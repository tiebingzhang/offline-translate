# Phase 0 Research: Wolof Translate Mobile Client

**Date**: 2026-04-16
**Spec**: [`spec.md`](./spec.md)
**Source inputs**: `mobile_app_requirements.md`, existing `web_server.py` (BFF), Context7 docs for Expo SDK 55 (April 2026), jest-expo, @testing-library/react-native, zustand, expo-sqlite, expo-router, @lingui/js-lingui, msw, maestro.

---

## 1. Framework & workflow

**Decision**: Expo SDK 55 managed workflow with Continuous Native Generation (CNG) via EAS Build. TypeScript 5.x. React Native 0.76+ (as bundled with Expo 55).

**Rationale**: Every hard requirement in `spec.md` (background `URLSession` upload, background audio playback, `AVAudioSession` category + interruption handling, audio route changes, microphone permission prompt) is covered by stock Expo modules. No custom native code is needed, so staying in managed + CNG keeps the repo free of `ios/` maintenance cost and keeps TestFlight distribution on `eas build --profile production --platform ios` + `eas submit`.

**Alternatives considered**:
- Bare workflow — rejected: unnecessary native-code overhead for a solo developer; no capability gap that stock Expo doesn't cover.
- Prebuild-and-commit `ios/` folder — rejected: defeats CNG; reintroduces the native-code maintenance we're avoiding.
- Flutter (raised as alternative in `mobile_app_requirements.md` §3.3) — rejected: the weaker OTA story would slow iteration for the solo-dev cadence this project depends on.

**Cited sources**: Context7 `/websites/expo_dev_versions_v55_0_0`, `/llmstxt/expo_dev_llms-full_txt`.

---

## 2. Audio capture & playback

**Decision**: `expo-audio` (not `expo-av`) for both recording and playback.

- Recording options (`RecordingOptions`): `.m4a` extension, `sampleRate: 16000`, `numberOfChannels: 1`, `bitRate: 48000`, `ios.outputFormat: MPEG4AAC`, `ios.audioQuality: MEDIUM`. Matches the mobile_app_requirements.md §4.2 target (AAC/m4a, 48 kbps mono, 16 kHz).
- Playback: `useAudioPlayer` hook for the Wolof audio returned by the BFF (direction = english→wolof).
- TTS fallback (direction = wolof→english): `expo-speech` with `language: 'en-US'`. iOS 16+ ships `en-US` voices natively — no voice download.
- Audio session config: `setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true })` before record/playback. This is what enables FR-006 background audio continuation + audio-route-change handling.
- Headphone-unplug auto-pause is documented behavior of `expo-audio` — FR-007 just has to hook the player event and update UI state.

