export type DirectionWire = 'english_to_wolof' | 'wolof_to_english';

export type JobStatusWire = 'queued' | 'processing' | 'completed' | 'failed';

export type BackendStageWire =
  | 'queued'
  | 'normalizing'
  | 'transcribing'
  | 'translating'
  | 'generating_speech'
  | 'completed'
  | 'failed';

export type OutputModeWire = 'wolof_audio' | 'english_audio' | 'text_only';

export interface UploadAcceptedWire {
  request_id: string;
  status: 'queued';
  stage: 'queued';
  direction: DirectionWire;
  status_url: string;
  poll_after_ms: number;
}

export interface JobErrorWire {
  message: string;
  type: string;
  stage?: BackendStageWire | string;
}

export interface JobResultWire {
  direction: DirectionWire;
  target_language: 'wolof' | 'english';
  transcribed_text: string;
  translated_text: string;
  output_mode: OutputModeWire;
  audio_url: string | null;
  speech_result?: { output_path: string } | null;
}

export interface JobStateWire {
  request_id: string;
  status: JobStatusWire;
  stage: BackendStageWire;
  stage_detail?: string | null;
  direction: DirectionWire;
  target_language?: 'wolof' | 'english';
  filename?: string;
  content_type?: string;
  bytes_received?: number;
  detected_format?: string;
  created_at_ms?: number;
  updated_at_ms?: number;
  timings_ms?: Record<string, number>;
  result: JobResultWire | null;
  error: JobErrorWire | null;
  completed_at_ms?: number;
  poll_after_ms: number;
}

export interface UploadErrorWire {
  request_id: string;
  status: 'failed';
  error: JobErrorWire;
}

export interface HealthWire {
  status: 'ok';
}
