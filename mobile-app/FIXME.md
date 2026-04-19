# mobile-app FIXMEs

Known bugs and deferred issues scoped to the Expo / React Native client.
Record root cause here; link out to a spec or task when a fix is scheduled.

---

## FR-007 audio route-change native bridge deferred

**Observed**: 2026-04-18, Phase 5 audit of `001-wolof-translate-mobile`.
**Surface**: `mobile-app/src/audio/session.ts:54-65` —
`subscribeToRouteChanges()` is a safe no-op. The JS listener is never
invoked because Expo SDK 55's `expo-audio` does not expose
`AVAudioSession.routeChangeNotification` (iOS) or
`AudioManager.ACTION_AUDIO_BECOMING_NOISY` (Android) as JS events.
**Spec link**: FR-007 — "The app MUST respect and correctly recover from
audio-route changes (built-in speaker ↔ wired ↔ Bluetooth) during both
recording and playback" (`mobile-app/specs/001-wolof-translate-mobile/spec.md:371-373`).

### Current behaviour

- iOS-native auto-pause on wired-headphone disconnect still works because
  `AVAudioSession` handles it at the OS level — the user hears silence
  when they unplug, which matches spec scenario 3's "no crash"
  requirement.
- Speaker → wired and speaker → Bluetooth hot-swaps rely entirely on
  the native audio session; the app cannot programmatically react or log
  the transition. Tests at
  `mobile-app/src/audio/__tests__/route-change.test.ts:87-93` pin the
  current contract (listener never fires) so the future bridge can land
  without silently changing caller behaviour.

### Missing pieces (for the bridge implementer)

1. **iOS**: register for
   `AVAudioSession.routeChangeNotification` in an Expo module and bridge
   to JS as a `RouteChangeEvent` with reason codes mapped to a simple
   `{ kind: 'changed' }` (matching the existing JS contract in
   `session.ts:4`).
2. **Android**: register a `BroadcastReceiver` for
   `AudioManager.ACTION_AUDIO_BECOMING_NOISY` (headset unplug) and for
   the `HEADSET_PLUG` sticky intent (connect/disconnect edge).
3. **JS**: flip
   `mobile-app/src/audio/session.ts:subscribeToRouteChanges` to bind the
   native emitter, and update
   `mobile-app/src/audio/__tests__/route-change.test.ts:87-93` to assert
   `{ kind: 'changed' }`.

### Why deferred

Writing an Expo module requires an EAS dev-client rebuild and native
toolchain setup that is out of scope for a JS-only patching session.
FR-007's spec scenario 3 ("no crash during route change") already passes
because the JS code never touches the native session; the missing piece
is the observability hook, not the reliability guarantee.

### Owner / next step

Defer to a dedicated native-module session. When picked up, reference
`research.md` §10 R-D and convert this FIXME entry into a task ticket
(e.g. `T056b`) or an FR-007 amendment note in `spec.md`.
