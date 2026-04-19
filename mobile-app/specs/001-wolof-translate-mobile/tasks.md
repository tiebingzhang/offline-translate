---
description: "Task list for the Wolof Translate Mobile Client (iOS v1)"
---

# Tasks: Wolof Translate Mobile Client

**Input**: Design documents from `/specs/001-wolof-translate-mobile/`
**Spec**: [`spec.md`](./spec.md) · **Plan**: [`plan.md`](./plan.md) · **Research**: [`research.md`](./research.md) · **Data model**: [`data-model.md`](./data-model.md) · **BFF contract**: [`contracts/bff-api.md`](./contracts/bff-api.md) · **Quickstart**: [`quickstart.md`](./quickstart.md)

**Tests**: Contract + unit + integration tests are **REQUIRED** for every surface that talks to the BFF (Constitution II — NON-NEGOTIABLE). Tests precede implementation within each user story.

**Organization**: Tasks are grouped by user story to enable independent implementation, testing, and demo.

**Format**: `[ID] [P?] [Story?] Description (exact file path)`

- **[P]** — parallelizable (different files, no dependency on an incomplete task)
- **[Story]** — maps to a spec user story (US1 / US2 / US3 / US4 / US5)
- **[M]** — manual user-review checkpoint (Constitution VIII: UI Mock-First; no downstream task in the same story may begin until [M] is recorded complete)
- **[Commit]** — end-of-phase commit task (Constitution VI)

> **Cross-repo prerequisites (prior)**: Previously listed BE-1 (audio download endpoint) + BE-2 (AAC/m4a ingestion) as cross-session prereqs tracked in `mobile_app_implementation_plan.md`. **Both are now folded into this session on 2026-04-17**: BE-2 is **FR-038 / T135a–T143**, BE-1 is **FR-039 / T144–T151**. Same git root, same feature branch; no cross-repo work remains. SC-001 end-to-end (including audio playback) is achievable within this session alone.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the Expo SDK 55 + TypeScript project and configure all build/test tooling.

- [X] T001 Create Expo SDK 55 TypeScript scaffold at `mobile-app/` root: `npx create-expo-app@latest . --template blank-typescript`; pin `expo@55` in `mobile-app/package.json`
- [X] T002 [P] Install runtime dependencies in `mobile-app/package.json`: `expo-audio`, `expo-file-system`, `expo-speech`, `expo-haptics`, `expo-localization`, `expo-sqlite`, `expo-router`, `expo-linking`, `expo-document-picker`, `@react-native-async-storage/async-storage`, `zustand@5`, `@lingui/core`, `@lingui/react`
- [X] T003 [P] Install dev dependencies: `@lingui/cli`, `@lingui/macro`, `@lingui/metro-transformer`, `jest-expo`, `@testing-library/react-native@14`, `msw@2`, `fast-text-encoding`, `react-native-url-polyfill`, `eslint-config-expo`, `prettier`, `typescript@5`
- [X] T004 [P] Configure `mobile-app/tsconfig.json` with `strict: true`, `moduleResolution: "bundler"`, and `paths` alias `@/*` → `src/*`
- [X] T005 [P] Configure `mobile-app/app.json`: declare `expo-audio` config plugin with `microphonePermission` copy + `enableBackgroundPlayback: true`, declare `expo-localization`, declare `expo-router` entry
- [X] T006 [P] Create `mobile-app/app.config.ts` implementing per-EAS-profile `NSAppTransportSecurity` branching (dev-only `localhost` + `.local` exceptions) per `research.md` §5
- [X] T007 [P] Create `mobile-app/eas.json` with three profiles: `development` (simulator + ad-hoc, HTTP-enabled), `preview` (ad-hoc internal), `production` (TestFlight, TLS-only)
- [X] T008 [P] Create `mobile-app/metro.config.js` adding `@lingui/metro-transformer/expo` and appending `po` to `resolver.sourceExts`
- [X] T009 [P] Create `mobile-app/jest.config.js` with `preset: "jest-expo"`, `setupFilesAfterEach: ["./jest.setup.ts"]`, and `testPathIgnorePatterns` for `node_modules` + `ios`
- [X] T010 [P] Create `mobile-app/.env.example` and `mobile-app/.env.development` with `BFF_BASE_URL_DEV=http://<lan-ip>:8090` placeholder
- [X] T011 [P] Create `mobile-app/.eslintrc.json` extending `eslint-config-expo`; create `mobile-app/.prettierrc` with project defaults
- [X] T012 [P] Add `lingui.config.ts` at `mobile-app/` root: source locales `en`, catalogs dir `src/i18n/locales/<locale>`
- [X] T013 [Commit] `001-wolof-translate-mobile:Phase1-Setup: initial Expo SDK 55 scaffold + tooling`

**Checkpoint**: Scaffold compiles; `npm test` runs (no tests yet, exits 0); `npx expo start` shows blank dev-client.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core cross-cutting modules required by every user story. No user-story work may start until this phase is complete.

- [X] T014 Create `mobile-app/jest.setup.ts`: register `msw/native` server, import `react-native-url-polyfill/auto` + `fast-text-encoding`, and add `jest.mock(...)` stubs for `expo-audio`, `expo-file-system`, `expo-file-system/legacy`, `expo-speech`, `expo-haptics`, `expo-sqlite`, `@react-native-async-storage/async-storage`, `expo-document-picker`
- [X] T015 Create `mobile-app/src/design/tokens.ts`: light + dark palettes (base `#f4efe6`, accent `#c8553d`, deep accent `#8b2e1b`, success `#1f6b4f` — plus secondary palette deep-indigo / ochre / muted-terracotta per `spec.md` FR-029 and `mobile_app_requirements.md` UX-10), spacing, radii, typography (SF Pro body, New York heading)
- [X] T016 [P] Create `mobile-app/src/i18n/index.ts`: Lingui initialization + `expo-localization.getLocales()` resolution; FR-037 fallback to `en`
- [X] T017 [P] Create `mobile-app/src/i18n/locales/en/messages.po` with initial string keys (directions, stages, errors, empty states, accessibility labels, retry banner copy)
- [X] T018 [P] Create `mobile-app/src/utils/casing.ts`: `toWire()` / `fromWire()` converters (snake_case ↔ camelCase) handling nested objects + arrays + primitives
- [X] T019 [P] Create `mobile-app/src/utils/__tests__/casing.test.ts`: unit coverage for flat, nested, arrays, null, and pass-through of unknown-shape values
- [X] T020 [P] Create `mobile-app/src/state/dev-log-store.ts`: Zustand circular buffer (capacity 500) with `append(entry)` (shifts oldest on overflow) and `clear()` actions; session-only (no `persist` middleware) per FR-015d
- [X] T021 [P] Create `mobile-app/src/utils/logger.ts`: `log(level, tag, message, meta?)` wrapper calling `useDevLogStore.getState().append`
- [X] T022 [P] Create `mobile-app/src/state/settings-store.ts`: Zustand with `persist` middleware over AsyncStorage (keys `wt.tapMode`, `wt.devModeEnabled`, `wt.backendUrlOverride`) per `data-model.md` §4
- [X] T023 Create `mobile-app/src/cache/db.ts`: `openDatabaseAsync("history.db")` + idempotent `CREATE TABLE IF NOT EXISTS` for `history` + `pending_jobs` + `idx_history_created_at_desc` per `data-model.md` §3; exposes a cached `getDb()` accessor
- [X] T024 [P] Create `mobile-app/src/api/bff-types.ts`: wire-level snake_case types (`UploadAcceptedWire`, `JobStateWire`, `JobResultWire`, `JobErrorWire`) per `contracts/bff-api.md` §§1–2
- [X] T025 [P] Create `mobile-app/src/audio/session.ts`: helpers `configureForRecording()` / `configureForPlayback()` calling `setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true/false })` + route-change + interruption subscription helpers
- [X] T026 [P] Create `mobile-app/src/pipeline/timeout.ts`: `computeTimeoutAtMs(startedAtMs, recordedDurationSec)` = `startedAtMs + (30 + recordedDurationSec) * 1000` (FR-020)
- [X] T027 [P] Create `mobile-app/src/pipeline/__tests__/timeout.test.ts`: unit tests (0 s → +30 s, 3 s → +33 s, 60 s → +90 s, boundary at exactly timeoutAtMs)
- [X] T028 [P] Create `mobile-app/src/pipeline/retry.ts`: poll-only backoff scheduler (`[1000, 3000, 9000]`, max 3 attempts) per FR-017a; exposes `nextDelayMs(attempt)` and `shouldGiveUp(attempt)`
- [X] T029 [P] Create `mobile-app/src/pipeline/__tests__/retry.test.ts`: unit tests for backoff sequence, exhaustion after attempt 3, and pass-through of non-transient errors
- [X] T030 Create `mobile-app/app/_layout.tsx`: `expo-router` Stack declaring `index` + `history` + modal routes `settings` and `dev-panel` (each with `presentation: "modal"` and `sheetAllowedDetents: [0.5, 1]`)
- [X] T031 Create `mobile-app/app/index.tsx` as a navigation-shell placeholder (renders localized "Main" string only)
- [X] T032 [P] Create `mobile-app/app/history.tsx` placeholder
- [X] T033 [P] Create `mobile-app/app/settings.tsx` placeholder
- [X] T034 [P] Create `mobile-app/app/dev-panel.tsx` placeholder
- [X] T035 [Commit] `001-wolof-translate-mobile:Phase2-Foundational: navigation shell, design tokens, i18n, stores, utilities, SQLite init`

