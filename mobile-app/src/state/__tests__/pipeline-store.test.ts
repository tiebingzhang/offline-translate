import { deleteAsync, getInfoAsync } from 'expo-file-system/legacy';

import type {
  BffClient,
  JobState,
  UploadAccepted,
} from '@/api/bff-client';
import { isTranslationError } from '@/api/bff-client';
import type { HistoryEntryInsert } from '@/cache/history-repo';

// Mock the BFF client module so pipeline-store consumes a stub client
// (001-wolof-translate-mobile:T075d)
const mockPostTranslateSpeak = jest.fn<Promise<UploadAccepted>, unknown[]>();
const mockPollUntilTerminal = jest.fn<AsyncGenerator<JobState, void, void>, unknown[]>();
const mockDownloadAudio = jest.fn<Promise<string | null>, unknown[]>();
const mockCheckHealth = jest.fn<Promise<{ status: 'ok' }>, unknown[]>();

jest.mock('@/api/bff-client', () => {
  const actual = jest.requireActual('@/api/bff-client');
  return {
    ...actual,
    createBffClient: jest.fn(
      (): BffClient => ({
        postTranslateSpeak: mockPostTranslateSpeak as unknown as BffClient['postTranslateSpeak'],
        pollUntilTerminal: mockPollUntilTerminal as unknown as BffClient['pollUntilTerminal'],
        downloadAudio: mockDownloadAudio as unknown as BffClient['downloadAudio'],
        checkHealth: mockCheckHealth as unknown as BffClient['checkHealth'],
      }),
    ),
  };
});

const mockHistoryInsert = jest.fn<Promise<void>, [HistoryEntryInsert]>();
const mockPendingInsert = jest.fn<Promise<void>, unknown[]>();
const mockPendingDelete = jest.fn<Promise<void>, unknown[]>();
const mockPendingResumeAll = jest.fn<
  Promise<{ live: unknown[]; expired: unknown[] }>,
  unknown[]
>();

jest.mock('@/cache/history-repo', () => ({
  historyRepo: {
    insert: (entry: HistoryEntryInsert) => mockHistoryInsert(entry),
    delete: jest.fn(async () => {}),
    list: jest.fn(async () => []),
  },
  AUDIO_DIR_URI: 'file:///document/audio/',
  HISTORY_MAX_ROWS: 20,
  HISTORY_MAX_BYTES: 50 * 1024 * 1024,
}));

jest.mock('@/cache/pending-jobs-repo', () => ({
  pendingJobsRepo: {
    insert: (job: unknown) => mockPendingInsert(job),
    delete: (id: unknown) => mockPendingDelete(id),
    resumeAll: (now: unknown) => mockPendingResumeAll(now),
  },
}));

const mockPlayResult = jest.fn<Promise<void>, unknown[]>();
const mockPlayerStop = jest.fn<void, unknown[]>();
jest.mock('@/audio/player', () => ({
  defaultPlayer: {
    playResult: (result: unknown, opts?: unknown) => mockPlayResult(result, opts),
    stop: () => mockPlayerStop(),
  },
}));

async function* singleCompletion(state: JobState): AsyncGenerator<JobState, void, void> {
  yield state;
}

// Import AFTER mocks register so the store binds to the mocks
// (001-wolof-translate-mobile:T075d)
import { usePipelineStore, resetBffClientCacheForTests } from '../pipeline-store';

function resetStore(): void {
  usePipelineStore.setState({
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
  });
}

function makeCompletedState(overrides: {
  audioUrl: string | null;
  outputMode: 'wolof_audio' | 'english_audio' | 'text_only';
  direction?: 'english_to_wolof' | 'wolof_to_english';
  targetLanguage?: 'wolof' | 'english';
  transcribedText?: string;
  translatedText?: string;
}): JobState {
  const direction = overrides.direction ?? 'english_to_wolof';
  const targetLanguage = overrides.targetLanguage ?? 'wolof';
  return {
    requestId: 'req-1',
    status: 'completed',
    stage: 'completed',
    stageDetail: null,
    direction,
    targetLanguage,
    timingsMs: null,
    result: {
      direction,
      targetLanguage,
      transcribedText: overrides.transcribedText ?? 'Hello',
      translatedText: overrides.translatedText ?? 'Jamm',
      outputMode: overrides.outputMode,
      audioUrl: overrides.audioUrl,
    },
    error: null,
    pollAfterMs: null,
    completedAtMs: 2_000_000,
  } as unknown as JobState;
}

