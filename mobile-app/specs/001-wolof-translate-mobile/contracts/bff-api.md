# BFF API Consumer Contract

**Date**: 2026-04-16
**Consumer**: Wolof Translate iOS mobile client
**Provider**: `web_server.py` (port 8090) in the parent `offline-translate` project

This document describes the mobile client's **consumption** of the BFF contract. The BFF is the source of truth; this file records the wire shape the client depends on so contract tests can fail fast when the BFF drifts.

**Casing**: BFF wire payloads are **snake_case**. The mobile client converts to camelCase at the boundary (`src/api/bff-client.ts`). Both shapes are documented below.

---

## 1. `POST /api/translate-speak`

Enqueue a new translation job.

### Request

- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Fields**:

| Part | Required | Content-Type | Description |
|---|---|---|---|
| `file` | yes | `audio/m4a` (or `audio/wav` for legacy; see note) | Recorded audio. Client sends AAC/m4a at 48 kbps mono 16 kHz. |
| `direction` | yes | `text/plain` | One of `english_to_wolof`, `wolof_to_english`. |

**Note on audio format**: The BFF's current `sniff_audio_format` accepts WAV. Per `mobile_app_implementation_plan.md:125` and `spec.md` §Dependencies, a companion BFF change (BE-2: PyAV transcoding) must accept AAC/m4a before the mobile client can function. **Blocking dependency.**

### Response — 202 Accepted (happy path)

```json
{
  "request_id": "a1b2c3d4",
  "status": "queued",
  "stage": "queued",
  "direction": "english_to_wolof",
  "status_url": "/api/requests/a1b2c3d4",
  "poll_after_ms": 500
}
```

Client-side camelCase domain mapping:

```ts
interface UploadAccepted {
  requestId: string;
  status: 'queued';
  stage: 'queued';
  direction: Direction;
  statusUrl: string;        // relative path; resolve against configured backend base URL
  pollAfterMs: number;
}
```

### Response — 400 Bad Request

Returned for missing `file`, empty upload, or unsupported `direction`.

```json
{
  "request_id": "e5f6g7h8",
  "status": "failed",
  "error": {
    "message": "Missing 'file' field in multipart upload.",
    "type": "BadRequest",
    "stage": "upload_validation"
  }
}
```

### Failure modes the client MUST handle

| Condition | HTTP status | Client response (spec ref) |
|---|---|---|
| Network unreachable | — (fetch reject) | `TranslationError.kind = 'upload_failed'`; preserve audio; show retry (FR-017) |
| Timeout before headers | — (fetch reject) | same as above |
| 400 Bad Request | 400 | Show user-readable `error.message`; NOT retryable (FR-018) |
| 5xx | 5xx | `kind = 'upload_failed'`; preserve audio; show retry (FR-017; NOT auto-retried — FR-017) |
| Malformed JSON | any | `kind = 'malformed_response'`; show retry (FR-018) |

---

## 2. `GET /api/requests/{request_id}`

Poll job state.

### Request

No body. Path variable `request_id` from the upload response.

### Response — 200 OK

Two main terminal shapes and one transient shape. Every response includes `poll_after_ms: 500` — the client MUST respect this cadence for the next poll (FR-004; `mobile_app_requirements.md` FR-4).

**Transient (status one of `queued | processing`)**:

```json
{
  "request_id": "a1b2c3d4",
  "status": "processing",
  "stage": "transcribing",
  "stage_detail": "Running whisper.cpp on 48 kbps AAC input.",
  "direction": "english_to_wolof",
  "target_language": "wolof",
  "filename": "upload.m4a",
  "content_type": "audio/m4a",
  "bytes_received": 182341,
  "detected_format": "m4a",
  "created_at_ms": 1713276000123,
  "updated_at_ms": 1713276002456,
  "timings_ms": { "normalizing": 412 },
  "result": null,
  "error": null,
  "poll_after_ms": 500
}
```

**Terminal — completed**:

```json
{
  "request_id": "a1b2c3d4",
  "status": "completed",
  "stage": "completed",
  "stage_detail": "Pipeline complete.",
  "direction": "english_to_wolof",
  "target_language": "wolof",
  "timings_ms": {
    "normalizing": 412, "transcribing": 1811, "translating": 634,
    "generating_speech": 2103, "total": 4960
  },
  "result": {
    "direction": "english_to_wolof",
    "target_language": "wolof",
    "transcribed_text": "Good morning",
    "translated_text": "Jamm nga fanaan",
    "whisper_response": { "...": "truncated" },
    "translation_result": null,
    "output_mode": "wolof_audio",
    "speech_result": {
      "output_path": "/abs/path/on/server/generated_audio/<uuid>.wav"
    },
    "audio_url": "/api/requests/a1b2c3d4/audio"
  },
  "error": null,
  "completed_at_ms": 1713276005083,
  "poll_after_ms": 500
}
```

> ⚠ **`audio_url` is a BE-1 field, not present in the current production BFF.** Until BE-1 lands (see `mobile_app_implementation_plan.md:260`), english_to_wolof cannot deliver playable audio to the mobile client. This is the hard prerequisite tracked in `research.md` §10 R-A.

**Terminal — failed**:

```json
{
  "request_id": "a1b2c3d4",
  "status": "failed",
  "stage": "transcribing",
  "direction": "english_to_wolof",
  "result": null,
  "error": {
    "message": "whisper.cpp returned empty output.",
    "type": "TranscriptionError",
    "stage": "transcribing"
  },
  "poll_after_ms": 500
}
```

### Response — 404 Not Found

