# Feature Specification: Wolof Translate Mobile Client

**Feature Branch**: `001-wolof-translate-mobile`
**Created**: 2026-04-16
**Status**: Draft
**Input**: User description: "mobile app. Use mobile_app_requirements.md as a starting point, write spec.md. build a mobile app to work with the servers built in /Users/m849876/workspace/crying-affrica/offline-translate."

## Clarifications

### Session 2026-04-16

- Q: For v1, is Android in scope (parity with iOS), partial (pipeline only), or out entirely? → A: Android is explicitly OUT of v1. v1 ships iOS-only; Android becomes its own subsequent feature/spec.
- Q: Is the app's own UI text localized in v1, and into which languages? → A: English-only UI at launch, but built on i18n scaffolding from day one. All user-visible strings live in a message catalog and date/time/number formatting is locale-aware, so Wolof and/or French localizations can be added later as separate features without refactor.
- Q: What is the maximum single-recording duration the app permits? → A: 60 seconds. The app shows elapsed time throughout, warns the user during the final seconds, and auto-stops the recording (and submits it) at 60 s. Client-side timeouts scale with the expected payload size this implies.
- Q: What crash reporting (if any) is permitted in the v1 beta? → A: TestFlight / OS-native crash reports are allowed. No third-party crash SDK is added. Crash data flows only through Apple's built-in pipeline; "no third-party telemetry" remains the posture.
- Q: What behavior do the History view's ordering, empty state, and user-delete capabilities have? → A: Newest-first ordering; a friendly empty state before any translations exist; per-item swipe-to-delete that removes both text and stored audio for that entry. No bulk "clear all" action in v1.
- Q: What client-side timeout bounds the end-to-end pipeline (upload + poll) before the app surfaces a retry? → A: Scaling formula — **30 s base + 1 s per second of recorded audio**. A 3-second clip times out at 33 s; a 60-second clip times out at 90 s. Applies wall-clock from upload start to a terminal state (completed / failed / client-side timeout).
- Q: What is the automatic-retry policy for upload vs. polling failures? → A: **Split policy**. The upload POST is NOT auto-retried (avoids duplicate back-end jobs without an idempotency key); upload failures surface the user retry button immediately. The polling GET IS auto-retried up to **3 times with exponential backoff (1 s, 3 s, 9 s)** on transient errors before the user retry button is surfaced. Captured audio is preserved in both cases.
- Q: What happens to an in-flight upload when the user backgrounds the app mid-upload? → A: **True background upload** via iOS `URLSession` background configuration — the upload continues while the app is suspended. On foreground, the app resumes polling with the stored `request_id`; no lost work, no re-upload, no local notification.
- Q: How does the app behave if the user presses a direction control while a previous translation is still in flight? → A: **Block**. While any pipeline phase (upload, polling, or auto-retry) is active, both direction controls MUST be visibly disabled. No queueing, no cancel-and-restart, no concurrent jobs in v1.
- Q: Where does the push-to-talk alternative mode toggle (FR-028) live, given the UI architecture has no settings surface? → A: **App bar gear icon → in-app modal Settings sheet**. The sheet hosts the Tap-mode toggle in v1 and is the canonical home for any future user-facing preferences (locale override, bulk history delete, etc.). Settings are accessible to all users; not gated behind developer mode.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Speak a phrase, hear it translated (Priority: P1)

A traveler, student, or community member with a phone opens the app, holds a
primary "English → Wolof" (or "Wolof → English") button, speaks a short phrase,
and releases. The app uploads the recording to the existing translation
back-end, shows the pipeline progress in plain language (transcribing,
translating, generating speech), and then plays back the translated audio while
displaying both the transcribed source text and the translated target text.

**Why this priority**: This single round-trip IS the product. Without it, the
app delivers no value. It is the minimum slice a user can evaluate, and it is
the slice that matches the behavior of today's web prototype.

**Independent Test**: Installable on a modern iPhone. The evaluator picks a
direction, records a 3–5 second phrase, and releases. Success = correct text
shown + translated audio played back, end-to-end, using only the existing
back-end services and the evaluator's device network.

