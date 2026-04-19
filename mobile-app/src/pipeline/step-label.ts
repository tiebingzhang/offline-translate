import type { BackendStage, Direction } from '@/api/bff-client';
import type { PipelinePhase } from '@/pipeline/state-machine';

export type StepMessageKey =
  | 'step.idle'
  | 'step.uploading'
  | 'step.queued'
  | 'step.normalizing'
  | 'step.transcribing.english'
  | 'step.transcribing.wolof'
  | 'step.translating.english_to_wolof'
  | 'step.translating.wolof_to_english'
  | 'step.generating_wolof_audio'
  | 'step.playing'
  | 'step.retrying'
  | 'step.timed_out'
  | 'step.failed';

export interface StepLabelInputs {
  phase: PipelinePhase;
  backendStage: BackendStage | null;
  direction: Direction | null;
}

export function stepLabel(input: StepLabelInputs): StepMessageKey {
  switch (input.phase) {
    case 'idle':
    case 'recording':
      return 'step.idle';
    case 'uploading':
      return 'step.uploading';
    case 'retrying':
      return 'step.retrying';
    case 'playing':
    case 'completed':
      return 'step.playing';
    case 'timed_out':
      return 'step.timed_out';
    case 'failed':
      return 'step.failed';
    case 'polling':
      return stageLabel(input.backendStage, input.direction);
    default:
      return 'step.queued';
  }
}

function stageLabel(
  stage: BackendStage | null,
  direction: Direction | null,
): StepMessageKey {
  switch (stage) {
    case 'queued':
      return 'step.queued';
    case 'normalizing':
      return 'step.normalizing';
    case 'transcribing':
      return direction === 'wolof_to_english'
        ? 'step.transcribing.wolof'
        : 'step.transcribing.english';
    case 'translating':
      return direction === 'wolof_to_english'
        ? 'step.translating.wolof_to_english'
        : 'step.translating.english_to_wolof';
    case 'generating_speech':
      return 'step.generating_wolof_audio';
    case 'completed':
      return 'step.playing';
    case 'failed':
      return 'step.failed';
    case null:
    default:
      return 'step.queued';
  }
}
