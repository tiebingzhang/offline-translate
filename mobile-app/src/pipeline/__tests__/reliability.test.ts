// Phase 5 / US4 reliability tests — exercises the pipeline-store failure modes
// (001-wolof-translate-mobile:T078)
import { deleteAsync, getInfoAsync } from 'expo-file-system/legacy';

import {
  TranslationError,
  type BffClient,
  type JobState,
  type UploadAccepted,
} from '@/api/bff-client';
import type { HistoryEntryInsert } from '@/cache/history-repo';

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

import {
  usePipelineStore,
  resetBffClientCacheForTests,
} from '@/state/pipeline-store';
import { computeTimeoutAtMs } from '@/pipeline/timeout';
import { initialPipelineState } from '@/pipeline/state-machine';

function resetStore(): void {
  usePipelineStore.setState({ ...initialPipelineState });
}

async function* yieldNothing(): AsyncGenerator<JobState, void, void> {
  // never yields — caller will throw before consumption completes
}

describe('pipeline-store reliability (Phase 5 / US4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetBffClientCacheForTests();
    resetStore();
    mockHistoryInsert.mockResolvedValue();
    mockPendingInsert.mockResolvedValue();
    mockPendingDelete.mockResolvedValue();
    mockPendingResumeAll.mockResolvedValue({ live: [], expired: [] });
    mockPlayResult.mockResolvedValue();
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 100 });
    (deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  // SC-004: when upload returns 5xx, the captured audio is preserved and the
  // user gets a retry affordance — they should not have to re-record.
  test('upload 500 — captured audio preserved + retry exposed (SC-004)', async () => {
    mockPostTranslateSpeak.mockRejectedValueOnce(
      new TranslationError({
        kind: 'upload_failed',
        message: 'Upload failed with status 500.',
        httpStatus: 500,
        retryable: true,
      }),
    );

    const captured = 'file:///cache/in-flight/clip.m4a';
    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease(captured, 3);

    const state = usePipelineStore.getState();
    expect(state.phase).toBe('failed');
    expect(state.capturedAudioUri).toBe(captured);
    expect(state.recordedDurationSec).toBe(3);
    expect(state.error?.kind).toBe('upload_failed');
    expect(state.error?.retryable).toBe(true);
    expect(deleteAsync).not.toHaveBeenCalledWith(captured, expect.anything());
  });

  test('retry() reuses preserved audio without re-recording (SC-004 follow-through)', async () => {
    mockPostTranslateSpeak.mockRejectedValueOnce(
      new TranslationError({
        kind: 'upload_failed',
        message: 'boom',
        httpStatus: 500,
        retryable: true,
      }),
    );

    const captured = 'file:///cache/in-flight/clip.m4a';
    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease(captured, 3);
    expect(usePipelineStore.getState().phase).toBe('failed');

    // Network recovers — retry should re-issue postTranslateSpeak with the
    // SAME captured URI, not require the user to record again.
    mockPostTranslateSpeak.mockResolvedValueOnce({
      requestId: 'req-2',
      pollAfterMs: 100,
    } as UploadAccepted);
    mockPollUntilTerminal.mockReturnValueOnce(yieldNothing());

    await usePipelineStore.getState().retry();

    expect(mockPostTranslateSpeak).toHaveBeenCalledTimes(2);
    const secondCall = mockPostTranslateSpeak.mock.calls[1]!;
    expect(secondCall[0]).toBe(captured);
    expect(secondCall[1]).toBe('english_to_wolof');
  });

  // FR-018: malformed JSON gets a friendly error variant + retry decision is
  // driven by the error.retryable flag (malformed_response is NOT retryable).
  test('malformed JSON response — friendly error kind, retryable=false (FR-018)', async () => {
    mockPostTranslateSpeak.mockRejectedValueOnce(
      new TranslationError({
        kind: 'malformed_response',
        message: 'Upload response was not valid JSON.',
        retryable: false,
      }),
    );

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/x.m4a', 3);

    const state = usePipelineStore.getState();
    expect(state.phase).toBe('failed');
    expect(state.error?.kind).toBe('malformed_response');
    expect(state.error?.retryable).toBe(false);
    expect(state.capturedAudioUri).toBe('file:///c/x.m4a');
  });

  // FR-020: the client-side timeout window is the payload-proportional value
  // computeTimeoutAtMs(start, durationSec) — start + (30 + duration) * 1000.
  // The store tracks this as state.timeoutAtMs the moment recording is released.
  test('client-side timeout window is payload-proportional (FR-020 — pipeline tracks computeTimeoutAtMs)', async () => {
    mockPostTranslateSpeak.mockResolvedValueOnce({
      requestId: 'req-3',
      pollAfterMs: 100,
    } as UploadAccepted);
    mockPollUntilTerminal.mockReturnValueOnce(yieldNothing());

    const beforeMs = Date.now();
    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/y.m4a', 5);

    const state = usePipelineStore.getState();
    expect(state.startedAtMs).not.toBeNull();
    expect(state.timeoutAtMs).not.toBeNull();
    // start + (30 + 5) * 1000 = start + 35000 ms — verify the recorded
    // timeoutAtMs equals computeTimeoutAtMs(startedAtMs, durationSec).
    // The store synthesises startedAtMs as `Date.now() - durationSec * 1000`
    // when pressRelease is called, so the absolute timeoutAtMs is roughly
    // `releaseMs + 30000` (the recording window already elapsed).
    const expected = computeTimeoutAtMs(state.startedAtMs!, 5);
    expect(state.timeoutAtMs).toBe(expected);
    expect(state.timeoutAtMs! - state.startedAtMs!).toBe(35_000);
    // Sanity: the absolute deadline is at least 29.9 s ahead of pre-release.
    expect(state.timeoutAtMs! - beforeMs).toBeGreaterThanOrEqual(29_900);

    // FR-020 sweep: a longer recording shifts the absolute deadline farther.
    resetStore();
    mockPostTranslateSpeak.mockResolvedValueOnce({
      requestId: 'req-3b',
      pollAfterMs: 100,
    } as UploadAccepted);
    mockPollUntilTerminal.mockReturnValueOnce(yieldNothing());
    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/y2.m4a', 60);
    const longState = usePipelineStore.getState();
    expect(longState.timeoutAtMs! - longState.startedAtMs!).toBe(90_000);
  });

  test('client_timeout error transitions to timed_out phase (FR-020 firing)', async () => {
    // postTranslateSpeak resolves OK so we enter polling, then the polling
    // generator throws client_timeout — the store should land in timed_out.
    mockPostTranslateSpeak.mockResolvedValueOnce({
      requestId: 'req-4',
      pollAfterMs: 100,
    } as UploadAccepted);
    mockPollUntilTerminal.mockImplementationOnce(async function* () {
      throw new TranslationError({
        kind: 'client_timeout',
        message: 'Translation did not complete in time.',
        retryable: true,
      });
    });

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/z.m4a', 4);

    const state = usePipelineStore.getState();
    expect(state.phase).toBe('timed_out');
    // Captured audio is still preserved so retry() can reuse it
    expect(state.capturedAudioUri).toBe('file:///c/z.m4a');
  });

  test('discard() clears all in-flight state and stops playback', async () => {
    mockPostTranslateSpeak.mockRejectedValueOnce(
      new TranslationError({
        kind: 'upload_failed',
        message: 'boom',
        retryable: true,
      }),
    );
    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/discard.m4a', 3);
    expect(usePipelineStore.getState().phase).toBe('failed');

    usePipelineStore.getState().discard();
    const state = usePipelineStore.getState();
    expect(state.phase).toBe('idle');
    expect(state.capturedAudioUri).toBeNull();
    expect(state.error).toBeNull();
    expect(mockPlayerStop).toHaveBeenCalled();
  });
});