**Acceptance Scenarios**:

1. **Given** the user is on the main screen with network access, **When** they
   press and hold the "English → Wolof" control, speak "Good morning", and
   release, **Then** within a few seconds the screen shows the transcribed
   English source, the translated Wolof target text, and plays the Wolof
   audio automatically.
2. **Given** the user is on the main screen, **When** they press and hold the
   "Wolof → English" control, speak a short Wolof phrase, and release, **Then**
   the screen shows the Wolof source transcription, the English target text,
   and the English translation is spoken aloud on-device.
3. **Given** the pipeline is still running, **When** the user looks at the
   status area, **Then** they see which stage is in progress (normalizing,
   transcribing, translating, generating speech) in language they can
   understand, without raw technical jargon.
4. **Given** the microphone permission has not been granted, **When** the user
   first tries to record, **Then** the system permission prompt appears, and if
   denied the app explains — in plain language — how to enable it in device
   settings, without crashing.
5. **Given** the user is mid-playback of translated audio, **When** they lock
   the screen or switch to another app, **Then** the audio continues playing
   until it ends naturally or they stop it.

---

### User Story 2 - Review and re-play recent translations offline (Priority: P2)

A user has completed several translations over the last hour or day and wants
to revisit one — to re-hear the pronunciation, show someone the phrasing, or
confirm a word they missed. From the main screen they open a "History" view
and see their recent translations with the source text, target text, and a
one-tap replay of the stored audio. This works even if the device currently
has no network.

**Why this priority**: Recent-translation recall is a very common real-world
use case (rehearsing, confirming, sharing). It turns the app from a one-shot
translator into a light study companion, but it is not required to prove the
core pipeline works, so it ships after Story 1.

**Independent Test**: With Story 1 already working, turn on airplane mode,
open History, tap a prior translation's replay control, and confirm the
stored audio plays and the stored text is visible — no network required.

**Acceptance Scenarios**:

1. **Given** the user has completed at least one translation while online,
   **When** they later open the History view offline, **Then** that
   translation is listed (newest first) with source text, target text,
   direction, and a replay control.
2. **Given** the user has accumulated more than the retained limit of
   translations (by count or by audio size), **When** a new translation
   completes, **Then** the oldest translation is removed from history and the
   new one is added.
3. **Given** the user taps the replay control on a history item, **When**
   playback starts, **Then** the stored audio plays without re-uploading or
   re-running any part of the pipeline.
4. **Given** the user has not yet completed any translations, **When**
   they open the History view, **Then** they see a friendly empty-state
   message directing them back to the main screen — not a blank list.
5. **Given** the user wants to remove a specific past translation,
   **When** they swipe that row in the History view and confirm the
   delete action, **Then** both the entry's text and its stored audio
   are removed from the device in the same action, and the row is no
   longer present in the list.

---

### User Story 3 - Developer-mode diagnostic panel (Priority: P3)

The solo developer (and any future contributor) needs a way to inspect what
the app is actually doing: the raw back-end response, a chronological event
log, a way to preview the captured audio, a way to upload a file from disk
instead of recording, and the ability to point the app at a different
back-end URL without rebuilding. All of this lives behind a developer-mode
toggle that is off by default for end users.

**Why this priority**: Useful for iteration, reproducing bugs, and
demonstrating pipeline internals. It is not user-visible by default and is
not required to ship v1; it can follow Stories 1 and 2.

**Independent Test**: Toggle developer mode on from the main screen. Confirm
the developer panels appear, the last back-end response can be viewed,
events are logged in order, an arbitrary audio file from device storage can be uploaded, and
the server URL can be edited and takes effect on the next upload.

**Acceptance Scenarios**:

1. **Given** developer mode is on, **When** the user records and uploads,
   **Then** the raw back-end response is visible for inspection and an
   entry is appended to the event log.
2. **Given** developer mode is on, **When** the user changes the back-end
   URL, **Then** the next upload uses the new URL, and the choice persists
   across app launches.
