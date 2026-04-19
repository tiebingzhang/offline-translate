import {
  FileSystemSessionType,
  FileSystemUploadType,
  createUploadTask,
  documentDirectory,
  downloadAsync,
  makeDirectoryAsync,
  uploadAsync,
} from 'expo-file-system/legacy';

import { fromWire } from '@/utils/casing';

import type {
  BackendStageWire,
  DirectionWire,
  JobErrorWire,
  JobResultWire,
  JobStateWire,
  OutputModeWire,
  UploadAcceptedWire,
} from './bff-types';
import { MAX_POLL_ATTEMPTS, nextDelayMs } from '@/pipeline/retry';

export type Direction = DirectionWire;
export type BackendStage = BackendStageWire;
export type OutputMode = OutputModeWire;

export type TranslationErrorKind =
  | 'upload_failed'
  | 'poll_failed'
  | 'server_failed'
  | 'client_timeout'
  | 'malformed_response';

export interface TranslationErrorInit {
  kind: TranslationErrorKind;
  message: string;
  httpStatus?: number;
  retryable: boolean;
  cause?: unknown;
}

export class TranslationError extends Error {
  readonly kind: TranslationErrorKind;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(init: TranslationErrorInit) {
    super(init.message);
    this.name = 'TranslationError';
    this.kind = init.kind;
    this.httpStatus = init.httpStatus;
    this.retryable = init.retryable;
    this.cause = init.cause;
  }
}

export function isTranslationError(err: unknown): err is TranslationError {
  return err instanceof TranslationError;
}

export interface UploadAccepted {
  requestId: string;
  status: 'queued';
  stage: 'queued';
  direction: Direction;
  statusUrl: string;
  pollAfterMs: number;
}

export interface JobError {
  message: string;
  type: string;
  stage: BackendStage | string;
}

export interface JobResult {
  direction: Direction;
  targetLanguage: 'wolof' | 'english';
  transcribedText: string;
  translatedText: string;
  outputMode: OutputMode;
  audioUrl: string | null;
}

export interface JobState {
  requestId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stage: BackendStage;
  stageDetail: string | null;
  direction: Direction;
  targetLanguage?: 'wolof' | 'english';
  timingsMs?: Record<string, number>;
  result: JobResult | null;
  error: JobError | null;
  pollAfterMs: number;
  completedAtMs?: number;
}

export interface TranslationResult {
  requestId: string;
  direction: Direction;
  targetLanguage: 'wolof' | 'english';
  transcribedText: string;
  translatedText: string;
  outputMode: OutputMode;
  audioUrl: string | null;
  localAudioUri: string | null;
  completedAtMs: number;
}

export interface BffClientConfig {
  baseUrl: string;
  nowMs?: () => number;
  sleepMs?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
  audioDir?: string;
}

export interface PostTranslateSpeakOpts {
  timeoutAtMs?: number;
  // Reports upload progress as a fraction in [0, 1]. When provided, the client
  // uses createUploadTask so the underlying URLSession surfaces real bytes-sent
  // events; if omitted, the simpler uploadAsync path is used.
  // (001-wolof-translate-mobile:T083 / FR-019)
  onProgress?: (frac: number) => void;
}

export interface BffClient {
  postTranslateSpeak(
    audioUri: string,
    direction: Direction,
    opts?: PostTranslateSpeakOpts,
  ): Promise<UploadAccepted>;
  pollUntilTerminal(
    requestId: string,
    opts: { timeoutAtMs: number },
  ): AsyncGenerator<JobState, void, void>;
  downloadAudio(requestId: string): Promise<string | null>;
  checkHealth(): Promise<{ status: 'ok' }>;
}

// Derived from the real Documents directory so downloadAsync writes to a path
// that's actually on disk at runtime (001-wolof-translate-mobile:T075a)
const DEFAULT_AUDIO_DIR = `${documentDirectory ?? 'file:///document/'}audio/`;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function parseJsonSafely<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function toUploadAccepted(wire: UploadAcceptedWire): UploadAccepted {
  return fromWire<UploadAccepted>(wire);
}