**Checkpoint**: Project boots, navigates between 4 blank routes; `npm test` runs foundation unit tests; Main screen shows localized placeholder.

---

## Phase 3: User Story 1 — Speak a phrase, hear it translated (Priority: P1) 🎯 MVP

**Goal**: A user presses and holds a direction button, speaks a short phrase, releases, and hears the translated audio while seeing the source and target text.

**Independent Test**: On a modern iPhone with network access and a running BFF (with BE-1+BE-2 shipped), press-and-hold "English → Wolof" for 3 s while saying "Good morning", release, and confirm within ~10 s that transcribed English, translated Wolof, and audio playback all occur (SC-001).

### Mock-first UI (Constitution VIII — gate on [M] before business logic)

- [X] T036 [US1] Create `mobile-app/src/components/DirectionButton.tsx` as a visual mock: two large full-width pressable tiles (min 96 pt tall) with pressed/recording states, animated pulse while "recording", haptic-feedback stub; renders from fixture props (no store wiring)
- [X] T037 [US1] Create `mobile-app/src/components/StatusPill.tsx` as a visual mock: badge cycling through `queued → normalizing → transcribing → translating → generating_speech → completed` from a fixture prop; localized labels from `src/i18n`
- [X] T038 [US1] Create `mobile-app/src/components/MetadataGrid.tsx` as a visual mock rendering hard-coded duration, sample rate, channel count, and active direction from fixture props
- [X] T039 [US1] Update `mobile-app/app/index.tsx` to compose `DirectionButton` + `StatusPill` + `MetadataGrid` + a mock transcribed/translated text pair area using fixture data from `data-model.md` §1.2
- [X] T040 [M] [US1] MANUAL: User reviews and approves the mock Main screen — layout, hit-target size, copy, token-level palette direction, motion feel. No US1 business-logic task below starts until approval is recorded here. (approved 2026-04-17)

### Contract & integration tests (TDD — Constitution II)

- [X] T041 [P] [US1] Create `mobile-app/src/api/__tests__/msw-handlers.ts` implementing the 15 BFF contract-test handlers (C1–C15) from `contracts/bff-api.md` §5
- [X] T042 [P] [US1] Create `mobile-app/src/api/__tests__/bff-client.test.ts` — covers C1 upload happy path, C2 400 bad direction, C3 upload network error, C4 malformed JSON, C5 poll transient→complete, C6 poll 1×503 auto-retry, C7 poll 3×503 exhaustion, C8 poll terminal failed, C9 poll 404, C10 client-side timeout (FR-020), C11 audio download happy, C12 audio download 404, C13 casing boundary, C14 `poll_after_ms` honored, C15 health
- [X] T043 [P] [US1] Create `mobile-app/src/pipeline/__tests__/state-machine.test.ts` — all transitions in `data-model.md` §1.1 (idle↔recording, recording→uploading on release, recording→idle on zero-sec edge, uploading→polling on 202, polling↔retrying, polling→completed, polling→failed, polling→timed_out, completed→playing, any→idle on discard)
- [X] T044 [P] [US1] Create `mobile-app/src/audio/__tests__/recorder.test.ts` — FR-002a 60-second auto-stop + auto-submit, elapsed-time tick at 1 Hz, countdown emits in the final 5 s, zero-length press-and-release refuses to submit, AAC/m4a 48 kbps mono 16 kHz recorder options passed to `expo-audio`
- [X] T045 [P] [US1] Create `mobile-app/src/audio/__tests__/player.test.ts` — english→wolof plays returned audio URL via `expo-audio`; wolof→english uses `expo-speech.speak(text, { language: "en-US" })`
- [X] T046 [P] [US1] Create `mobile-app/src/cache/__tests__/pending-jobs-repo.test.ts` — insert on 202, delete on terminal, cold-start `resumeAll()` returns only rows with `timeout_at_ms > now`, expired rows are deleted with retry-affordance hint

### Implementation

- [X] T047 [US1] Implement `mobile-app/src/api/bff-client.ts` — `postTranslateSpeak()` (multipart upload via `expo-file-system/legacy uploadAsync` with `sessionType: BACKGROUND`, `httpMethod: "POST"`, `fieldName: "file"`, `parameters: { direction }`), `pollUntilTerminal()` (async generator yielding stage updates, honoring `pollAfterMs`, with FR-017a backoff via `pipeline/retry.ts`), `downloadAudio()` (→ `Paths.document/audio/{requestId}.m4a`), `checkHealth()`; use `casing.ts` converters at the wire boundary (satisfies T041 + T042)
- [X] T048 [P] [US1] Implement `mobile-app/src/audio/recorder.ts` — `expo-audio` `useAudioRecorder` wrapper with FR-002a 60 s cap, 1 Hz duration emitter, final-5-seconds countdown flag, captured-audio URI returned; AAC/m4a 48 kbps mono 16 kHz options from `research.md` §2 (satisfies T044)
- [X] T049 [P] [US1] Implement `mobile-app/src/audio/player.ts` — unified `playResult(result)` that picks `expo-audio` for `audioUrl`-bearing results (english_to_wolof) and `expo-speech` with `"en-US"` for text-only (wolof_to_english) (satisfies T045)
- [X] T050 [US1] Implement `mobile-app/src/pipeline/state-machine.ts` — full transition table from `data-model.md` §1.1 with FR-002b concurrent-block guards, FR-006a background-resume entry, FR-020 timeout watchdog via `setTimeout` registered against `timeoutAtMs`, FR-021 discard rules (satisfies T043)
- [X] T051 [P] [US1] Implement `mobile-app/src/cache/pending-jobs-repo.ts` — `insert(request)`, `delete(requestId)`, `resumeAll()` reading SQLite `pending_jobs` rows per `data-model.md` §3 (satisfies T046)
- [X] T052 [US1] Implement `mobile-app/src/state/pipeline-store.ts` — Zustand store wiring the state machine (T050) + `pending-jobs-repo` (T051) + `bff-client` (T047); exposes selectors for `DirectionButton`, `StatusPill`, `MetadataGrid`, retry banner, discard action, current captured-audio URI
- [X] T053 [US1] Wire `mobile-app/app/index.tsx` to `pipeline-store`: replace fixture props with live selectors; preserve the visual composition approved at T040
- [X] T054 [US1] Implement microphone-permission flow in `mobile-app/src/audio/recorder.ts`: first-use prompt via `expo-audio.AudioModule.requestRecordingPermissionsAsync()`; denial path uses `expo-linking.openSettings()` with localized guidance copy (FR-005)
- [X] T055 [US1] Implement FR-008 interruption handling in `mobile-app/src/audio/session.ts` + `pipeline-store`: subscribe to `expo-audio` interruption events, pause on phone call / Siri, resume-or-stop on interruption-end with coherent UI state
- [X] T056 [US1] Implement FR-007 audio-route-change handling in `mobile-app/src/audio/session.ts`: subscribe to route changes during playback; attempt to continue playback through the new output, verify behavior against `research.md` §10 R-D (resume programmatically if `expo-audio` auto-pauses on route change) — SDK 55 does not surface route-change events through `expo-audio`; native AVAudioSession behavior is relied upon for continuity, stub subscription retained for Phase 5 refinement
- [X] T057 [P] [US1] Create `mobile-app/src/components/RetryBanner.tsx` — banner with localized error message + Retry button + Discard button, wired to `pipeline-store`; surfaces `TranslationError.message` and `kind`
- [X] T058 [US1] Implement FR-006a cold-start resume hook in `mobile-app/app/_layout.tsx`: on mount, call `pendingJobsRepo.resumeAll()`; for each live row, enter `pipeline-store` `polling` state using the stored `request_id` and re-enter polling (no re-upload)
- [X] T059 [P] [US1] Create `mobile-app/maestro/flows/us1-happy-path.yaml`: launch → wait for Main → long-press English→Wolof button 3 s → assert transcribed text visible, translated text visible, playback indicator active within SC-001 bounds
- [X] T060 [P] [US1] Create `mobile-app/maestro/flows/us1-timeout.yaml`: enable dev mode, set BFF URL to an unreachable host, record 5 s phrase, assert `RetryBanner` appears within 35 s (30 s base + 5 s audio per FR-020)
- [X] T061 [Commit] `001-wolof-translate-mobile:Phase3-US1: MVP round-trip translation`

**Checkpoint — MVP**: US1 works end-to-end against a real BFF. Contract tests pass. Maestro US1 flows green. Demo-ready. **Note (2026-04-17)**: full end-to-end audio playback on `english_to_wolof` also requires BE-1 (download endpoint, cross-session) and FR-038 (BFF AAC/m4a ingestion — tasks T135a–T143 below in this same phase).

---

### FR-003a increment — Persistent pipeline status bar (additive US1 extension, 2026-04-17)

**Goal**: Add a bottom-pinned status bar that shows a direction-aware plain-language step label plus a live whole-second countdown of the FR-020 timeout budget.

**Scope gate**: Client-only per `plan.md` § VIII-addendum and `contracts/bff-api.md` §7. No BFF contract change. If any task below surfaces a need for a BFF change, halt and obtain explicit user approval per `spec.md` FR-003a Back-end scope gate.