3. **Given** developer mode is on, **When** the user selects an audio file
   from device storage instead of recording, **Then** the file is uploaded
   through the same pipeline and produces the same kind of result as a
   recording.
4. **Given** the app is restarted, **When** it opens, **Then** the previous
   developer-mode on/off state is preserved.

---

### User Story 4 - Recover gracefully from poor networks and interruptions (Priority: P2)

A user on a weak connection records a phrase and gets a network error, or
gets a phone call mid-pipeline, or switches from speakerphone to Bluetooth
headphones. In every case, the app does not crash, does not silently drop
their recording, and lets them retry without re-speaking.

**Why this priority**: The product lives in the real world, which includes
flaky networks, phone calls, and changing audio routes. Reliability here is
a perceived-quality driver. It lifts the app from "demo" to "usable", so it
belongs with — not after — the cache story.

**Independent Test**: Force a network failure (airplane mode during upload).
Confirm the captured audio is preserved and the UI offers a clear retry that
reuses the same recording. Separately, trigger a mid-playback audio-route
change and a simulated phone call; the app must remain coherent.

**Acceptance Scenarios**:

1. **Given** the user has just released the record button, **When** the
   upload fails (offline, timeout, server error), **Then** a clear retry
   control is shown, the captured audio is preserved on-device, and tapping
   retry re-uploads the same audio without asking the user to re-record.
2. **Given** translated audio is playing, **When** an incoming phone call
   arrives, **Then** playback pauses, and when the call ends the app is in
   a coherent state (either resumed, or stopped with a clearly visible way
   to replay).
3. **Given** audio is playing through the speaker, **When** the user
   connects wired or Bluetooth headphones mid-playback, **Then** playback
   continues through the new output without crashing.
4. **Given** the back-end returns a malformed or unexpected response,
   **When** the app receives it, **Then** the user sees a friendly failure
   message and can retry or start over, instead of seeing a crash.

---

### User Story 5 - Visual design and accessibility (Priority: P3)

The app feels native and modern on iOS, reads comfortably at any system text
size, has voice-over labels on every interactive element, works in both
light and dark appearances, and incorporates thoughtfully-selected West
African design motifs (not generic clip-art).

**Why this priority**: The pipeline must work first (P1), must be reliable
(P2), and must be inspectable (P3). Visual polish and the cultural design
pass are required before general release, but they do not block an internal
MVP. They sit alongside the developer panel as a pre-release-ready story.

**Independent Test**: On a physical modern iPhone, walk through the main
flow with VoiceOver on and confirm every control is announced meaningfully;
switch system text size to the largest dynamic-type step and confirm the
layout does not clip or overlap; toggle dark mode and confirm the palette
remains warm and readable; verify the background pattern and accents are
recognizably inspired by West African design, not generic stock.

**Acceptance Scenarios**:

1. **Given** VoiceOver is enabled, **When** the user navigates
   the main screen, **Then** every interactive element is announced with a
   meaningful label describing its purpose.
2. **Given** the user has increased their system text size, **When** they
   open the app, **Then** all UI text scales with the system setting and no
   primary control becomes unreachable or unreadable.
3. **Given** the user switches the device to dark mode, **When** the app is
   foregrounded, **Then** the interface adapts while preserving the warm,
   earth-tone character of the brand (no flat pure-black fallback).
4. **Given** a user unfamiliar with the project opens the app, **When** they
   see the background pattern, icons, and palette, **Then** the visual
   language reads as thoughtfully West African — not as generic
   "African-style" stock imagery.

---

### Edge Cases

- **Zero-second recording**: user taps and releases without speaking — the
  app must either refuse to upload with a friendly message, or upload and
  surface the empty-result gracefully (not crash).
- **Maximum-length recording**: user holds the record control up to (or
  through) the 60-second cap. During the final ~5 seconds the app MUST
  surface a visible countdown, and at 60 s the app MUST auto-stop the
  recording and submit it for translation as if the user had released
  the control.