When the `request_id` is unknown (expired on the BFF side or typoed):

```json
{
  "error": { "message": "Request not found.", "type": "NotFound" },
  "request_id": "a1b2c3d4"
}
```

Client-side: treat as terminal `failed` with `kind = 'server_failed'` and a user-readable message; captured audio preserved; retry affordance shown (FR-017 / FR-018).

### Client-side camelCase domain mapping

```ts
interface JobState {
  requestId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stage: BackendStage;
  stageDetail: string | null;
  direction: Direction;
  targetLanguage: 'wolof' | 'english';
  timingsMs: Record<string, number>;
  result: JobResult | null;
  error: JobError | null;
  pollAfterMs: number;
  completedAtMs?: number;
}

interface JobResult {
  direction: Direction;
  targetLanguage: 'wolof' | 'english';
  transcribedText: string;
  translatedText: string;
  outputMode: OutputMode;
  audioUrl: string | null; // BE-1
}

interface JobError {
  message: string;
  type: string;
  stage: BackendStage;
}
```

---

## 3. `GET /api/requests/{request_id}/audio`  (BE-1 — pending)

Stream the generated audio for a completed `english_to_wolof` job.

### Request

No body. Response is a binary audio stream.

### Response — 200 OK

- **Content-Type**: `audio/wav` (per `mobile_app_implementation_plan.md:327`) or `audio/m4a` if the BFF transcodes.
- **Body**: raw audio bytes.

Client downloads via `expo-file-system` (`downloadAsync` to `Paths.document/audio/{requestId}.m4a`). This happens immediately on pipeline completion and BEFORE the history-insert so FR-013 offline-replay works on first view.

### Failure modes

| Condition | Client response |
|---|---|
| 404 / 410 | Log warning; mark history entry's `localAudioUri = null`; user sees text-only row (graceful degradation for FR-013) |
| Network error during download | Retry once; if still failing, same as 404 |

---

## 4. `GET /api/health`

Lightweight liveness check.

### Response — 200 OK

```json
{ "status": "ok" }
```

Used only in dev-mode's "ping backend" affordance and potentially in the cold-start configuration-sanity check against `backendUrlOverride`. NOT part of the user-facing pipeline.

---

## 5. Contract tests (schedule in `tasks.md`)

Every handler below MUST exist in `src/api/__tests__/bff-client.test.ts` BEFORE `src/api/bff-client.ts` is implemented (Constitution II). MSW handlers are the test fixture.

| # | Contract test | Given | When | Then |
|---|---|---|---|---|
| C1 | Upload happy path | valid m4a + direction | client `postTranslateSpeak(...)` | returns `UploadAccepted` with `requestId`, `pollAfterMs` |
| C2 | Upload 400 bad direction | valid m4a + unsupported direction | client `postTranslateSpeak(...)` | throws `TranslationError(kind='upload_failed', httpStatus=400, retryable=false)` |
| C3 | Upload network error | server unreachable | client `postTranslateSpeak(...)` | throws `TranslationError(kind='upload_failed', retryable=true)` |
| C4 | Upload malformed JSON | 202 body is `<html>...` | client `postTranslateSpeak(...)` | throws `TranslationError(kind='malformed_response', retryable=false)` |
| C5 | Poll transient → complete | sequence of MSW responses `queued → processing → completed` | client `pollUntilTerminal(requestId)` | yields stages in order, returns completed `JobState` |
| C6 | Poll auto-retry on 5xx | 1 × 503 then 200 completed | client `pollUntilTerminal(...)` | 1 backoff (1 s) then success (FR-017a) |
| C7 | Poll auto-retry exhaustion | 3 × 503 | client `pollUntilTerminal(...)` | throws `TranslationError(kind='poll_failed', retryable=true)` after 3 backoffs |
| C8 | Poll terminal failed | `status=failed` with error body | client `pollUntilTerminal(...)` | throws `TranslationError(kind='server_failed', retryable=false)` |
| C9 | Poll 404 | unknown `request_id` | client `pollUntilTerminal(...)` | throws `TranslationError(kind='server_failed', retryable=false)` |
| C10 | Client-side timeout | polls stay on `processing` past `timeoutAtMs` | client `pollUntilTerminal(...)` | throws `TranslationError(kind='client_timeout', retryable=true)` (FR-020) |
| C11 | Audio download happy path | 200 + wav bytes | client `downloadAudio(requestId)` | returns local `file://` URI under `Paths.document/audio/` |
| C12 | Audio download 404 | 404 | client `downloadAudio(requestId)` | returns `null` (graceful degradation) |
| C13 | Casing boundary — poll | wire payload with `request_id`, `stage_detail` | client returns `JobState` | fields are camelCase; unknown wire keys are stripped |
| C14 | `poll_after_ms` is honored | response returns `poll_after_ms: 1500` | client schedules next poll | waits ≥ 1500 ms |
| C15 | Health check | `GET /api/health` | client `checkHealth()` | returns `{ status: 'ok' }` |

---

## 6. Versioning & drift

- The BFF has no formal API version header. Drift is detected via contract tests (§5) running in CI.
- If the BFF adds a field in `result` or `error`, the client passes it through to the dev-mode raw-response view (FR-015c) unchanged but ignores it for domain logic unless explicitly consumed.
- If the BFF removes or renames any of `request_id`, `status`, `stage`, `direction`, `poll_after_ms`, `result.transcribed_text`, `result.translated_text`, `result.output_mode`, `result.audio_url`, the contract tests fail and a coordinated BFF+mobile change is required.