**Rationale**: `expo-av` is on the deprecation track (A/V was split into `expo-audio` + `expo-video` in SDK 53; the video half's companion modules are already announced for removal in SDK 56). Starting on the non-deprecated module avoids a migration later.

**Alternatives considered**:
- `expo-av` — rejected (deprecation).
- Native `AVAudioRecorder`/`AVAudioPlayer` via a custom config plugin — rejected (unnecessary; no capability gap).

**Cited sources**: Context7 `/websites/expo_dev_versions_v55_0_0` (`sdk/audio`, `sdk/video`, `sdk/speech`).

---

## 3. Background upload (FR-006a)

**Decision**: `expo-file-system/legacy`'s `uploadAsync()` with `FileSystemUploadOptions.sessionType = FileSystemSessionType.BACKGROUND` and `uploadType: FileSystemUploadType.BINARY_CONTENT` — mapped to `multipart/form-data` via `httpMethod: 'POST'` + `fieldName: 'file'` + `parameters: { direction }` so the on-wire shape matches the BFF contract.

**Rationale**: This is the shortest path to iOS `URLSession` background configuration without adding a custom module. Per the docs, `sessionType: BACKGROUND` defaults on iOS and **"the downloading/uploading session on the native side will work even if the application is moved to background; if the task completes while the application is in background, the Promise will be either resolved immediately or (if the application execution has already been stopped) once the app is moved to foreground again"**. That is exactly what FR-006a specifies. The `request_id` from the 202 response must be persisted so polling can resume; see §6 (Persistence) for where.

**Alternatives considered**:
- `react-native-background-upload` — rejected: non-essential third-party dependency; Expo-managed usage requires a config plugin and adds maintenance weight for zero benefit over the first-party route.
- Next-gen `expo-file-system` (the `File`/`Directory`/`Paths` API) — that API does **not** yet expose the same upload knobs in SDK 55; use the `expo-file-system/legacy` import for upload specifically. Next-gen is fine for file IO (§6).

**Cited sources**: Context7 `/websites/expo_dev_versions_v55_0_0` (`sdk/filesystem-legacy`).

---

## 4. iOS background audio + permissions config

**Decision**: Configure via the `expo-audio` config plugin in `app.json`:

```json
{
  "expo": {
    "plugins": [
      ["expo-audio", {
        "microphonePermission": "Allow Wolof Translate to access your microphone for translation.",
        "enableBackgroundPlayback": true,
        "enableBackgroundRecording": false
      }]
    ]
  }
}
```

The plugin writes `UIBackgroundModes: ["audio"]` and `NSMicrophoneUsageDescription` into the generated `Info.plist` during prebuild. FR-005 permission string comes from the same plugin option. No duplicate declaration in `ios.infoPlist` required.

**Cited sources**: Context7 `/websites/expo_dev_versions_v55_0_0` ("Configure Background Audio Playback in app.json").

---

## 5. Per-environment ATS (HTTP) exception

**Decision**: Dynamic `app.config.ts` branching on `process.env.EAS_BUILD_PROFILE`. Only the `development` profile gets `NSExceptionDomains` for `localhost` and `.local`; `production` ships with no ATS exceptions.

```ts
// app.config.ts
const isDev = process.env.EAS_BUILD_PROFILE === 'development';
export default {
  expo: {
    ios: {
      infoPlist: isDev ? {
        NSAppTransportSecurity: {
          NSExceptionDomains: {
            localhost: { NSExceptionAllowsInsecureHTTPLoads: true },
            local:     { NSIncludesSubdomains: true, NSExceptionAllowsInsecureHTTPLoads: true }
          }
        }
      } : {}
    }
  }
};
```

Satisfies FR-023 (release builds TLS-only) + the development-ergonomic case of pointing at `http://<mac-lan-ip>:8090` during M0/M1.

**Alternative rejected**: global `NSAllowsArbitraryLoads: true`. Even gated behind a build variant it's App-Review-hostile if a profile slips through; `NSExceptionDomains` is the narrower, safer knob.

---

## 6. State, persistence, and i18n stack

| Concern | Decision | Library | Context7 ID |
|---|---|---|---|
| Global state | 2 Zustand stores (`usePipelineStore`, `useSettingsStore`) + 1 dev-only (`useDevLogStore`) | `zustand` v5 | `/pmndrs/zustand` |
| Settings persistence | `persist` middleware → AsyncStorage | `@react-native-async-storage/async-storage` v2 | `/react-native-async-storage/async-storage` |
| History metadata | SQLite (`openDatabaseAsync`) — one `history` table capped at 20 rows | `expo-sqlite` | `/expo/expo` |
| Audio blobs | `expo-file-system`/next — `Paths.document/audio/<request_id>.m4a` | `expo-file-system` | `/expo/expo` |
| i18n scaffolding | `@lingui/core` + `@lingui/react` + `@lingui/metro-transformer/expo` | Lingui | `/lingui/js-lingui` |
| Navigation | `expo-router` v4 with `presentation: 'modal'` + `sheetAllowedDetents: [0.5, 1]` for Settings and Dev Panel | `expo-router` | `/expo/expo` |
| Dev-mode event log | In-memory circular buffer (size 500) in `useDevLogStore`; session-only, not persisted | `zustand` | `/pmndrs/zustand` |

**Split rationale**:
- `usePipelineStore` is intentionally NOT persisted — it's session-only to match FR-002b (a pipeline state can't "leak" across launches; on cold start the app reads any pending `request_id` from SQLite and resumes polling via a dedicated "resume" code path, NOT by restoring the prior state machine).
- Audio blobs live in `Paths.document/audio/` (not `cache/`) because FR-012 requires the history cap to drive eviction; OS-pressure eviction of `cacheDirectory` would break FR-007/FR-013 (offline replay).
- SQLite over a JSON file for history: 20 rows is small, but the `ORDER BY created_at DESC LIMIT 20` pattern with atomic insert+trim is simpler in SQL than in a JSON file — and SQLite is already a zero-cost dependency in Expo.

---

## 7. Testing stack

