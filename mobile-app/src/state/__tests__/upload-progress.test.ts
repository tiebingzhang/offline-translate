// T083 — upload progress wiring (FR-019)
// (001-wolof-translate-mobile:T083)
import {
  TranslationError,
  type BffClient,
  type JobState,
  type PostTranslateSpeakOpts,
  type UploadAccepted,
} from '@/api/bff-client';
import type { HistoryEntryInsert } from '@/cache/history-repo';

const mockPostTranslateSpeak = jest.fn<Promise<UploadAccepted>, [string, string, PostTranslateSpeakOpts | undefined]>();
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

jest.mock('@/cache/history-repo', () => ({
  historyRepo: {
    insert: jest.fn<Promise<void>, [HistoryEntryInsert]>(async () => {}),
    delete: jest.fn(async () => {}),
    list: jest.fn(async () => []),
  },
  AUDIO_DIR_URI: 'file:///document/audio/',
  HISTORY_MAX_ROWS: 20,
  HISTORY_MAX_BYTES: 50 * 1024 * 1024,
}));

jest.mock('@/cache/pending-jobs-repo', () => ({
  pendingJobsRepo: {
    insert: jest.fn(async () => {}),
    delete: jest.fn(async () => {}),
    resumeAll: jest.fn(async () => ({ live: [], expired: [] })),
  },
}));

jest.mock('@/audio/player', () => ({
  defaultPlayer: {
    playResult: jest.fn(async () => {}),
    stop: jest.fn(),
  },
}));

import {
  UPLOAD_PROGRESS_VISIBILITY_DELAY_MS,
  resetBffClientCacheForTests,
  usePipelineStore,
} from '@/state/pipeline-store';
import { initialPipelineState } from '@/pipeline/state-machine';

function resetStore(): void {
  usePipelineStore.setState({ ...initialPipelineState });
}

async function* yieldNothing(): AsyncGenerator<JobState, void, void> {
  // never yields — the test is about the upload phase only
}

describe('pipeline-store upload progress (T083 / FR-019)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    resetBffClientCacheForTests();
    resetStore();
    mockPollUntilTerminal.mockReturnValue(yieldNothing());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('progress callback updates uploadProgress while uploading', async () => {
    let capturedOnProgress: ((frac: number) => void) | undefined;
    mockPostTranslateSpeak.mockImplementationOnce(async (_uri, _dir, opts) => {
      capturedOnProgress = opts?.onProgress;
      // Hold the upload pending so we stay in 'uploading' phase
      return new Promise<UploadAccepted>(() => undefined);
    });

    usePipelineStore.getState().pressStart('english_to_wolof');
    void usePipelineStore.getState().pressRelease('file:///c/up.m4a', 3);
    // Allow the async pressRelease to fire postTranslateSpeak
    await Promise.resolve();
    await Promise.resolve();

    expect(capturedOnProgress).toBeDefined();

    capturedOnProgress!(0.25);
    expect(usePipelineStore.getState().uploadProgress).toBe(0.25);

    capturedOnProgress!(0.75);
    expect(usePipelineStore.getState().uploadProgress).toBe(0.75);
  });

  test(`uploadProgressVisible flips true after ${UPLOAD_PROGRESS_VISIBILITY_DELAY_MS}ms while still uploading`, async () => {
    mockPostTranslateSpeak.mockImplementationOnce(
      () => new Promise<UploadAccepted>(() => undefined),
    );

    usePipelineStore.getState().pressStart('english_to_wolof');
    void usePipelineStore.getState().pressRelease('file:///c/slow.m4a', 3);
    await Promise.resolve();
    await Promise.resolve();

    expect(usePipelineStore.getState().uploadProgressVisible).toBe(false);

    jest.advanceTimersByTime(UPLOAD_PROGRESS_VISIBILITY_DELAY_MS - 1);
    expect(usePipelineStore.getState().uploadProgressVisible).toBe(false);

    jest.advanceTimersByTime(1);
    expect(usePipelineStore.getState().uploadProgressVisible).toBe(true);
  });

  test('uploadProgressVisible stays false if upload completes before threshold', async () => {
    mockPostTranslateSpeak.mockResolvedValueOnce({
      requestId: 'req-fast',
      pollAfterMs: 100,
    } as UploadAccepted);

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/fast.m4a', 3);

    // Upload resolved → uploadAccepted dispatched → progress visibility reset
    expect(usePipelineStore.getState().uploadProgressVisible).toBe(false);
    expect(usePipelineStore.getState().uploadProgress).toBeNull();
    expect(usePipelineStore.getState().uploadStartedAtMs).toBeNull();

    // Even if the timer fires later, the phase is no longer 'uploading'
    jest.advanceTimersByTime(UPLOAD_PROGRESS_VISIBILITY_DELAY_MS + 100);
    expect(usePipelineStore.getState().uploadProgressVisible).toBe(false);
  });

  test('upload failure clears uploadProgress + visibility (no stale indicator on retry banner)', async () => {
    mockPostTranslateSpeak.mockRejectedValueOnce(
      new TranslationError({
        kind: 'upload_failed',
        message: 'boom',
        retryable: true,
      }),
    );

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/oops.m4a', 3);

    const state = usePipelineStore.getState();
    expect(state.phase).toBe('failed');
    expect(state.uploadProgress).toBeNull();
    expect(state.uploadProgressVisible).toBe(false);
    expect(state.uploadStartedAtMs).toBeNull();
  });

  test('progress events after the phase advances are no-ops (no leakage into polling)', async () => {
    let capturedOnProgress: ((frac: number) => void) | undefined;
    mockPostTranslateSpeak.mockImplementationOnce(async (_uri, _dir, opts) => {
      capturedOnProgress = opts?.onProgress;
      return { requestId: 'req-leak', pollAfterMs: 100 } as UploadAccepted;
    });

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/leak.m4a', 3);

    // Phase is now 'polling' — late progress event should not flip
    // uploadProgress back into a stale state
    expect(usePipelineStore.getState().phase).toBe('polling');
    capturedOnProgress?.(0.99);
    expect(usePipelineStore.getState().uploadProgress).toBeNull();
  });
});
