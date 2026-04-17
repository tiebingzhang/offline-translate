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

> **Cross-repo prerequisite (blocking US1 closure)**: The parent `offline-translate` BFF must ship **BE-1** (`GET /api/requests/{id}/audio` + `audio_url` in result) and **BE-2** (AAC/m4a acceptance via PyAV transcoding) — tracked in `mobile_app_implementation_plan.md` in the parent repo, NOT here. US1 acceptance scenarios cannot pass end-to-end until those two parent-repo changes land.

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
- [ ] T013 [Commit] `001-wolof-translate-mobile:Phase1-Setup: initial Expo SDK 55 scaffold + tooling`

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
- [ ] T035 [Commit] `001-wolof-translate-mobile:Phase2-Foundational: navigation shell, design tokens, i18n, stores, utilities, SQLite init`

**Checkpoint**: Project boots, navigates between 4 blank routes; `npm test` runs foundation unit tests; Main screen shows localized placeholder.

---

## Phase 3: User Story 1 — Speak a phrase, hear it translated (Priority: P1) 🎯 MVP

**Goal**: A user presses and holds a direction button, speaks a short phrase, releases, and hears the translated audio while seeing the source and target text.

**Independent Test**: On a modern iPhone with network access and a running BFF (with BE-1+BE-2 shipped), press-and-hold "English → Wolof" for 3 s while saying "Good morning", release, and confirm within ~10 s that transcribed English, translated Wolof, and audio playback all occur (SC-001).

### Mock-first UI (Constitution VIII — gate on [M] before business logic)

- [ ] T036 [US1] Create `mobile-app/src/components/DirectionButton.tsx` as a visual mock: two large full-width pressable tiles (min 96 pt tall) with pressed/recording states, animated pulse while "recording", haptic-feedback stub; renders from fixture props (no store wiring)
- [ ] T037 [US1] Create `mobile-app/src/components/StatusPill.tsx` as a visual mock: badge cycling through `queued → normalizing → transcribing → translating → generating_speech → completed` from a fixture prop; localized labels from `src/i18n`
- [ ] T038 [US1] Create `mobile-app/src/components/MetadataGrid.tsx` as a visual mock rendering hard-coded duration, sample rate, channel count, and active direction from fixture props
- [ ] T039 [US1] Update `mobile-app/app/index.tsx` to compose `DirectionButton` + `StatusPill` + `MetadataGrid` + a mock transcribed/translated text pair area using fixture data from `data-model.md` §1.2
- [ ] T040 [M] [US1] MANUAL: User reviews and approves the mock Main screen — layout, hit-target size, copy, token-level palette direction, motion feel. No US1 business-logic task below starts until approval is recorded here.

### Contract & integration tests (TDD — Constitution II)

- [ ] T041 [P] [US1] Create `mobile-app/src/api/__tests__/msw-handlers.ts` implementing the 15 BFF contract-test handlers (C1–C15) from `contracts/bff-api.md` §5
- [ ] T042 [P] [US1] Create `mobile-app/src/api/__tests__/bff-client.test.ts` — covers C1 upload happy path, C2 400 bad direction, C3 upload network error, C4 malformed JSON, C5 poll transient→complete, C6 poll 1×503 auto-retry, C7 poll 3×503 exhaustion, C8 poll terminal failed, C9 poll 404, C10 client-side timeout (FR-020), C11 audio download happy, C12 audio download 404, C13 casing boundary, C14 `poll_after_ms` honored, C15 health
- [ ] T043 [P] [US1] Create `mobile-app/src/pipeline/__tests__/state-machine.test.ts` — all transitions in `data-model.md` §1.1 (idle↔recording, recording→uploading on release, recording→idle on zero-sec edge, uploading→polling on 202, polling↔retrying, polling→completed, polling→failed, polling→timed_out, completed→playing, any→idle on discard)
- [ ] T044 [P] [US1] Create `mobile-app/src/audio/__tests__/recorder.test.ts` — FR-002a 60-second auto-stop + auto-submit, elapsed-time tick at 1 Hz, countdown emits in the final 5 s, zero-length press-and-release refuses to submit, AAC/m4a 48 kbps mono 16 kHz recorder options passed to `expo-audio`
- [ ] T045 [P] [US1] Create `mobile-app/src/audio/__tests__/player.test.ts` — english→wolof plays returned audio URL via `expo-audio`; wolof→english uses `expo-speech.speak(text, { language: "en-US" })`
- [ ] T046 [P] [US1] Create `mobile-app/src/cache/__tests__/pending-jobs-repo.test.ts` — insert on 202, delete on terminal, cold-start `resumeAll()` returns only rows with `timeout_at_ms > now`, expired rows are deleted with retry-affordance hint