| Layer | Tool | Context7 ID |
|---|---|---|
| Test runner preset | `jest-expo` | `/expo/expo` |
| Component / hook tests | `@testing-library/react-native` v14 | `/callstack/react-native-testing-library` |
| HTTP contract mocking | `msw` v2 via `msw/native` | `/websites/mswjs_io` |
| iOS E2E (simulator + device) | `maestro` | `/mobile-dev-inc/maestro-docs` |

**Contract-test approach (Constitution II)**: MSW handlers model the BFF contract (§1 of `contracts/bff-api.md`) — happy path, 4xx (`BadRequest` for missing file / invalid direction / empty payload), 5xx (`BadGateway` / timeout), and malformed-JSON. These handlers are written BEFORE `bff-client.ts` is implemented (TDD per Constitution II). A failing contract test in the suite gates any BFF-client code change.

**E2E coverage priorities** (Maestro flows):
1. `us1-happy-path.yaml` — record short phrase → see translated text → hear playback.
2. `us1-timeout.yaml` — start upload with server unreachable → see retry affordance at the FR-020 bound.
3. `us2-offline-history.yaml` — with one prior completed translation, toggle airplane mode → open History → replay.
4. `us4-background-upload.yaml` — record → immediately background → bring to foreground → see completion.

**Mocking native modules**: single `jest.setup.ts` registers `jest.mock('expo-audio' | 'expo-file-system' | 'expo-file-system/legacy' | 'expo-speech' | 'expo-haptics')` with function stubs. No test file imports these modules at top level.

**Alternatives rejected**:
- Detox (Context7 `/wix/detox`) — heavier setup (`.detoxrc`, Metro patch, custom app rebuild); overkill for a v1 with ~5 screens.
- `react-native-testing-library` (deprecated package name) — superseded by `@testing-library/react-native`.
- `nock` / `fetch-mock` for HTTP — rejected in favor of MSW's handler-based approach that can be reused for Maestro-side mocking if needed.

---

## 8. Logger for dev-mode event log (FR-015d)

