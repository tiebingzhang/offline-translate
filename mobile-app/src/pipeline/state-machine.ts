import type {
  BackendStage,
  Direction,
  TranslationError,
  TranslationResult,
} from '@/api/bff-client';
import { computeTimeoutAtMs } from '@/pipeline/timeout';
import { MAX_POLL_ATTEMPTS } from '@/pipeline/retry';

export type PipelinePhase =
  | 'idle'
  | 'recording'
  | 'uploading'
  | 'polling'
  | 'retrying'
  | 'playing'
  | 'completed'
  | 'failed'
  | 'timed_out';

export interface PipelineState {
  phase: PipelinePhase;
  direction: Direction | null;
  requestId: string | null;
  capturedAudioUri: string | null;
  recordedDurationSec: number;
  startedAtMs: number | null;
  timeoutAtMs: number | null;
  backendStage: BackendStage | null;
  backendStageDetail: string | null;
  pollAttempt: number;
  pollAfterMs: number | null;
  result: TranslationResult | null;
  error: TranslationError | null;
}

export type PipelineAction =
  | { type: 'pressStart'; direction: Direction }
  | { type: 'pressReleaseTooShort' }
  | {
      type: 'pressRelease';
      capturedUri: string;
      durationSec: number;
      startedAtMs: number;
    }
  | { type: 'uploadAccepted'; requestId: string; pollAfterMs: number }
  | { type: 'uploadFailed'; error: TranslationError }
  | { type: 'pollStage'; stage: BackendStage; stageDetail?: string | null }
  | { type: 'pollTransient'; error: TranslationError }
  | { type: 'pollRecovered' }
  | { type: 'jobCompleted'; result: TranslationResult }
  | { type: 'jobFailed'; error: TranslationError }
  | { type: 'timeout'; nowMs: number }
  | { type: 'playbackStarted' }
  | { type: 'playbackEnded' }
  | { type: 'discard' };

export const initialPipelineState: PipelineState = {
  phase: 'idle',
  direction: null,
  requestId: null,
  capturedAudioUri: null,
  recordedDurationSec: 0,
  startedAtMs: null,
  timeoutAtMs: null,
  backendStage: null,
  backendStageDetail: null,
  pollAttempt: 0,
  pollAfterMs: null,
  result: null,
  error: null,
};

export function reducePipeline(
  state: PipelineState,
  action: PipelineAction,
): PipelineState {
  switch (action.type) {
    case 'pressStart': {
      if (state.phase !== 'idle') return state;
      return {
        ...initialPipelineState,
        phase: 'recording',
        direction: action.direction,
      };
    }

    case 'pressReleaseTooShort': {
      if (state.phase !== 'recording') return state;
      return initialPipelineState;
    }

    case 'pressRelease': {
      if (state.phase !== 'recording') return state;
      return {
        ...state,
        phase: 'uploading',
        capturedAudioUri: action.capturedUri,
        recordedDurationSec: action.durationSec,
        startedAtMs: action.startedAtMs,
        timeoutAtMs: computeTimeoutAtMs(action.startedAtMs, action.durationSec),
      };
    }

    case 'uploadAccepted': {
      if (state.phase !== 'uploading') return state;
      return {
        ...state,
        phase: 'polling',
        requestId: action.requestId,
        pollAfterMs: action.pollAfterMs,
        pollAttempt: 0,
      };
    }

    case 'uploadFailed': {
      if (state.phase !== 'uploading') return state;
      return { ...state, phase: 'failed', error: action.error };
    }

    case 'pollStage': {
      if (state.phase !== 'polling' && state.phase !== 'retrying') return state;
      return {
        ...state,
        phase: 'polling',
        backendStage: action.stage,
        backendStageDetail: action.stageDetail ?? null,
      };
    }

    case 'pollTransient': {
      if (state.phase !== 'polling' && state.phase !== 'retrying') return state;
      return {
        ...state,
        phase: 'retrying',
        pollAttempt: state.pollAttempt + 1,
        error: action.error,
      };
    }

    case 'pollRecovered': {
      if (state.phase !== 'retrying') return state;
      return { ...state, phase: 'polling', pollAttempt: 0, error: null };
    }

    case 'jobCompleted': {
      if (state.phase !== 'polling' && state.phase !== 'retrying') return state;
      return {
        ...state,
        phase: 'completed',
        result: action.result,
        error: null,
      };
    }

    case 'jobFailed': {
      if (
        state.phase !== 'polling' &&
        state.phase !== 'retrying' &&
        state.phase !== 'uploading'
      )
        return state;
      if (state.phase === 'retrying' && state.pollAttempt < MAX_POLL_ATTEMPTS) {
        return { ...state, phase: 'failed', error: action.error };
      }
      return { ...state, phase: 'failed', error: action.error };
    }

    case 'timeout': {
      if (
        state.phase !== 'polling' &&
        state.phase !== 'retrying' &&
        state.phase !== 'uploading'
      )
        return state;
      return { ...state, phase: 'timed_out' };
    }

    case 'playbackStarted': {
      if (state.phase !== 'completed') return state;
      return { ...state, phase: 'playing' };
    }

    case 'playbackEnded': {
      if (state.phase !== 'playing') return state;
      return { ...state, phase: 'completed' };
    }

    case 'discard': {
      return initialPipelineState;
    }

    default:
      return state;
  }
}
