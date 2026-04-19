import type { BackendStage, Direction } from '@/api/bff-client';
import { stepLabel } from '@/pipeline/step-label';
import type { PipelinePhase } from '@/pipeline/state-machine';

describe('stepLabel — client-only phases (direction/stage ignored)', () => {
  const directions: (Direction | null)[] = ['english_to_wolof', 'wolof_to_english', null];

  it.each([
    ['idle', 'step.idle'],
    ['recording', 'step.idle'],
    ['uploading', 'step.uploading'],
    ['retrying', 'step.retrying'],
    ['playing', 'step.playing'],
    ['timed_out', 'step.timed_out'],
    ['failed', 'step.failed'],
  ] as const)('phase=%s → %s regardless of direction/stage', (phase, expected) => {
    for (const direction of directions) {
      expect(
        stepLabel({ phase: phase as PipelinePhase, backendStage: null, direction }),
      ).toBe(expected);
      expect(
        stepLabel({
          phase: phase as PipelinePhase,
          backendStage: 'translating',
          direction,
        }),
      ).toBe(expected);
    }
  });

  it('phase=completed falls back to step.playing (pre-playback flash)', () => {
    expect(
      stepLabel({ phase: 'completed', backendStage: 'completed', direction: 'english_to_wolof' }),
    ).toBe('step.playing');
  });
});

describe('stepLabel — polling phase direction-aware backend stages', () => {
  const directions: Direction[] = ['english_to_wolof', 'wolof_to_english'];

  it.each([
    ['queued', 'step.queued'],
    ['normalizing', 'step.normalizing'],
  ] as const)('stage=%s → %s for both directions', (stage, expected) => {
    for (const direction of directions) {
      expect(
        stepLabel({ phase: 'polling', backendStage: stage as BackendStage, direction }),
      ).toBe(expected);
    }
  });

  it('stage=transcribing: en→wo → step.transcribing.english', () => {
    expect(
      stepLabel({
        phase: 'polling',
        backendStage: 'transcribing',
        direction: 'english_to_wolof',
      }),
    ).toBe('step.transcribing.english');
  });

  it('stage=transcribing: wo→en → step.transcribing.wolof', () => {
    expect(
      stepLabel({
        phase: 'polling',
        backendStage: 'transcribing',
        direction: 'wolof_to_english',
      }),
    ).toBe('step.transcribing.wolof');
  });

  it('stage=translating: en→wo → step.translating.english_to_wolof', () => {
    expect(
      stepLabel({
        phase: 'polling',
        backendStage: 'translating',
        direction: 'english_to_wolof',
      }),
    ).toBe('step.translating.english_to_wolof');
  });

  it('stage=translating: wo→en → step.translating.wolof_to_english', () => {
    expect(
      stepLabel({
        phase: 'polling',
        backendStage: 'translating',
        direction: 'wolof_to_english',
      }),
    ).toBe('step.translating.wolof_to_english');
  });

  it('stage=generating_speech → step.generating_wolof_audio (en→wo only path)', () => {
    expect(
      stepLabel({
        phase: 'polling',
        backendStage: 'generating_speech',
        direction: 'english_to_wolof',
      }),
    ).toBe('step.generating_wolof_audio');
  });

  it('stage=completed (polling) → step.playing', () => {
    expect(
      stepLabel({
        phase: 'polling',
        backendStage: 'completed',
        direction: 'english_to_wolof',
      }),
    ).toBe('step.playing');
  });

  it('stage=failed (polling) → step.failed', () => {
    expect(
      stepLabel({
        phase: 'polling',
        backendStage: 'failed',
        direction: 'wolof_to_english',
      }),
    ).toBe('step.failed');
  });
});

describe('stepLabel — polling phase null-fallback', () => {
  it('phase=polling with backendStage=null falls back to step.queued', () => {
    expect(
      stepLabel({ phase: 'polling', backendStage: null, direction: 'english_to_wolof' }),
    ).toBe('step.queued');
  });

  it('phase=polling with backendStage=null and direction=null falls back to step.queued', () => {
    expect(
      stepLabel({ phase: 'polling', backendStage: null, direction: null }),
    ).toBe('step.queued');
  });
});