- **Microphone permission denied forever**: user has permanently denied
  microphone access in settings. The app must show a clear path back to
  settings, not a silent no-op on press.
- **Back-end temporarily unreachable**: auto-retries of the polling
  phase (FR-017a: up to 3, exponential backoff 1 s / 3 s / 9 s) all
  fail. After the final auto-retry, the app MUST stop retrying,
  preserve the captured audio, and hand control back to the user via
  the retry affordance.
- **Pipeline never reaches a terminal state**: back-end sits in
  `processing` past the FR-020 client-side bound (30 s + 1 s per
  second of recorded audio). The app MUST treat the job as failed at
  that bound, preserve the captured audio, and surface the retry
  affordance so the user can re-submit without re-recording.
- **Storage pressure for history cache**: device storage is near full. The
  cache must not grow unbounded; eviction must continue to work and must
  never cause a crash on write.
- **Direction mismatch**: user speaks in one language but had the other
  direction selected (e.g., speaks English with "Wolof → English" active).
  The transcription will be poor; the app surfaces the outcome without
  pretending a good translation occurred.
- **App backgrounded mid-upload**: user backgrounds or locks the device
  while the upload is in flight. Per FR-006a, the upload MUST continue
  via `URLSession` background configuration. On next foreground the app
  MUST pick up the persisted `request_id` and resume polling
  (FR-017a). If the OS terminates the background upload (rare, on
  storage or memory pressure), the captured audio MUST remain on-device
  and the retry affordance MUST be shown on foreground.
- **Duplicate rapid taps on a direction control**: user double-taps instead
  of press-and-hold. The app must not start then immediately cancel a
  recording; taps must be distinguished from press-and-hold intent.
- **Press during in-flight job**: user presses a direction control
  while the previous translation is still uploading, polling, or
  auto-retrying. Per FR-002b the controls are disabled; the press
  MUST be a no-op (or surface a subtle "please wait" hint) and MUST
  NOT cancel the in-flight job or queue a new recording.

## Requirements *(mandatory)*

### Functional Requirements

**Core translation round-trip (US1)**

- **FR-001**: The app MUST offer two clearly-labeled primary controls for
  the two translation directions (English → Wolof, Wolof → English).
- **FR-002**: The app MUST record audio only while the user is pressing a
  direction control, and MUST automatically submit the recording on
  release OR at the 60-second maximum-length auto-stop (see FR-002a),
  whichever comes first.
- **FR-002a**: A single recording MUST NOT exceed 60 seconds. The app
  MUST display elapsed recording time throughout capture, show a visible
  countdown during the final ~5 seconds, and auto-stop and auto-submit
  at 60 s as if the user had released the control.
- **FR-002b**: While any pipeline phase is active for a prior
  translation (upload in flight per FR-003/FR-006a, polling in
  progress per FR-004, or an FR-017a auto-retry sequence is running),
  BOTH direction controls MUST be visibly disabled and MUST NOT start
  a new recording on press. The app MUST NOT queue a second job, MUST
  NOT cancel the in-flight job, and MUST NOT allow concurrent jobs in
  v1. Controls re-enable when the prior job reaches a terminal state
  (completed, failed, or client-side timeout per FR-020) or the user
  explicitly discards the prior job via FR-021.
- **FR-003**: The app MUST upload the recorded audio to the existing
  translation back-end and MUST display the ongoing pipeline stage to the
  user in plain language until a terminal state is reached.
- **FR-004**: On successful completion, the app MUST display the
  transcribed source text and the translated target text, and MUST play the
  translated audio:
  - For English → Wolof: the translated Wolof audio returned by the speech
    service.
  - For Wolof → English: a spoken rendition of the English translation
    produced on-device (system text-to-speech).
- **FR-005**: The app MUST request microphone permission on first attempted
  recording and MUST handle denial by showing clear, actionable guidance.
- **FR-006**: Translated audio MUST continue to play if the user locks the
  screen or switches to another app during playback.