describe('pipeline-store completion path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetBffClientCacheForTests();
    resetStore();
    mockPostTranslateSpeak.mockResolvedValue({
      requestId: 'req-1',
      pollAfterMs: 100,
    } as UploadAccepted);
    mockHistoryInsert.mockResolvedValue();
    mockPendingInsert.mockResolvedValue();
    mockPendingDelete.mockResolvedValue();
    mockPendingResumeAll.mockResolvedValue({ live: [], expired: [] });
    mockPlayResult.mockResolvedValue();
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 42_000 });
    (deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  test('english_to_wolof completion: downloads audio, persists history, unlinks transient capture (FR-021)', async () => {
    mockDownloadAudio.mockResolvedValue('file:///document/audio/req-1.m4a');
    mockPollUntilTerminal.mockReturnValue(
      singleCompletion(
        makeCompletedState({ audioUrl: '/api/req-1/audio', outputMode: 'wolof_audio' }),
      ),
    );

    const capturedUri = 'file:///cache/in-flight/abc.m4a';
    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease(capturedUri, 3);

    expect(mockDownloadAudio).toHaveBeenCalledWith('req-1');
    expect(mockHistoryInsert).toHaveBeenCalledTimes(1);
    const inserted = mockHistoryInsert.mock.calls[0]![0];
    expect(inserted).toMatchObject({
      requestId: 'req-1',
      direction: 'english_to_wolof',
      transcribedText: 'Hello',
      translatedText: 'Jamm',
      audioPath: 'req-1.m4a',
      audioByteSize: 42_000,
    });
    expect(deleteAsync).toHaveBeenCalledWith(
      capturedUri,
      expect.objectContaining({ idempotent: true }),
    );
    expect(mockPlayResult).toHaveBeenCalledTimes(1);
  });

  test('wolof_to_english text-only completion: persists TTS-only entry, unlinks transient (FR-010, FR-011, FR-021)', async () => {
    mockDownloadAudio.mockResolvedValue(null);
    mockPollUntilTerminal.mockReturnValue(
      singleCompletion(
        makeCompletedState({
          audioUrl: null,
          outputMode: 'text_only',
          direction: 'wolof_to_english',
          targetLanguage: 'english',
          transcribedText: 'Jamm',
          translatedText: 'Peace',
        }),
      ),
    );

    const capturedUri = 'file:///cache/in-flight/def.m4a';
    usePipelineStore.getState().pressStart('wolof_to_english');
    await usePipelineStore.getState().pressRelease(capturedUri, 3);

    expect(mockDownloadAudio).not.toHaveBeenCalled();
    expect(mockHistoryInsert).toHaveBeenCalledTimes(1);
    expect(mockHistoryInsert.mock.calls[0]![0]).toMatchObject({
      requestId: 'req-1',
      direction: 'wolof_to_english',
      transcribedText: 'Jamm',
      translatedText: 'Peace',
      audioPath: '',
      audioByteSize: 0,
    });
    expect(deleteAsync).toHaveBeenCalledWith(
      capturedUri,
      expect.objectContaining({ idempotent: true }),
    );
  });

  test('non-TranslationError from pendingJobsRepo.insert surfaces as failed phase with poll_failed wrapped error', async () => {
    mockDownloadAudio.mockResolvedValue('file:///document/audio/req-1.m4a');
    mockPollUntilTerminal.mockReturnValue(
      singleCompletion(
        makeCompletedState({ audioUrl: '/api/req-1/audio', outputMode: 'wolof_audio' }),
      ),
    );
    const boom = new Error('boom');
    mockPendingInsert.mockRejectedValueOnce(boom);

    const capturedUri = 'file:///cache/in-flight/stuck.m4a';
    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease(capturedUri, 3);

    const state = usePipelineStore.getState();
    expect(state.phase).toBe('failed');
    expect(isTranslationError(state.error)).toBe(true);
    expect(state.error?.kind).toBe('poll_failed');
    expect(state.error?.retryable).toBe(false);
    expect(state.error?.cause).toBe(boom);
  });

  test('skips transient unlink when capturedUri equals localAudioUri (no double-free)', async () => {
    const shared = 'file:///document/audio/req-1.m4a';
    mockDownloadAudio.mockResolvedValue(shared);
    mockPollUntilTerminal.mockReturnValue(
      singleCompletion(
        makeCompletedState({ audioUrl: '/api/req-1/audio', outputMode: 'wolof_audio' }),
      ),
    );

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease(shared, 3);

    expect(mockHistoryInsert).toHaveBeenCalledTimes(1);
    expect(deleteAsync).not.toHaveBeenCalled();
  });
});
