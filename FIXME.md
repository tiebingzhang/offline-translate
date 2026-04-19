# FIXME

Known bugs and deferred issues. Record root cause here; link out to a spec or
task when a fix is scheduled.

---

## Echo on mobile Wolof audio playback (iOS simulator + local BFF)

**Observed**: 2026-04-17, after FR-039 landed (`208861b`).
**Surface**: iOS simulator running against `web_server.py` on the same Mac.
**Symptom**: After a successful `english_to_wolof` round-trip, the translated
Wolof audio plays back twice with a short offset — perceived as echo.

### Root cause

Two independent audio streams are rendered to the same Mac speakers:

1. **Server-side playback.** `web_server.py:627` calls
   `call_speech_server(...)` with `speech_config.play = True` (default at
   `web_server.py:997`; CLI flag `--speech-no-play` at `web_server.py:1133`).
   The speech server at `wolof_speech_server.py:94` receives `play=True,
   wait=False` and invokes `start_background_playback(generated_path)`
   (`wolof_speech_server.py:36`), which spawns a daemon thread that calls
   `play_wav_file()` directly on the host's audio device. This was the
   webapp's only playback path — `webapp/app.js` has no `<audio>` element
   consuming `audio_url`, so the webapp depends on server-side playback to
   produce any sound at all.

2. **Client-side playback.** After the pipeline completes, the BFF returns
   `audio_url = "/api/requests/{id}/audio"` per FR-039e. The mobile client
   downloads the `.m4a` (`src/state/pipeline-store.ts:102-104`) and plays it
   via `defaultPlayer.playResult(...)` at
   `src/state/pipeline-store.ts:126`, which calls `player.play()` exactly
   once at `src/audio/player.ts:67`.

When the iOS simulator runs on the same Mac as the BFF, the simulator's
audio is routed to the host's speakers, so streams (1) and (2) overlap on
the same output device. FR-039 introduced the mobile-side path without
disabling the pre-existing server-side path, so both fire for every
`english_to_wolof` job.

The echo disappears in any deployment where the BFF has no audio device
(headless VPS, Docker container), but it is always present in the local
simulator workflow.

### Ruled out

- **Mobile double-trigger.** `playResult` is called exactly once per
  completion (`pipeline-store.ts:126`); `player.play()` is called exactly
  once per `playResult` (`player.ts:67`). Single-fire on the client side.
- **BFF double-encode / double-write.** `encode_pcm_to_aac_m4a` runs once
  inside `generating_speech` (`web_server.py:637`); the m4a file is written
  once (`web_server.py:639`).

### Proposed fix

Move Wolof audio playback out of the BFF and into whichever client submitted
the request. The BFF becomes a pure producer of audio bytes; the client that
asked for the translation is also the one that renders it. Mobile already
works this way; the webapp migrates to match.

Shape of the change:

- **Webapp (`webapp/app.js` + `webapp/index.html`).** Add an `<audio>` element
  and, on the `completed` poll frame, set
  `audioEl.src = job.result.audio_url; audioEl.play()`. Modern browsers play
  `audio/m4a` natively; the webapp is served same-origin from the BFF (port
  8090) so no CORS work is needed; and the user has already interacted with
  the page (the click that started the translation) so autoplay policies are
  satisfied. Gives the user native controls (pause, seek, replay) as a
  side benefit.
- **BFF (`web_server.py`).** Flip the default at `web_server.py:997` and the
  CLI default at `web_server.py:1133` so `speech_config.play` is `False` by
  default. This removes the call to `start_background_playback` in
  `wolof_speech_server.py:94`. The WAV is still written to disk for the m4a
  encoder (FR-039c) — only the host-speaker playback step is removed.
- **Mobile.** No change. `pipeline-store.ts:126` already plays the downloaded
  `.m4a` client-side.

With this in place, stream (1) from the root cause above is eliminated on
every surface, and each client is responsible for its own output. Mobile
plays only when mobile submitted; the browser plays only when the browser
submitted.

### Tradeoff / open question

The BFF's server-side playback predates FR-039 and is used by non-HTTP
entry points too — `speak_translate.py` and the `main.py` / `app.py`
scripts invoke the speech pipeline directly and rely on
`play_wav_file()` to make sound. Flipping the default to
`play=False` silences those consumers unless they are audited and
updated (or unless the default is preserved and the HTTP path passes
`play=False` explicitly). Decision needed before implementation: change
the global default, or only suppress playback on the HTTP/upload path.

### Spec placement

Not yet scoped. Candidate homes: a new FR-040 amendment to
`specs/001-wolof-translate-mobile/spec.md` (same single-git-root rationale
as FR-038/FR-039), or a fresh spec session once the current session closes.
