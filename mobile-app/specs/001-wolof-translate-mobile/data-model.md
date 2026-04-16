# Phase 1 Data Model: Wolof Translate Mobile Client

**Date**: 2026-04-16
**Spec**: [`spec.md`](./spec.md)
**Scope**: On-device state and persisted entities. All types are camelCase at the TypeScript domain layer (per Constitution III); the BFF wire layer stays snake_case and is converted at the boundary (see `contracts/bff-api.md`).

---

## 1. Domain entities

### 1.1 `TranslationRequest` (session-only; NOT persisted as a long-term row)

Represents one in-flight user attempt. Held in `usePipelineStore`.

```ts
type Direction = 'english_to_wolof' | 'wolof_to_english';

type PipelinePhase =
  | 'idle'
  | 'recording'
  | 'uploading'
  | 'polling'
  | 'retrying'     // FR-017a poll auto-retry window
  | 'playing'
  | 'completed'
  | 'failed'
  | 'timed_out';   // FR-020 client-side timeout

type BackendStage =
  | 'queued'
  | 'normalizing'
  | 'transcribing'
  | 'translating'
  | 'generating_speech'
  | 'completed'
  | 'failed';

interface TranslationRequest {
  localId: string;              // uuid v4 (client-generated, for log correlation)
  requestId: string | null;     // set once the BFF 202 response arrives; survives backgrounding
  direction: Direction;
  capturedAudioUri: string;     // file:// path under Paths.cache/in-flight/ or document/audio/
  recordedDurationSec: number;  // used by FR-020 timeout formula
  phase: PipelinePhase;
  backendStage: BackendStage | null;
  backendStageDetail: string | null;
  timingsMs: Record<string, number>;
  pollAttempt: number;          // auto-retry counter for FR-017a (max 3)
  startedAtMs: number;          // wall-clock, for FR-020 total timeout check
  timeoutAtMs: number;          // startedAtMs + (30 + recordedDurationSec) * 1000
  error: TranslationError | null;
}

interface TranslationError {
  kind: 'upload_failed' | 'poll_failed' | 'server_failed' | 'client_timeout' | 'malformed_response';
  message: string;        // user-readable
  httpStatus?: number;    // when known
  retryable: boolean;
}
```

**State transitions** (guarded):

```
idle → recording               (press-and-hold direction control; FR-002)
recording → uploading          (release or 60 s auto-stop; FR-002/FR-002a)
recording → idle               (zero-second edge; FR Edge Cases "Zero-second recording")
uploading → polling            (on 202 Accepted; requestId now set)
uploading → failed             (upload error; FR-017)
polling → completed            (status === "completed" + result populated)
polling → failed               (status === "failed" from BFF)
polling → retrying             (transient poll error; FR-017a)
retrying → polling             (auto-retry succeeds)
retrying → failed              (3 auto-retries exhausted; FR-017a)
polling | retrying → timed_out (wall-clock exceeds timeoutAtMs; FR-020)
completed → playing            (auto-playback starts)
playing → completed            (playback finishes)
(any pending) → idle           (user discards; FR-021)
```

Captured audio (`capturedAudioUri`) is NOT deleted on `failed` or `timed_out` (FR-017 / FR-021). It IS deleted on `idle` re-entry via user discard OR on successful `completed` — AFTER the blob has been copied into the history cache audio path (if the result qualifies for history retention).

### 1.2 `TranslationResult` (session object; some fields persisted via `HistoryEntry`)

The completion payload derived from a successful `GET /api/requests/{id}` response.

```ts
type OutputMode = 'wolof_audio' | 'english_audio' | 'text_only';

interface TranslationResult {
  requestId: string;
  direction: Direction;
  targetLanguage: 'wolof' | 'english';
  transcribedText: string;      // source
  translatedText: string;       // target
  outputMode: OutputMode;
  audioUrl: string | null;      // absolute URL to BFF audio endpoint (BE-1); null for english_to_wolof until BE-1 ships
  localAudioUri: string | null; // set once audio has been downloaded to Paths.document/audio/{requestId}.m4a
  completedAtMs: number;        // epoch ms (BFF's completed_at_ms)
}
```

### 1.3 `HistoryEntry` (persisted in SQLite + filesystem)

A Translation Result that's been retained in the on-device cache. Subject to FR-012 count (≤ 20) and size (≤ 50 MB) caps.

```ts
interface HistoryEntry {
  id: number;                   // SQLite rowid
  requestId: string;            // from BFF
  direction: Direction;
  transcribedText: string;
  translatedText: string;
  audioPath: string;            // relative to Paths.document/audio/ (e.g., "a1b2c3d4.m4a")
  audioByteSize: number;        // used for the 50 MB cap check
  createdAtMs: number;          // epoch ms (completedAtMs from the source result)
}
```

**Invariants**:
- `audioPath` MUST point to a file that exists on disk when the row is queried. A row whose file is missing is treated as corrupt and pruned.
- `COUNT(*) ≤ 20` after every insert (trim oldest on overflow; FR-012).
- `SUM(audioByteSize) ≤ 50 * 1024 * 1024` after every insert (trim oldest on overflow; FR-012).
- Delete (FR-013c) is transactional: remove the SQLite row AND unlink the audio file in the same user action.

### 1.4 `UserSettings` (persisted via AsyncStorage; user-visible)

Settings accessible via the app-bar gear icon (FR-028a).