### Implementation

- [ ] T047 [US1] Implement `mobile-app/src/api/bff-client.ts` — `postTranslateSpeak()` (multipart upload via `expo-file-system/legacy uploadAsync` with `sessionType: BACKGROUND`, `httpMethod: "POST"`, `fieldName: "file"`, `parameters: { direction }`), `pollUntilTerminal()` (async generator yielding stage updates, honoring `pollAfterMs`, with FR-017a backoff via `pipeline/retry.ts`), `downloadAudio()` (→ `Paths.document/audio/{requestId}.m4a`), `checkHealth()`; use `casing.ts` converters at the wire boundary (satisfies T041 + T042)
- [ ] T048 [P] [US1] Implement `mobile-app/src/audio/recorder.ts` — `expo-audio` `useAudioRecorder` wrapper with FR-002a 60 s cap, 1 Hz duration emitter, final-5-seconds countdown flag, captured-audio URI returned; AAC/m4a 48 kbps mono 16 kHz options from `research.md` §2 (satisfies T044)
- [ ] T049 [P] [US1] Implement `mobile-app/src/audio/player.ts` — unified `playResult(result)` that picks `expo-audio` for `audioUrl`-bearing results (english_to_wolof) and `expo-speech` with `"en-US"` for text-only (wolof_to_english) (satisfies T045)
- [ ] T050 [US1] Implement `mobile-app/src/pipeline/state-machine.ts` — full transition table from `data-model.md` §1.1 with FR-002b concurrent-block guards, FR-006a background-resume entry, FR-020 timeout watchdog via `setTimeout` registered against `timeoutAtMs`, FR-021 discard rules (satisfies T043)
- [ ] T051 [P] [US1] Implement `mobile-app/src/cache/pending-jobs-repo.ts` — `insert(request)`, `delete(requestId)`, `resumeAll()` reading SQLite `pending_jobs` rows per `data-model.md` §3 (satisfies T046)
- [ ] T052 [US1] Implement `mobile-app/src/state/pipeline-store.ts` — Zustand store wiring the state machine (T050) + `pending-jobs-repo` (T051) + `bff-client` (T047); exposes selectors for `DirectionButton`, `StatusPill`, `MetadataGrid`, retry banner, discard action, current captured-audio URI
- [ ] T053 [US1] Wire `mobile-app/app/index.tsx` to `pipeline-store`: replace fixture props with live selectors; preserve the visual composition approved at T040
- [ ] T054 [US1] Implement microphone-permission flow in `mobile-app/src/audio/recorder.ts`: first-use prompt via `expo-audio.AudioModule.requestRecordingPermissionsAsync()`; denial path uses `expo-linking.openSettings()` with localized guidance copy (FR-005)
- [ ] T055 [US1] Implement FR-008 interruption handling in `mobile-app/src/audio/session.ts` + `pipeline-store`: subscribe to `expo-audio` interruption events, pause on phone call / Siri, resume-or-stop on interruption-end with coherent UI state
- [ ] T056 [US1] Implement FR-007 audio-route-change handling in `mobile-app/src/audio/session.ts`: subscribe to route changes during playback; attempt to continue playback through the new output, verify behavior against `research.md` §10 R-D (resume programmatically if `expo-audio` auto-pauses on route change)
- [ ] T057 [P] [US1] Create `mobile-app/src/components/RetryBanner.tsx` — banner with localized error message + Retry button + Discard button, wired to `pipeline-store`; surfaces `TranslationError.message` and `kind`
- [ ] T058 [US1] Implement FR-006a cold-start resume hook in `mobile-app/app/_layout.tsx`: on mount, call `pendingJobsRepo.resumeAll()`; for each live row, enter `pipeline-store` `polling` state using the stored `request_id` and re-enter polling (no re-upload)
- [ ] T059 [P] [US1] Create `mobile-app/maestro/flows/us1-happy-path.yaml`: launch → wait for Main → long-press English→Wolof button 3 s → assert transcribed text visible, translated text visible, playback indicator active within SC-001 bounds
- [ ] T060 [P] [US1] Create `mobile-app/maestro/flows/us1-timeout.yaml`: enable dev mode, set BFF URL to an unreachable host, record 5 s phrase, assert `RetryBanner` appears within 35 s (30 s base + 5 s audio per FR-020)
- [ ] T061 [Commit] `001-wolof-translate-mobile:Phase3-US1: MVP round-trip translation`