**Decision**: An in-house circular-buffer logger (~60 LOC) held in `useDevLogStore` (Zustand). Buffer capacity 500 entries; `append(entry)` shifts the oldest when full; `clear()` action; session-only (no `persist` middleware so logs reset on cold launch, matching FR-015d's "current session" scope).

**Public API**:
```ts
log(level: 'debug' | 'info' | 'warn' | 'error', tag: string, message: string, meta?: Record<string, unknown>): void
```

Every call site — BFF client, audio module, state machine — pushes through this one function. The dev-panel modal renders the buffer with a "Clear" button bound to `useDevLogStore.getState().clear`.

**Alternatives rejected**: `pino`, `winston`, `react-native-logs` — none earn their bundle weight for "display the last N events in a drawer"; `console.log` interception is fragile on Hermes.

---

## 9. BFF contract findings (verified against `web_server.py`)

The BFF surface is snake_case throughout (keys: `request_id`, `status_url`, `poll_after_ms`, `stage_detail`, `timings_ms`, `transcribed_text`, `translated_text`, `output_mode`, `speech_result`, `target_language`, `detected_format`, `bytes_received`, `created_at_ms`, `updated_at_ms`, `completed_at_ms`). Full wire-level contract is transcribed in [`contracts/bff-api.md`](./contracts/bff-api.md). Key points relevant to planning:

1. **Upload response is 202 Accepted** with `{ request_id, status, stage, direction, status_url, poll_after_ms }`. The mobile client MUST persist `request_id` immediately on 202 so FR-006a background-resume works across a process kill.
2. **Poll response** (`GET /api/requests/{id}`) includes `poll_after_ms: 500` on every response — the client MUST respect this cadence rather than hard-coding a polling interval (FR-004 / `mobile_app_requirements.md` FR-4).
3. **Terminal states** are `status: "completed"` (with `result` populated) and `status: "failed"` (with `error` populated and `result: null`). The client's state machine terminates on either.
4. **Audio result**: the BFF's current behavior returns `speech_result.output_path` — a SERVER-SIDE path, not an HTTP URL. The implementation plan already flags this (`mobile_app_implementation_plan.md:260` / "BE-1"): the BFF must be extended to serve `GET /api/requests/{id}/audio` and add an `audio_url` field to the result. The mobile client MUST consume `audio_url` from the result. Until BE-1 lands the Wolof→Wolof direction cannot complete a round-trip — this is the same blocking dependency already listed in `spec.md` §Dependencies. **Treat BE-1 as the hard prerequisite for M1 US1 closure.**
5. **Casing at the TS boundary**: even though the BFF is snake_case, the TypeScript domain model is camelCase per Constitution Principle III. A thin `fromWire()` / `toWire()` converter lives in `src/utils/casing.ts`; `src/api/bff-types.ts` describes the wire shape literally (snake_case) and `src/api/bff-client.ts` returns the camelCase domain objects. See Complexity Tracking in `plan.md` for the recorded deviation justification.

---

## 10. Risks surfaced

| # | Risk | Mitigation |
|---|---|---|
| R-A | **BE-1 (`audio_url` + `/audio` endpoint)** is a hard prerequisite for US1 closure. | Schedule BE-1 as the first task in `tasks.md` before any mobile-side pipeline work; gate US1 acceptance on its availability. |
| R-B | `expo-file-system/legacy` may be removed in SDK 56 or 57. | Track Expo release notes; the next-gen `expo-file-system` is expected to expose equivalent background-upload APIs. Migration plan is a single-file change in `src/api/bff-client.ts`. |
| R-C | Maestro flows targeting physical device require paid Apple Developer enrollment. | Start with Simulator runs for M0/M1; enroll before M3 (TestFlight). |
| R-D | `expo-audio` auto-pauses on headphone disconnect. FR-007 says "continues through the new output without crashing" during playback. "Auto-pause" satisfies "does not crash" but may not satisfy "continues" through a speaker→wired switch. | Verify the exact auto-pause scope on SDK 55 during M1; if needed, listen for `AVAudioSession.routeChange` via `expo-audio` player events and resume playback programmatically. |
| R-E | Constitution III mandates camelCase wire payloads; BFF uses snake_case. | Record as a DEVIATION in `plan.md` Complexity Tracking. The boundary converter (`casing.ts`) keeps domain code camelCase; the wire stays snake_case per the existing BFF contract (`spec.md` Assumptions). |

---

## 11. Resolved NEEDS CLARIFICATION

All items from the Technical Context template are resolved by §§1–8 above. Remaining spec-level TODOs are tracked as items in [`tasks.md`](./tasks.md) (to be generated by `/speckit-tasks`).

---

## 12. FR-003a addendum — persistent pipeline status bar (2026-04-17)

**No new research required.** The FR-003a increment (bottom-pinned status bar: direction-aware step label + FR-020 countdown) is implementable with the stack already pinned in §§1–7. Findings:

| Question | Finding | Source |
|---|---|---|
| Does the BFF already emit the data needed for the step label? | **Yes.** `stage ∈ {queued, normalizing, transcribing, translating, generating_speech, completed, failed}` and `direction ∈ {english_to_wolof, wolof_to_english}` are on every poll frame. | `src/api/bff-types.ts:5-12, 41-46`; `contracts/bff-api.md` §2 (poll shape) |
| Is any other client-side phase needed beyond the backend stages? | **Yes, and it's already modelled.** `phase ∈ {idle, recording, uploading, polling, retrying, playing, completed, failed, timed_out}` already exists in the reducer; FR-003a reuses it. | `src/pipeline/state-machine.ts:10-19` |
| Is `timeoutAtMs` available to a UI component? | **Yes.** Already set in state on `pressRelease` via `computeTimeoutAtMs(startedAtMs, durationSec)`. | `src/pipeline/state-machine.ts:101`; `src/pipeline/timeout.ts:4-7` |
| Does a 1 Hz `setInterval` for the countdown conflict with SC-006 (no ≥ 200 ms freezes)? | **No.** Single interval, single `useState` update per second, no heavy layout. | SC-006 applies to translation pipeline work, not to a 1 Hz text update. |
| Is a new library needed? | **No.** React + Zustand + existing i18n catalog are sufficient. | §6 |

**Decision**: implement the resolver in `src/pipeline/step-label.ts` (pure function) and the UI in `src/components/PipelineStatusBar.tsx`. No config-plugin change, no permission change, no new dependency. See `plan.md` §FR-003a Design Detail for the full sketch.

**Alternatives considered**:
- Derive the label inside the existing `StatusPill` component — rejected because `StatusPill` lives in the header and doesn't carry the countdown; the bar must be persistent at the bottom per FR-003a.
- Stream sub-stage progress from the BFF via SSE — rejected per the FR-003a Back-end scope gate; not necessary at this spec phase.
- Compute countdown via an accumulator instead of `Date.now() - timeoutAtMs` delta — rejected because accumulators drift when JS is stalled or the app is backgrounded. The delta approach self-corrects on re-foreground.
