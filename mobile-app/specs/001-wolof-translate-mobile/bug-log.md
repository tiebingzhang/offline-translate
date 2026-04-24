# Direction-button stuck-disabled bug log

Audit target: user-visible symptom is the two `DirectionButton`s at the top of the main screen becoming permanently unresponsive (either `disabled` or enabled-but-inert), with no RetryBanner or discard affordance to recover, forcing an app force-kill.

Button gating at `app/index.tsx:199,210`:

```ts
disabled={phase !== 'idle' && phase !== 'recording' && phase !== 'completed'}
```

Escape paths that already work:
- `failed` / `timed_out` → `RetryBanner` exposes retry + discard.
- `completed` → buttons re-enable; `handlePressIn` calls `discard()` before starting a new recording.

The bugs below cover the disabled phases (`uploading`, `polling`, `playing`) and one enabled-but-inert case (`recording`) that have no UI escape.

Bug A (non-`TranslationError` stranding `uploading`/`polling`) and the original TTS `onEnded` bug were fixed in prior commits (`4580c92`, `70e19d7`).

---

## Bug B — `defaultPlayer.playResult` rejection is silently dropped

**Severity:** Critical.

**Location:** `src/state/pipeline-store.ts:172-186` (inside `drainPoll`, after a completed job).

**Stuck phase:** `playing`.

### Root cause

After dispatching `playbackStarted` (which moves phase from `completed` → `playing`), the store kicks off playback with:

```ts
void defaultPlayer.playResult(terminal, {
  onEnded: () => dispatch({ type: 'playbackEnded' }),
  onInterruptionBegan: () => { ... },
});
```

The `void` operator discards the returned promise, so any rejection from `playResult` is lost. `playResult` is `async`, and a rejection before the internal listener is wired means `opts.onEnded` is never invoked. Phase stays at `playing`, buttons stay disabled, and there is no `RetryBanner` for the `playing` phase.

### Realistic triggers

- `deps.configureForPlayback()` in `player.ts` rejects (iOS audio-session conflict with an active recording elsewhere, or a Bluetooth route that the `expo-audio` session layer refuses).
- `deps.createAudioPlayer(localAudioUri)` throws synchronously on a corrupt/0-byte file.
- `Speech.speak(...)` throws synchronously on the TTS path (e.g., text-length > `maxSpeechInputLength`, TTS engine uninitialized).
- Any future awaited call introduced at the top of `playResult` that throws before the listener is attached.

### Proposed solution

Attach a `.catch` that dispatches `playbackEnded` so the pipeline always returns to `completed`. Keep the error non-visible to the user (the result text is already on screen — nothing to retry) but log for diagnostics.

```ts
dispatch({ type: 'playbackStarted' });
defaultPlayer
  .playResult(terminal, {
    onEnded: () => dispatch({ type: 'playbackEnded' }),
    onInterruptionBegan: () => { ... },
  })
  .catch((err) => {
    log('error', 'playback', 'playResult rejected', { err: String(err) });
    dispatch({ type: 'playbackEnded' });
  });
```

The `playbackEnded` reducer guards `if (state.phase !== 'playing') return state;` so this is idempotent against a successful listener-driven `onEnded`.

### TDD test scenario

In `src/state/__tests__/pipeline-store.test.ts`: inject a fake player whose `playResult` returns `Promise.reject(new Error('boom'))`. Drive the pipeline to completion. Assert phase transitions `polling → completed → playing → completed` and the error is logged. Requires exposing a player-injection seam or mocking `@/audio/player` at the module boundary.

---

## Bug C — audio-path `playbackStatusUpdate` listener can miss completion

**Severity:** Important (low frequency, but unrecoverable).

**Location:** `src/audio/player.ts:74-84`.

**Stuck phase:** `playing`.

### Root cause

The status listener only fires `opts.onEnded` when:
1. `status.didJustFinish === true`, or
2. `lastPlaying === true && status.playing === false` (a natural play → pause transition, used to catch OS interruptions).

If the underlying `expo-audio` player fails to load or begin playback entirely — e.g., the file is corrupt, 0-byte, or deleted between `downloadAudio` and `createAudioPlayer` — the player emits `playbackStatusUpdate` events with `isLoaded: false` and `playing: false` but never raises `didJustFinish`. `lastPlaying` starts `false`, so the `lastPlaying && !playing` branch also never fires. `opts.onEnded` is never called.

### Realistic triggers

- `downloadAudio` resolved to a path whose contents are truncated or unreadable (backend returned a 200 with an empty body, disk was full during write, etc.).
- The audio file was deleted by `unlinkTransientCapture` due to a path-comparison edge case (e.g., symlink vs. realpath mismatch) before `createAudioPlayer` opened it.
- `expo-audio` native-side load error.

### Proposed solution

Two non-exclusive options — pick (1) for a targeted fix, add (2) only if the real `expo-audio` status shape makes (1) unreliable:

1. **Inspect the status object for error/loaded flags.** Check `status.isLoaded === false` after at least one event, or inspect any `status.error` field, and call `opts.onEnded` from the listener in that case. Requires verifying `expo-audio`'s actual status shape against Context7 docs — the `AudioPlayerLike` interface in `player.ts` currently only declares `didJustFinish` and untyped `playing`.