**Independent Test**: With US1 working, start a translation and confirm at each phase that (a) the bottom bar is visible with the correct plain-language label matching `spec.md` FR-003a vocabulary, (b) the countdown decrements once per second and never displays below zero, (c) on terminal state the bar holds the final label and the countdown stops updating, and (d) VoiceOver reads both label and "X seconds remaining" per FR-025.

#### Mock-first UI (Constitution VIII — gate on [M] before implementation)

- [X] T125 [US1] Create `mobile-app/src/components/PipelineStatusBar.tsx` as a visual mock: bottom-pinned row rendering a fixture-prop `stepLabelKey` (e.g., `'step.transcribing.english'`) + `secondsLeft: number` + `visible: boolean`; localized via `src/i18n`; no store wiring; mock covers all 15 i18n keys enumerated in `plan.md` §FR-003a Design Detail
- [X] T126 [US1] Update `mobile-app/app/index.tsx` to mount the mock `PipelineStatusBar` pinned to the bottom safe-area inset behind a dev-fixture cycler that walks through the 13 representative `(phase, backendStage, direction)` states (idle hidden, uploading, queued, normalizing, transcribing.english, transcribing.wolof, translating.english_to_wolof, translating.wolof_to_english, generating_wolof_audio, playing, retrying, timed_out, failed); add `ScrollView.contentContainerStyle.paddingBottom` ≥ bar height so direction buttons remain fully reachable
- [X] T127 [M] [US1] MANUAL: User reviews and approves the mock `PipelineStatusBar` — copy of every state, direction-aware phrasing, countdown format (e.g., `"33s remaining"` vs bare `"33"`), visual weight relative to the header `StatusPill`, bottom-inset placement in light + dark modes, reduce-motion behavior. No FR-003a implementation task below starts until approval is recorded here. (approved 2026-04-17)

#### Tests (TDD — Constitution II)

- [X] T128 [P] [US1] Create `mobile-app/src/pipeline/__tests__/step-label.test.ts` — exhaustive `(phase × backendStage × direction)` table asserting each branch in `plan.md` §FR-003a Design Detail maps to the correct `step.*` MessageKey; include null-direction fallback (phase=polling + direction=null → default queued) and null-stage fallback during polling
- [X] T129 [P] [US1] Create `mobile-app/src/components/__tests__/PipelineStatusBar.test.tsx` — (a) snapshot at 5 representative states (idle → renders null; uploading; polling+transcribing+english_to_wolof; playing; timed_out); (b) countdown tick: mount with `timeoutAtMs = now + 5000`, advance fake timers by 1 s × 5, assert display decrements `5 → 4 → 3 → 2 → 1 → 0` and holds at 0 (never goes negative); (c) terminal freeze: transition `phase` to `completed`, assert the interval is cleared and display no longer changes; (d) accessibility: `accessibilityLabel` contains the localized step + "seconds remaining" per FR-025

#### Implementation

- [X] T130 [P] [US1] Extend `mobile-app/src/i18n/locales/en/messages.po` and `mobile-app/src/i18n/locales/en/messages.ts` with the 15 FR-003a step keys (`step.idle`, `step.uploading`, `step.queued`, `step.normalizing`, `step.transcribing.english`, `step.transcribing.wolof`, `step.translating.english_to_wolof`, `step.translating.wolof_to_english`, `step.generating_wolof_audio`, `step.playing`, `step.retrying`, `step.timed_out`, `step.failed`, `step.countdown`, `step.a11y`) with English copy from `plan.md` §FR-003a Design Detail
- [X] T131 [US1] Implement `mobile-app/src/pipeline/step-label.ts` — pure function `stepLabel({ phase, backendStage, direction }): MessageKey` implementing the resolution table in `plan.md` §FR-003a Design Detail; no side effects, no store access; direction-aware branches for `transcribing` and `translating`; English→Wolof-only branch for `generating_speech` → `step.generating_wolof_audio` (satisfies T128)
- [X] T132 [US1] Implement `mobile-app/src/components/PipelineStatusBar.tsx` — consume `usePipelineStore` selectors for `phase`, `backendStage`, `direction`, `timeoutAtMs`; resolve label via `stepLabel(...)`; run `useEffect` that starts `setInterval(1000)` computing `secondsLeft = Math.max(0, Math.ceil((timeoutAtMs - Date.now()) / 1000))`; clear interval on terminal phase or unmount; render null when `phase === 'idle'`; compose `accessibilityLabel` via the `step.a11y` ICU-interpolated message; honor `AccessibilityInfo.isReduceMotionEnabled()` per FR-032 (no animated state transitions when reduce-motion is on) (satisfies T129)
- [X] T133 [US1] Wire `mobile-app/app/index.tsx` to the live `PipelineStatusBar`: replace the fixture cycler from T126 with the production component; keep the existing header `StatusPill` unchanged; preserve the T040-approved composition of `DirectionButton` + `StatusPill` + `MetadataGrid` + result text; ensure `paddingBottom` continues to reserve space for the bar when `phase !== 'idle'`
- [X] T134 [P] [US1] Extend `mobile-app/maestro/flows/us1-happy-path.yaml` with three assertions mid-flight: (a) `id: PipelineStatusBar` is visible, (b) visible text matches one of the expected localized `step.*` strings during the polling window, (c) the countdown numeric value strictly decreases between two sampled `extendedWaitUntil` checks
- [X] T135 [Commit] `001-wolof-translate-mobile:Phase3-US1-FR003a: persistent pipeline status bar (step label + countdown)`

**Checkpoint — FR-003a**: Bottom status bar visible throughout an in-flight translation, label matches the FR-003a vocabulary at every transition, countdown decrements at 1 Hz and clamps to zero on timeout. No BFF change required; Back-end scope gate remains CLEARED.

---

### FR-038 increment — BFF AAC/m4a ingestion (BE-2 folded in-session, 2026-04-17)

**Goal**: Extend the BFF (`web_server.py`) to accept AAC-in-m4a uploads from the mobile client via in-memory PyAV transcoding, unblocking every live US1 round-trip from iOS. Closes the production bug where the simulator fails with `"The server could not finish your translation."` because `normalize_audio_for_whisper` rejects non-WAV uploads.

**Scope**: BFF-side only, carried on the same `001-wolof-translate-mobile` branch (single-git-root; see `plan.md` Constitution V amendment). No mobile-app source changes. No network-contract redefinition — the endpoint signature, response shape, and error envelope are all superset-compatible (`plan.md` §FR-038 Design Detail). Principle VIII (UI Mock-First) does not apply — no UI surface.

**Independent Test**: With the BFF restarted against the amended `web_server.py` and a newly `pip install -e .`'d `av` dependency, a live recording from the iOS simulator completes an end-to-end English→Wolof translation round-trip (transcribed text, translated text, and playback audio all visible/audible), and the existing desktop webapp at `http://127.0.0.1:8090/` continues to complete WAV-based translations unchanged.

#### Pre-work: Python packaging + pytest scaffold (new 2026-04-17; fills I1/I2 from /speckit-analyze)

The parent `offline-translate/` tree currently has **no `pyproject.toml`, no `requirements.txt`, and no `tests/` directory** — only `web_server.py` and its sibling `*.py` services. FR-038 implementation (T138 `pip install -e .`, T137 `pytest tests/test_transcode.py`) assumes both; they must be created first. Plan's "BFF touchpoints" section has been amended to show these as CREATED (not AMENDED).

- [X] T135a [US1] Create `offline-translate/pyproject.toml` with (a) a `[project]` table declaring the existing runtime deps inferred from current imports in `web_server.py` and sibling services — `numpy`, `soxr`, `fastapi` (or whatever HTTP framework the web server already uses) — plus the **new** `av ~= 13.1` dependency (PyAV; FR-038b), (b) a `[project.optional-dependencies] dev = ["pytest>=8"]` entry for the FR-038 test suite, and (c) a `[tool.pytest.ini_options] testpaths = ["tests"]` block so `pytest` auto-discovers the new `tests/` dir. Record the PyAV release-notes link in a comment above the dep. Verify `pip install -e .` succeeds on macOS arm64 with no system `ffmpeg` package installed. (Supersedes the `pyproject.toml` amendment originally embedded in T138.)
- [X] T135b [US1] Create `offline-translate/tests/` directory, `offline-translate/tests/__init__.py` (empty), and `offline-translate/tests/conftest.py` (empty for now; placeholder for future shared fixtures). Run `pytest` from the parent repo root and confirm it exits 0 with "collected 0 items" (the scaffold is alive, no tests yet). Do NOT check in a `tests/fixtures/` dir — that is created by T136 alongside the fixture files.
- [X] T135c [Commit] `001-wolof-translate-mobile:Phase3-US1-FR038-PreWork: BFF Python packaging + pytest scaffold`

#### Tests (TDD — Constitution II; authored BEFORE implementation)

