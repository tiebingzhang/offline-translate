import { deleteAsync, getInfoAsync } from 'expo-file-system/legacy';
import { create } from 'zustand';

import {
  createBffClient,
  isTranslationError,
  type BffClient,
  type Direction,
  type TranslationResult,
} from '@/api/bff-client';
import { defaultPlayer } from '@/audio/player';
import { historyRepo } from '@/cache/history-repo';
import { pendingJobsRepo, type PendingJob } from '@/cache/pending-jobs-repo';
import { log } from '@/utils/logger';
import {
  initialPipelineState,
  reducePipeline,
  type PipelineAction,
  type PipelineState,
} from '@/pipeline/state-machine';

import { useSettingsStore } from './settings-store';

const DEFAULT_BFF_BASE_URL =
  process.env.EXPO_PUBLIC_BFF_BASE_URL ??
  process.env.BFF_BASE_URL_DEV ??
  'http://localhost:8090';

export const UPLOAD_PROGRESS_VISIBILITY_DELAY_MS = 2000;

function resolveBaseUrl(): string {
  const override = useSettingsStore.getState().backendUrlOverride;
  return override && override.trim().length > 0 ? override : DEFAULT_BFF_BASE_URL;
}

let clientCache: { baseUrl: string; client: BffClient } | null = null;

function getClient(): BffClient {
  const baseUrl = resolveBaseUrl();
  if (!clientCache || clientCache.baseUrl !== baseUrl) {
    clientCache = { baseUrl, client: createBffClient({ baseUrl }) };
  }
  return clientCache.client;
}

interface PipelineStoreActions {
  pressStart: (direction: Direction) => void;
  pressRelease: (capturedUri: string, durationSec: number) => Promise<void>;
  pressReleaseTooShort: () => void;
  discard: () => void;
  retry: () => Promise<void>;
  resumePendingJob: (job: PendingJob) => Promise<void>;
}

type PipelineStore = PipelineState & PipelineStoreActions;

