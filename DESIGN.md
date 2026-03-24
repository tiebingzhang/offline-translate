# Design

## Objective

Build a **web-first push-to-talk translator** for **English -> Wolof** conversation, then later wrap the same flow in Electron.

The first version should optimize for:

- fast iteration
- simple operational flow
- stable transcription and translation
- direct Wolof audio playback

The first release target is **not** simultaneous interpreting. It is a turn-based conversational tool:

1. user presses and holds to talk
2. web app records one utterance
3. backend transcribes and translates
4. backend generates Wolof speech
5. Wolof audio is played
6. the next turn begins

## Scope For V1

V1 is limited to **English -> Wolof**.

The English speech recognition path will use a Whisper-family model served through the `whisper.cpp` HTTP server. The chosen model should perform **transcription + translation in one step**, returning Wolof text directly if the model supports that behavior.

The Wolof speech generation path will use the existing local Python speech code in [app.py](/Users/tzhang/code/wolof-translate/app.py).

## Product Direction

Build the product as a **web app first**, not an Electron app first.

Reasoning:

- the core risk is speech pipeline quality and latency, not desktop packaging
- a web app is faster to iterate on for push-to-talk UX and progress states
- the frontend/backend contract can remain stable when the UI is later embedded in Electron
- Electron can be added once the speech pipeline is proven end-to-end

Electron remains the likely packaging target, but it should come **after** the web prototype is working.

## Proposed Architecture

### Frontend Web App

Responsibilities:

- capture microphone audio in the browser
- encode the utterance as WAV
- show progress states
- submit the audio to the application server
- play returned or generated Wolof audio

Suggested UI states:

- idle
- recording
- uploading
- transcribing
- generating speech
- playing audio
- error

### Application Server

Responsibilities:

- receive recorded WAV audio from the web app
- forward audio to the local `whisper.cpp` server
- receive Wolof text
- forward Wolof text to a Wolof speech service
- return structured status and output metadata to the frontend

This server should be the single orchestrator for the v1 flow.

### `whisper.cpp` Server

Responsibilities:

- accept uploaded WAV audio
- run the selected Whisper-family model
- return the recognized / translated text

For v1, this should be treated as an external local dependency started alongside the app.

### Wolof Speech Server

Responsibilities:

- accept Wolof text
- synthesize Wolof audio using the speech code in [app.py](/Users/tzhang/code/wolof-translate/app.py)
- speak the result directly
- optionally save the generated WAV for debugging or replay

This should be implemented as a small HTTP server built around the TTS primitives already present in [app.py](/Users/tzhang/code/wolof-translate/app.py).

Note: the current text translation / TTS server in [translate.py](/Users/tzhang/code/wolof-translate/translate.py) is oriented around **English text -> Wolof text -> Wolof audio**. V1 of this design instead assumes `whisper.cpp` returns Wolof text directly, so the new speech server can focus on **Wolof text -> Wolof audio playback**.

## V1 Request Flow

```text
browser microphone
-> browser records one utterance
-> browser encodes WAV
-> web app server
-> whisper.cpp server
-> Wolof text
-> Wolof speech server
-> generated Wolof audio playback
```

## Audio Segmentation Decision

V1 should start with **one push-to-talk utterance per request**.

That means:

- no continuous streaming
- no fixed-time chunking inside an utterance
- no silence-based splitting inside an utterance for the first implementation

Instead:

- recording starts when the user presses the talk button
- recording ends when the user releases it
- the full utterance is uploaded as one WAV file

This is the simplest and most stable approach for a conversational prototype.

### Optional Safety Constraints

Even without chunking, v1 should still consider:

- a max utterance duration, such as 10 to 15 seconds
- minimum duration checks to ignore accidental taps
- basic silence trimming at the start or end if the recorded WAV contains obvious dead space

These are guardrails, not intra-utterance chunking.

## API Shape

### Frontend -> Application Server

Suggested endpoint:

- `POST /api/translate-speak`

Suggested request:

- multipart form upload with one recorded WAV file

Suggested response:

- recognized text metadata
- Wolof text
- playback or output-audio metadata
- timing information for each stage
- error details when relevant

### Application Server -> `whisper.cpp`

Suggested behavior:

- upload the recorded WAV to the `whisper.cpp` HTTP server
- request the configured model
- parse the returned text

This layer should hide `whisper.cpp` specifics from the frontend.

Current example request shape:

```bash
curl 127.0.0.1:8080/inference \
  -H "Content-Type: multipart/form-data" \
  -F file="@./wolof-115-english.wav" \
  -F temperature="0.0" \
  -F temperature_inc="0.2" \
  -F response_format="json"
```

Current example response shape:

```json
{
  "text": "Maa ngi ci jàmm.\n Lu jàppee ak yaw?\n"
}
```

Integration implication:

- the application server should submit multipart form data
- the uploaded field name should be `file`
- the parser should treat `text` as the primary output from `whisper.cpp`
- temperature and response-format options should be configurable in the application server

### Application Server -> Wolof Speech Server

Suggested endpoint:

- `POST /speak`

Suggested JSON body:

```json
{
  "text": "wolof text here",
  "play": true,
  "wait": true
}
```

This endpoint should directly synthesize and play Wolof speech using the TTS helpers in [app.py](/Users/tzhang/code/wolof-translate/app.py).

## Initial Non-Goals

Do not build these into v1:

- simultaneous two-way translation
- duplex conversation handling
- background streaming ASR
- speaker diarization
- Electron packaging
- mobile support

## Implementation Notes

- Keep the web frontend and Python backend separated by a small HTTP API.
- Keep `whisper.cpp` isolated behind the application server so the frontend never calls it directly.
- Keep Wolof speech generation isolated behind its own local server boundary so it can be tested independently.
- Save intermediate WAV files during development when useful for debugging, but do not make file persistence mandatory for the final request path.

## Milestones

### Milestone 1

Manual text-to-Wolof speech playback using the TTS code in [app.py](/Users/tzhang/code/wolof-translate/app.py).

### Milestone 2

Application server can accept browser-recorded WAV audio and send multipart form data to `whisper.cpp` at `/inference`.

### Milestone 3

End-to-end English speech -> Wolof text -> Wolof speech playback.

### Milestone 4

Web UI displays progress clearly for each stage.

### Milestone 5

Wrap the proven flow in Electron.