- [X] T136 [P] [US1] Capture audio fixtures under `tests/fixtures/audio/` in the parent `offline-translate/` tree: `ios_sim_3s.m4a` (3 s English phrase from the iOS simulator recorder output — record once via the dev-mode "Preview" button or by hand-capturing the Documents dir), `ios_sim_10s.m4a` (10 s phrase, same source), `malformed_moov.m4a` (a synthetically truncated MP4 container — e.g., first 32 bytes of any m4a then random padding — for the FR-038d corrupt-container branch), `empty_decoded.m4a` (an AAC container whose decoder yields zero frames after resampling — for the FR-038d empty-stream branch; synthesize by writing a valid `ftyp`/`moov` header with a zero-length `mdat`), and `silence_90s.m4a` (~90 s of AAC/m4a silence, encoded with the same recorder settings — for the FR-038e 75 s duration-cap trigger). Add `_make_video_only_mp4_fixture()` helper in `tests/conftest.py` that returns a minimal MP4 bytes payload with a video track and no audio track (for the FR-038d no-audio-stream branch) — avoids checking in a video binary. Check all four m4a fixtures into git (they are tiny — <200 KB total). Depends on T135b (the `tests/` dir exists). **Status 2026-04-17**: generated via `tests/fixtures/generate_audio_fixtures.py` (PyAV synthesis). `ios_sim_*.m4a` are synthetic sine-tone surrogates — real iOS-simulator captures should replace them when available (does not block tests; codec settings are identical to the real recorder output). `empty_decoded.m4a` is still committed but the empty-decoded test case uses an in-test monkeypatched container (AAC decoders pad single-sample input; no real fixture reliably produces zero decoded frames).
- [X] T137 [P] [US1] Create `tests/test_transcode.py` in the parent `offline-translate/` tree with six pytest cases matching `plan.md` §FR-038 Design Detail verbatim: (a) **happy path (FR-038a/b)** — `assert sniff_audio_format(aac) == "m4a"` (C1 contract guard; if this drifts, `contracts/bff-api.md §2` poll-shape example `detected_format: "m4a"` becomes false), then `transcode_to_wav(ios_sim_3s.m4a bytes)` returns bytes whose first 4 are `RIFF` and bytes 8–12 are `WAVE`; passing the output through the existing `_read_wav_samples(...)` yields a `(samples, 16000)` tuple with `samples.shape[1] == 1`; (b) **WAV bypass regression (FR-038c)** — call `normalize_audio_for_whisper(wav_bytes, "webapp.wav")` where `wav_bytes` is a 1-second silent 16 kHz mono PCM WAV produced by `_encode_pcm16_wav(np.zeros(16_000, dtype=np.float32), 16_000)`; assert the function completes without invoking `transcode_to_wav` (use `monkeypatch` on the `av.open` symbol and assert it was never called) and returns 16 kHz mono PCM WAV; (c) **malformed-container error (FR-038d)** — `pytest.raises(RuntimeError, match="could not be decoded by PyAV")` when `transcode_to_wav(malformed_moov.m4a bytes)` is called; (d) **no-audio-stream (FR-038d, C3)** — `pytest.raises(RuntimeError, match="no audio stream")` when `transcode_to_wav(_make_video_only_mp4_fixture())` is called; (e) **empty-decoded-stream (FR-038d, C3)** — `pytest.raises(RuntimeError, match="Decoded audio stream was empty")` when `transcode_to_wav(empty_decoded.m4a bytes)` is called; (f) **resource caps (FR-038e, U2)** — TWO sub-asserts: (f1) `monkeypatch.setattr(av, "open", ...)` to a recorder, call `transcode_to_wav(b"\x00" * (2*1024*1024 + 1))`, expect `pytest.raises(RuntimeError, match="exceeds 2 MiB size cap")` AND assert PyAV was never called (pre-decode rejection); (f2) `pytest.raises(RuntimeError, match="Decoded audio duration exceeds 75s cap")` when `transcode_to_wav(silence_90s.m4a bytes)` is called. **Status 2026-04-17**: all 7 pytest cases pass (happy path + 6 error branches).

#### Implementation