```ts
interface UserSettings {
  tapMode: boolean;              // false = push-and-hold (default); true = tap-to-start/tap-to-stop (FR-028)
  // Reserved for future versions (locale override, bulk history delete toggles, etc.)
}
```

**Defaults**: `{ tapMode: false }`.

### 1.5 `DeveloperSettings` (persisted via AsyncStorage; dev-visible only)

Settings accessible via the dev-mode panel (FR-014 / FR-015).

```ts
interface DeveloperSettings {
  devModeEnabled: boolean;       // off by default (FR-014 / FR-016)
  backendUrlOverride: string | null; // null = use build-time default (FR-022)
}
```

**Defaults**: `{ devModeEnabled: false, backendUrlOverride: null }`.

### 1.6 `DevLogEntry` (session-only; in-memory only)

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface DevLogEntry {
  seq: number;
  atMs: number;         // wall-clock epoch ms
  level: LogLevel;
  tag: string;          // e.g., 'bff', 'audio', 'pipeline'
  message: string;
  meta?: Record<string, unknown>;
}
```

Buffer capacity: 500. `clear()` empties the buffer (FR-015d).

---

## 2. Persistence topology

| Concern | Store | Why |
|---|---|---|
| Current pipeline state | Zustand `usePipelineStore` (in-memory) | Session-only; FR-002b forbids cross-launch concurrent state |
| User settings | Zustand `useSettingsStore` with `persist` → AsyncStorage | Small KV, no query patterns; fast cold-read for FR-028 |
| Developer settings | Same store as user settings (namespaced) | Same KV store; no second dependency |
| History metadata | `expo-sqlite` — `history.db`, table `history` | Predictable ordering + bounded-count trim is cleaner in SQL |
| History audio blobs | `expo-file-system` `Paths.document/audio/{requestId}.m4a` | `documentDirectory` survives OS purge (unlike `cacheDirectory`); required by FR-007 / FR-013 |
| In-flight captured audio | `expo-file-system` `Paths.cache/in-flight/{localId}.m4a` | Transient; fine to lose on OS purge after completion |
| In-flight `requestId` (for background-resume) | SQLite `pending_jobs` table (see §3) | Persists across process termination; required by FR-006a |
| Dev-mode event log | Zustand `useDevLogStore` (in-memory, session-only) | FR-015d scope is "current session"; clear-log action zeroes the buffer |

---

## 3. SQLite schema

`history.db` (opened once at app launch via `openDatabaseAsync`):

```sql
CREATE TABLE IF NOT EXISTS history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id      TEXT    NOT NULL UNIQUE,
  direction       TEXT    NOT NULL CHECK (direction IN ('english_to_wolof','wolof_to_english')),
  transcribed_text TEXT   NOT NULL,
  translated_text TEXT    NOT NULL,
  audio_path      TEXT    NOT NULL,
  audio_byte_size INTEGER NOT NULL,
  created_at_ms   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_created_at_desc
  ON history (created_at_ms DESC);

CREATE TABLE IF NOT EXISTS pending_jobs (
  request_id      TEXT    PRIMARY KEY,
  direction       TEXT    NOT NULL,
  captured_audio_path TEXT NOT NULL,
  recorded_duration_sec REAL NOT NULL,
  started_at_ms   INTEGER NOT NULL,
  timeout_at_ms   INTEGER NOT NULL
);
```

`pending_jobs` exists to support FR-006a: on 202 Accepted, the client INSERTs a row; on terminal state, the row is DELETEd. On cold start the client reads `pending_jobs` and resumes polling each row whose `timeout_at_ms > now` (others are deleted and the user is shown the retry affordance).

Note per Constitution I (Schema Safety): **these are client-owned tables in a client-owned SQLite file. No shared/server-side schema is altered by app code.** This is not a migration event in the Flyway sense; it's a local DB the client fully controls. The table is created idempotently on first launch and never "altered" by running code — any future schema change ships via a new migration file + a gated `PRAGMA user_version` check.

---

## 4. AsyncStorage keys

Namespaced under `wt.*` to avoid collision if the app is ever embedded in a host app later:

| Key | Value | Used by |
|---|---|---|
| `wt.tapMode` | `boolean` | FR-028 |
| `wt.devModeEnabled` | `boolean` | FR-014 / FR-016 |
| `wt.backendUrlOverride` | `string \| null` | FR-015e / FR-022 |

No other keys are read or written. Migration strategy: unknown keys are ignored; missing keys default to the type's zero value per §1.

---

## 5. Derived / computed values

| Value | Source | Used by |
|---|---|---|
| `timeoutAtMs` | `startedAtMs + (30 + recordedDurationSec) * 1000` | FR-020 |
| `nextPollDelayMs` on auto-retry | `[1000, 3000, 9000][pollAttempt - 1]` | FR-017a |
| `directionLabel` | i18n catalog keys `direction.english_to_wolof` / `direction.wolof_to_english` | FR-035 |
| `stageLabel` | i18n catalog keys `stage.normalizing`, `stage.transcribing`, `stage.translating`, `stage.generating_speech` | FR-003 / SC-006 |

---

## 6. Redaction / privacy at the data boundary

Per FR-033 and FR-034:
- Captured audio is the ONLY PII-like payload. It NEVER leaves the device except as the body of `POST /api/translate-speak`.
- The event log (§1.6) MUST NOT contain microphone audio bytes. Meta may reference `capturedAudioUri` by path only.
- Dev-mode "raw back-end response" (FR-015c) may display the transcribed text — that's an explicit developer-opt-in view and is scoped to the device (no external telemetry per FR-034 / SC-011).