- **FR-006a**: An in-flight upload (`POST /api/translate-speak`) MUST
  continue running if the app is backgrounded or the screen is
  locked, using iOS `URLSession` background configuration. On next
  foreground the app MUST locate the job by its persisted
  `request_id` and resume polling (FR-004/FR-017a) rather than
  re-uploading. The persisted `request_id` MUST survive process
  suspension.
- **FR-007**: The app MUST respect and correctly recover from audio-route
  changes (built-in speaker ↔ wired ↔ Bluetooth) during both recording and
  playback.
- **FR-008**: The app MUST pause the current pipeline on a system
  interruption (e.g., phone call) and return to a coherent state when the
  interruption ends.
- **FR-009**: The app MUST visibly display relevant capture metadata
  during and after recording (duration, sample rate, channel count, and
  active direction) so the user can see the app is capturing correctly.

**Offline history cache (US2)**

- **FR-010**: The app MUST retain a rolling history of recently completed
  translations on-device, accessible from the main screen.
- **FR-011**: Each retained history entry MUST include the source text,
  the target text, the direction, the completion timestamp, and the result
  audio needed to replay without network.
- **FR-012**: The history cache MUST be bounded by BOTH a count limit (at
  most 20 most-recent entries) AND a total audio-storage limit (at most
  50 MB of cached audio), evicting oldest entries first when either limit
  is reached.
- **FR-013**: The user MUST be able to replay a cached translation with a
  single tap, from the history view, without network access.
- **FR-013a**: History entries MUST be displayed newest-first (most
  recently completed at the top).
- **FR-013b**: When no history entries exist, the History view MUST
  show an empty-state message that directs the user back to the main
  screen to start a translation (no blank/empty list allowed).
- **FR-013c**: The user MUST be able to delete any single history entry
  via a swipe-to-delete interaction. Deleting an entry MUST remove both
  its text and its stored audio from the device within the same user
  action. No bulk "clear all history" action is provided in v1.

**Developer-mode diagnostic panel (US3)**

- **FR-014**: The app MUST expose a developer-mode toggle that is off by
  default. When on, it reveals diagnostic panels; when off, the panels
  MUST NOT be visible to end users.
- **FR-015**: In developer mode the app MUST allow the user to:
  a. Preview the captured recording before or without uploading.
  b. Upload an audio file selected from device storage in addition to
     recording live.
  c. View the raw, unredacted back-end response from the last upload.
  d. View a chronological, scrollable event log of the current session
     with a clear-log action.
  e. Edit the back-end URL at runtime.
- **FR-016**: Developer-mode state (on/off and the chosen back-end URL)
  MUST persist across app launches on the same device.

**Reliability under real-world conditions (US4)**

- **FR-017**: If an upload (the initial `POST`) fails for any reason
  (no network, timeout, server error), the app MUST NOT auto-retry the
  upload; it MUST keep the captured audio on-device and MUST
  immediately show a retry control that re-uses that audio without
  requiring the user to re-record. Auto-retrying the upload is
  disallowed to avoid duplicate back-end jobs in the absence of an
  idempotency key.
- **FR-017a**: If a polling request (the status `GET`) fails
  transiently (connection error, timeout, 5xx), the app MUST silently
  auto-retry the poll up to **3 times with exponential backoff
  (1 s, 3 s, 9 s)** before surfacing failure. If all auto-retries are
  exhausted, the app MUST surface the user retry control and preserve
  the captured audio (FR-021). Terminal failure responses from the
  back-end (`status: failed`) are NOT retried.
- **FR-018**: The app MUST NOT crash on malformed or unexpected back-end
  responses; it MUST surface a user-readable failure and offer a way to
  retry or start over.
- **FR-019**: The app MUST display upload progress (and, when the upload
  is slower than ~2 seconds, an estimated time remaining or a non-fake
  progress indicator) so the user knows the app is still working.
- **FR-020**: The client MUST apply a bounded, payload-proportional
  timeout to the end-to-end pipeline (from upload start to a terminal
  state). The timeout MUST be computed as **30 seconds base + 1 second
  per second of recorded audio** (so a 3 s clip times out at 33 s and
  the maximum 60 s clip times out at 90 s). On timeout the client MUST
  treat the job as failed, preserve the captured audio per FR-017/
  FR-021, and show the retry affordance.
