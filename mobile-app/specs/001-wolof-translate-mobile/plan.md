# Implementation Plan: Wolof Translate Mobile Client

**Branch**: `001-wolof-translate-mobile` | **Date**: 2026-04-16 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `specs/001-wolof-translate-mobile/spec.md`

## Summary

An iOS-first React Native + Expo client (TypeScript, SDK 55, min iOS 16) for the existing `offline-translate` BFF. The app delivers a press-and-hold English↔Wolof translation round-trip (US1), an offline history cache (US2), a developer diagnostic panel (US3), real-world reliability behaviors (US4), and a thoughtfully West-African visual identity (US5). All network I/O targets the unchanged BFF contract (`POST /api/translate-speak`, `GET /api/requests/{id}`, `GET /api/requests/{id}/audio` [BE-1], `GET /api/health`); background uploads use iOS `URLSession` background configuration via `expo-file-system/legacy`; background playback uses `expo-audio` with the matching `UIBackgroundModes: audio` config-plugin output. Pipeline-state management is centralized in two Zustand stores; history metadata persists in a client-owned SQLite table; audio blobs live under `Paths.document/audio/`. TDD is enforced via jest-expo + `@testing-library/react-native` + MSW contract tests against the BFF, with Maestro flows for the four critical E2E paths. Distribution is TestFlight-only for v1.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Expo SDK 55, React Native 0.76+
**Primary Dependencies**: `expo`, `expo-router` (navigation), `expo-audio` (recording + playback), `expo-file-system` (legacy import for background upload; next-gen for audio file IO), `expo-speech` (English on-device TTS), `expo-haptics`, `expo-localization`, `expo-sqlite`, `@react-native-async-storage/async-storage`, `zustand` v5, `@lingui/core` + `@lingui/react` + `@lingui/metro-transformer/expo` — pinned specifically in `research.md` §§1–7
**Storage**: `expo-sqlite` (`history.db` with `history` + `pending_jobs` tables, client-owned — see `data-model.md` §3), `expo-file-system` `Paths.document/audio/` for audio blobs, `AsyncStorage` for `wt.*` prefs
**Testing**: `jest-expo` + `@testing-library/react-native` v14 (unit / component / hook); `msw` v2 via `msw/native` (BFF contract tests, 15 handlers enumerated in `contracts/bff-api.md` §5); `maestro` (iOS Simulator + physical-device E2E; 4 flows listed in `quickstart.md`)
**Target Platform**: iOS 16.0 and newer (iPhone SE 2nd gen+); iPad inherits the phone layout centered; TestFlight-only distribution in v1
**Project Type**: Mobile app — Expo managed workflow with Continuous Native Generation (CNG) via EAS Build. No manually-maintained `ios/` directory.
**Performance Goals**: SC-001 end-to-end <10 s for a ≤ 5 s phrase on good network (9/10 attempts); SC-005 cold-start <2 s; SC-006 no UI freezes ≥ 200 ms during active translation
**Constraints**: FR-020 timeout = 30 s + 1 s per second of audio (33 s at 3 s clip, 90 s at 60 s clip); FR-017a poll auto-retry capped at 3 with 1/3/9 s backoff; FR-012 history ≤ 20 entries AND ≤ 50 MB of audio; FR-002a recording ≤ 60 s; FR-034 no third-party telemetry (TestFlight/OS-native crash reports only); release builds TLS-only (FR-023)
**Scale/Scope**: Single-user per device. Four screens (Main, History, Settings modal sheet, Dev Panel modal sheet). ~40 functional requirements in `spec.md`. Audio footprint: AAC 48 kbps mono 16 kHz (≈180 KB per 30 s clip).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Code Minimalism & Schema Safety** — **PASS**. Every external integration uses official/Expo libraries (no hand-rolled native audio, no hand-rolled URLSession module). No secrets are declared in source; `EAS Secrets` will carry any runtime secret (none anticipated in v1). Non-secret config lives in `app.config.ts` + `.env.*` per-profile. On schema safety: the `history` and `pending_jobs` tables live in a client-owned SQLite file (`history.db`) that no other service touches; they are created idempotently on first launch via `CREATE TABLE IF NOT EXISTS` (see `data-model.md` §3). **No application-level ALTER** is performed at runtime.
- [x] **II. Test-Driven Development** — **PASS**. `contracts/bff-api.md` §5 enumerates 15 contract tests that MUST be authored before `src/api/bff-client.ts` is implemented. Integration/component tests cover the pipeline state machine (`src/pipeline/state-machine.ts`), history eviction rules (`src/cache/history-repo.ts`), and the four user-story happy paths. Maestro flows cover US1, US1-timeout, US2-offline, and FR-006a background upload. Coverage target: >80% on `src/api`, `src/pipeline`, `src/cache`, and primary components.
- [x] **III. Research & Design Discipline** — **PASS with one recorded DEVIATION**. No auth is in scope for v1, so "secure-by-default" is N/A (no protected routes exist). Reuse is high: the BFF is consumed unchanged; Expo modules replace every candidate hand-rolled native layer. **Deviation**: the BFF wire payloads are snake_case (existing contract — `spec.md` §Assumptions forbids the client from redefining it), but Constitution III requires camelCase. A boundary converter (`src/utils/casing.ts`) keeps the TypeScript domain strictly camelCase; the wire stays snake_case. See Complexity Tracking below.
- [x] **IV. Comment Traceability** — **PASS**. Any comments added in implementation will carry the `(001-wolof-translate-mobile:<task-id>)` suffix per the convention. The plan itself is a design artifact, so no such suffixes appear in plan prose.
- [x] **V. Git Worktree Workflow** — **PASS**. The feature branch `001-wolof-translate-mobile` is in use; branch name matches the spec name. No child-repo branches are needed — the parent `offline-translate` repo's BE-1 / BE-2 changes are in a **separate** spec session (tracked in `mobile_app_implementation_plan.md`) and are a cross-repo prerequisite, not shared source in this mobile-app repo.
- [x] **VI. Commit Discipline** — **PASS**. Phase boundaries in `tasks.md` (to be generated) will yield complete, reviewable commits. Commit messages will follow `001-wolof-translate-mobile:<PHASE>: <description>`.
- [x] **VII. Spec Session Continuity** — **PASS**. The branch name `001-wolof-translate-mobile` matches the spec folder, so context recovery from the git branch alone is deterministic (see Constitution VII).
- [x] **VIII. UI Mock-First Delivery** — **PASS**. `tasks.md` will place, for each UI-bearing feature, a mock-UI task BEFORE any business-logic tasks, followed by an explicit user-approval task. The four UI-bearing surfaces are: Main screen, History screen, Settings sheet, Dev Panel sheet. Four mock tasks + four approval gates.

