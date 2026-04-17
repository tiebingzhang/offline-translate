# Implementation Plan: Wolof Translate Mobile Client

**Branch**: `001-wolof-translate-mobile` | **Date**: 2026-04-17 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `specs/001-wolof-translate-mobile/spec.md`

## Summary

An iOS-first React Native + Expo client (TypeScript, SDK 55, min iOS 16) for the existing `offline-translate` BFF. The app delivers a press-and-hold English↔Wolof translation round-trip (US1), an offline history cache (US2), a developer diagnostic panel (US3), real-world reliability behaviors (US4), and a thoughtfully West-African visual identity (US5). All network I/O targets the unchanged BFF contract (`POST /api/translate-speak`, `GET /api/requests/{id}`, `GET /api/requests/{id}/audio` [BE-1], `GET /api/health`); background uploads use iOS `URLSession` background configuration via `expo-file-system/legacy`; background playback uses `expo-audio` with the matching `UIBackgroundModes: audio` config-plugin output. Pipeline-state management is centralized in two Zustand stores; history metadata persists in a client-owned SQLite table; audio blobs live under `Paths.document/audio/`. TDD is enforced via jest-expo + `@testing-library/react-native` + MSW contract tests against the BFF, with Maestro flows for the four critical E2E paths. Distribution is TestFlight-only for v1.