function toJobState(wire: JobStateWire): JobState {
  const camel = fromWire<JobState & { requestId: string }>(wire);
  return {
    requestId: camel.requestId,
    status: camel.status,
    stage: camel.stage,
    stageDetail: camel.stageDetail ?? null,
    direction: camel.direction,
    targetLanguage: camel.targetLanguage,
    timingsMs: camel.timingsMs,
    result: camel.result ? toJobResult(wire.result as JobResultWire) : null,
    error: camel.error ? toJobError(wire.error as JobErrorWire) : null,
    pollAfterMs: camel.pollAfterMs,
    completedAtMs: camel.completedAtMs,
  };
}

function toJobResult(wire: JobResultWire): JobResult {
  return {
    direction: wire.direction,
    targetLanguage: wire.target_language,
    transcribedText: wire.transcribed_text,
    translatedText: wire.translated_text,
    outputMode: wire.output_mode,
    audioUrl: wire.audio_url,
  };
}

function toJobError(wire: JobErrorWire): JobError {
  return {
    message: wire.message,
    type: wire.type,
    stage: (wire.stage ?? 'failed') as BackendStage,
  };
}

export function createBffClient(config: BffClientConfig): BffClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const nowMs = config.nowMs ?? (() => Date.now());
  const sleepMs = config.sleepMs ?? defaultSleep;
  const fetchImpl = config.fetchImpl ?? fetch;
  const audioDir = config.audioDir ?? DEFAULT_AUDIO_DIR;

  async function postTranslateSpeak(
    audioUri: string,
    direction: Direction,
    opts?: PostTranslateSpeakOpts,
  ): Promise<UploadAccepted> {
    const url = joinUrl(baseUrl, '/api/translate-speak');
    const fsOptions = {
      httpMethod: 'POST' as const,
      fieldName: 'file',
      mimeType: 'audio/m4a',
      sessionType: FileSystemSessionType.BACKGROUND,
      uploadType: FileSystemUploadType.MULTIPART,
      parameters: { direction },
    };
    const uploadPromise = opts?.onProgress
      ? createUploadTask(url, audioUri, fsOptions, ({
          totalBytesSent,
          totalBytesExpectedToSend,
        }) => {
          if (totalBytesExpectedToSend > 0) {
            const frac = Math.min(1, Math.max(0, totalBytesSent / totalBytesExpectedToSend));
            opts.onProgress!(frac);
          }
        }).uploadAsync()
      : uploadAsync(url, audioUri, fsOptions);

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let response: { status: number; body: string } | null | undefined;
    try {
      if (opts?.timeoutAtMs !== undefined) {
        const waitMs = Math.max(0, opts.timeoutAtMs - nowMs());
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new TranslationError({
                kind: 'client_timeout',
                message: 'Translation did not complete in time.',
                retryable: true,
              }),
            );
          }, waitMs);
        });
        response = await Promise.race([uploadPromise, timeoutPromise]);
      } else {
        response = await uploadPromise;
      }
    } catch (cause) {
      if (isTranslationError(cause)) throw cause;
      throw new TranslationError({
        kind: 'upload_failed',
        message: 'Network error during upload.',
        retryable: true,
        cause,
      });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
    if (!response) {
      // createUploadTask resolves undefined when cancelled — we never cancel
      // here, but the type allows it, so guard rather than cast.
      // (001-wolof-translate-mobile:T083)
      throw new TranslationError({
        kind: 'upload_failed',
        message: 'Upload was cancelled before completion.',
        retryable: true,
      });
    }

    if (response.status >= 400) {
      const parsed = parseJsonSafely<{ error?: { message?: string } }>(response.body);
      throw new TranslationError({
        kind: 'upload_failed',
        message: parsed?.error?.message ?? `Upload failed with status ${response.status}.`,
        httpStatus: response.status,
        retryable: response.status >= 500,
      });
    }

    const parsed = parseJsonSafely<UploadAcceptedWire>(response.body);
    if (!parsed || typeof parsed.request_id !== 'string') {
      throw new TranslationError({
        kind: 'malformed_response',
        message: 'Upload response was not valid JSON.',
        retryable: false,
      });
    }
    return toUploadAccepted(parsed);
  }

  async function* pollUntilTerminal(
    requestId: string,
    opts: { timeoutAtMs: number },
  ): AsyncGenerator<JobState, void, void> {
    const url = joinUrl(baseUrl, `/api/requests/${requestId}`);
    let attempt = 0;
    let hasYielded = false;
    let lastDelayMs = 0;

    while (true) {
      if (nowMs() >= opts.timeoutAtMs) {
        throw new TranslationError({
          kind: 'client_timeout',
          message: 'Translation did not complete in time.',
          retryable: true,
        });
      }

      if (hasYielded && lastDelayMs > 0) {
        await sleepMs(lastDelayMs);
        if (nowMs() >= opts.timeoutAtMs) {
          throw new TranslationError({
            kind: 'client_timeout',
            message: 'Translation did not complete in time.',
            retryable: true,
          });
        }
      }

      let res: Response;
      try {
        res = await fetchImpl(url);
      } catch (cause) {
        attempt += 1;
        if (attempt > MAX_POLL_ATTEMPTS) {
          throw new TranslationError({
            kind: 'poll_failed',
            message: 'Polling failed after retries.',
            retryable: true,
            cause,
          });
        }
        await sleepMs(nextDelayMs(attempt));
        continue;
      }

      if (res.status === 404) {
        throw new TranslationError({
          kind: 'server_failed',
          message: 'Request not found on server.',
          httpStatus: 404,
          retryable: false,
        });
      }

      if (res.status >= 500) {
        attempt += 1;
        if (attempt > MAX_POLL_ATTEMPTS) {
          throw new TranslationError({
            kind: 'poll_failed',
            message: 'Polling failed after retries.',
            httpStatus: res.status,
            retryable: true,
          });
        }
        await sleepMs(nextDelayMs(attempt));
        continue;
      }

      if (res.status >= 400) {
        throw new TranslationError({
          kind: 'server_failed',
          message: `Polling returned status ${res.status}.`,
          httpStatus: res.status,
          retryable: false,
        });
      }

      const text = await res.text();
      const wire = parseJsonSafely<JobStateWire>(text);
      if (!wire || typeof wire.request_id !== 'string') {
        throw new TranslationError({
          kind: 'malformed_response',
          message: 'Poll response was not valid JSON.',
          retryable: false,
        });
      }

      attempt = 0;
      const state = toJobState(wire);
      hasYielded = true;
      lastDelayMs = Math.max(0, state.pollAfterMs);
      yield state;

      if (state.status === 'completed') {
        return;
      }
      if (state.status === 'failed') {
        throw new TranslationError({
          kind: 'server_failed',
          message: state.error?.message ?? 'Translation failed on server.',
          retryable: false,
        });
      }
    }
  }

  async function downloadAudioImpl(requestId: string): Promise<string | null> {
    const url = joinUrl(baseUrl, `/api/requests/${requestId}/audio`);
    const target = `${audioDir.replace(/\/+$/, '')}/${requestId}.m4a`;
    try {
      await makeDirectoryAsync(audioDir, { intermediates: true }).catch(() => undefined);
      const res = await downloadAsync(url, target);
      if (res.status >= 400) {
        return null;
      }
      return res.uri || target;
    } catch {
      return null;
    }
  }

  async function checkHealth(): Promise<{ status: 'ok' }> {
    const res = await fetchImpl(joinUrl(baseUrl, '/api/health'));
    const text = await res.text();
    const parsed = parseJsonSafely<{ status: 'ok' }>(text);
    if (!parsed || parsed.status !== 'ok') {
      throw new TranslationError({
        kind: 'malformed_response',
        message: 'Health check response was not valid.',
        retryable: false,
      });
    }
    return parsed;
  }

  return {
    postTranslateSpeak,
    pollUntilTerminal,
    downloadAudio: downloadAudioImpl,
    checkHealth,
  };
}