**Checkpoint — MVP**: US1 works end-to-end against a real BFF (with BE-1+BE-2 landed). Contract tests pass. Maestro US1 flows green. Demo-ready.

---

## Phase 4: User Story 2 — Review and re-play recent translations offline (Priority: P2)

**Goal**: Users can open a History view, see recent translations newest-first, and replay stored audio even in airplane mode.

**Independent Test**: With US1 working, complete one translation, toggle airplane mode, open History, tap replay → audio plays and text is visible; swipe-to-delete removes both text and audio.

### Mock-first UI

- [ ] T062 [US2] Create `mobile-app/src/components/HistoryRow.tsx` as a visual mock: source text, translated text, direction badge, replay button, iOS-native swipe-to-delete affordance; renders from fixture data (no store wiring)
- [ ] T063 [US2] Create `mobile-app/src/components/EmptyState.tsx`: localized message directing the user back to the main screen (FR-013b)
- [ ] T064 [US2] Update `mobile-app/app/history.tsx` to render a `FlatList` of `HistoryRow` over a fixture array + fallback `EmptyState` when the array is empty
- [ ] T065 [M] [US2] MANUAL: User reviews and approves the mock History screen — newest-first ordering, empty-state copy, swipe-to-delete UX, replay button placement, direction badge contrast in light+dark. No US2 business-logic task below starts until approved.

### Tests

- [ ] T066 [P] [US2] Create `mobile-app/src/cache/__tests__/history-repo.test.ts` — `insert()` creates row + writes audio file; 20-row cap trims oldest (FR-012); 50 MB cap trims oldest (FR-012); `delete()` removes row AND unlinks file atomically (FR-013c); `list()` returns newest-first (FR-013a); corrupt rows (file missing on disk) are pruned during `list()`
- [ ] T067 [P] [US2] Create `mobile-app/src/components/__tests__/HistoryRow.test.tsx` — renders all fields, fires onReplay + onDelete, shows the correct direction badge and accessibility label
- [ ] T068 [P] [US2] Create `mobile-app/src/components/__tests__/EmptyState.test.tsx` — renders the localized empty-state copy keyed by `history.empty`

### Implementation

- [ ] T069 [US2] Implement `mobile-app/src/cache/history-repo.ts` — SQLite `history` INSERT/DELETE/SELECT (ordering on `idx_history_created_at_desc`) + `Paths.document/audio/` file I/O; eviction honoring both 20-row and 50 MB caps in a single transaction (satisfies T066)
- [ ] T070 [US2] Wire pipeline completion hook in `mobile-app/src/state/pipeline-store.ts`: after `downloadAudio()` succeeds, call `historyRepo.insert(...)` then unlink the transient captured-audio temp file (FR-021)
- [ ] T071 [US2] Wire `mobile-app/app/history.tsx` to `historyRepo.list()`: show cached entries newest-first; fallback to `EmptyState` when empty; replay tap plays local audio via `expo-audio` using `localAudioUri` (no network — SC-007)
- [ ] T072 [US2] Implement FR-013c swipe-to-delete in `HistoryRow` + `app/history.tsx` using the iOS-native swipe reveal pattern → `historyRepo.delete(id)` (atomic row + file unlink)
- [ ] T073 [US2] Add navigation affordance to History from `mobile-app/app/index.tsx` — history icon in the top app bar, with localized accessibility label
- [ ] T074 [P] [US2] Create `mobile-app/maestro/flows/us2-offline-history.yaml` — complete one translation → toggle airplane mode → open History → tap replay → assert playback active; swipe row → tap Delete → assert row removed
- [ ] T075 [Commit] `001-wolof-translate-mobile:Phase4-US2: offline history cache`