## Project Structure

### Documentation (this feature)

```text
specs/001-wolof-translate-mobile/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── bff-api.md       # Phase 1 output — consumer contract + 15 MSW contract tests
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
│   ├── index.tsx                # Main translate screen
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
│   │   └── __tests__/
│   ├── cache/
│   │   ├── history-repo.ts      # SQLite + Paths.document/audio/ with FR-012 caps
│   │   ├── pending-jobs-repo.ts # FR-006a cold-start resume
│   │   └── __tests__/
│   ├── state/
│   │   ├── pipeline-store.ts    # Zustand — in-memory, session-only
│   │   ├── settings-store.ts    # Zustand + persist → AsyncStorage
│   │   └── dev-log-store.ts     # Zustand circular buffer (cap 500)
│   ├── components/
│   │   ├── DirectionButton.tsx
│   │   ├── StatusPill.tsx
│   │   ├── MetadataGrid.tsx
│   │   ├── HistoryRow.tsx
│   │   ├── RetryBanner.tsx
│   │   ├── SettingsSheet.tsx
│   │   ├── DevPanelSheet.tsx
│   │   └── __tests__/
│   ├── i18n/
│   │   ├── index.ts             # Lingui init + expo-localization resolution
│   │   └── locales/
│   │       └── en/
│   │           └── messages.po
│   ├── design/
│   │   ├── tokens.ts            # colors (light + dark), radii, spacing, typography
│   │   └── motifs/              # West-African pattern assets (low-opacity background)
│   └── utils/
│       ├── casing.ts            # snake_case <-> camelCase at wire boundary (see Complexity Tracking)
│       └── logger.ts            # thin wrapper over useDevLogStore
└── assets/
    ├── fonts/
    ├── icon.png
    ├── splash.png
    └── patterns/
```

**Structure Decision**: Single mobile app — the spec is iOS-only in v1 (`spec.md` §Clarifications #1). No sibling `api/` or `android/` folder in this repo. The BFF lives in the parent `offline-translate/` project and is NOT modified by this spec; BE-1 and BE-2 are tracked as cross-repo prerequisites (see `research.md` §10 R-A). The `app/` directory hosts the expo-router file-based route tree; all non-UI code lives under `src/` for clean test collocation and explicit import boundaries.

## Complexity Tracking

> Only filled because one Constitution Check deviation was recorded.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Snake_case on the wire** (deviates from Constitution III "camelCase in ALL API JSON") | The mobile client consumes the existing BFF (`web_server.py`) unchanged (`spec.md` §Assumptions: "The mobile client consumes their existing network API surface and does not define its own contract"). The BFF currently emits snake_case (`request_id`, `stage_detail`, `poll_after_ms`, `transcribed_text`, `translated_text`, `audio_url`). | Alternative A — rename BFF fields: rejected because out of scope (`spec.md` Assumptions). Alternative B — use snake_case everywhere in the client: rejected because Principle III explicitly requires camelCase in the client's code surface, and camelCase is idiomatic for TS. Chosen mitigation: boundary converter `src/utils/casing.ts` (≈20 LOC, one responsibility, fully unit-tested as contract test C13). Domain code and tests never see snake_case. |
