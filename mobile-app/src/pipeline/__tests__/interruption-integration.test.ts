// Phase 5 / US4 — pipeline-level interruption wiring (FR-008)
// Exercises the full path from an OS audio interruption through the pipeline
// store so that the app returns to a coherent 'completed' state with the
// result preserved for replay. Complements the unit-level coverage in
// src/audio/__tests__/interruption.test.ts, which tests only the session-layer
// state machine. Without this test, subscribeToInterruptions would have zero
// production call-sites — the contract exists only in the test harness.
// (001-wolof-translate-mobile:T079)
import {
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

// Player mock — captures the interruption subscription handler the
// pipeline-store registers, so the test can simulate an OS interruption
// firing during active playback (001-wolof-translate-mobile:T079)
let capturedOnInterruptionBegan: (() => void) | undefined;
let capturedOnEnded: (() => void) | undefined;
const mockPlayerStop = jest.fn<void, unknown[]>();
const mockPlayerPause = jest.fn<void, unknown[]>();
const mockPlayResult = jest.fn(
  async (
    _result: unknown,
    opts?: { onEnded?: () => void; onInterruptionBegan?: () => void },
  ) => {
    capturedOnEnded = opts?.onEnded;
    capturedOnInterruptionBegan = opts?.onInterruptionBegan;
  },
);

jest.mock('@/audio/player', () => ({
  defaultPlayer: {
    playResult: (result: unknown, opts?: unknown) => mockPlayResult(result, opts as never),
    pause: () => mockPlayerPause(),
    stop: () => mockPlayerStop(),
  },
}));

import {
  usePipelineStore,
  resetBffClientCacheForTests,
} from '@/state/pipeline-store';
import { initialPipelineState } from '@/pipeline/state-machine';

function resetStore(): void {
  usePipelineStore.setState({ ...initialPipelineState });
}

function makeTerminalState(): JobState {
  return {
    requestId: 'req-int-1',
    status: 'completed',
    stage: 'completed',
    stageDetail: null,
    completedAtMs: 2_000_000,
    result: {
      direction: 'english_to_wolof',
      targetLanguage: 'wolof',
      transcribedText: 'Good morning',
      translatedText: 'Jamm nga fanaan',
      outputMode: 'wolof_audio',
      audioUrl: '/api/requests/req-int-1/audio',
    },
  } as unknown as JobState;
}

async function* yieldTerminal(): AsyncGenerator<JobState, void, void> {
  yield makeTerminalState();
}

describe('pipeline-store interruption handling (Phase 5 / US4 / FR-008)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnInterruptionBegan = undefined;
    capturedOnEnded = undefined;
    resetBffClientCacheForTests();
    resetStore();
    mockDownloadAudio.mockResolvedValue('file:///document/audio/req-int-1.m4a');
  });

  test('registers an onInterruptionBegan handler when playback starts (FR-008)', async () => {
    mockPostTranslateSpeak.mockResolvedValueOnce({
      requestId: 'req-int-1',
      pollAfterMs: 100,
    } as UploadAccepted);
    mockPollUntilTerminal.mockReturnValueOnce(yieldTerminal());

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/int.m4a', 3);

    expect(mockPlayResult).toHaveBeenCalledTimes(1);
    expect(typeof capturedOnInterruptionBegan).toBe('function');
    expect(usePipelineStore.getState().phase).toBe('playing');
  });

  test('OS interruption during playback pauses playback and restores completed phase (FR-008 / spec §US4 scenario 2)', async () => {
    mockPostTranslateSpeak.mockResolvedValueOnce({
      requestId: 'req-int-1',
      pollAfterMs: 100,
    } as UploadAccepted);
    mockPollUntilTerminal.mockReturnValueOnce(yieldTerminal());

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/int.m4a', 3);

    expect(usePipelineStore.getState().phase).toBe('playing');
    expect(usePipelineStore.getState().result?.requestId).toBe('req-int-1');

    // Simulate OS interruption (phone call, Siri, alarm)
    capturedOnInterruptionBegan?.();

    const state = usePipelineStore.getState();
    // Coherent state: the pipeline returns to 'completed' with the result
    // preserved so the user can replay. Per spec §US4 scenario 2, this is
    // the "stopped with a clearly visible way to replay" branch.
    expect(state.phase).toBe('completed');
    expect(state.result?.requestId).toBe('req-int-1');
    // Native playback stopped so the interruption sound (call audio) is not
    // fighting with Wolof playback.
    expect(mockPlayerPause).toHaveBeenCalled();
  });

  test('natural playback end also returns to completed (no regression on onEnded path)', async () => {
    mockPostTranslateSpeak.mockResolvedValueOnce({
      requestId: 'req-int-1',
      pollAfterMs: 100,
    } as UploadAccepted);
    mockPollUntilTerminal.mockReturnValueOnce(yieldTerminal());

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/int.m4a', 3);
    expect(usePipelineStore.getState().phase).toBe('playing');

    capturedOnEnded?.();

    expect(usePipelineStore.getState().phase).toBe('completed');
    expect(mockPlayerPause).not.toHaveBeenCalled();
  });

  test('interruption during non-playing phase is safely ignored (idempotent)', async () => {
    mockPostTranslateSpeak.mockResolvedValueOnce({
      requestId: 'req-int-1',
      pollAfterMs: 100,
    } as UploadAccepted);
    mockPollUntilTerminal.mockReturnValueOnce(yieldTerminal());

    usePipelineStore.getState().pressStart('english_to_wolof');
    await usePipelineStore.getState().pressRelease('file:///c/int.m4a', 3);

    // First interruption lands us in 'completed'
    capturedOnInterruptionBegan?.();
    expect(usePipelineStore.getState().phase).toBe('completed');

    // A second spurious invocation must not crash or mutate state further
    expect(() => capturedOnInterruptionBegan?.()).not.toThrow();
    expect(usePipelineStore.getState().phase).toBe('completed');
  });
});