**Checkpoint**: US1 + US2 both independently functional. Offline replay demonstrable.

---

## Phase 5: User Story 4 — Recover gracefully from poor networks and interruptions (Priority: P2)

**Goal**: The app doesn't crash, doesn't drop the recording, and lets the user retry without re-speaking when the network drops, a phone call arrives, or the audio route changes mid-flight.

**Independent Test**: Force airplane mode during upload → retry banner appears, audio preserved, tapping retry reuses the same audio after network returns. Separately: simulated phone call mid-playback pauses coherently; headphone connect mid-playback continues playback without crashing.

> Most of the code lives in US1 (FR-017/017a, FR-018, FR-007, FR-008, FR-006a). This phase focuses on UX polish for all error kinds, additional E2E coverage, and the upload-progress indicator.

### Mock-first refinement

- [ ] T076 [US4] Extend `mobile-app/src/components/RetryBanner.tsx` to differentiate all `TranslationError.kind` values with localized, actionable copy (`upload_failed`, `poll_failed`, `server_failed`, `client_timeout`, `malformed_response`); include emphasis (primary Retry / secondary Discard) tuned per error kind
- [ ] T077 [M] [US4] MANUAL: User reviews and approves the retry + error-state UX variants (copy, button placement, discard vs retry emphasis, color tone for each kind). No US4 implementation below starts until approved.

### Tests

- [ ] T078 [P] [US4] Create `mobile-app/src/pipeline/__tests__/reliability.test.ts` — simulated upload 500 preserves captured audio + exposes retry affordance (SC-004); malformed JSON response → friendly error + retry (FR-018); client-side timeout fires after payload-proportional window (FR-020)
- [ ] T079 [P] [US4] Create `mobile-app/src/audio/__tests__/interruption.test.ts` — simulated `expo-audio` interruption begin → `pipeline-store` pauses; interruption end → coherent state (resume-or-stop with replay affordance)
- [ ] T080 [P] [US4] Create `mobile-app/src/audio/__tests__/route-change.test.ts` — simulated speaker→wired and speaker→Bluetooth route changes mid-playback: no crash; playback either continues through the new output or explicitly resumes per `research.md` §10 R-D
- [ ] T081 [P] [US4] Create `mobile-app/maestro/flows/us4-background-upload.yaml` — record 5 s phrase → immediately background app (home) → wait 8 s → foreground → assert completion result visible (FR-006a end-to-end)
- [ ] T082 [P] [US4] Create `mobile-app/maestro/flows/us4-offline-retry.yaml` — airplane mode ON → record 3 s phrase → assert `RetryBanner` visible → airplane mode OFF → tap Retry → assert translation completes without re-recording (SC-004)

### Implementation

- [ ] T083 [US4] Add upload-progress indicator to `StatusPill` in `mobile-app/src/components/StatusPill.tsx` — when the current phase is `uploading` and `>= 2 s` have elapsed without reaching `polling`, render a non-fake progress indicator from the `uploadAsync` progress callback (FR-019)
- [ ] T084 [Commit] `001-wolof-translate-mobile:Phase5-US4: reliability polish + E2E flows`

**Checkpoint**: US1, US2, and US4 all functional independently. Reliability Maestro flows green.

---

## Phase 6: User Story 3 — Developer-mode diagnostic panel (Priority: P3)