- [X] T138 [US1] Verify the PyAV install lands cleanly on every target platform: (a) `pip install -e .` on macOS arm64 (already exercised in T135a), (b) `pip install -e .` inside the Linux x86_64 deployment container described in `deploy-dev.md` §1 (VPS target), confirming the pre-built wheel pulls without any system `ffmpeg-dev` package required. Record the installed `av` wheel's `sha256` in `deploy-dev.md` per R-9. (The `av ~= 13.1` dep itself was added in T135a; this task is install-sanity only.) **Status 2026-04-17**: macOS arm64 install verified; `av-13.1.0-cp310-cp310-macosx_11_0_arm64.whl` sha256 recorded in `deploy-dev.md` §8b. Linux x86_64 VPS install still **DEFERRED** — requires VPS access, tracked as T138b.
- [X] T139 [US1] Implement the `transcode_to_wav(audio_bytes: bytes) -> bytes` helper in `offline-translate/web_server.py` (placed immediately above `normalize_audio_for_whisper`) exactly per the body in `plan.md` §FR-038 Design Detail — including the two new module-level constants `MAX_UPLOAD_BYTES = 2 * 1024 * 1024` (FR-038e) and `MAX_DECODED_DURATION_SEC = 75.0` (FR-038e). Order of checks inside the helper: (1) **pre-decode size cap** — if `len(audio_bytes) > MAX_UPLOAD_BYTES`, raise `RuntimeError("Upload exceeds 2 MiB size cap.")` BEFORE `av.open` is invoked; (2) auto-detect container via `av.open(BytesIO, format=None)`; (3) pick the first audio stream — raise `RuntimeError("Upload contains no audio stream.")` if absent; (4) resample to `s16` / `mono` / `16_000` via `av.AudioResampler`, accumulating a running `total_samples` count and raising `RuntimeError("Decoded audio duration exceeds 75s cap.")` as soon as it exceeds `int(MAX_DECODED_DURATION_SEC * WHISPER_SAMPLE_RATE)` (FR-038e post-decode cap); (5) flush with `resampler.resample(None)` (same running-count guard); (6) raise `RuntimeError("Decoded audio stream was empty.")` if no frames produced; (7) reuse the existing `_encode_pcm16_wav(...)` helper. (Satisfies T137a, T137c, T137d, T137e, T137f.)
- [X] T140 [US1] Amend `offline-translate/web_server.py::normalize_audio_for_whisper` (currently at `web_server.py:206-208`): replace the `raise RuntimeError(f"Audio upload {input_filename!r} must be a WAV file.")` line with `audio_bytes = transcode_to_wav(audio_bytes)`; everything downstream of that line stays untouched. Preserve the `sniff_audio_format(audio_bytes) != "wav"` guard — the transcoding call only fires on non-WAV inputs, so the webapp's existing WAV path bypasses it byte-identically (satisfies T137b).
- [X] T141 [P] [US1] Deployment sanity in `deploy-dev.md` (parent repo): append a one-line note that restarting the BFF now requires `pip install -e .` to pull the new `av` dependency; document the `sha256` of the installed `av` wheel for M0 baseline per `mobile_app_implementation_plan.md` R-9 mitigation.
- [ ] T142a [US1] **SC-012 baseline capture** — record a 20-utterance English corpus as PCM WAV (16 kHz mono, 16-bit) via any desktop means (macOS `say` → `afconvert`, or `sox`), covering short (≤ 5 s), medium (~10 s), and long (~30 s) phrases. POST each WAV to the amended BFF's `/api/translate-speak` (webapp/legacy path, bypassing the transcoder per FR-038c), persist each run's `transcribed_text`, and compute a baseline WER for each utterance against ground-truth transcripts (hand-authored or the script text). Store the 20-row baseline table in `offline-translate/tests/fixtures/audio/sc012_baseline.json` (or `.csv`).
- [ ] T142b [US1] **SC-012 AAC/m4a comparison** — re-record the same 20 utterances from the iOS simulator (Main screen → press-and-hold → release), letting each go through the FR-038b transcoder path. Persist each run's `transcribed_text` and compute AAC-path WER per utterance using the same ground-truth transcripts from T142a. Store the 20-row comparison table alongside `sc012_baseline.json`.
- [ ] T142c [US1] **SC-012 regression gate** — diff T142b WER vs T142a WER per utterance; compute `mean(abs(wer_aac - wer_wav))` and assert the aggregate regression is **≤ 5 percentage points** per SC-012. If any single utterance exceeds the cap by > 10 pp, flag it for investigation (bitrate raise contingency per plan's R-1 mitigation — a one-line change to `src/audio/recorder.ts` to bump from 48 kbps to 64 kbps). Record the final pass/fail in a comment on T142c and in `deploy-dev.md`.
- [ ] T142d [US1] **Live iOS smoke test** — with the amended BFF running on `http://127.0.0.1:8090`, launch the iOS simulator, point it at the Mac host (`.env.development` already has the correct BFF URL), record a 3-second English phrase via the Main screen, and confirm: (i) the upload completes (no `error.server_failed` retry banner), (ii) the `PipelineStatusBar` progresses through transcribing/translating/generating stages, (iii) translated Wolof audio plays back, (iv) the transcribed English and translated Wolof text both render. History-cache assertion is deferred to Phase 4 (U3 from /speckit-analyze — US2 surface is not yet wired in Phase 3).
- [X] T143 [Commit] `001-wolof-translate-mobile:Phase3-US1-FR038-BE2: PyAV transcoding on BFF upload path`

**Checkpoint — FR-038 / SC-012**: iOS simulator (and physical iPhone) translation round-trip completes against the running BFF with AAC/m4a uploads; webapp WAV flow regressed-test green; no change to the mobile network contract. Unblocks the MVP checkpoint above (which explicitly depended on "BE-2 landed").

---

### FR-039 increment — BFF audio delivery (BE-1 folded in-session, 2026-04-17)

**Goal**: Extend the BFF (`web_server.py`) to serve the generated Wolof audio to the mobile client over HTTP at a new `GET /api/requests/{id}/audio` endpoint and populate the `audio_url` field on completion. Audio is delivered as AAC/m4a (48 kbps mono 16 kHz) — symmetric with the upload codec and ~5× smaller than PCM WAV. Transcode runs eagerly inside the existing `generating_speech` pipeline stage. Unblocks SC-001's "hearing the translated audio" and the Maestro `us1-happy-path.yaml` audio-playback assertion.

**Scope**: BFF-side only, carried on the same `001-wolof-translate-mobile` branch (single-git-root). Reuses PyAV from FR-038 — **zero new dependencies**. No mobile-app source changes (the client is already contract-ready via T047 `downloadAudio()`). No new `BackendStage` value — transcode is absorbed inside `generating_speech` (FR-039c). Principle VIII (UI Mock-First) does not apply — no UI surface.

**Independent Test**: With the amended BFF running and an iOS simulator pointed at it, record an english→wolof phrase → `PipelineStatusBar` progresses through all stages → translated Wolof audio plays back automatically. The downloaded payload is `audio/m4a` and at least 5× smaller than the retained `.wav` at `speech_result.output_path`. The existing desktop webapp still plays the `.wav` unchanged.

#### Tests (TDD — Constitution II; authored BEFORE implementation)

- [X] T144 [P] [US1] Extend `tests/conftest.py` with three shared pytest fixtures used by the new FR-039 test suite: (a) `client` — a test-client wrapping the `web_server.py` app (framework-specific: `fastapi.testclient.TestClient(app)` if FastAPI, `werkzeug.Client(app)` otherwise); (b) `run_english_to_wolof_job(utterance_bytes, duration_sec, expect_status="completed")` — enqueues a job, drives the pipeline synchronously (stubbing out the real whisper/translate/TTS servers so tests run offline), returns the `request_id`, and asserts the final status matches `expect_status`; (c) `enqueue_wolof_to_english_job(utterance_bytes)` — same but for the wolof→english direction (`output_mode != "wolof_audio"`) so the 409 branch can be exercised. These fixtures are shared by T145 and any future BFF test file. **Status 2026-04-17**: the BFF uses stdlib `ThreadingHTTPServer`, not FastAPI/Flask, so the `client` fixture starts a real server on port 0 and drives it via `urllib.request`. `run_english_to_wolof_job` is a factory that pre-populates `JobStore` with a completed job + real WAV + real encoded `.m4a` on a per-test `tmp_path/generated_audio/`. `enqueue_wolof_to_english_job` is the wolof→english sibling that seeds `output_mode = "english_audio"`.
- [X] T145 [P] [US1] Create `tests/test_audio_endpoint.py` in the parent `offline-translate/` tree with five pytest cases matching `plan.md` §FR-039 Design Detail verbatim: (a) **happy path (FR-039a/b + SC-013a/b/c)** — run an english→wolof job to `completed`, `GET /api/requests/{id}/audio` returns HTTP 200 with `Content-Type: audio/m4a`, non-zero `Content-Length`, and `Content-Disposition: attachment; filename="{id}.m4a"`; body's bytes 4–8 equal `ftyp` (MP4 magic); `transcode_to_wav(body)` round-trips back to a valid 16 kHz mono PCM WAV (symmetric with FR-038b); (b) **404 unknown request_id (FR-039a)** — `GET /api/requests/does-not-exist/audio` returns 404 with `error.type == "NotFound"`; (c) **409 wrong state (FR-039a)** — enqueue a wolof→english job (output_mode != "wolof_audio"), GET its `/audio`, assert 409 with `error.type == "InvalidState"` (or similar distinct 4xx); also cover "still processing" by driving a job only through `queued` before hitting `/audio`; (d) **encode failure = job failure (FR-039f)** — `monkeypatch.setattr("web_server.encode_pcm_to_aac_m4a", boom)` where `boom` raises `RuntimeError("Failed to encode output audio: synthetic")`, run the pipeline, assert job status is `failed`, `error.message` matches `"Failed to encode output audio"`, and `result.audio_url` is `None`; (e) **bandwidth bound (SC-013d)** — after the happy-path run, assert `Path(output_path_m4a).stat().st_size * 5 <= Path(output_path).stat().st_size` (m4a at least 5× smaller than the retained wav). **Status 2026-04-17**: 9 pytest cases pass (5 route + 2 encode unit + 2 generating_speech integration). SC-013d bandwidth asserted at 3 s clip duration (sub-1s is container-overhead-dominated).

#### Implementation

- [X] T146 [US1] Implement `encode_pcm_to_aac_m4a(wav_bytes: bytes) -> bytes` in `offline-translate/web_server.py` (placed immediately below `transcode_to_wav`) exactly per the body in `plan.md` §FR-039 Design Detail. Add module-level constants `WOLOF_TTS_AAC_BITRATE = 48_000` and `WOLOF_TTS_SAMPLE_RATE = 16_000` (the latter may alias `WHISPER_SAMPLE_RATE` if already defined). Use `av.open(..., mode="w", format="mp4")` with `out_container.add_stream("aac", rate=16_000, layout="mono")` and `out_stream.bit_rate = 48_000`; iterate input WAV frames, encode + mux, flush. Raise `RuntimeError("Failed to encode output audio: <reason>")` on any `av.AVError` or on empty output bytes (FR-039f). (Satisfies T145a and T145d.) **Pre-placed in the FR-038 commit (089ff25) as scaffolding; inert until T147 wiring.**
- [X] T147 [US1] Extend the `generating_speech` pipeline stage in `offline-translate/web_server.py` (the existing code path that calls `wolof_speech_server` and writes `{id}.wav`) to — AFTER the WAV is written and BEFORE `status` transitions to `completed` — call `encode_pcm_to_aac_m4a(wav_bytes)`, write the returned bytes to `generated_audio/{request_id}.m4a`, set `result.speech_result["output_path_m4a"]` to the absolute path, and set `result.audio_url = f"/api/requests/{request_id}/audio"`. If `encode_pcm_to_aac_m4a` raises `RuntimeError`, catch it, set `job.status = "failed"` with `error = {"message": str(exc), "type": "AudioEncodeError", "stage": "generating_speech"}`, and return without setting `audio_url` (FR-039f). Do NOT add a new `BackendStage` value — `timings_ms.generating_speech` absorbs the ~100 ms encode cost (FR-039c). Do NOT delete the `.wav` file — retention is FR-039d. **Implementation note**: RuntimeError from encode falls through the existing `fail_job(…, stage=generating_speech, exc)` handler at the end of `process_request_job`, which writes `error = {"message": str(exc), "type": type(exc).__name__ == "RuntimeError", "stage": "generating_speech"}`. `error.type == "RuntimeError"` rather than the plan's speculative `"AudioEncodeError"`; the `error.message` carries the specified "Failed to encode output audio: …" prefix verbatim.
- [X] T148 [US1] Implement route handler `GET /api/requests/{request_id}/audio` in `offline-translate/web_server.py` per `plan.md` §FR-039 Design Detail. Behaviors: (i) unknown `request_id` → 404 with `{"error": {"message": "Request not found.", "type": "NotFound"}, "request_id": ...}`; (ii) job status != `completed` OR `result.output_mode != "wolof_audio"` → 409 with `{"error": {"message": "Audio not available for this job.", "type": "InvalidState"}}`; (iii) `output_path_m4a` missing from disk (evicted) → 404 with `{"error": {"message": "Audio file evicted or missing.", "type": "NotFound"}}`; (iv) happy → `FileResponse(m4a_path, media_type="audio/m4a", filename=f"{request_id}.m4a")` setting `Content-Type: audio/m4a` and `Content-Disposition: attachment; filename="{request_id}.m4a"` (framework-specific). Uses `os.stat()` implicitly for `Content-Length`. (Satisfies T145a, T145b, T145c.) **Implementation note**: the existing `/api/requests/{id}` dispatch was reordered so the `/audio` suffix is matched BEFORE the plain job-fetch branch; stdlib `http.server` requires this explicit ordering (no framework path-parameter extractor). File streaming uses `shutil.copyfileobj(file, self.wfile)`.
- [X] T149 [P] [US1] Update `contracts/bff-api.md` in this spec directory: remove the ⚠️ "BE-1 field, not present in the current production BFF" warning from §2 (line ~152); remove the "(BE-1 — pending)" suffix from §3's heading and the introductory note; add a sentence to §6 (Versioning & drift) noting `audio_url` is now always populated on english_to_wolof completion responses. Also update `research.md` §10 R-A: strike "BE-1 is a hard prerequisite" and mark as folded-in-session per FR-039. Also update `quickstart.md` §"Run locally on iOS Simulator" to mention that Wolof audio now plays back automatically (previously noted as BE-1-gated).
- [ ] T150 [US1] End-to-end SC-013 acceptance: with the amended BFF running on `http://127.0.0.1:8090` and T143 + T147 both landed, launch the iOS simulator, point it at the Mac host, record a 3-second English phrase via the Main screen, and confirm: (i) completion poll response includes `audio_url: "/api/requests/{id}/audio"` (not `null`), (ii) mobile client downloads the audio via `expo-file-system.downloadAsync` (visible in dev-mode event log), (iii) translated Wolof audio plays back automatically via `expo-audio` without format conversion, (iv) the downloaded `.m4a` file on-device is at least 5× smaller than the retained `.wav` on the server (SC-013d — verify via `ls -la` on both sides), (v) the desktop webapp at `http://127.0.0.1:8090/` can still play the `.wav` via the existing webapp flow (regression check on FR-039d). Record SC-013 pass/fail in `deploy-dev.md`.
- [X] T151 [Commit] `001-wolof-translate-mobile:Phase3-US1-FR039-BE1: serve generated Wolof audio as AAC/m4a`

**Checkpoint — FR-039 / SC-013**: iOS simulator english→wolof round-trip now delivers playable audio end-to-end. The `contracts/bff-api.md` ⚠️ BE-1 notes are struck; `research.md` R-A is struck. The Maestro `us1-happy-path.yaml` audio-playback assertion (T059) now passes. This closes the last cross-repo prerequisite for SC-001 end-to-end.

---

## Phase 4: User Story 2 — Review and re-play recent translations offline (Priority: P2)

**Goal**: Users can open a History view, see recent translations newest-first, and replay stored audio even in airplane mode.

**Independent Test**: With US1 working, complete one translation, toggle airplane mode, open History, tap replay → audio plays and text is visible; swipe-to-delete removes both text and audio.

### Mock-first UI

- [X] T062 [US2] Create `mobile-app/src/components/HistoryRow.tsx` as a visual mock: source text, translated text, direction badge, replay button, iOS-native swipe-to-delete affordance; renders from fixture data (no store wiring)
- [X] T063 [US2] Create `mobile-app/src/components/EmptyState.tsx`: localized message directing the user back to the main screen (FR-013b)
- [X] T064 [US2] Update `mobile-app/app/history.tsx` to render a `FlatList` of `HistoryRow` over a fixture array + fallback `EmptyState` when the array is empty
- [X] T065 [M] [US2] MANUAL: User reviews and approves the mock History screen — newest-first ordering, empty-state copy, swipe-to-delete UX, replay button placement, direction badge contrast in light+dark. No US2 business-logic task below starts until approved. (approved 2026-04-17)

### Tests

- [X] T066 [P] [US2] Create `mobile-app/src/cache/__tests__/history-repo.test.ts` — `insert()` creates row + writes audio file; 20-row cap trims oldest (FR-012); 50 MB cap trims oldest (FR-012); `delete()` removes row AND unlinks file atomically (FR-013c); `list()` returns newest-first (FR-013a); corrupt rows (file missing on disk) are pruned during `list()`
- [X] T067 [P] [US2] Create `mobile-app/src/components/__tests__/HistoryRow.test.tsx` — renders all fields, fires onReplay + onDelete, shows the correct direction badge and accessibility label
- [X] T068 [P] [US2] Create `mobile-app/src/components/__tests__/EmptyState.test.tsx` — renders the localized empty-state copy keyed by `history.empty`

### Implementation

- [X] T069 [US2] Implement `mobile-app/src/cache/history-repo.ts` — SQLite `history` INSERT/DELETE/SELECT (ordering on `idx_history_created_at_desc`) + `Paths.document/audio/` file I/O; eviction honoring both 20-row and 50 MB caps in a single transaction (satisfies T066)
- [X] T070 [US2] Wire pipeline completion hook in `mobile-app/src/state/pipeline-store.ts`: after `downloadAudio()` succeeds, call `historyRepo.insert(...)` then unlink the transient captured-audio temp file (FR-021)
- [X] T071 [US2] Wire `mobile-app/app/history.tsx` to `historyRepo.list()`: show cached entries newest-first; fallback to `EmptyState` when empty; replay tap plays local audio via `expo-audio` using `localAudioUri` (no network — SC-007)
- [X] T072 [US2] Implement FR-013c swipe-to-delete in `HistoryRow` + `app/history.tsx` using the iOS-native swipe reveal pattern → `historyRepo.delete(id)` (atomic row + file unlink)
- [X] T073 [US2] Add navigation affordance to History from `mobile-app/app/index.tsx` — history icon in the top app bar, with localized accessibility label
- [X] T074 [P] [US2] Create `mobile-app/maestro/flows/us2-offline-history.yaml` — complete one translation → toggle airplane mode → open History → tap replay → assert playback active; swipe row → tap Delete → assert row removed
- [X] T075 [Commit] `001-wolof-translate-mobile:Phase4-US2: offline history cache`

### Phase 4 Remediation (post-review alignment; 2026-04-17)

Review against `spec.md`/`plan.md`/`data-model.md` surfaced five gaps: the audio path was a literal placeholder (not the real Documents directory), insert + eviction was not wrapped in a single SQL transaction (T069 language), `wolof_to_english` TTS-only results were silently not persisted (FR-010/FR-011), the completion wiring in `pipeline-store.ts` lacked unit coverage (Constitution II), and `HistoryRow` imported `Direction` from a sibling component instead of the domain module.

- [X] T075a [US2] In `src/cache/history-repo.ts` (and `src/api/bff-client.ts`) derive the audio directory from `documentDirectory` (`expo-file-system/legacy`) instead of the literal `file:///document/audio/`; add an idempotent `makeDirectoryAsync({ intermediates: true })` call before filesystem IO (FR-013 offline replay requires a real on-device path)
- [X] T075b [US2] Wrap INSERT + overflow eviction in `db.withTransactionAsync(...)` so `COUNT(*) ≤ 20` and `SUM(audio_byte_size) ≤ 50 MB` hold across crashes (T069 literal ask; `data-model.md` §1.3 invariants). File unlinks run AFTER commit. Also unlink the prior audio file when re-inserting a row with a duplicate `request_id` (no orphaned blobs).
- [X] T075c [US2] Persist `wolof_to_english` TTS-only entries with an empty-string `audio_path` sentinel (no schema change). Update `pipeline-store.persistToHistory` to always insert; `history-repo.list()` to skip the file-existence check when `audio_path` is empty; `history-repo.delete()` to skip `unlinkAudio` when `audio_path` is empty; `app/history.tsx` `entryToPlayableResult` to set `outputMode: 'text_only'` and `localAudioUri: null` so `defaultPlayer.playResult` falls back to `expo-speech` (FR-004, FR-010, FR-011). Amend `data-model.md` §1.3 accordingly.
- [X] T075d [P] [US2] Create `src/state/__tests__/pipeline-store.test.ts` — (a) english_to_wolof completion → `historyRepo.insert` with real audio fields + transient `deleteAsync`, (b) wolof_to_english text-only → insert with `audioPath: ''`, `audioByteSize: 0` + transient `deleteAsync`, (c) `capturedUri === localAudioUri` → no transient unlink (Constitution II TDD; covers T070 wiring).
- [X] T075e [US2] `src/components/HistoryRow.tsx` imports `Direction` from `@/api/bff-client` (domain type), not `@/components/DirectionButton`.
- [X] T075f [Commit] `001-wolof-translate-mobile:Phase4-US2-Remediation: real doc-dir path, tx eviction, TTS history, store tests`

**Checkpoint**: US1 + US2 both independently functional. Offline replay demonstrable.

---

## Phase 5: User Story 4 — Recover gracefully from poor networks and interruptions (Priority: P2)

**Goal**: The app doesn't crash, doesn't drop the recording, and lets the user retry without re-speaking when the network drops, a phone call arrives, or the audio route changes mid-flight.

**Independent Test**: Force airplane mode during upload → retry banner appears, audio preserved, tapping retry reuses the same audio after network returns. Separately: simulated phone call mid-playback pauses coherently; headphone connect mid-playback continues playback without crashing.

> Most of the code lives in US1 (FR-017/017a, FR-018, FR-007, FR-008, FR-006a). This phase focuses on UX polish for all error kinds, additional E2E coverage, and the upload-progress indicator.

### Mock-first refinement

- [X] T076 [US4] Extend `mobile-app/src/components/RetryBanner.tsx` to differentiate all `TranslationError.kind` values with localized, actionable copy (`upload_failed`, `poll_failed`, `server_failed`, `client_timeout`, `malformed_response`); include emphasis (primary Retry / secondary Discard) tuned per error kind
- [X] T077 [M] [US4] MANUAL: User reviews and approves the retry + error-state UX variants (copy, button placement, discard vs retry emphasis, color tone for each kind). No US4 implementation below starts until approved. (approved 2026-04-18)

### Tests

- [X] T078 [P] [US4] Create `mobile-app/src/pipeline/__tests__/reliability.test.ts` — simulated upload 500 preserves captured audio + exposes retry affordance (SC-004); malformed JSON response → friendly error + retry (FR-018); client-side timeout fires after payload-proportional window (FR-020)
- [X] T079 [P] [US4] Create `mobile-app/src/audio/__tests__/interruption.test.ts` — simulated `expo-audio` interruption begin → `pipeline-store` pauses; interruption end → coherent state (resume-or-stop with replay affordance)
- [X] T080 [P] [US4] Create `mobile-app/src/audio/__tests__/route-change.test.ts` — simulated speaker→wired and speaker→Bluetooth route changes mid-playback: no crash; playback either continues through the new output or explicitly resumes per `research.md` §10 R-D
- [X] T081 [P] [US4] Create `mobile-app/maestro/flows/us4-background-upload.yaml` — record 5 s phrase → immediately background app (home) → wait 8 s → foreground → assert completion result visible (FR-006a end-to-end)
- [X] T082 [P] [US4] Create `mobile-app/maestro/flows/us4-offline-retry.yaml` — airplane mode ON → record 3 s phrase → assert `RetryBanner` visible → airplane mode OFF → tap Retry → assert translation completes without re-recording (SC-004)

### Implementation

- [X] T083 [US4] Add upload-progress indicator (FR-019): wire real upload progress through `mobile-app/src/api/bff-client.ts` (opt-in `onProgress` on `postTranslateSpeak` via `createUploadTask`), track `uploadProgress` / `uploadStartedAtMs` / `uploadProgressVisible` in `mobile-app/src/state/pipeline-store.ts` (2 s store-owned visibility timer so fast uploads never flicker), and render it in `mobile-app/app/index.tsx` via the existing `uploadProgress` prop on `mobile-app/src/components/StatusPill.tsx` — when the current phase is `uploading` and `>= 2 s` have elapsed without reaching `polling`, show a non-fake percentage from the `createUploadTask` progress callback
- [X] T084 [Commit] `001-wolof-translate-mobile:Phase5-US4: reliability polish + E2E flows`

**Checkpoint**: US1, US2, and US4 all functional independently. Reliability Maestro flows green.

---

## Phase 6: User Story 3 — Developer-mode diagnostic panel (Priority: P3)

**Goal**: A toggle-in developer panel exposes raw backend response, event log, captured-audio preview, file-upload-from-disk, and a runtime backend URL override.

**Independent Test**: Enable developer mode → panels appear → change BFF URL → next upload uses new URL → view raw response of a completed job → clear the event log → re-open app → developer-mode state persists.

### Mock-first UI

- [X] T085 [US3] Create `mobile-app/src/components/DevPanelSheet.tsx` as a visual mock: dev-toggle, server URL text input, raw response code block, event log scrollable list with Clear button, file-picker trigger button; fixture data only
- [X] T086 [US3] Update `mobile-app/app/dev-panel.tsx` to host `DevPanelSheet` as the modal content
- [X] T087 [US3] Add a developer-mode access affordance in `mobile-app/app/index.tsx` — a small toggle in the top app bar visible to all users (per `spec.md` §Clarifications #1 reading; `FR-014` allows visible toggle, only panels are gated)
- [X] T088 [M] [US3] MANUAL: User reviews and approves the Dev Panel mock — discoverability of the toggle, panel layout, copy. No US3 business-logic task below starts until approved. (approved 2026-04-18)

### Tests

- [X] T089 [P] [US3] Create `mobile-app/src/components/__tests__/DevPanelSheet.test.tsx` — dev-toggle flips `settings-store.devModeEnabled`; backend URL input is validated (URL parse) and persisted; Clear button empties `dev-log-store`; file-picker trigger calls `expo-document-picker.getDocumentAsync`
- [X] T090 [P] [US3] Create `mobile-app/src/state/__tests__/settings-store.test.ts` — `devModeEnabled` + `backendUrlOverride` survive a simulated cold re-hydration (FR-016)

### Implementation

- [X] T091 [US3] Implement FR-015a audio preview in `DevPanelSheet`: "Preview" button plays the currently-captured audio (if any) via `expo-audio` without uploading
- [X] T092 [US3] Implement FR-015b file-from-disk upload: integrate `expo-document-picker` to select an `m4a`/`wav` file, then feed the result into `pipeline-store` the same way a live recording does
- [X] T093 [US3] Implement FR-015c raw-response view: `pipeline-store` retains the last `JobState` wire payload; `DevPanelSheet` renders it in a monospaced code block
- [X] T094 [US3] Implement FR-015d event log: `DevPanelSheet` binds to `useDevLogStore` with a `FlatList`; Clear action invokes `useDevLogStore.getState().clear()`
- [X] T095 [US3] Implement FR-015e backend URL editor: `DevPanelSheet` form writes to `settings-store.backendUrlOverride`; `bff-client.ts` reads the override on every request (FR-022)
- [X] T096 [US3] Verify FR-014 + FR-016 persistence in `app/_layout.tsx`: dev-mode state and URL override are loaded on launch before the first navigation
- [X] T097 [P] [US3] Create `mobile-app/maestro/flows/us3-dev-mode.yaml` — enable dev mode → change backend URL → next upload goes to new URL → toggle dev mode off → panels hidden; cold-relaunch preserves the toggle state
- [X] T098 [Commit] `001-wolof-translate-mobile:Phase6-US3: developer diagnostic panel`

**Checkpoint**: US1 + US2 + US3 + US4 all independently functional.

---

## Phase 7: User Story 5 — Visual design and accessibility (Priority: P3)

**Goal**: The app reads as thoughtfully West African (not generic stock), supports light + dark mode with preserved earth-tone character, honors Dynamic Type and VoiceOver, and ships the in-app Settings sheet with the tap-mode alternative (FR-028/028a).

**Independent Test**: On a physical iPhone — VoiceOver audit passes with zero unlabeled controls (SC-008); largest Dynamic Type does not clip or overlap primary controls (SC-009); dark mode preserves warm earth-tone character (no pure-black fallback); a West-African-design-aware reviewer identifies the visual identity as intentional, not generic (SC-010); tap-mode toggle in the new Settings sheet switches direction-button interaction from press-and-hold to tap-to-start/stop (FR-028).

### Design + Settings sheet

- [X] T099 [US5] Author Senegalese-textile motif assets (Kente / mudcloth / basket-weave) and place in `mobile-app/assets/patterns/`; developer authorship required per FR-029 (no AI-generated, no generic stock)
- [X] T100 [US5] Create `mobile-app/src/design/BackgroundPattern.tsx`: low-opacity (<8 %) overlay using the motif asset per FR-030; conditional on `prefers-reduced-motion`
- [X] T101 [US5] Extend `mobile-app/src/design/tokens.ts` with finalized secondary palette (deep indigo, ochre, muted terracotta) and verify light + dark variants across all components already built in Phases 3–6
- [ ] T102 [US5] Update `mobile-app/app.json` icon + splash to Senegalese-contextual assets (FR-031) — NOT national flag, NOT continent silhouette
- [X] T103 [US5] Create `mobile-app/src/components/SettingsSheet.tsx` (FR-028a): hosts the Tap-mode toggle (FR-028) bound to `settings-store.tapMode`; layout reserves space for future rows without restructure
- [X] T104 [US5] Update `mobile-app/app/settings.tsx` to host `SettingsSheet` as the modal content
- [X] T105 [US5] Add a gear icon in the top app bar of `mobile-app/app/index.tsx` that opens `/settings` via `router.push("/settings")`
- [X] T106 [M] [US5] MANUAL: User reviews and approves the end-to-end visual design pass: motif integration on all screens, palette in light + dark, Settings sheet UX, app icon + splash, dev-mode-toggle visual fit. No remaining US5 tasks proceed until approval is recorded. (approved 2026-04-18)

### Accessibility + visual implementation

- [X] T107 [P] [US5] Implement FR-028 tap-mode alternative in `mobile-app/src/components/DirectionButton.tsx` — when `settings-store.tapMode === true`, switch from press-and-hold to tap-to-start / tap-to-stop; maintain identical downstream pipeline behavior
- [X] T108 [P] [US5] Add `accessibilityLabel` + `accessibilityHint` (FR-025) to every interactive component (`DirectionButton`, `StatusPill`, `HistoryRow`, `RetryBanner`, `SettingsSheet`, `DevPanelSheet`) reading from `src/i18n/locales/en/messages.po`
- [X] T109 [P] [US5] Audit Dynamic Type in `mobile-app/src/components/**` — remove all fixed `fontSize` overrides, verify every `<Text>` scales (FR-026 / SC-009); test at the largest Dynamic Type step
- [X] T110 [P] [US5] Implement dark-mode palette branching in `mobile-app/src/design/tokens.ts` via `useColorScheme()`; every color consumer reads through a token (FR-024 / FR-027); no pure-black fallback
- [X] T111 [P] [US5] Honor reduce-motion preference (FR-032) via `AccessibilityInfo.isReduceMotionEnabled()` — disable non-essential spring/pulse animations on `DirectionButton` and `StatusPill`
- [X] T112 [P] [US5] Create `mobile-app/src/design/__tests__/contrast.test.ts` — computed WCAG AA contrast ratios for every foreground/background token pair in light and dark palettes (FR-027); assertion ≥ 4.5 for text, ≥ 3.0 for UI
- [X] T113 [P] [US5] Create `mobile-app/maestro/flows/us5-a11y-voiceover.yaml` — enable VoiceOver → navigate Main + History + Settings → assert every interactive control announces a meaningful label (SC-008)
- [X] T114 [Commit] `001-wolof-translate-mobile:Phase7-US5: visual design + accessibility pass`

**Checkpoint**: All five user stories independently functional; visual identity coherent; accessibility gates passing.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate Success Criteria end-to-end, harden for TestFlight, and close out.

- [ ] T115 [P] Execute the manual steps in `specs/001-wolof-translate-mobile/quickstart.md` on a physical iPhone: cold-start timing (SC-005 ≤ 2 s), SC-001 end-to-end timing in 10 attempts, SC-007 offline recall, SC-009 at largest Dynamic Type, SC-011 network-traffic audit (only BFF + Apple pipeline)
- [X] T116 [P] Verify FR-034 + SC-011: `grep -R` the dependency tree for any analytics/telemetry/crash SDK (Sentry, Firebase, Amplitude, Mixpanel, Datadog, etc.); confirm only Apple TestFlight / OS-native crash reports flow
- [X] T117 [P] Coverage audit: run `npm test -- --coverage` and confirm >80 % on `src/api`, `src/pipeline`, `src/cache`, and primary components (`DirectionButton`, `StatusPill`, `HistoryRow`, `RetryBanner`, `SettingsSheet`); add missing unit tests
- [ ] T118 [P] Performance audit: using Xcode Instruments (Main Thread + Hangs) verify SC-006 — no UI freezes ≥ 200 ms during an active translation; document traces in `specs/001-wolof-translate-mobile/perf-traces/` if any
- [X] T119 [P] i18n readiness scan: add a scripted check in `mobile-app/scripts/check-i18n.sh` that greps `src/` and `app/` for literal user-visible strings not wrapped in `t\`...\`` / `<Trans>` (FR-035)
- [X] T119a [P] FR-036 locale-aware formatters: create `mobile-app/src/utils/formatters.ts` exposing `formatDuration(sec)`, `formatDate(ms)`, `formatNumber(n)` via `Intl.NumberFormat` / `Intl.DateTimeFormat` seeded from `expo-localization.getLocales()[0]?.languageTag` (falls back to `"en-US"` per FR-037). Sweep call sites: `src/components/MetadataGrid.tsx` (duration), `src/components/HistoryRow.tsx` (timestamp), and the FR-003a countdown in `src/components/PipelineStatusBar.tsx`. Add unit tests covering `en-US`, `fr-FR`, `wo-SN` locales.
- [ ] T120 [P] FR-037 fallback verification: set device locale to `fr` → launch app → assert UI renders in `en` without visible errors
- [X] T121 [P] Update `mobile-app/CLAUDE.md` with any agent-context drift discovered during Phases 3–7 (run `.specify/scripts/bash/update-agent-context.sh claude`)
- [X] T122 [P] Update `mobile-app/README.md` with the `quickstart.md` essentials + TestFlight build steps; link to spec + plan
- [ ] T123 TestFlight build: `eas build --profile production --platform ios`; confirm the build validates with no ATS exceptions; run smoke tests (US1 happy path + US2 offline replay) on an enrolled tester device
- [ ] T124 [Commit] `001-wolof-translate-mobile:Phase8-Polish: v1 polish + TestFlight readiness`

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 Setup** — no dependencies.
- **Phase 2 Foundational** — depends on Phase 1 complete; blocks all user stories.
- **Phase 3 US1 (P1)** — depends on Phase 2. The MVP path. Now contains three additive sub-increments under the same phase: **FR-003a** (persistent pipeline status bar), **FR-038** (BFF AAC/m4a ingestion, BE-2 folded in-session, 2026-04-17), and **FR-039** (BFF audio delivery, BE-1 folded in-session, 2026-04-17). FR-038 tasks (T135a–T143) and FR-039 tasks (T144–T151) carry all prior BE-1/BE-2 cross-repo dependencies on the same feature branch — no cross-repo work remains.
- **Phase 4 US2 (P2)** — depends on Phase 2; logically chains after US1 for end-to-end demo purposes, but US2 tasks can start in parallel if staffed.
- **Phase 5 US4 (P2)** — depends on Phase 3 US1 (reuses retry + timeout + interruption code paths).
- **Phase 6 US3 (P3)** — depends on Phase 2; can start in parallel with US2/US4 if staffed.
- **Phase 7 US5 (P3)** — depends on Phase 3/4/6 (applies polish to existing surfaces); Settings sheet itself is an independent new surface.
- **Phase 8 Polish** — depends on US1–US5 all passing their independent tests.

### Per-story gating (Constitution VIII)

Each user story MUST complete its `[M]` approval gate before any of that story's implementation tasks begin:

- US1: T040 must be `[M]` approved → T041–T061 may proceed.
- US1 FR-003a extension: T127 must be `[M]` approved → T128–T135 may proceed. (Independent of the earlier US1 gate — T127 is a fresh UI-bearing surface per Constitution VIII.)
- US2: T065 must be `[M]` approved → T066–T075 may proceed.
- US3: T088 must be `[M]` approved → T089–T098 may proceed.
- US4: T077 must be `[M]` approved → T078–T084 may proceed.
- US5: T106 must be `[M]` approved → T107–T114 may proceed.

### Within each user story

- Tests precede implementation for BFF-contract surfaces (Constitution II).
- Models / entities before services; services before screens; screens before Maestro flows.

### Parallel opportunities

- Phase 1 T002–T012 all parallelizable after T001.
- Phase 2 T016–T029 largely parallelizable (T014 / T015 / T023 / T030 are not marked [P] because they gate other work).
- US1 tests T041–T046 parallel.
- US1 implementation T048 / T049 / T051 parallel after their respective tests exist.
- Every `[P]` Maestro flow can be authored in parallel with its component's unit tests.
- Accessibility hardening T107–T113 parallel.

### Cross-repo dependency

**Amended 2026-04-17 (second round)**: Both BE-1 and BE-2 are now in-session. **BE-2 is FR-038 / T135a–T143**; **BE-1 is FR-039 / T144–T151** (folded 2026-04-17 following /speckit-clarify). Same git root, same feature branch, zero cross-repo work. US1's end-to-end audio-playback assertion (Maestro `us1-happy-path.yaml` T059) no longer has any external blocker — it depends only on T143 (FR-038 upload path) + T151 (FR-039 download path) landing in this branch.

---

## Parallel Example — User Story 1 test kickoff

After T040 is approved, spawn these in parallel:

```bash
# Test authoring (parallel)
Task: "Implement MSW handlers in mobile-app/src/api/__tests__/msw-handlers.ts"            # T041
Task: "Author bff-client.test.ts covering C1–C15 in mobile-app/src/api/__tests__/"       # T042
Task: "Author state-machine.test.ts in mobile-app/src/pipeline/__tests__/"               # T043
Task: "Author recorder.test.ts in mobile-app/src/audio/__tests__/"                       # T044
Task: "Author player.test.ts in mobile-app/src/audio/__tests__/"                         # T045
Task: "Author pending-jobs-repo.test.ts in mobile-app/src/cache/__tests__/"              # T046
```

Then sequentially implement T047 → T048/T049/T051 (parallel) → T050 → T052 → T053 → T054-T058.

---

## Implementation Strategy

### MVP first (fastest path to a demo)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1 core (T036–T061) → Phase 3 FR-003a (T125–T135) → Phase 3 FR-038 (T135a–T143) → Phase 3 FR-039 (T144–T151).
2. STOP after T151; validate on a physical iPhone against a running BFF. No external prerequisites remain — BE-1 and BE-2 are both in-session.
3. Demo US1 end-to-end including audio playback; gather feedback before moving on.

### Incremental delivery (recommended for solo dev)

1. US1 MVP (Phases 1–3).
2. US2 offline history (Phase 4) — doubles the perceived value without new backend work.
3. US4 reliability polish (Phase 5) — lifts it from "demo" to "usable".
4. US3 dev panel (Phase 6) — as-needed when debugging issues gets painful.
5. US5 visual + a11y pass (Phase 7) — before external beta invites go out.
6. Polish + TestFlight (Phase 8).

### Parallel-capacity strategy (if a second dev joins)

- Dev A: US1 → US4 (pipeline + reliability).
- Dev B: US2 (history) + US3 (dev panel) — both independent of US1 internals.
- Joint: US5 after both dev-A and dev-B land; Polish phase together.

---

## Notes

- `[P]` tasks touch different files with no dependency on incomplete tasks.
- `[M]` tasks pause execution pending explicit user approval — do NOT proceed to the next task in the same story until the user records approval.
- `[Commit]` tasks require user approval before invoking `git commit` (Constitution VI).
- Each commit message follows `001-wolof-translate-mobile:<Phase>: <description>`.
- Every task's implementation file belongs to `mobile-app/` or `specs/001-wolof-translate-mobile/`, **with two exceptions**: (1) the FR-038 (BE-2) tasks T135a–T143 touch `offline-translate/web_server.py`, `offline-translate/pyproject.toml`, `offline-translate/tests/`, and `offline-translate/deploy-dev.md`; (2) the FR-039 (BE-1) tasks T144–T151 touch `offline-translate/web_server.py`, `offline-translate/tests/test_audio_endpoint.py`, `offline-translate/tests/conftest.py`, and `offline-translate/generated_audio/` (written at runtime). Both exceptions are covered by the Constitution V amendment in `plan.md` — the mobile-app tree and `offline-translate/` share the same git root, so those files are on the same `001-wolof-translate-mobile` feature branch.
- Comments added to source MUST carry the `(001-wolof-translate-mobile:<TaskID>)` suffix (Constitution IV) — example: `// Honor pollAfterMs from the BFF (001-wolof-translate-mobile:T047)`.
- Tests are mandatory for BFF contract surfaces (Constitution II); verify that each contract test FAILS on first write before the matching implementation task begins.
