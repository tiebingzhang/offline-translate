# Implementation Plan: Wolof Translate Mobile Client

**Branch**: `001-wolof-translate-mobile` | **Date**: 2026-04-17 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `specs/001-wolof-translate-mobile/spec.md`

## Summary

An iOS-first React Native + Expo client (TypeScript, SDK 55, min iOS 16) for the existing `offline-translate` BFF. The app delivers a press-and-hold English↔Wolof translation round-trip (US1), an offline history cache (US2), a developer diagnostic panel (US3), real-world reliability behaviors (US4), and a thoughtfully West-African visual identity (US5). All network I/O targets the unchanged BFF contract (`POST /api/translate-speak`, `GET /api/requests/{id}`, `GET /api/requests/{id}/audio` [BE-1], `GET /api/health`); background uploads use iOS `URLSession` background configuration via `expo-file-system/legacy`; background playback uses `expo-audio` with the matching `UIBackgroundModes: audio` config-plugin output. Pipeline-state management is centralized in two Zustand stores; history metadata persists in a client-owned SQLite table; audio blobs live under `Paths.document/audio/`. TDD is enforced via jest-expo + `@testing-library/react-native` + MSW contract tests against the BFF, with Maestro flows for the four critical E2E paths. Distribution is TestFlight-only for v1.

**2026-04-17 increment — FR-003a (persistent pipeline status bar)**. The Main screen gains a persistent bottom status bar that renders (a) a direction-aware plain-language step label derived from `(backendStage, direction, phase)` and (b) a live whole-second countdown of the FR-020 timeout budget (`timeoutAtMs - now`, clamped to ≥ 0). The increment is **client-only**: the existing BFF contract already emits `stage`, `stage_detail`, and `direction` on every poll frame, and `timeoutAtMs` is a client-derived value per FR-020. The FR-003a **Back-end scope gate** is therefore CLEARED — no user approval required before planning (see Constitution Check § VIII-addendum below). Work is ~4–6 focused hours spread across one mock-first PR and one wiring PR.

**2026-04-17 increment — FR-038 (BFF AAC/m4a ingestion, "BE-2" folded in-session)**. Previously tracked cross-session in `mobile_app_implementation_plan.md` §4 BE-2. Moved in-session because (a) the mobile-app tree and `web_server.py` share a single git root (`offline-translate/`), so the `001-wolof-translate-mobile` feature branch already covers both surfaces with zero cross-repo cost, and (b) the bug is the live blocker: the BFF's `normalize_audio_for_whisper` (`web_server.py:206-208`) rejects every mobile upload with `"Audio upload '<name>.m4a' must be a WAV file."`, which surfaces as `TranslationError.kind === 'server_failed'` in the client. FR-038 adds a single pre-pipeline transcoding step on the BFF using PyAV (Python `av` package, pre-built wheels, bundles FFmpeg — no system `ffmpeg` dependency). Scope: ~1 new Python dependency, one new function (`transcode_to_wav`), one two-line edit in `normalize_audio_for_whisper`, plus tests. No change to the network contract (`POST /api/translate-speak` accepts a superset of what it accepted before; webapp WAV uploads remain on the unchanged legacy path per FR-038c).

