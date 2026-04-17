import type { TranslationError, TranslationResult } from '../../api/bff-client';
import {
  initialPipelineState,
  reducePipeline,
  type PipelineAction,
  type PipelineState,
} from '../state-machine';

const uploadErr: TranslationError = {
  name: 'TranslationError',
  message: 'boom',
  kind: 'upload_failed',
  retryable: true,
} as unknown as TranslationError;

const serverErr: TranslationError = {
  name: 'TranslationError',
  message: 'server',
  kind: 'server_failed',
  retryable: false,
} as unknown as TranslationError;

const pollTransient: TranslationError = {
  name: 'TranslationError',
  message: 'transient',
  kind: 'poll_failed',
  retryable: true,
} as unknown as TranslationError;

const mockResult: TranslationResult = {
  requestId: 'a1b2c3d4',
  direction: 'english_to_wolof',
  targetLanguage: 'wolof',
  transcribedText: 'Good morning',
  translatedText: 'Jamm nga fanaan',
  outputMode: 'wolof_audio',
  audioUrl: '/api/requests/a1b2c3d4/audio',
  localAudioUri: null,
  completedAtMs: 1_713_276_005_083,
};

function run(actions: PipelineAction[]): PipelineState {
  return actions.reduce(reducePipeline, initialPipelineState);
}

