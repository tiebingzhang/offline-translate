import { http, HttpResponse, delay } from 'msw';

import type {
  JobStateWire,
  UploadAcceptedWire,
  UploadErrorWire,
} from '../bff-types';

export const BFF_TEST_BASE_URL = 'http://localhost:8090';

export const fixtures = {
  uploadAccepted: (overrides?: Partial<UploadAcceptedWire>): UploadAcceptedWire => ({
    request_id: 'a1b2c3d4',
    status: 'queued',
    stage: 'queued',
    direction: 'english_to_wolof',
    status_url: '/api/requests/a1b2c3d4',
    poll_after_ms: 500,
    ...overrides,
  }),

  uploadBadDirection: (): UploadErrorWire => ({
    request_id: 'e5f6g7h8',
    status: 'failed',
    error: {
      message: "Unsupported 'direction' field.",
      type: 'BadRequest',
      stage: 'upload_validation',
    },
  }),

  jobQueued: (requestId = 'a1b2c3d4'): JobStateWire => ({
    request_id: requestId,
    status: 'queued',
    stage: 'queued',
    stage_detail: null,
    direction: 'english_to_wolof',
    target_language: 'wolof',
    timings_ms: {},
    result: null,
    error: null,
    poll_after_ms: 500,
  }),

  jobProcessing: (
    stage: JobStateWire['stage'] = 'transcribing',
    requestId = 'a1b2c3d4',
  ): JobStateWire => ({
    request_id: requestId,
    status: 'processing',
    stage,
    stage_detail: `Running ${stage}.`,
    direction: 'english_to_wolof',
    target_language: 'wolof',
    timings_ms: { normalizing: 412 },
    result: null,
    error: null,
    poll_after_ms: 500,
  }),

  jobCompleted: (
    requestId = 'a1b2c3d4',
    overrides?: Partial<JobStateWire>,
  ): JobStateWire => ({
    request_id: requestId,
    status: 'completed',
    stage: 'completed',
    stage_detail: 'Pipeline complete.',
    direction: 'english_to_wolof',
    target_language: 'wolof',
    timings_ms: {
      normalizing: 412,
      transcribing: 1811,
      translating: 634,
      generating_speech: 2103,
      total: 4960,
    },
    result: {
      direction: 'english_to_wolof',
      target_language: 'wolof',
      transcribed_text: 'Good morning',
      translated_text: 'Jamm nga fanaan',
      output_mode: 'wolof_audio',
      audio_url: `/api/requests/${requestId}/audio`,
      speech_result: { output_path: '/server/generated_audio/abc.wav' },
    },
    error: null,
    completed_at_ms: 1_713_276_005_083,
    poll_after_ms: 500,
    ...overrides,
  }),

  jobFailed: (requestId = 'a1b2c3d4'): JobStateWire => ({
    request_id: requestId,
    status: 'failed',
    stage: 'transcribing',
    direction: 'english_to_wolof',
    target_language: 'wolof',
    result: null,
    error: {
      message: 'whisper.cpp returned empty output.',
      type: 'TranscriptionError',
      stage: 'transcribing',
    },
    poll_after_ms: 500,
  }),

  notFound: (requestId = 'a1b2c3d4') => ({
    error: { message: 'Request not found.', type: 'NotFound' },
    request_id: requestId,
  }),

  healthOk: () => ({ status: 'ok' as const }),
};

export const handlers = {
  healthOk: () =>
    http.get(`${BFF_TEST_BASE_URL}/api/health`, () =>
      HttpResponse.json(fixtures.healthOk()),
    ),

  pollCompletedImmediately: (requestId = 'a1b2c3d4') =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}`, () =>
      HttpResponse.json(fixtures.jobCompleted(requestId)),
    ),

  pollSequence: (requestId: string, sequence: JobStateWire[]) => {
    let i = 0;
    return http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}`, () => {
      const body = sequence[Math.min(i, sequence.length - 1)];
      i += 1;
      return HttpResponse.json(body);
    });
  },

  pollTransientThenComplete: (requestId = 'a1b2c3d4') =>
    handlers.pollSequence(requestId, [
      fixtures.jobQueued(requestId),
      fixtures.jobProcessing('transcribing', requestId),
      fixtures.jobProcessing('translating', requestId),
      fixtures.jobCompleted(requestId),
    ]),

  pollFailingThenComplete: (
    requestId: string,
    failCount: number,
    failStatus = 503,
  ) => {
    let calls = 0;
    return http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}`, () => {
      calls += 1;
      if (calls <= failCount) {
        return HttpResponse.json({ error: 'service unavailable' }, { status: failStatus });
      }
      return HttpResponse.json(fixtures.jobCompleted(requestId));
    });
  },

  pollAlways5xx: (requestId = 'a1b2c3d4', status = 503) =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}`, () =>
      HttpResponse.json({ error: 'service unavailable' }, { status }),
    ),

  pollTerminalFailed: (requestId = 'a1b2c3d4') =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}`, () =>
      HttpResponse.json(fixtures.jobFailed(requestId)),
    ),

  pollNotFound: (requestId = 'a1b2c3d4') =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}`, () =>
      HttpResponse.json(fixtures.notFound(requestId), { status: 404 }),
    ),

  pollStuckOnProcessing: (requestId = 'a1b2c3d4') =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}`, () =>
      HttpResponse.json(fixtures.jobProcessing('transcribing', requestId)),
    ),

  pollWithCustomPollAfterMs: (requestId: string, pollAfterMs: number) =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}`, () =>
      HttpResponse.json({
        ...fixtures.jobProcessing('transcribing', requestId),
        poll_after_ms: pollAfterMs,
      }),
    ),

  pollWithExtraUnknownKeys: (requestId = 'a1b2c3d4') =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}`, () =>
      HttpResponse.json({
        ...fixtures.jobProcessing('transcribing', requestId),
        some_extra_field: 'ignore_me',
        result: null,
      }),
    ),

  audioOk: (requestId = 'a1b2c3d4', body = new Uint8Array([0, 1, 2, 3])) =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}/audio`, () =>
      HttpResponse.arrayBuffer(body.buffer, {
        headers: { 'content-type': 'audio/wav' },
      }),
    ),

  audioNotFound: (requestId = 'a1b2c3d4') =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/${requestId}/audio`, () =>
      HttpResponse.json(fixtures.notFound(requestId), { status: 404 }),
    ),

  delayed: (ms: number, response: unknown, status = 200) =>
    http.get(`${BFF_TEST_BASE_URL}/api/requests/:id`, async () => {
      await delay(ms);
      return HttpResponse.json(response as Parameters<typeof HttpResponse.json>[0], {
        status,
      });
    }),
};

export type BffHandlerKey = keyof typeof handlers;