- **FR-021**: The app MUST discard captured audio only when the user
  explicitly starts a new recording, taps a clear "discard" action, or
  successfully completes the translation.

**Configuration and environments**

- **FR-022**: The default back-end URL MUST be set at build time (one
  value for development, one value for release builds) and MUST be
  overridable at runtime in developer mode.
- **FR-023**: Release builds MUST use an encrypted (TLS-protected)
  back-end endpoint. Unencrypted endpoints MAY be permitted only in
  developer/debug builds and only for local-network development.

**Visual design and accessibility (US5)**

- **FR-024**: The app MUST support both light and dark appearance, with
  the warm, earth-tone brand character preserved in both.
- **FR-025**: Every interactive control MUST have a screen-reader label
  that describes its purpose (not just its icon).
- **FR-026**: Text MUST scale with the user's system text-size
  preference; the main flow MUST remain usable at the largest supported
  dynamic-type setting.
- **FR-027**: Color contrast for text and essential UI MUST meet WCAG AA
  against the chosen palette in both light and dark modes.
- **FR-028**: The push-to-talk interaction MUST have an alternative
  tap-to-start / tap-to-stop mode available to all users (not gated
  behind developer mode). The toggle MUST live in the in-app Settings
  sheet (see FR-028a). Its chosen value MUST persist across app
  launches on the same device.
- **FR-028a**: The app MUST expose an in-app Settings sheet, reached
  via a gear icon in the top app bar, that is visible to all users.
  In v1 the sheet hosts the FR-028 tap-mode toggle; the sheet is the
  canonical home for future user-facing preferences and MUST be
  designed to accommodate additional rows without structural
  redesign. The Settings sheet is distinct from the developer-mode
  panels (FR-014) and is NOT gated by the developer-mode toggle.
- **FR-029**: The visual identity MUST incorporate West African design
  motifs (Kente/mudcloth/Wolof-region basket-weave or analogous textile
  traditions) chosen intentionally by a developer with the relevant
  cultural background; generic "African-style" stock imagery is not
  acceptable.
- **FR-030**: Background patterns and ornamental layers MUST remain
  subtle enough not to compete with foreground content (low opacity,
  behind-content placement).
- **FR-031**: The splash screen and app icon MUST reference the project's
  Senegalese/Wolof context without resorting to national-flag or generic
  continent-shape imagery.
- **FR-032**: Motion and animation MUST respect the user's
  reduce-motion / prefers-reduced-motion preference.

**Privacy and data handling**

- **FR-033**: Captured microphone audio MUST NOT be persisted beyond the
  current session unless (a) the user explicitly saves/exports it, or
  (b) it becomes part of a completed translation retained in the history
  cache per FR-010 to FR-012.