describe('pipeline state machine', () => {
  describe('recording entry + exit', () => {
    test('idle → recording on pressStart', () => {
      const s = run([{ type: 'pressStart', direction: 'english_to_wolof' }]);
      expect(s.phase).toBe('recording');
      expect(s.direction).toBe('english_to_wolof');
      expect(s.error).toBeNull();
    });

    test('recording → idle on zero-second release (no upload)', () => {
      const s = run([
        { type: 'pressStart', direction: 'english_to_wolof' },
        { type: 'pressReleaseTooShort' },
      ]);
      expect(s.phase).toBe('idle');
      expect(s.capturedAudioUri).toBeNull();
    });

    test('recording → uploading on pressRelease with captured audio', () => {
      const s = run([
        { type: 'pressStart', direction: 'english_to_wolof' },
        {
          type: 'pressRelease',
          capturedUri: 'file:///cache/x.m4a',
          durationSec: 3.2,
          startedAtMs: 1_000_000,
        },
      ]);
      expect(s.phase).toBe('uploading');
      expect(s.capturedAudioUri).toBe('file:///cache/x.m4a');
      expect(s.recordedDurationSec).toBe(3.2);
      expect(s.startedAtMs).toBe(1_000_000);
      expect(s.timeoutAtMs).toBe(1_000_000 + 30_000 + 3.2 * 1000);
    });

    test('FR-002b — pressStart while not idle is ignored (concurrent-block guard)', () => {
      const after1 = run([{ type: 'pressStart', direction: 'english_to_wolof' }]);
      const after2 = reducePipeline(after1, {
        type: 'pressStart',
        direction: 'wolof_to_english',
      });
      expect(after2).toBe(after1);
    });
  });

  describe('upload → polling', () => {
    test('uploading → polling on uploadAccepted', () => {
      const s = run([
        { type: 'pressStart', direction: 'english_to_wolof' },
        {
          type: 'pressRelease',
          capturedUri: 'file:///c/x.m4a',
          durationSec: 3,
          startedAtMs: 1_000_000,
        },
        { type: 'uploadAccepted', requestId: 'abc', pollAfterMs: 500 },
      ]);
      expect(s.phase).toBe('polling');
      expect(s.requestId).toBe('abc');
    });

    test('uploading → failed on uploadFailed (preserves capturedAudioUri)', () => {
      const s = run([
        { type: 'pressStart', direction: 'english_to_wolof' },
        {
          type: 'pressRelease',
          capturedUri: 'file:///c/x.m4a',
          durationSec: 3,
          startedAtMs: 1_000_000,
        },
        { type: 'uploadFailed', error: uploadErr },
      ]);
      expect(s.phase).toBe('failed');
      expect(s.error).toBe(uploadErr);
      expect(s.capturedAudioUri).toBe('file:///c/x.m4a');
    });
  });

  describe('polling + retrying', () => {
    const base: PipelineAction[] = [
      { type: 'pressStart', direction: 'english_to_wolof' },
      {
        type: 'pressRelease',
        capturedUri: 'file:///c/x.m4a',
        durationSec: 3,
        startedAtMs: 1_000_000,
      },
      { type: 'uploadAccepted', requestId: 'abc', pollAfterMs: 500 },
    ];

    test('polling → polling on pollStage updates stage + detail', () => {
      const s = run([
        ...base,
        {
          type: 'pollStage',
          stage: 'transcribing',
          stageDetail: 'Running whisper',
        },
      ]);
      expect(s.phase).toBe('polling');
      expect(s.backendStage).toBe('transcribing');
      expect(s.backendStageDetail).toBe('Running whisper');
    });

    test('polling → retrying on pollTransient, increments pollAttempt', () => {
      const s = run([
        ...base,
        { type: 'pollTransient', error: pollTransient },
      ]);
      expect(s.phase).toBe('retrying');
      expect(s.pollAttempt).toBe(1);
    });

    test('retrying → polling on pollRecovered resets attempt counter', () => {
      const s = run([
        ...base,
        { type: 'pollTransient', error: pollTransient },
        { type: 'pollRecovered' },
      ]);
      expect(s.phase).toBe('polling');
      expect(s.pollAttempt).toBe(0);
    });

    test('retrying → failed on jobFailed (auto-retry exhaustion)', () => {
      const s = run([
        ...base,
        { type: 'pollTransient', error: pollTransient },
        { type: 'pollTransient', error: pollTransient },
        { type: 'pollTransient', error: pollTransient },
        { type: 'jobFailed', error: pollTransient },
      ]);
      expect(s.phase).toBe('failed');
      expect(s.error).toBe(pollTransient);
      expect(s.capturedAudioUri).toBe('file:///c/x.m4a');
    });

    test('polling → timed_out on timeout action (FR-020)', () => {
      const s = run([
        ...base,
        { type: 'timeout', nowMs: 9_999_999 },
      ]);
      expect(s.phase).toBe('timed_out');
      expect(s.capturedAudioUri).toBe('file:///c/x.m4a');
    });

    test('retrying → timed_out on timeout action', () => {
      const s = run([
        ...base,
        { type: 'pollTransient', error: pollTransient },
        { type: 'timeout', nowMs: 9_999_999 },
      ]);
      expect(s.phase).toBe('timed_out');
    });
  });

  describe('completion + playback', () => {
    const base: PipelineAction[] = [
      { type: 'pressStart', direction: 'english_to_wolof' },
      {
        type: 'pressRelease',
        capturedUri: 'file:///c/x.m4a',
        durationSec: 3,
        startedAtMs: 1_000_000,
      },
      { type: 'uploadAccepted', requestId: 'abc', pollAfterMs: 500 },
    ];

    test('polling → completed on jobCompleted populates result', () => {
      const s = run([...base, { type: 'jobCompleted', result: mockResult }]);
      expect(s.phase).toBe('completed');
      expect(s.result).toBe(mockResult);
    });

    test('polling → failed on jobFailed sets error', () => {
      const s = run([...base, { type: 'jobFailed', error: serverErr }]);
      expect(s.phase).toBe('failed');
      expect(s.error).toBe(serverErr);
    });

    test('completed → playing on playbackStarted', () => {
      const s = run([
        ...base,
        { type: 'jobCompleted', result: mockResult },
        { type: 'playbackStarted' },
      ]);
      expect(s.phase).toBe('playing');
    });

    test('playing → completed on playbackEnded', () => {
      const s = run([
        ...base,
        { type: 'jobCompleted', result: mockResult },
        { type: 'playbackStarted' },
        { type: 'playbackEnded' },
      ]);
      expect(s.phase).toBe('completed');
    });
  });

  describe('discard', () => {
    test('any non-idle phase → idle on discard (FR-021), clearing transient state', () => {
      const phases: PipelineAction[][] = [
        [{ type: 'pressStart', direction: 'english_to_wolof' }],
        [
          { type: 'pressStart', direction: 'english_to_wolof' },
          {
            type: 'pressRelease',
            capturedUri: 'file:///c/x.m4a',
            durationSec: 3,
            startedAtMs: 1_000_000,
          },
        ],
        [
          { type: 'pressStart', direction: 'english_to_wolof' },
          {
            type: 'pressRelease',
            capturedUri: 'file:///c/x.m4a',
            durationSec: 3,
            startedAtMs: 1_000_000,
          },
          { type: 'uploadFailed', error: uploadErr },
        ],
      ];
      for (const actions of phases) {
        const s = run([...actions, { type: 'discard' }]);
        expect(s).toEqual(initialPipelineState);
      }
    });
  });
});