export const usePipelineStore = create<PipelineStore>((set, get) => {
  const dispatch = (action: PipelineAction) => {
    set((s) => reducePipeline(s, action));
  };

  async function runPipelineFromUpload(
    capturedUri: string,
    direction: Direction,
    startedAtMs: number,
    durationSec: number,
  ): Promise<void> {
    const client = getClient();
    const timeoutAtMs = get().timeoutAtMs ?? startedAtMs + (30 + durationSec) * 1000;
    // FR-019: gate the indicator behind a 2 s threshold so fast uploads never
    // flicker an indicator. The store itself owns the timer rather than the UI
    // so the rule is enforced regardless of which view consumes it.
    // (001-wolof-translate-mobile:T083)
    const visibilityTimer = setTimeout(() => {
      if (get().phase === 'uploading') {
        dispatch({ type: 'uploadProgressVisible' });
      }
    }, UPLOAD_PROGRESS_VISIBILITY_DELAY_MS);
    try {
      const accepted = await client.postTranslateSpeak(capturedUri, direction, {
        timeoutAtMs,
        onProgress: (frac) => {
          if (get().phase === 'uploading') {
            dispatch({ type: 'uploadProgress', frac });
          }
        },
      });
      dispatch({
        type: 'uploadAccepted',
        requestId: accepted.requestId,
        pollAfterMs: accepted.pollAfterMs,
      });
      await pendingJobsRepo.insert({
        requestId: accepted.requestId,
        direction,
        capturedAudioPath: capturedUri,
        recordedDurationSec: durationSec,
        startedAtMs,
        timeoutAtMs,
      });
      await drainPoll(accepted.requestId, timeoutAtMs);
    } catch (err) {
      handlePipelineError(err);
    } finally {
      clearTimeout(visibilityTimer);
    }
  }

  async function drainPoll(requestId: string, timeoutAtMs: number): Promise<void> {
    const client = getClient();
    try {
      let terminal: TranslationResult | null = null;
      for await (const state of client.pollUntilTerminal(requestId, { timeoutAtMs })) {
        dispatch({
          type: 'pollStage',
          stage: state.stage,
          stageDetail: state.stageDetail ?? null,
        });
        if (state.status === 'completed' && state.result) {
          const localAudioUri = state.result.audioUrl
            ? await client.downloadAudio(requestId)
            : null;
          terminal = {
            requestId: state.requestId,
            direction: state.result.direction,
            targetLanguage: state.result.targetLanguage,
            transcribedText: state.result.transcribedText,
            translatedText: state.result.translatedText,
            outputMode: state.result.outputMode,
            audioUrl: state.result.audioUrl,
            localAudioUri,
            completedAtMs: state.completedAtMs ?? Date.now(),
          };
          break;
        }
      }
      if (terminal) {
        dispatch({ type: 'jobCompleted', result: terminal });
        await pendingJobsRepo.delete(requestId).catch(() => undefined);
        const capturedBefore = get().capturedAudioUri;
        await persistToHistory(terminal);
        await unlinkTransientCapture(capturedBefore, terminal.localAudioUri);
        dispatch({ type: 'playbackStarted' });
        void defaultPlayer.playResult(terminal, {
          onEnded: () => dispatch({ type: 'playbackEnded' }),
          // FR-008: on an OS interruption (phone call, Siri, alarm) during
          // playback, pause the native player and land in 'completed' so the
          // result stays visible and the user can replay. The 'playbackEnded'
          // reducer is a no-op unless phase === 'playing', so a stray second
          // invocation (e.g. from a spurious status blip) is idempotent.
          // (001-wolof-translate-mobile:T079)
          onInterruptionBegan: () => {
            if (get().phase !== 'playing') return;
            defaultPlayer.pause();
            dispatch({ type: 'playbackEnded' });
          },
        });
      }
    } catch (err) {
      handlePipelineError(err);
      await pendingJobsRepo.delete(requestId).catch(() => undefined);
    }
  }

  async function persistToHistory(terminal: TranslationResult): Promise<void> {
    try {
      let audioPath = '';
      let byteSize = 0;
      // TTS-only entries (FR-004 wolof_to_english) persist with an empty
      // audioPath sentinel — replay is produced on-device via expo-speech and
      // does not need a cached file (001-wolof-translate-mobile:T075c)
      if (terminal.localAudioUri) {
        const info = await getInfoAsync(terminal.localAudioUri).catch(() => null);
        byteSize =
          info && 'size' in info && typeof info.size === 'number' ? info.size : 0;
        audioPath =
          terminal.localAudioUri.split('/').pop() || `${terminal.requestId}.m4a`;
      }
      await historyRepo.insert({
        requestId: terminal.requestId,
        direction: terminal.direction,
        transcribedText: terminal.transcribedText,
        translatedText: terminal.translatedText,
        audioPath,
        audioByteSize: byteSize,
        createdAtMs: terminal.completedAtMs,
      });
    } catch (err) {
      log('warn', 'history', 'insert failed', { err: String(err) });
    }
  }

  async function unlinkTransientCapture(
    capturedUri: string | null,
    localAudioUri: string | null,
  ): Promise<void> {
    if (!capturedUri || capturedUri === localAudioUri) return;
    await deleteAsync(capturedUri, { idempotent: true }).catch(() => undefined);
  }

  function handlePipelineError(err: unknown): void {
    if (!isTranslationError(err)) {
      log('error', 'pipeline', 'unexpected error', { err: String(err) });
      return;
    }
    const phase = get().phase;
    if (err.kind === 'client_timeout') {
      dispatch({ type: 'timeout', nowMs: Date.now() });
    } else if (phase === 'uploading') {
      dispatch({ type: 'uploadFailed', error: err });
    } else {
      dispatch({ type: 'jobFailed', error: err });
    }
  }

  return {
    ...initialPipelineState,

    pressStart: (direction) => {
      dispatch({ type: 'pressStart', direction });
    },

    pressReleaseTooShort: () => {
      dispatch({ type: 'pressReleaseTooShort' });
    },

    pressRelease: async (capturedUri, durationSec) => {
      const direction = get().direction;
      if (!direction) return;
      const nowMs = Date.now();
      const startedAtMs = get().startedAtMs ?? nowMs - durationSec * 1000;
      dispatch({
        type: 'pressRelease',
        capturedUri,
        durationSec,
        startedAtMs,
        uploadStartedAtMs: nowMs,
      });
      await runPipelineFromUpload(capturedUri, direction, startedAtMs, durationSec);
    },

    discard: () => {
      defaultPlayer.stop();
      const requestId = get().requestId;
      dispatch({ type: 'discard' });
      if (requestId) {
        void pendingJobsRepo.delete(requestId).catch(() => undefined);
      }
    },

    retry: async () => {
      const { capturedAudioUri, direction, recordedDurationSec, startedAtMs } = get();
      if (!capturedAudioUri || !direction) return;
      dispatch({ type: 'discard' });
      dispatch({ type: 'pressStart', direction });
      const nowMs = Date.now();
      const effectiveStart = startedAtMs ?? nowMs - recordedDurationSec * 1000;
      dispatch({
        type: 'pressRelease',
        capturedUri: capturedAudioUri,
        durationSec: recordedDurationSec,
        startedAtMs: effectiveStart,
        uploadStartedAtMs: nowMs,
      });
      await runPipelineFromUpload(
        capturedAudioUri,
        direction,
        effectiveStart,
        recordedDurationSec,
      );
    },

    resumePendingJob: async (job) => {
      dispatch({ type: 'pressStart', direction: job.direction });
      dispatch({
        type: 'pressRelease',
        capturedUri: job.capturedAudioPath,
        durationSec: job.recordedDurationSec,
        startedAtMs: job.startedAtMs,
        uploadStartedAtMs: Date.now(),
      });
      dispatch({ type: 'uploadAccepted', requestId: job.requestId, pollAfterMs: 500 });
      await drainPoll(job.requestId, job.timeoutAtMs);
    },
  };
});

export function resetBffClientCacheForTests(): void {
  clientCache = null;
}