**Goal**: A toggle-in developer panel exposes raw backend response, event log, captured-audio preview, file-upload-from-disk, and a runtime backend URL override.

**Independent Test**: Enable developer mode → panels appear → change BFF URL → next upload uses new URL → view raw response of a completed job → clear the event log → re-open app → developer-mode state persists.

### Mock-first UI

- [ ] T085 [US3] Create `mobile-app/src/components/DevPanelSheet.tsx` as a visual mock: dev-toggle, server URL text input, raw response code block, event log scrollable list with Clear button, file-picker trigger button; fixture data only
- [ ] T086 [US3] Update `mobile-app/app/dev-panel.tsx` to host `DevPanelSheet` as the modal content
- [ ] T087 [US3] Add a developer-mode access affordance in `mobile-app/app/index.tsx` — a small toggle in the top app bar visible to all users (per `spec.md` §Clarifications #1 reading; `FR-014` allows visible toggle, only panels are gated)
- [ ] T088 [M] [US3] MANUAL: User reviews and approves the Dev Panel mock — discoverability of the toggle, panel layout, copy. No US3 business-logic task below starts until approved.

### Tests

- [ ] T089 [P] [US3] Create `mobile-app/src/components/__tests__/DevPanelSheet.test.tsx` — dev-toggle flips `settings-store.devModeEnabled`; backend URL input is validated (URL parse) and persisted; Clear button empties `dev-log-store`; file-picker trigger calls `expo-document-picker.getDocumentAsync`
- [ ] T090 [P] [US3] Create `mobile-app/src/state/__tests__/settings-store.test.ts` — `devModeEnabled` + `backendUrlOverride` survive a simulated cold re-hydration (FR-016)

### Implementation

- [ ] T091 [US3] Implement FR-015a audio preview in `DevPanelSheet`: "Preview" button plays the currently-captured audio (if any) via `expo-audio` without uploading
- [ ] T092 [US3] Implement FR-015b file-from-disk upload: integrate `expo-document-picker` to select an `m4a`/`wav` file, then feed the result into `pipeline-store` the same way a live recording does
- [ ] T093 [US3] Implement FR-015c raw-response view: `pipeline-store` retains the last `JobState` wire payload; `DevPanelSheet` renders it in a monospaced code block
- [ ] T094 [US3] Implement FR-015d event log: `DevPanelSheet` binds to `useDevLogStore` with a `FlatList`; Clear action invokes `useDevLogStore.getState().clear()`
- [ ] T095 [US3] Implement FR-015e backend URL editor: `DevPanelSheet` form writes to `settings-store.backendUrlOverride`; `bff-client.ts` reads the override on every request (FR-022)
- [ ] T096 [US3] Verify FR-014 + FR-016 persistence in `app/_layout.tsx`: dev-mode state and URL override are loaded on launch before the first navigation
- [ ] T097 [P] [US3] Create `mobile-app/maestro/flows/us3-dev-mode.yaml` — enable dev mode → change backend URL → next upload goes to new URL → toggle dev mode off → panels hidden; cold-relaunch preserves the toggle state
- [ ] T098 [Commit] `001-wolof-translate-mobile:Phase6-US3: developer diagnostic panel`

**Checkpoint**: US1 + US2 + US3 + US4 all independently functional.

---

## Phase 7: User Story 5 — Visual design and accessibility (Priority: P3)

**Goal**: The app reads as thoughtfully West African (not generic stock), supports light + dark mode with preserved earth-tone character, honors Dynamic Type and VoiceOver, and ships the in-app Settings sheet with the tap-mode alternative (FR-028/028a).

**Independent Test**: On a physical iPhone — VoiceOver audit passes with zero unlabeled controls (SC-008); largest Dynamic Type does not clip or overlap primary controls (SC-009); dark mode preserves warm earth-tone character (no pure-black fallback); a West-African-design-aware reviewer identifies the visual identity as intentional, not generic (SC-010); tap-mode toggle in the new Settings sheet switches direction-button interaction from press-and-hold to tap-to-start/stop (FR-028).

### Design + Settings sheet

- [ ] T099 [US5] Author Senegalese-textile motif assets (Kente / mudcloth / basket-weave) and place in `mobile-app/assets/patterns/`; developer authorship required per FR-029 (no AI-generated, no generic stock)
- [ ] T100 [US5] Create `mobile-app/src/design/BackgroundPattern.tsx`: low-opacity (<8 %) overlay using the motif asset per FR-030; conditional on `prefers-reduced-motion`
- [ ] T101 [US5] Extend `mobile-app/src/design/tokens.ts` with finalized secondary palette (deep indigo, ochre, muted terracotta) and verify light + dark variants across all components already built in Phases 3–6
- [ ] T102 [US5] Update `mobile-app/app.json` icon + splash to Senegalese-contextual assets (FR-031) — NOT national flag, NOT continent silhouette
- [ ] T103 [US5] Create `mobile-app/src/components/SettingsSheet.tsx` (FR-028a): hosts the Tap-mode toggle (FR-028) bound to `settings-store.tapMode`; layout reserves space for future rows without restructure
- [ ] T104 [US5] Update `mobile-app/app/settings.tsx` to host `SettingsSheet` as the modal content
- [ ] T105 [US5] Add a gear icon in the top app bar of `mobile-app/app/index.tsx` that opens `/settings` via `router.push("/settings")`
- [ ] T106 [M] [US5] MANUAL: User reviews and approves the end-to-end visual design pass: motif integration on all screens, palette in light + dark, Settings sheet UX, app icon + splash, dev-mode-toggle visual fit. No remaining US5 tasks proceed until approval is recorded.

### Accessibility + visual implementation

- [ ] T107 [P] [US5] Implement FR-028 tap-mode alternative in `mobile-app/src/components/DirectionButton.tsx` — when `settings-store.tapMode === true`, switch from press-and-hold to tap-to-start / tap-to-stop; maintain identical downstream pipeline behavior
- [ ] T108 [P] [US5] Add `accessibilityLabel` + `accessibilityHint` (FR-025) to every interactive component (`DirectionButton`, `StatusPill`, `HistoryRow`, `RetryBanner`, `SettingsSheet`, `DevPanelSheet`) reading from `src/i18n/locales/en/messages.po`
- [ ] T109 [P] [US5] Audit Dynamic Type in `mobile-app/src/components/**` — remove all fixed `fontSize` overrides, verify every `<Text>` scales (FR-026 / SC-009); test at the largest Dynamic Type step
- [ ] T110 [P] [US5] Implement dark-mode palette branching in `mobile-app/src/design/tokens.ts` via `useColorScheme()`; every color consumer reads through a token (FR-024 / FR-027); no pure-black fallback
- [ ] T111 [P] [US5] Honor reduce-motion preference (FR-032) via `AccessibilityInfo.isReduceMotionEnabled()` — disable non-essential spring/pulse animations on `DirectionButton` and `StatusPill`
- [ ] T112 [P] [US5] Create `mobile-app/src/design/__tests__/contrast.test.ts` — computed WCAG AA contrast ratios for every foreground/background token pair in light and dark palettes (FR-027); assertion ≥ 4.5 for text, ≥ 3.0 for UI
- [ ] T113 [P] [US5] Create `mobile-app/maestro/flows/us5-a11y-voiceover.yaml` — enable VoiceOver → navigate Main + History + Settings → assert every interactive control announces a meaningful label (SC-008)
- [ ] T114 [Commit] `001-wolof-translate-mobile:Phase7-US5: visual design + accessibility pass`

**Checkpoint**: All five user stories independently functional; visual identity coherent; accessibility gates passing.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate Success Criteria end-to-end, harden for TestFlight, and close out.

- [ ] T115 [P] Execute the manual steps in `specs/001-wolof-translate-mobile/quickstart.md` on a physical iPhone: cold-start timing (SC-005 ≤ 2 s), SC-001 end-to-end timing in 10 attempts, SC-007 offline recall, SC-009 at largest Dynamic Type, SC-011 network-traffic audit (only BFF + Apple pipeline)
- [ ] T116 [P] Verify FR-034 + SC-011: `grep -R` the dependency tree for any analytics/telemetry/crash SDK (Sentry, Firebase, Amplitude, Mixpanel, Datadog, etc.); confirm only Apple TestFlight / OS-native crash reports flow
- [ ] T117 [P] Coverage audit: run `npm test -- --coverage` and confirm >80 % on `src/api`, `src/pipeline`, `src/cache`, and primary components (`DirectionButton`, `StatusPill`, `HistoryRow`, `RetryBanner`, `SettingsSheet`); add missing unit tests
- [ ] T118 [P] Performance audit: using Xcode Instruments (Main Thread + Hangs) verify SC-006 — no UI freezes ≥ 200 ms during an active translation; document traces in `specs/001-wolof-translate-mobile/perf-traces/` if any
- [ ] T119 [P] i18n readiness scan: add a scripted check in `mobile-app/scripts/check-i18n.sh` that greps `src/` and `app/` for literal user-visible strings not wrapped in `t\`...\`` / `<Trans>` (FR-035)
- [ ] T120 [P] FR-037 fallback verification: set device locale to `fr` → launch app → assert UI renders in `en` without visible errors
- [ ] T121 [P] Update `mobile-app/CLAUDE.md` with any agent-context drift discovered during Phases 3–7 (run `.specify/scripts/bash/update-agent-context.sh claude`)
- [ ] T122 [P] Update `mobile-app/README.md` with the `quickstart.md` essentials + TestFlight build steps; link to spec + plan
- [ ] T123 TestFlight build: `eas build --profile production --platform ios`; confirm the build validates with no ATS exceptions; run smoke tests (US1 happy path + US2 offline replay) on an enrolled tester device
- [ ] T124 [Commit] `001-wolof-translate-mobile:Phase8-Polish: v1 polish + TestFlight readiness`

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 Setup** — no dependencies.
- **Phase 2 Foundational** — depends on Phase 1 complete; blocks all user stories.
- **Phase 3 US1 (P1)** — depends on Phase 2. The MVP path.
- **Phase 4 US2 (P2)** — depends on Phase 2; logically chains after US1 for end-to-end demo purposes, but US2 tasks can start in parallel if staffed.
- **Phase 5 US4 (P2)** — depends on Phase 3 US1 (reuses retry + timeout + interruption code paths).
- **Phase 6 US3 (P3)** — depends on Phase 2; can start in parallel with US2/US4 if staffed.
- **Phase 7 US5 (P3)** — depends on Phase 3/4/6 (applies polish to existing surfaces); Settings sheet itself is an independent new surface.
- **Phase 8 Polish** — depends on US1–US5 all passing their independent tests.

### Per-story gating (Constitution VIII)

Each user story MUST complete its `[M]` approval gate before any of that story's implementation tasks begin:

- US1: T040 must be `[M]` approved → T041–T061 may proceed.
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

BE-1 and BE-2 (in the parent `offline-translate` repo) block the US1 success scenarios — specifically T059 end-to-end. If BE-1/BE-2 are not yet landed when Phase 3 begins, US1 implementation can proceed fully (contract tests stub the BE behavior via MSW), but the E2E Maestro flow T059 will not pass until BE-1/BE-2 ship. Flag this with the user at T061.

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

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1 end-to-end.
2. STOP at T061; validate on a physical iPhone against a running BFF with BE-1+BE-2.
3. Demo US1; gather feedback before moving on.

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
- Every task's implementation file belongs to `mobile-app/` or `specs/001-wolof-translate-mobile/` — no task touches the parent `offline-translate/` repo.
- Comments added to source MUST carry the `(001-wolof-translate-mobile:<TaskID>)` suffix (Constitution IV) — example: `// Honor pollAfterMs from the BFF (001-wolof-translate-mobile:T047)`.
- Tests are mandatory for BFF contract surfaces (Constitution II); verify that each contract test FAILS on first write before the matching implementation task begins.