- **FR-034**: The v1 release MUST NOT include third-party analytics,
  telemetry, or crash-reporting SDKs. Apple's built-in
  TestFlight / OS-native crash reporting IS permitted (it flows through
  Apple's pipeline only and adds no new third-party destination); any
  later addition of a third-party analytics or crash SDK requires an
  explicit product decision and a user-facing privacy disclosure.

**Internationalization scaffolding**

- **FR-035**: The app MUST render its UI in English for v1, and MUST
  route every user-visible string (labels, button text, status messages,
  error messages, accessibility labels, empty/loading states) through a
  localization catalog rather than hard-coding them at the call site.
- **FR-036**: Date, time, duration, and number formatting shown to the
  user MUST be locale-aware (respects the device's current locale) so
  that future locale additions require no refactoring of presentation
  code.
- **FR-037**: The app MUST NOT block on a non-English locale in v1: if
  the device locale has no matching translation, the app MUST fall back
  to English without visible errors.

### Key Entities *(include if feature involves data)*

- **Translation Request**: represents one user attempt. Holds the
  captured audio, the chosen direction, and the lifecycle of the job as
  it moves through the back-end stages to completion or failure.
- **Translation Result**: the successful outcome of a Translation
  Request. Holds the source-language transcription, the target-language
  translation, the translated audio, the direction, and the time of
  completion. Eligible for retention in the history cache.
- **History Entry**: a Translation Result kept in the on-device cache for
  offline replay, subject to the count and size caps.
- **Developer Settings**: on-device settings that control the diagnostic
  panel (on/off) and the runtime back-end URL override. Persisted across
  launches.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a modern phone with a good network, a user can go from
  tapping a direction control, speaking a short phrase (≤ 5 seconds), and
  hearing the translated audio in **under 10 seconds end-to-end**, in at
  least 9 out of 10 attempts.
- **SC-002**: First-time users, given no instructions, can complete a
  round-trip translation in **under 60 seconds** of opening the app.
- **SC-003**: **95% of core translation attempts** (US1) either complete
  successfully or fail with a clear, actionable message — no silent
  failures, no UI crashes.
- **SC-004**: When the network drops or the back-end errors during
  upload, **100% of captured recordings are preserved** on-device and
  can be retried by the user without re-recording.
- **SC-005**: The app's cold-start to interactive main screen is **under
  2 seconds** on recent-generation phones.
- **SC-006**: During an active translation the app stays responsive
  (no perceptible UI freezes ≥ 200 ms).
- **SC-007**: Recent-history recall (US2) works with **zero network
  requests** — a user in airplane mode can open History and replay a
  stored translation.
- **SC-008**: Every interactive control on the main and history screens
  has a meaningful screen-reader label — **VoiceOver audit passes with
  zero unlabeled controls**.
- **SC-009**: The main flow remains fully usable at the **largest
  supported system text size** — no primary control becomes clipped,
  overlapping, or unreachable.
- **SC-010**: An internal reviewer familiar with West African design
  can identify the brand as **intentionally West African** (not generic
  "African-style") on first glance, and confirms no motifs are used
  out-of-context.
- **SC-011**: No user-identifying data, microphone audio, or
  third-party analytics event leaves the device in the v1 release —
  **external network traffic from the app is limited to the project's
  translation back-end**. (Apple's built-in OS/TestFlight crash
  reporting pipeline is not considered third-party analytics and is
  permitted.)

## Assumptions

- The existing translation back-end services in
  `/Users/m849876/workspace/crying-affrica/offline-translate` (the BFF
  and its downstream speech/translation services) are the single source
  of truth for translation pipeline behavior. The mobile client consumes
  their existing network API surface and does **not** define its own contract.
- The back-end will be extended (in a separate, coordinated effort) to
  accept compressed audio uploads so the mobile client does not need to
  upload uncompressed waveforms. Until that extension lands, core
  functionality may depend on it (blocking risk noted below).
- No user accounts, sign-in, or per-user data model are in scope for
  this feature; the product is single-user per device.
- Distribution in v1 is limited to an internal / beta channel; public
  store submissions are out of scope.
- This feature targets iOS only. Android is out of scope for v1 and
  will be addressed as a separate future feature/spec; no Android
  acceptance criteria, permissions, or platform-specific behavior are
  required here.
- The developer has the cultural background to directly approve West
  African design motifs; external cultural consultation is not required
  for v1.
- Motion/animation preferences, text-size preferences, and audio
  routes are surfaced by the device; the app is expected to respect
  them but not to re-implement them.

## Dependencies

- **Back-end compressed-audio ingestion**: the back-end must accept a
  modern compressed audio format from the mobile client. Without this,
  the core translation round-trip (US1) cannot work as specified and
  the feature is blocked.
- **Reachable back-end endpoint**: the app assumes a reachable
  development endpoint for local iteration and a reachable TLS-protected
  endpoint for release builds. Hosting/DNS for the latter is outside the
  scope of this feature but is a prerequisite for a distributable build.
- **Device capabilities**: microphone access, network access, on-device
  text-to-speech, and local storage. All are standard on supported
  phones; no special entitlements beyond microphone and (for iOS
  background playback) background-audio capability are assumed.