**2026-04-17 increment — FR-003a (persistent pipeline status bar)**. The Main screen gains a persistent bottom status bar that renders (a) a direction-aware plain-language step label derived from `(backendStage, direction, phase)` and (b) a live whole-second countdown of the FR-020 timeout budget (`timeoutAtMs - now`, clamped to ≥ 0). The increment is **client-only**: the existing BFF contract already emits `stage`, `stage_detail`, and `direction` on every poll frame, and `timeoutAtMs` is a client-derived value per FR-020. The FR-003a **Back-end scope gate** is therefore CLEARED — no user approval required before planning (see Constitution Check § VIII-addendum below). Work is ~4–6 focused hours spread across one mock-first PR and one wiring PR.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Expo SDK 55, React Native 0.76+
**Primary Dependencies**: `expo`, `expo-router` (navigation), `expo-audio` (recording + playback), `expo-file-system` (legacy import for background upload; next-gen for audio file IO), `expo-speech` (English on-device TTS), `expo-haptics`, `expo-localization`, `expo-sqlite`, `@react-native-async-storage/async-storage`, `zustand` v5, `@lingui/core` + `@lingui/react` + `@lingui/metro-transformer/expo` — pinned specifically in `research.md` §§1–7. **FR-003a adds no new dependency.**
**Storage**: `expo-sqlite` (`history.db` with `history` + `pending_jobs` tables, client-owned — see `data-model.md` §3), `expo-file-system` `Paths.document/audio/` for audio blobs, `AsyncStorage` for `wt.*` prefs. **FR-003a adds no persisted state.**
**Testing**: `jest-expo` + `@testing-library/react-native` v14 (unit / component / hook); `msw` v2 via `msw/native` (BFF contract tests, 15 handlers enumerated in `contracts/bff-api.md` §5); `maestro` (iOS Simulator + physical-device E2E; 4 flows listed in `quickstart.md`). **FR-003a adds: unit tests for the `stepLabel` resolver + countdown math, a snapshot test for `PipelineStatusBar`, and an accessibility label assertion.**
**Target Platform**: iOS 16.0 and newer (iPhone SE 2nd gen+); iPad inherits the phone layout centered; TestFlight-only distribution in v1.
**Project Type**: Mobile app — Expo managed workflow with Continuous Native Generation (CNG) via EAS Build. No manually-maintained `ios/` directory.
**Performance Goals**: SC-001 end-to-end <10 s for a ≤ 5 s phrase on good network (9/10 attempts); SC-005 cold-start <2 s; SC-006 no UI freezes ≥ 200 ms during active translation. **FR-003a countdown ticks at 1 Hz via a single `setInterval`, cleared on terminal phase; no perceptible UI cost.**
**Constraints**: FR-020 timeout = 30 s + 1 s per second of audio (33 s at 3 s clip, 90 s at 60 s clip); FR-017a poll auto-retry capped at 3 with 1/3/9 s backoff; FR-012 history ≤ 20 entries AND ≤ 50 MB of audio; FR-002a recording ≤ 60 s; FR-034 no third-party telemetry (TestFlight/OS-native crash reports only); release builds TLS-only (FR-023). **FR-003a introduces no new constraint; it elevates FR-020's wall-clock budget to a user-visible affordance.**
**Scale/Scope**: Single-user per device. Four screens (Main, History, Settings modal sheet, Dev Panel modal sheet). ~40 functional requirements in `spec.md` (FR-003a is the 41st). Audio footprint: AAC 48 kbps mono 16 kHz (≈180 KB per 30 s clip).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Code Minimalism & Schema Safety** — **PASS**. Every external integration uses official/Expo libraries (no hand-rolled native audio, no hand-rolled URLSession module). No secrets are declared in source; `EAS Secrets` will carry any runtime secret (none anticipated in v1). Non-secret config lives in `app.config.ts` + `.env.*` per-profile. On schema safety: the `history` and `pending_jobs` tables live in a client-owned SQLite file (`history.db`) that no other service touches; they are created idempotently on first launch via `CREATE TABLE IF NOT EXISTS` (see `data-model.md` §3). **No application-level ALTER** is performed at runtime. **FR-003a increment**: adds one pure function (`stepLabel({ phase, backendStage, direction }) → MessageKey`), one presentational component (`PipelineStatusBar`), and ~12 i18n catalog keys. No new state, no new store, no schema change, no new dependency.
- [x] **II. Test-Driven Development** — **PASS**. `contracts/bff-api.md` §5 enumerates 15 contract tests that MUST be authored before `src/api/bff-client.ts` is implemented. Integration/component tests cover the pipeline state machine (`src/pipeline/state-machine.ts`), history eviction rules (`src/cache/history-repo.ts`), and the four user-story happy paths. Maestro flows cover US1, US1-timeout, US2-offline, and FR-006a background upload. Coverage target: >80% on `src/api`, `src/pipeline`, `src/cache`, and primary components. **FR-003a increment**: unit tests for `stepLabel` cover every `(phase, backendStage, direction)` combination listed in FR-003a (the label vocabulary table); countdown math unit test covers positive/zero/negative clamp and terminal-phase freeze; a `PipelineStatusBar` component test asserts (i) step label matches spec vocabulary, (ii) countdown decrements, (iii) `accessibilityLabel` conveys step + seconds remaining per FR-025. Tests authored BEFORE the component is wired to the store.
- [x] **III. Research & Design Discipline** — **PASS with one recorded DEVIATION** (carried from 2026-04-16 plan; not introduced by FR-003a). No auth is in scope for v1, so "secure-by-default" is N/A (no protected routes exist). Reuse is high: the BFF is consumed unchanged; Expo modules replace every candidate hand-rolled native layer. **Deviation**: the BFF wire payloads are snake_case (existing contract — `spec.md` §Assumptions forbids the client from redefining it), but Constitution III requires camelCase. A boundary converter (`src/utils/casing.ts`) keeps the TypeScript domain strictly camelCase; the wire stays snake_case. See Complexity Tracking below. **FR-003a increment**: follows the existing `StatusPill` pattern (`src/components/StatusPill.tsx`) which already resolves `BackendStage → MessageKey`. The new resolver is a direction-aware extension of that pattern, not a parallel design.
- [x] **IV. Comment Traceability** — **PASS**. Any comments added in implementation will carry the `(001-wolof-translate-mobile:<task-id>)` suffix per the convention. The plan itself is a design artifact, so no such suffixes appear in plan prose.
- [x] **V. Git Worktree Workflow** — **PASS**. The feature branch `001-wolof-translate-mobile` is in use; branch name matches the spec name. No child-repo branches are needed — the parent `offline-translate` repo's BE-1 / BE-2 changes are in a **separate** spec session (tracked in `mobile_app_implementation_plan.md`) and are a cross-repo prerequisite, not shared source in this mobile-app repo. **FR-003a introduces no cross-repo work** (verified via spec's Back-end scope gate).
- [x] **VI. Commit Discipline** — **PASS**. Phase boundaries in `tasks.md` (to be updated by `/speckit-tasks`) will yield complete, reviewable commits. Commit messages will follow `001-wolof-translate-mobile:<PHASE>: <description>`. **FR-003a increment**: expected two commits — one for the mock-first surface + user-approval gate, one for the wired component + tests.
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

**Structure Decision**: Single mobile app — the spec is iOS-only in v1 (`spec.md` §Clarifications #1). No sibling `api/` or `android/` folder in this repo. The BFF lives in the parent `offline-translate/` project and is NOT modified by this spec; BE-1 and BE-2 are tracked as cross-repo prerequisites (see `research.md` §10 R-A). The `app/` directory hosts the expo-router file-based route tree; all non-UI code lives under `src/` for clean test collocation and explicit import boundaries. **FR-003a additions (2026-04-17)** live entirely within `src/pipeline/` (logic) and `src/components/` (presentation); no new folders, no new stores, no new cross-cutting concerns.

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