**2026-04-17 increment — FR-039 (BFF audio delivery, "BE-1" folded in-session)**. Previously tracked cross-session as "BE-1" (`contracts/bff-api.md §3`, `research.md §10 R-A`). Moved in-session for the same single-git-root reason as FR-038 and to unblock SC-001's "hearing the translated audio" and the `us1-happy-path.yaml` Maestro audio-playback assertion. FR-039 exposes the generated Wolof audio via a new `GET /api/requests/{request_id}/audio` endpoint and populates the `audio_url` field already awaited by the mobile client in `contracts/bff-api.md §2`. Chosen downlink format is **AAC/m4a at 48 kbps mono 16 kHz** — symmetric with the upload codec (FR-038a) and ~5× smaller than PCM WAV over cellular / the Cloudflare-Tunnel topology in `deploy-dev.md`. Transcode is **eager at job completion** inside the existing `generating_speech` stage — no new `BackendStage`, no FR-003a step-label change, no mobile-client change. PyAV (introduced by FR-038) is reused for the encode — **no new Python dependency**. Retained `.wav` stays on disk alongside the new `.m4a` so the existing webapp playback regression-tests clean. Scope: ~1 new encode helper (`encode_pcm_to_aac_m4a`), one new route handler, one extension to the `generating_speech` stage that writes two result fields (`audio_url`, `speech_result.output_path_m4a`), plus pytests. ~1.5 h of BFF work.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Expo SDK 55, React Native 0.76+ for the mobile client; **Python 3.11+** for the in-session BFF change (FR-038; unchanged runtime version from the existing `web_server.py`).
**Primary Dependencies**: `expo`, `expo-router` (navigation), `expo-audio` (recording + playback), `expo-file-system` (legacy import for background upload; next-gen for audio file IO), `expo-speech` (English on-device TTS), `expo-haptics`, `expo-localization`, `expo-sqlite`, `@react-native-async-storage/async-storage`, `zustand` v5, `@lingui/core` + `@lingui/react` + `@lingui/metro-transformer/expo` — pinned specifically in `research.md` §§1–7. **FR-003a adds no new dependency. FR-038 adds exactly one new Python dependency: `av` (PyAV) in `pyproject.toml`; ships pre-built wheels for macOS/Linux/Windows, bundles FFmpeg, no system `ffmpeg` binary required. FR-039 adds zero new dependencies — the PyAV encoder reuses the same `av` package FR-038 introduced.**
**Storage**: `expo-sqlite` (`history.db` with `history` + `pending_jobs` tables, client-owned — see `data-model.md` §3), `expo-file-system` `Paths.document/audio/` for audio blobs, `AsyncStorage` for `wt.*` prefs. **FR-003a adds no persisted state.**
**Testing**: `jest-expo` + `@testing-library/react-native` v14 (unit / component / hook); `msw` v2 via `msw/native` (BFF contract tests, 15 handlers enumerated in `contracts/bff-api.md` §5); `maestro` (iOS Simulator + physical-device E2E; 4 flows listed in `quickstart.md`). **FR-003a adds: unit tests for the `stepLabel` resolver + countdown math, a snapshot test for `PipelineStatusBar`, and an accessibility label assertion. FR-038 adds a small Python test surface on the BFF side**: (a) a `pytest` case that pipes a fixture AAC/m4a blob (captured from the iOS simulator) through `transcode_to_wav()` and asserts the output is valid 16 kHz mono PCM WAV consumable by the existing whisper pipeline, (b) a legacy-path regression test that confirms WAV uploads from the webapp still bypass the transcoder, (c) a malformed-container test that confirms `status: failed` with a descriptive `error.message` per FR-038d. **FR-039 adds four Python test cases on the BFF side** (in the same `tests/` tree T135b creates): (a) happy path — run an english→wolof job to `completed`, GET `/api/requests/{id}/audio`, assert HTTP 200 + `Content-Type: audio/m4a` + bytes starting with `ftyp` MP4 magic + `Content-Disposition` filename, and round-trip the bytes through `transcode_to_wav()` (reusing FR-038b's helper symmetrically) to assert a valid 16 kHz mono PCM WAV comes back; (b) 404 — GET `/audio` on an unknown `request_id`; (c) 409 — GET `/audio` on a job still `processing` or on a `wolof_to_english` job with `output_mode != "wolof_audio"`; (d) encode failure — `monkeypatch` the encode helper to raise, run the pipeline, assert the job transitions to `status: failed` with `error.message` matching `"Failed to encode output audio"`. Bandwidth assertion (SC-013 d): assert `len(m4a_bytes) <= len(wav_bytes) / 5`.
**Target Platform**: iOS 16.0 and newer (iPhone SE 2nd gen+); iPad inherits the phone layout centered; TestFlight-only distribution in v1.
**Project Type**: Mobile app — Expo managed workflow with Continuous Native Generation (CNG) via EAS Build. No manually-maintained `ios/` directory.
**Performance Goals**: SC-001 end-to-end <10 s for a ≤ 5 s phrase on good network (9/10 attempts); SC-005 cold-start <2 s; SC-006 no UI freezes ≥ 200 ms during active translation. **FR-003a countdown ticks at 1 Hz via a single `setInterval`, cleared on terminal phase; no perceptible UI cost.**
**Constraints**: FR-020 timeout = 30 s + 1 s per second of audio (33 s at 3 s clip, 90 s at 60 s clip); FR-017a poll auto-retry capped at 3 with 1/3/9 s backoff; FR-012 history ≤ 20 entries AND ≤ 50 MB of audio; FR-002a recording ≤ 60 s; FR-034 no third-party telemetry (TestFlight/OS-native crash reports only); release builds TLS-only (FR-023). **FR-003a introduces no new constraint; it elevates FR-020's wall-clock budget to a user-visible affordance.**
**Scale/Scope**: Single-user per device. Four screens (Main, History, Settings modal sheet, Dev Panel modal sheet). ~40 functional requirements in `spec.md` (FR-003a is the 41st; FR-038 is the 42nd; **FR-039 is the 43rd**). Audio footprint: AAC 48 kbps mono 16 kHz (≈180 KB per 30 s upload clip; downlink Wolof audio ~30 KB per 5 s utterance, ~5× smaller than WAV per SC-013). FR-038 BFF work is ~4 hours: one new `transcode_to_wav()` helper, a two-line splice into `normalize_audio_for_whisper`, one `pyproject.toml` dependency, and three pytest cases. **FR-039 BFF work is ~1.5 hours**: one new `encode_pcm_to_aac_m4a()` helper (~40 LOC), one extension to the `generating_speech` stage that writes `.m4a` alongside `.wav` and populates `result.audio_url`, one new `GET /api/requests/{id}/audio` route handler, and four pytest cases. Zero mobile-client changes — the client is already contract-ready (tasks.md T047 `downloadAudio()`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Code Minimalism & Schema Safety** — **PASS**. Every external integration uses official/Expo libraries (no hand-rolled native audio, no hand-rolled URLSession module). No secrets are declared in source; `EAS Secrets` will carry any runtime secret (none anticipated in v1). Non-secret config lives in `app.config.ts` + `.env.*` per-profile. On schema safety: the `history` and `pending_jobs` tables live in a client-owned SQLite file (`history.db`) that no other service touches; they are created idempotently on first launch via `CREATE TABLE IF NOT EXISTS` (see `data-model.md` §3). **No application-level ALTER** is performed at runtime. **FR-003a increment**: adds one pure function (`stepLabel({ phase, backendStage, direction }) → MessageKey`), one presentational component (`PipelineStatusBar`), and ~12 i18n catalog keys. No new state, no new store, no schema change, no new dependency. **FR-038 increment**: the chosen transcoder is **PyAV** (the official FFmpeg-Python binding) — no hand-rolled codec work. Exactly one new Python dependency (`av`) is added to `pyproject.toml`; PyAV's pre-built wheels remove any system `ffmpeg` binary requirement. No database schema is touched (FR-038 is stateless, in-memory transcoding). Backward-compat path for WAV uploads remains unchanged per FR-038c, so the existing webapp flow is not refactored. **FR-039 increment**: reuses the PyAV dependency introduced by FR-038 — **zero new dependencies**. The encode helper is a ~40 LOC PyAV call; the route handler streams a static file from disk via the web framework's existing file-response primitive. No database schema is touched (the `.m4a` path is only a field on the in-memory job record). The existing `.wav` file retention (FR-039d) means the webapp legacy playback path is not touched either.
- [x] **II. Test-Driven Development** — **PASS**. `contracts/bff-api.md` §5 enumerates 15 contract tests that MUST be authored before `src/api/bff-client.ts` is implemented. Integration/component tests cover the pipeline state machine (`src/pipeline/state-machine.ts`), history eviction rules (`src/cache/history-repo.ts`), and the four user-story happy paths. Maestro flows cover US1, US1-timeout, US2-offline, and FR-006a background upload. Coverage target: >80% on `src/api`, `src/pipeline`, `src/cache`, and primary components. **FR-003a increment**: unit tests for `stepLabel` cover every `(phase, backendStage, direction)` combination listed in FR-003a (the label vocabulary table); countdown math unit test covers positive/zero/negative clamp and terminal-phase freeze; a `PipelineStatusBar` component test asserts (i) step label matches spec vocabulary, (ii) countdown decrements, (iii) `accessibilityLabel` conveys step + seconds remaining per FR-025. Tests authored BEFORE the component is wired to the store. **FR-038 increment**: three pytest cases MUST be authored before `transcode_to_wav()` is wired into `normalize_audio_for_whisper` — (a) iOS-simulator AAC/m4a fixture transcodes to 16 kHz mono PCM WAV consumable by the existing whisper pipeline (happy path, FR-038a/b), (b) a PCM WAV upload bypasses the transcoder entirely and reaches the legacy normalize path byte-for-byte unchanged (regression, FR-038c), (c) a deliberately malformed m4a container (truncated moov atom) ends in `status: failed` with a descriptive `error.message` (FR-038d). Fixtures live under `tests/fixtures/audio/` and are captured once from the simulator and checked in. **FR-039 increment**: four pytest cases MUST be authored in `tests/test_audio_endpoint.py` BEFORE `encode_pcm_to_aac_m4a()` or the `/audio` route is wired — (a) happy path returns 200 + `Content-Type: audio/m4a` + valid MP4 magic + round-trips through `transcode_to_wav()` symmetrically (FR-039a/b), (b) 404 on unknown `request_id` (FR-039a), (c) 409 on job-not-completed / wrong-output-mode (FR-039a), (d) encode-failure surfaces as `status: failed` with descriptive `error.message` (FR-039f). Plus a bandwidth-budget assertion (SC-013d): m4a payload ≤ wav payload / 5.
- [x] **III. Research & Design Discipline** — **PASS with one recorded DEVIATION** (carried from 2026-04-16 plan; not introduced by FR-003a). No auth is in scope for v1, so "secure-by-default" is N/A (no protected routes exist). Reuse is high: the BFF is consumed unchanged; Expo modules replace every candidate hand-rolled native layer. **Deviation**: the BFF wire payloads are snake_case (existing contract — `spec.md` §Assumptions forbids the client from redefining it), but Constitution III requires camelCase. A boundary converter (`src/utils/casing.ts`) keeps the TypeScript domain strictly camelCase; the wire stays snake_case. See Complexity Tracking below. **FR-003a increment**: follows the existing `StatusPill` pattern (`src/components/StatusPill.tsx`) which already resolves `BackendStage → MessageKey`. The new resolver is a direction-aware extension of that pattern, not a parallel design.
- [x] **IV. Comment Traceability** — **PASS**. Any comments added in implementation will carry the `(001-wolof-translate-mobile:<task-id>)` suffix per the convention. The plan itself is a design artifact, so no such suffixes appear in plan prose.
- [x] **V. Git Worktree Workflow** — **PASS (amended 2026-04-17 for FR-038 and FR-039)**. The feature branch `001-wolof-translate-mobile` is in use; branch name matches the spec name. **The mobile-app tree and the BFF (`web_server.py`) share a single git root** (`offline-translate/`) — verified via `git rev-parse --show-toplevel`. FR-038's and FR-039's BFF changes are therefore both carried on the same feature branch as the mobile work; no child-repo branch is required because there is no child repo. The prior assertion that BE-1/BE-2 were "in a separate spec session" is **fully superseded** — BE-2 is now FR-038 and BE-1 is now FR-039; there are no remaining cross-repo prerequisites for the end-to-end round-trip. **FR-003a introduces no cross-repo work** (verified via spec's Back-end scope gate).
- [x] **VI. Commit Discipline** — **PASS**. Phase boundaries in `tasks.md` (to be updated by `/speckit-tasks`) will yield complete, reviewable commits. Commit messages will follow `001-wolof-translate-mobile:<PHASE>: <description>`. **FR-003a increment**: expected two commits — one for the mock-first surface + user-approval gate, one for the wired component + tests. **FR-038 increment**: expected two commits — `001-wolof-translate-mobile:Phase3-US1-FR038-PreWork: BFF Python packaging + pytest scaffold` (T135c) and `001-wolof-translate-mobile:Phase3-US1-FR038-BE2: PyAV transcoding on BFF upload path` (T143). **FR-039 increment**: expected one commit — `001-wolof-translate-mobile:Phase3-US1-FR039-BE1: serve generated Wolof audio as AAC/m4a` (at the end of the FR-039 sub-phase). Because FR-038 and FR-039 have no UI surface, Principle VIII (UI Mock-First Delivery) does not apply to either; TDD order (pytest cases before the wiring edit) satisfies Principle II for both.
- [x] **VII. Spec Session Continuity** — **PASS**. The branch name `001-wolof-translate-mobile` matches the spec folder, so context recovery from the git branch alone is deterministic (see Constitution VII).
- [x] **VIII. UI Mock-First Delivery** — **PASS**. `tasks.md` places, for each UI-bearing feature, a mock-UI task BEFORE any business-logic tasks, followed by an explicit user-approval task. The UI-bearing surfaces are: Main screen, History screen, Settings sheet, Dev Panel sheet (four existing mock + approval pairs, already landed in Phase 3). **FR-003a adds a fifth UI-bearing surface — the persistent bottom status bar — and therefore REQUIRES a fresh mock + user-approval pair** in `tasks.md` before any wiring task may start. The mock must populate realistic (phase, backendStage, direction, countdown) combinations so the user can validate copy + layout at every state in the vocabulary table.

### VIII-addendum (FR-003a Back-end scope gate — NEW in spec, 2026-04-17)

The FR-003a **Back-end scope gate** sub-clause requires planning to halt and obtain explicit user approval if any implementation path requires a BFF contract change. This plan affirms the gate is CLEARED:

| Gate check | Finding | Evidence |
|---|---|---|
| New BFF endpoint required? | **No.** | Step label resolves from existing `stage` field (poll) + `direction` field (upload + poll) + client `phase`. |
| New wire field required? | **No.** | Both inputs already exist in `JobStateWire` (`src/api/bff-types.ts:41-59`). |
| Streaming / SSE channel required? | **No.** | 1 Hz client-side `setInterval` for the countdown; no sub-stage streaming; `stage_detail` (already in contract) is sufficient if richer copy is ever wanted. |
| Any other BFF contract change required? | **No.** | The countdown is derived entirely from `timeoutAtMs`, which is a client-computed value per FR-020. |

**Conclusion**: FR-003a is fully implementable client-only. Planning proceeds without user approval for BFF scope because no BFF scope change is being proposed.

## Project Structure

### Documentation (this feature)

```text
specs/001-wolof-translate-mobile/
├── plan.md              # This file
├── research.md          # Phase 0 output (amended 2026-04-17 with §12 FR-003a addendum)
├── data-model.md        # Phase 1 output (amended 2026-04-17 with §1.7 + §5 FR-003a entries)
├── quickstart.md        # Phase 1 output (amended 2026-04-17 smoke-test note)
├── contracts/
│   └── bff-api.md       # Phase 1 output — consumer contract + 15 MSW contract tests (FR-003a: no contract change; addendum note added)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
mobile-app/
├── app.json                     # Expo + plugins (expo-audio mic permission + background playback)
├── app.config.ts                # Dynamic config; per-profile ATS exceptions (dev-only HTTP)
├── eas.json                     # EAS Build profiles: development | preview | production
├── package.json
├── tsconfig.json
├── metro.config.js              # Lingui @lingui/metro-transformer/expo hookup
├── jest.config.js               # preset: 'jest-expo'
├── jest.setup.ts                # MSW server + jest.mock(...) for native modules
├── .env.example
├── .env.development             # BFF_BASE_URL_DEV = http://<lan-ip>:8090
├── maestro/
│   └── flows/
│       ├── us1-happy-path.yaml
│       ├── us1-timeout.yaml
│       ├── us2-offline-history.yaml
│       └── us4-background-upload.yaml
├── app/                         # expo-router file-based routing
│   ├── _layout.tsx              # Stack; declares modal routes with sheetAllowedDetents
│   ├── index.tsx                # Main translate screen (FR-003a: hosts PipelineStatusBar at the bottom)
│   ├── history.tsx              # History screen
│   ├── settings.tsx             # Modal sheet (FR-028a)
│   └── dev-panel.tsx            # Modal sheet (FR-014 / FR-015)
├── src/
│   ├── api/
│   │   ├── bff-client.ts        # postTranslateSpeak, pollUntilTerminal, downloadAudio, checkHealth
│   │   ├── bff-types.ts         # Wire-level (snake_case) types
│   │   └── __tests__/
│   │       ├── bff-client.test.ts
│   │       └── msw-handlers.ts
│   ├── audio/
│   │   ├── recorder.ts          # expo-audio wrapper; 60 s cap (FR-002a)
│   │   ├── player.ts            # expo-audio playback + expo-speech English TTS
│   │   ├── session.ts           # setAudioModeAsync + route-change subscription
│   │   └── __tests__/
│   ├── pipeline/
│   │   ├── state-machine.ts     # idle | recording | uploading | polling | retrying | playing | completed | failed | timed_out
│   │   ├── timeout.ts           # FR-020 formula
│   │   ├── retry.ts             # FR-017a poll-only backoff
│   │   ├── step-label.ts        # NEW 2026-04-17 — FR-003a direction-aware step label resolver (pure function)
│   │   └── __tests__/
│   │       └── step-label.test.ts  # NEW — exhaustive (phase × backendStage × direction) table
│   ├── cache/
│   │   ├── history-repo.ts
│   │   ├── pending-jobs-repo.ts
│   │   └── __tests__/
│   ├── state/
│   │   ├── pipeline-store.ts
│   │   ├── settings-store.ts
│   │   └── dev-log-store.ts
│   ├── components/
│   │   ├── DirectionButton.tsx
│   │   ├── StatusPill.tsx
│   │   ├── MetadataGrid.tsx
│   │   ├── HistoryRow.tsx
│   │   ├── RetryBanner.tsx
│   │   ├── PipelineStatusBar.tsx    # NEW 2026-04-17 — FR-003a persistent bottom bar (step label + countdown)
│   │   ├── SettingsSheet.tsx
│   │   ├── DevPanelSheet.tsx
│   │   └── __tests__/
│   │       └── PipelineStatusBar.test.tsx  # NEW — snapshot + a11y + countdown tick
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/
│   │       └── en/
│   │           └── messages.po   # Amended 2026-04-17 with ~12 FR-003a keys (see data-model §5)
│   ├── design/
│   │   ├── tokens.ts
│   │   └── motifs/
│   └── utils/
│       ├── casing.ts
│       └── logger.ts
└── assets/
    ├── fonts/
    ├── icon.png
    ├── splash.png
    └── patterns/
```

**Structure Decision**: Single mobile app — the spec is iOS-only in v1 (`spec.md` §Clarifications #1). No sibling `api/` or `android/` folder in this repo. The BFF (`web_server.py`) lives in the parent `offline-translate/` directory, which shares the same git root as the mobile-app tree. **Amended 2026-04-17**: FR-038 introduces a narrow, in-scope BFF change (AAC/m4a transcoding via PyAV) committed on the same `001-wolof-translate-mobile` branch — see the BFF touchpoints section below. BE-1 (audio download endpoint) remains tracked as a cross-session prerequisite in `research.md` §10 R-A; BE-2 is no longer a cross-session item because it has been folded in as FR-038. The `app/` directory hosts the expo-router file-based route tree; all non-UI code lives under `src/` for clean test collocation and explicit import boundaries. **FR-003a additions (2026-04-17)** live entirely within `src/pipeline/` (logic) and `src/components/` (presentation); no new folders, no new stores, no new cross-cutting concerns.

### BFF touchpoints (FR-038, new 2026-04-17)

```text
offline-translate/                  # (git root — same as mobile-app)
├── web_server.py                   # AMENDED — FR-038: new `transcode_to_wav()`;
│                                   #   `normalize_audio_for_whisper` invokes it
│                                   #   when `sniff_audio_format != "wav"` (FR-038b)
│                                   # AMENDED — FR-039: new `encode_pcm_to_aac_m4a()`;
│                                   #   `generating_speech` stage calls it eagerly,
│                                   #   writes .m4a alongside .wav, sets
│                                   #   `audio_url` + `output_path_m4a`;
│                                   #   new route `GET /api/requests/{id}/audio`
├── generated_audio/                # EXISTING — now contains BOTH `{id}.wav`
│                                   #   (legacy, for webapp) AND `{id}.m4a` (FR-039d)
├── pyproject.toml                  # CREATED — parent repo currently has no pyproject.toml
│                                   #   and no requirements.txt; T135a bootstraps it
│                                   #   with existing runtime deps (numpy, soxr, ...) +
│                                   #   new `av ~= 13.1` (PyAV; reused by FR-039) +
│                                   #   dev-dep `pytest>=8` +
│                                   #   `[tool.pytest.ini_options] testpaths = ["tests"]`
└── tests/                          # CREATED — parent repo currently has no tests/ dir
    ├── __init__.py                 # CREATED (T135b) — empty
    ├── conftest.py                 # CREATED (T135b) — empty placeholder;
    │                               #   FR-039 adds fixtures: `run_english_to_wolof_job`,
    │                               #   `enqueue_wolof_to_english_job`, `client`
    ├── fixtures/
    │   └── audio/                  # CREATED (T136) — fixtures dir
    │       ├── ios_sim_3s.m4a      # NEW — captured once from iOS simulator
    │       ├── ios_sim_10s.m4a     # NEW — for length robustness
    │       ├── malformed_moov.m4a  # NEW — truncated container for FR-038d
    │       ├── empty_decoded.m4a   # NEW — zero-frame decoded stream (FR-038d)
    │       └── silence_90s.m4a     # NEW — triggers FR-038e duration cap
    ├── test_transcode.py           # NEW (T137) — six pytest cases (FR-038a/b, 038c,
    │                               #   038d ×3 branches, 038e ×2 caps)
    └── test_audio_endpoint.py      # NEW (FR-039, T145) — four pytest cases
                                    #   (FR-039a/b happy path + 404 + 409 + FR-039f
                                    #   encode-fail) plus SC-013d bandwidth assertion
```

**Bootstrap note (2026-04-17 from /speckit-analyze)**: a filesystem audit of `offline-translate/` confirmed that neither `pyproject.toml` nor `requirements.txt` nor `tests/` currently exist — the parent repo's dependencies are installed ad-hoc per `README.md`. `tasks.md` therefore gates FR-038 implementation on two new pre-work tasks, **T135a** (bootstrap `pyproject.toml`) and **T135b** (bootstrap `tests/` + `pytest` config), which must land before T136/T137 can proceed. T135c commits the scaffold. This is a Phase 3 FR-038 sub-phase prerequisite and does NOT reopen any prior phase.

No other BFF files are touched. The existing webapp (`webapp/`) WAV upload flow is unaffected per FR-038c. The `GET /api/requests/{id}`, `GET /api/health`, and `GET /api/requests/{id}/audio` (BE-1) endpoints are NOT modified by FR-038.

## FR-003a Design Detail (new in 2026-04-17 increment)

### Data flow

```
┌──────────────────────┐     ┌────────────────────┐     ┌──────────────────────┐
│  BFF /api/requests/* │     │  usePipelineStore  │     │  PipelineStatusBar   │
│  (poll response)     │──▶──│                    │──▶──│                      │
│  stage, direction,   │     │  phase             │     │  stepLabel(...)      │
│  stage_detail        │     │  backendStage      │     │  ─▶ i18n key         │
└──────────────────────┘     │  direction         │     │                      │
                             │  timeoutAtMs       │──▶──│  setInterval(1000) ─▶│
                             └────────────────────┘     │  secondsLeft clamp 0 │
                                                        └──────────────────────┘
```

All inputs already exist. The two new surfaces are: the pure resolver and the presentational component.

### `stepLabel` resolver (pure, ~40 LOC)

```ts
// src/pipeline/step-label.ts
export type StepLabelInputs = {
  phase: PipelinePhase;
  backendStage: BackendStage | null;
  direction: Direction | null;
};

export function stepLabel(input: StepLabelInputs): MessageKey {
  // client-only phases (no backend involvement)
  if (input.phase === 'uploading') return 'step.uploading';
  if (input.phase === 'retrying') return 'step.retrying';
  if (input.phase === 'playing') return 'step.playing';
  if (input.phase === 'timed_out') return 'step.timed_out';
  if (input.phase === 'failed') return 'step.failed';
  if (input.phase === 'idle' || input.phase === 'recording') return 'step.idle';

  // polling phase — direction-aware backend stage
  switch (input.backendStage) {
    case 'queued':           return 'step.queued';
    case 'normalizing':      return 'step.normalizing';
    case 'transcribing':     return input.direction === 'english_to_wolof'
                                   ? 'step.transcribing.english'
                                   : 'step.transcribing.wolof';
    case 'translating':      return input.direction === 'english_to_wolof'
                                   ? 'step.translating.english_to_wolof'
                                   : 'step.translating.wolof_to_english';
    case 'generating_speech': return 'step.generating_wolof_audio';
    case 'completed':        return 'step.playing';
    case 'failed':           return 'step.failed';
    default:                 return 'step.queued';
  }
}
```

### `PipelineStatusBar` component (~100 LOC)

- Zustand selectors for `phase`, `backendStage`, `direction`, `timeoutAtMs`.
- `useEffect` on `(timeoutAtMs, phase)`: starts `setInterval(1000)` to update `secondsLeft = Math.max(0, Math.ceil((timeoutAtMs - Date.now()) / 1000))`; clears on terminal phase or unmount.
- Hidden (null render) when `phase === 'idle'`; otherwise renders a bottom-pinned row with (step label, countdown) and respects reduce-motion (no animated transitions when enabled).
- `accessibilityLabel` composes step + "X seconds remaining" for FR-025 compliance.

### Integration into `app/index.tsx`

- Wrap existing `SafeAreaView` content so the status bar pins to the bottom safe-area inset (iOS home-indicator region respected).
- Add `paddingBottom` ≥ bar height to the `ScrollView.contentContainerStyle` so the primary direction controls are never covered.

### Testing (TDD — authored before wiring)

1. `src/pipeline/__tests__/step-label.test.ts` — exhaustive `(phase × backendStage × direction)` table covering:
   - all 9 `PipelinePhase` values
   - all 7 `BackendStage` values × 2 `Direction` values
   - null inputs (phase=idle → `step.idle`; backendStage=null with phase=polling → `step.queued` fallback)
2. `src/components/__tests__/PipelineStatusBar.test.tsx` —
   - **snapshot at 5 representative states**: idle (null render), uploading, polling + transcribing + en→wo, playing, timed_out.
   - **countdown tick**: mount with `timeoutAtMs = now + 5000`, advance timers 1 s × 5, assert "5" → "4" → … → "0".
   - **terminal freeze**: transition `phase` to `completed`, assert the interval is cleared and countdown no longer updates.
   - **accessibility**: `accessibilityLabel` contains step label + "seconds remaining".
3. `src/pipeline/__tests__/timeout.test.ts` — extend existing test file with `Math.ceil` clamp math cases if not already covered (`timeoutAtMs === now` → 0; `timeoutAtMs < now` → 0).

### i18n catalog additions (~12 keys)

Appended to `src/i18n/locales/en/messages.po` and `.ts`:

| Key | English | Notes |
|---|---|---|
| `step.idle` | `""` (empty) | Bar hidden when idle; key kept for completeness |
| `step.uploading` | `Uploading recording` | Client-only |
| `step.queued` | `Queued` | Backend stage |
| `step.normalizing` | `Preparing audio` | Backend stage |
| `step.transcribing.english` | `Transcribing English audio to text` | Direction-aware |
| `step.transcribing.wolof` | `Transcribing Wolof audio to text` | Direction-aware |
| `step.translating.english_to_wolof` | `Translating English to Wolof` | Direction-aware |
| `step.translating.wolof_to_english` | `Translating Wolof to English` | Direction-aware |
| `step.generating_wolof_audio` | `Generating Wolof audio` | English→Wolof only |
| `step.playing` | `Playing translation` | Client-only (phase=playing or stage=completed pre-playback) |
| `step.retrying` | `Retrying…` | Client-only |
| `step.timed_out` | `Timed out` | Client-only terminal |
| `step.failed` | `Failed` | Client-only terminal |
| `step.countdown` | `{seconds}s remaining` | ICU interpolation |
| `step.a11y` | `{label} — {seconds} seconds remaining` | FR-025 accessibility composition |

Total: 15 keys (the vocabulary table in FR-003a is the contract for this list).

The existing `stage.*` keys used by `StatusPill` stay unchanged; the new `step.*` namespace is purpose-built for the richer bar copy and doesn't conflict with the header pill.

## FR-038 Design Detail (BE-2 folded in-session, 2026-04-17)

### Data flow

```
┌──────────────┐   multipart/form-data   ┌────────────────────┐
│ Mobile (iOS) │  file=<AAC/m4a>,        │  web_server.py     │
│              │  direction=...          │  /api/translate-   │
│              │────────────────────────▶│  speak (POST)      │
└──────────────┘                         └─────────┬──────────┘
                                                   │
                           reads bytes + sniffs    │
                                   ▼
                      ┌─────────────────────────────────┐
                      │  normalize_audio_for_whisper    │
                      │  ─ if sniff = "wav" → legacy    │  (FR-038c)
                      │    path (unchanged)             │
                      │  ─ else → transcode_to_wav(...) │  (FR-038b, NEW)
                      │         ↓ (PCM WAV 16 kHz mono) │
                      │    legacy path resumes here     │
                      └─────────────────────────────────┘
                                   │
                                   ▼
                      whisper.cpp → translation → TTS
                      (all downstream services unchanged)
```

### `transcode_to_wav` helper (pure, ~40 LOC)

```python
# web_server.py (new helper, added near normalize_audio_for_whisper)
import io
import av
import numpy as np

WHISPER_SAMPLE_RATE = 16_000     # existing constant
MAX_UPLOAD_BYTES = 2 * 1024 * 1024   # FR-038e: 2 MiB raw-upload cap
MAX_DECODED_DURATION_SEC = 75.0  # FR-038e: 60 s recording + 25 % slack

def transcode_to_wav(audio_bytes: bytes) -> bytes:
    """Decode any PyAV-supported container (m4a/AAC, OGG/Opus, WebM) to
    16 kHz mono PCM WAV bytes, fully in memory. Raises RuntimeError with a
    descriptive message on corrupt/unsupported input (FR-038d) or when
    FR-038e resource bounds are exceeded."""
    if len(audio_bytes) > MAX_UPLOAD_BYTES:
        raise RuntimeError("Upload exceeds 2 MiB size cap.")

    input_buf = io.BytesIO(audio_bytes)
    try:
        container = av.open(input_buf, format=None)  # auto-detect
    except av.AVError as exc:
        raise RuntimeError(
            f"Audio container could not be decoded by PyAV: {exc}"
        ) from exc

    try:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise RuntimeError("Upload contains no audio stream.")

        resampler = av.AudioResampler(
            format="s16",       # signed 16-bit PCM
            layout="mono",      # downmix
            rate=WHISPER_SAMPLE_RATE,
        )

        pcm_chunks: list[np.ndarray] = []
        total_samples = 0
        max_samples = int(MAX_DECODED_DURATION_SEC * WHISPER_SAMPLE_RATE)
        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                arr = resampled.to_ndarray().reshape(-1)
                pcm_chunks.append(arr)
                total_samples += arr.size
                if total_samples > max_samples:
                    raise RuntimeError("Decoded audio duration exceeds 75s cap.")
        # flush
        for resampled in resampler.resample(None):
            arr = resampled.to_ndarray().reshape(-1)
            pcm_chunks.append(arr)
            total_samples += arr.size
            if total_samples > max_samples:
                raise RuntimeError("Decoded audio duration exceeds 75s cap.")
    finally:
        container.close()

    if not pcm_chunks:
        raise RuntimeError("Decoded audio stream was empty.")

    pcm_i16 = np.concatenate(pcm_chunks).astype(np.int16)
    return _encode_pcm16_wav(pcm_i16.astype(np.float32), WHISPER_SAMPLE_RATE)
```

`_encode_pcm16_wav` already exists in `web_server.py:180-203`. No change to it.

### Splice into `normalize_audio_for_whisper` (two lines)

```python
# web_server.py:206-219 (AMENDED)
def normalize_audio_for_whisper(audio_bytes, input_filename):
    if sniff_audio_format(audio_bytes) != "wav":
        audio_bytes = transcode_to_wav(audio_bytes)   # ← NEW (FR-038b)
        # from here down, the WAV-specific pipeline is unchanged
    samples, sample_rate = _read_wav_samples(audio_bytes, input_filename)
    # ... (unchanged) ...
```

The previous `raise RuntimeError("... must be a WAV file.")` line is removed — it's replaced by the transcoding call. All existing WAV uploads hit `sniff_audio_format == "wav"` and skip the new call entirely (FR-038c).

### Test surface (`tests/test_transcode.py`, ~120 LOC)

```python
def test_ios_simulator_aac_transcodes_to_valid_wav():
    # FR-038a/b happy path + FR-038a sniff guard (C1 from /speckit-analyze)
    aac = Path("tests/fixtures/audio/ios_sim_3s.m4a").read_bytes()
    assert sniff_audio_format(aac) == "m4a"   # contract tie-in — if this drifts,
                                              # contracts/bff-api.md §2 poll-shape
                                              # example `detected_format: "m4a"`
                                              # becomes false.
    wav = transcode_to_wav(aac)
    # Verify magic bytes + 16 kHz mono s16
    assert wav[:4] == b"RIFF" and wav[8:12] == b"WAVE"
    samples, sr = _read_wav_samples(wav, "ios_sim_3s.wav")
    assert sr == 16_000
    assert samples.shape[1] == 1

def test_existing_wav_upload_bypasses_transcoder():
    # FR-038c regression — webapp flow must be byte-identical
    wav_in = _encode_pcm16_wav(np.zeros(16_000, dtype=np.float32), 16_000)
    wav_out = normalize_audio_for_whisper(wav_in, "webapp.wav")
    # Existing pipeline writes 16 kHz mono PCM; confirm shape matches
    samples, sr = _read_wav_samples(wav_out, "webapp.wav")
    assert sr == 16_000 and samples.shape[1] == 1

def test_malformed_m4a_raises_descriptive_runtime_error():
    # FR-038d error surface — the worker's RuntimeError path already maps to
    # status=failed with error.message, so this is the contract we rely on.
    with pytest.raises(RuntimeError, match="could not be decoded by PyAV"):
        transcode_to_wav(b"\x00\x00\x00\x20ftypmp42truncated")

def test_container_without_audio_stream_raises():
    # FR-038d — stream-less container branch (C3 from /speckit-analyze)
    # Synthesize a minimal valid MP4 container with a video track and no audio.
    video_only = _make_video_only_mp4_fixture()   # helper in conftest.py
    with pytest.raises(RuntimeError, match="no audio stream"):
        transcode_to_wav(video_only)

def test_empty_decoded_stream_raises():
    # FR-038d — empty-decoded-stream branch (C3 from /speckit-analyze)
    # Use a silence-only fixture whose decoder yields zero frames after
    # resampling (e.g., an AAC with an invalid mdat atom declared zero-length).
    empty_decoded = Path("tests/fixtures/audio/empty_decoded.m4a").read_bytes()
    with pytest.raises(RuntimeError, match="Decoded audio stream was empty"):
        transcode_to_wav(empty_decoded)

def test_upload_exceeding_2mib_rejected_before_pyav(monkeypatch):
    # FR-038e — raw byte-size cap (U2 from /speckit-analyze)
    called = []
    monkeypatch.setattr(av, "open", lambda *a, **kw: called.append(1))
    oversize = b"\x00" * (2 * 1024 * 1024 + 1)
    with pytest.raises(RuntimeError, match="exceeds 2 MiB size cap"):
        transcode_to_wav(oversize)
    assert called == []   # PyAV never invoked on oversize payload

def test_decoded_duration_exceeding_75s_rejected():
    # FR-038e — post-decode duration cap (U2 from /speckit-analyze)
    # Fixture: ~90 s of AAC/m4a silence. Decoded, this exceeds the 75 s cap.
    long_clip = Path("tests/fixtures/audio/silence_90s.m4a").read_bytes()
    with pytest.raises(RuntimeError, match="Decoded audio duration exceeds 75s cap"):
        transcode_to_wav(long_clip)
```

Fixture additions beyond the three already listed in `offline-translate/tests/fixtures/audio/`: `empty_decoded.m4a` (zero-frame decoder output) and `silence_90s.m4a` (FR-038e cap trigger). `_make_video_only_mp4_fixture` is a helper in `conftest.py` that synthesizes a minimal MP4 with an mpeg4-video track and no `soun` track — avoids checking in a video binary.

### `pyproject.toml` bootstrap (new file; originally planned as a one-line amendment)

The parent `offline-translate/` repo currently has **no `pyproject.toml` and no `requirements.txt`** — a filesystem audit during `/speckit-analyze` on 2026-04-17 confirmed this. The bootstrap happens in **T135a** (not T138). Target shape:

```toml
[project]
name = "offline-translate"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    # Existing runtime deps (inferred from web_server.py imports — finalize during T135a)
    "numpy",
    "soxr",
    # ... any other existing runtime deps ...

    # New for FR-038
    "av ~= 13.1",   # PyAV — FFmpeg bundled, no system ffmpeg required (FR-038b)
]

[project.optional-dependencies]
dev = [
    "pytest >= 8",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

Version pin rationale: PyAV 13.x is the current stable series with pre-built wheels for CPython 3.11–3.13 on macOS arm64/x86_64, Linux x86_64/aarch64, and Windows. Pin is `~=` to allow patch updates without accepting major breaks.

**T138** (formerly "add `av` to pyproject") is narrowed to install-sanity only: run `pip install -e .` on macOS arm64 (already covered by T135a) **plus** the Linux x86_64 deployment container described in `deploy-dev.md` §1 (the VPS target — previously unverified).

### Deployment check

- `pip install -e .` on a clean macOS + Linux container to confirm wheel availability (no `ffmpeg-dev` required).
- `sha256` of the installed `av` wheel recorded in deployment notes (per `mobile_app_implementation_plan.md` R-9 contingency).

### Risk surface (deltas from `mobile_app_implementation_plan.md` §10)

| Risk | Likelihood | Impact | Mitigation in this plan |
|---|---|---|---|
| R-1 (AAC compression degrades whisper accuracy) | Low–Med | High | SC-012 sets the ≤5% WER bound; 20-utterance comparison is part of FR-038 verification. If exceeded, contingency is to raise recorder bitrate to 64 kbps — a one-line change in `src/audio/recorder.ts`. |
| R-9 (PyAV wheel unavailable on host) | Low | Medium | Pre-built wheels exist for all mainline deployment targets; fallback is a multi-stage Docker build with `ffmpeg-dev`. |
| (new) R-11 container variations (iOS vs Android m4a) | Low | Low | Android is out of v1 scope (FR-Android). iOS AVAudioRecorder container variations are covered by the `ios_sim_3s.m4a` / `ios_sim_10s.m4a` fixtures checked into `tests/fixtures/audio/`. |

## FR-039 Design Detail (BE-1 folded in-session, 2026-04-17)

### Data flow

```
  TTS stage (generating_speech)
┌─────────────────────────────────────────────────────────────────────┐
│  wolof_speech_server.py  ──WAV bytes──▶ _write_wav_to_disk()        │
│                                          │                           │
│                                          ▼                           │
│                                generated_audio/{id}.wav              │
│                                          │                           │
│                                          ▼ FR-039c (eager, in-stage) │
│                                encode_pcm_to_aac_m4a(wav_bytes)      │
│                                          │                           │
│                                          ▼                           │
│                                generated_audio/{id}.m4a              │
│                                          │                           │
│                                          ▼                           │
│  result.speech_result.output_path       = "/abs/.../{id}.wav"        │
│  result.speech_result.output_path_m4a   = "/abs/.../{id}.m4a" (NEW)  │
│  result.audio_url                       = "/api/requests/{id}/audio" │
│  status                                 = "completed"                │
└─────────────────────────────────────────────────────────────────────┘

  Mobile download (unchanged client code, T047)
┌─────────────────────────────────────────────────────────────────────┐
│  bff-client.downloadAudio(audioUrl)  ──GET──▶                        │
│                                                                     │
│      GET /api/requests/{id}/audio      ──▶   web_server.py          │
│                                                  │                  │
│                                                  ▼                  │
│                                         os.stat(output_path_m4a)    │
│                                                  │                  │
│                                                  ▼                  │
│      200 OK                            ◀──  stream file bytes       │
│      Content-Type: audio/m4a                                        │
│      Content-Length: N                                              │
│      Content-Disposition: attachment; filename="{id}.m4a"           │
│                                                                     │
│  expo-file-system.downloadAsync → Paths.document/audio/{id}.m4a     │
│  expo-audio.play(localUri)                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### `encode_pcm_to_aac_m4a` helper (pure, ~50 LOC)

```python
# web_server.py (new helper, added below transcode_to_wav)
import io
import av

WOLOF_TTS_AAC_BITRATE = 48_000   # FR-039b — symmetric with mobile upload
WOLOF_TTS_SAMPLE_RATE = 16_000   # matches whisper / TTS pipeline

def encode_pcm_to_aac_m4a(wav_bytes: bytes) -> bytes:
    """Encode 16 kHz mono PCM WAV bytes to AAC-in-MP4 (m4a) bytes, fully in
    memory. The output container is seekable (MP4 with fragmented moov) and
    playable by iOS AVAudioPlayer / expo-audio without further conversion.
    Raises RuntimeError with a descriptive message on encoder/container
    failure (FR-039f)."""
    in_buf = io.BytesIO(wav_bytes)
    out_buf = io.BytesIO()

    try:
        in_container = av.open(in_buf, mode="r", format="wav")
        out_container = av.open(out_buf, mode="w", format="mp4")

        in_stream = next(s for s in in_container.streams if s.type == "audio")
        out_stream = out_container.add_stream(
            "aac",
            rate=WOLOF_TTS_SAMPLE_RATE,
            layout="mono",
        )
        out_stream.bit_rate = WOLOF_TTS_AAC_BITRATE

        for frame in in_container.decode(in_stream):
            frame.pts = None  # let muxer reassign
            for packet in out_stream.encode(frame):
                out_container.mux(packet)
        # flush encoder
        for packet in out_stream.encode(None):
            out_container.mux(packet)
    except av.AVError as exc:
        raise RuntimeError(f"Failed to encode output audio: {exc}") from exc
    finally:
        try:
            out_container.close()
        except Exception:
            pass
        try:
            in_container.close()
        except Exception:
            pass

    encoded = out_buf.getvalue()
    if not encoded:
        raise RuntimeError("Failed to encode output audio: empty output stream.")
    return encoded
```

### Extension to `generating_speech` stage

Current code writes `{id}.wav` and sets `result.speech_result = { output_path: "..." }`. The new code path (still inside the same pipeline stage) appends:

```python
# inside generating_speech, AFTER wolof_speech_server produces wav_bytes and
# output_path = f"{generated_audio_dir}/{request_id}.wav" is written:
try:
    m4a_bytes = encode_pcm_to_aac_m4a(wav_bytes)
except RuntimeError as exc:
    # FR-039f — terminal failure
    job.status = "failed"
    job.error = {
        "message": str(exc),
        "type": "AudioEncodeError",
        "stage": "generating_speech",
    }
    return

m4a_path = f"{generated_audio_dir}/{request_id}.m4a"
Path(m4a_path).write_bytes(m4a_bytes)

result.speech_result["output_path_m4a"] = m4a_path
result.audio_url = f"/api/requests/{request_id}/audio"
# status transitions to "completed" at end of stage as before
```

No change to the `stage` field progression. `timings_ms.generating_speech` naturally absorbs the ~100 ms encode.

### `GET /api/requests/{request_id}/audio` route (~30 LOC)

```python
# web_server.py — new route, placed near the existing /api/requests/{id} handler
@app.get("/api/requests/{request_id}/audio")
def get_request_audio(request_id: str):
    job = jobs.get(request_id)
    if job is None:
        return JSONResponse(
            {"error": {"message": "Request not found.", "type": "NotFound"},
             "request_id": request_id},
            status_code=404,
        )
    if job.status != "completed" or job.result.output_mode != "wolof_audio":
        return JSONResponse(
            {"error": {"message": "Audio not available for this job.",
                       "type": "InvalidState"},
             "request_id": request_id},
            status_code=409,
        )
    m4a_path = job.result.speech_result.get("output_path_m4a")
    if not m4a_path or not Path(m4a_path).is_file():
        return JSONResponse(
            {"error": {"message": "Audio file evicted or missing.",
                       "type": "NotFound"},
             "request_id": request_id},
            status_code=404,
        )
    return FileResponse(
        m4a_path,
        media_type="audio/m4a",
        filename=f"{request_id}.m4a",   # sets Content-Disposition: attachment
    )
```

(Exact names depend on the web framework already in use by `web_server.py`; the spec bullet FR-039a fixes the headers and status codes, the implementation detail follows the framework.)

### Test surface (`tests/test_audio_endpoint.py`, ~100 LOC)

```python
def test_audio_endpoint_happy_path(client, run_english_to_wolof_job):
    # FR-039a + FR-039b + SC-013a/b/c
    request_id = run_english_to_wolof_job(b"Good morning", duration_sec=3)
    resp = client.get(f"/api/requests/{request_id}/audio")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/m4a"
    assert int(resp.headers["content-length"]) > 0
    assert f'filename="{request_id}.m4a"' in resp.headers.get("content-disposition", "")
    body = resp.content
    # MP4 magic "ftyp" at offset 4-8
    assert body[4:8] == b"ftyp"
    # Symmetric round-trip: decode the m4a back to WAV via FR-038b's helper,
    # assert whisper-compatible 16 kHz mono PCM WAV comes out.
    wav = transcode_to_wav(body)
    samples, sr = _read_wav_samples(wav, f"{request_id}.wav")
    assert sr == 16_000 and samples.shape[1] == 1

def test_audio_endpoint_404_unknown_request(client):
    # FR-039a — 404 branch
    resp = client.get("/api/requests/does-not-exist/audio")
    assert resp.status_code == 404
    assert resp.json()["error"]["type"] == "NotFound"

def test_audio_endpoint_409_wrong_state(client, enqueue_wolof_to_english_job):
    # FR-039a — 409 branch (wolof_to_english has output_mode != "wolof_audio")
    request_id = enqueue_wolof_to_english_job(b"...")
    resp = client.get(f"/api/requests/{request_id}/audio")
    assert resp.status_code == 409

def test_encode_failure_fails_the_job(monkeypatch, run_english_to_wolof_job):
    # FR-039f — encode-failure surface
    def boom(*a, **kw): raise RuntimeError("Failed to encode output audio: synthetic")
    monkeypatch.setattr("web_server.encode_pcm_to_aac_m4a", boom)
    request_id = run_english_to_wolof_job(b"Good morning", duration_sec=3,
                                          expect_status="failed")
    job = jobs[request_id]
    assert job.status == "failed"
    assert "Failed to encode output audio" in job.error["message"]
    assert job.result is None or job.result.audio_url is None

def test_m4a_at_least_5x_smaller_than_wav(run_english_to_wolof_job):
    # SC-013d — bandwidth verification
    request_id = run_english_to_wolof_job(b"Good morning", duration_sec=3)
    job = jobs[request_id]
    wav_size = Path(job.result.speech_result["output_path"]).stat().st_size
    m4a_size = Path(job.result.speech_result["output_path_m4a"]).stat().st_size
    assert m4a_size * 5 <= wav_size, (
        f"SC-013 bandwidth bound violated: m4a={m4a_size} bytes, wav={wav_size} bytes"
    )
```

### Risk surface (FR-039-specific deltas)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PyAV AAC encoder unavailable in the installed wheel (rare; LGPL vs GPL build flavors) | Low | Medium | Pre-built wheels on PyPI ship the `aac` encoder by default. Fallback = pin to a different PyAV release series or revert to serving WAV temporarily (FR-039 rollback = delete the encode call + set `audio_url` to point at the `.wav`; client already handles `audio/wav` via A1 fix). |
| iOS AVAudioPlayer / expo-audio can't decode PyAV-produced m4a (container variations) | Low | High | Symmetric round-trip pytest `test_audio_endpoint_happy_path` verifies the produced bytes decode back to 16 kHz mono PCM via the FR-038b helper, so the container is at least sound. Live simulator smoke test in T150 (SC-013) catches any iOS-specific decoder surprise. Fallback is to set the output container's `moov` atom placement to the front (`av.open(..., options={"movflags": "faststart"})`). |
| Disk growth from dual `.wav` + `.m4a` retention (FR-039d) | Low (v1 single-user) | Low | Acknowledged; no eviction policy in v1. Add a `cron`-style cleaner in a later spec when the VPS disk graph shows it matters. |

## Complexity Tracking

> Only filled because one Constitution Check deviation exists. **No new deviation introduced by the FR-003a increment.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Snake_case on the wire** (deviates from Constitution III "camelCase in ALL API JSON") | The mobile client consumes the existing BFF (`web_server.py`) unchanged (`spec.md` §Assumptions: "The mobile client consumes their existing network API surface and does not define its own contract"). The BFF currently emits snake_case (`request_id`, `stage_detail`, `poll_after_ms`, `transcribed_text`, `translated_text`, `audio_url`). | Alternative A — rename BFF fields: rejected because out of scope (`spec.md` Assumptions). Alternative B — use snake_case everywhere in the client: rejected because Principle III explicitly requires camelCase in the client's code surface, and camelCase is idiomatic for TS. Chosen mitigation: boundary converter `src/utils/casing.ts` (≈20 LOC, one responsibility, fully unit-tested as contract test C13). Domain code and tests never see snake_case. |

## Post-Design Re-Check (2026-04-17)

After the FR-003a design above:

- **Principles I, II, III, IV, V, VI, VII, VIII — all PASS.** No new deviation introduced.
- **FR-003a Back-end scope gate — CLEARED.** Design uses only existing contract fields and client-computed `timeoutAtMs`; no BFF change proposed.
- **Downstream follow-up (owned by `/speckit-tasks`)**: tasks.md must allocate a new mock-first task + user-approval gate for `PipelineStatusBar` BEFORE any wiring task (Principle VIII). Suggested placement: a new Phase 3b subsection under US1 (or equivalent placement that groups with the existing bottom-of-main-screen UI work). The Phase 3 US1 block is already marked complete by T036–T060; FR-003a is an additive US1 extension and must NOT reopen those tasks.

### Post-Design Re-Check — FR-038 (BE-2 fold-in, 2026-04-17)

After the FR-038 design above:

- **Principles I, II, IV, V, VI, VII — PASS.** No new deviation introduced. Principle III (camelCase) is N/A because FR-038 touches Python and the BFF wire format, which is already tracked under the existing Complexity Tracking deviation (snake_case on the wire). Principle VIII (UI Mock-First) is N/A because FR-038 has no UI surface.
- **FR-003a Back-end scope gate**: not applicable to FR-038; that gate is specific to the FR-003a requirement. FR-038 is a deliberate BFF contract superset (accepts more formats than before; same response shape), not a contract redefinition — no new endpoint, no new wire field, no streaming channel, no breaking change to the webapp's existing path.
- **Downstream follow-up (owned by `/speckit-tasks`)**: `tasks.md` must add a new phase (suggested: "Phase 3c — FR-038 BFF AAC/m4a ingestion (BE-2)") with three pytest tasks (authored first, per Principle II), one implementation task (`transcode_to_wav` + splice), one `pyproject.toml` task, and one `[Commit]` task. No mock-first pair is needed (no UI). This phase unblocks SC-012 and resolves the live `server_failed` bug seen in the simulator.

### Post-Design Re-Check — FR-039 (BE-1 fold-in, 2026-04-17)

After the FR-039 design above:

- **Principles I, II, IV, V, VI, VII — PASS.** No new deviation introduced. Principle III (camelCase) is N/A for the same reason as FR-038 (Python + existing snake_case wire). Principle VIII (UI Mock-First) is N/A because FR-039 has no UI surface — the client's existing `PipelineStatusBar` (FR-003a) and playback code are already contract-ready for the new `audio_url` field.
- **FR-003a Back-end scope gate**: CLEARED. FR-039 is a deliberate additive BFF extension — new endpoint `GET /api/requests/{id}/audio` and new field `audio_url` — but these have been present in `contracts/bff-api.md` (§2 result shape, §3 audio endpoint) since the contract was first drafted, explicitly marked pending BE-1. FR-039 is the implementation of that already-documented contract surface, not a redefinition. Existing 15 MSW contract handlers (§5 C11/C12) already cover the mobile side; no mobile-client change required.
- **FR-039 scope is bounded**: `audio_url` is optional (nullable; unchanged wire shape for wolof_to_english), so webapp and any other consumers that don't read `audio_url` are unaffected. The new route lives under the existing `/api/requests/{id}` prefix and obeys the same 404 convention as the sibling routes. No streaming / SSE. No breaking change.
- **Downstream follow-up (owned by `/speckit-tasks`)**: `tasks.md` must add a new sub-phase (suggested: "Phase 3d — FR-039 BFF audio delivery (BE-1)") with four pytest tasks (authored first, per Principle II), one encode-helper task, one `generating_speech` stage-extension task, one `/audio` route-handler task, one end-to-end iOS simulator smoke task (SC-013), and one `[Commit]` task. No mock-first pair is needed (no UI). The `contracts/bff-api.md` ⚠️ "BE-1 pending" notes should be removed once the implementation lands. `research.md §10 R-A` should be struck / updated similarly.