2. **Belt-and-suspenders watchdog in `pipeline-store.ts`.** On `playbackStarted`, start a `setTimeout` for `max(15_000, 2 * resultDurationSec * 1000)` (or use the server-provided duration when available). On fire, if phase is still `playing`, dispatch `playbackEnded`. Clear the timer on `playbackEnded`/`discard`.

The watchdog (option 2) also covers any future listener regressions and the TTS-path error cases, but at the cost of lingering state in the store. Prefer (1); adopt (2) only if (1) turns out to depend on undocumented expo-audio behavior.

### TDD test scenario

In `src/audio/__tests__/player.test.ts`: use the existing `makeFakePlayer` helper to simulate a listener sequence `{ isLoaded: false, playing: false }` twice with no `didJustFinish`. Assert `opts.onEnded` was called exactly once. For option (2), in the pipeline-store test file: use `jest.useFakeTimers()`, complete a job, advance the clock past the watchdog threshold without calling `onEnded`, and assert phase is back to `completed`.

---

## Bug D — inert `recording` phase after failed mic start

**Severity:** Secondary (same user-visible symptom — buttons unresponsive — even though the underlying phase is technically `recording`, which is enabled).

**Location:** `app/index.tsx:75-82` + `src/audio/recorder.ts:102-120`.

**"Stuck" phase:** `recording` (enabled by gating rule, but `handlePressIn` early-returns when phase !== idle/completed, so further presses do nothing).

### Root cause

`handlePressIn` dispatches `pressStart` (phase → `recording`) before `recorder.start()` runs, and `recorder.start()` is `void`-fired without error handling:

```ts
const handlePressIn = (targetDirection: Direction) => {
  if (phase !== 'idle' && phase !== 'completed') return;
  if (phase === 'completed') {
    discard();
  }
  pressStart(targetDirection);   // phase → 'recording'
  void recorder.start();          // may reject or silently no-op
};
```

`useRecorder.start` in `src/audio/recorder.ts:109-111`:

```ts
if (!granted) {
  optionsRef.current.onPermissionDenied?.();
  return;  // resolves, does not throw, recorder.status stays 'idle'
}
```

If permission is denied, `onPermissionDenied` is fired (alert shown), but no dispatch returns phase to `idle`. `recorder.status` is still `idle` internally. Subsequent button presses hit `handlePressIn`, which sees phase=`recording` and early-returns. `handlePressOut` hits `recorder.status !== 'recording'` and also early-returns. Phase is stuck at `recording` with no way to recover through the UI.

Same outcome if `configureForRecording()`, `recorder.prepareToRecordAsync()`, or `recorder.record()` throws — those throws escape the `void`-fired promise and are swallowed.

### Realistic triggers

- User revokes mic permission in Settings mid-session and returns to the app.
- First-launch permission dialog denied.
- `expo-audio` native error during `prepareToRecordAsync` (hardware contention with a concurrent audio session, e.g., a Bluetooth device just disconnected).
- `configureForRecording` session-mode switch fails.

### Proposed solution

Two coordinated changes:

1. **In `app/index.tsx`**, wire the permission-denied callback and catch recorder-start errors:

```ts
const recorder = useRecorder({
  onPermissionDenied: () => {
    onPermissionDenied();  // existing alert
    discard();              // return phase to 'idle'
  },
  onTooShort: pressReleaseTooShort,
  onAutoSubmit: (uri, durationSec) => { void pressRelease(uri, durationSec); },
});

const handlePressIn = (targetDirection: Direction) => {
  if (phase !== 'idle' && phase !== 'completed') return;
  if (phase === 'completed') discard();
  pressStart(targetDirection);
  recorder.start().catch(() => {
    discard();
  });
};
```

2. **Optionally harden `useRecorder`** so `start()` re-throws instead of silently returning on permission denial, making the caller's `.catch` the single escape path. Lower priority — the callback wiring in (1) is sufficient.

### TDD test scenario

Two tests, both light-touch:

- **Unit-level (pipeline-store already covers `discard`).** Integration in an existing recorder-aware test: mount `MainScreen` with `useRecorder` mocked to invoke `onPermissionDenied` on `start()`. Assert the pipeline store's phase is `idle` after the call (not `recording`).
- **Recorder-layer.** In `src/audio/__tests__/recorder.test.ts`: mock `AudioModule.getRecordingPermissionsAsync` and `requestRecordingPermissionsAsync` to resolve `{ granted: false }`. Assert `start()` fires `onPermissionDenied` and does not flip `status` to `recording`. (This test may already exist — reuse if so.)

---

## Priority & sequencing

Recommended order:

1. **Bug B first** — highest blast radius, smallest change, easy to test. Users who see the stuck `playing` state today have no escape.
2. **Bug D next** — small, self-contained, addresses a separate but related "buttons don't work" report path.
3. **Bug C last** — needs a real `expo-audio` status-shape verification via Context7 before the fix is safe; worth deferring until (B) and (D) have baked.

Each fix is its own commit under `001-wolof-translate-mobile:Phase8-Polish:` per constitution Principle VI, with a failing test landed first per Principle II.
