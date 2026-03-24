# Wolof Translate

`wolof-translate` is a push-to-talk desktop interpreter for spoken **Wolof <-> English** conversations.

The planned application will use:

- **Electron** for the desktop shell
- An embedded **web UI** inside Electron to show recording, transcription, translation, generation, and playback progress
- **Python** for orchestration and model / API integration
- **whisper.cpp** and Whisper-based models for speech-to-text
- Text-to-speech APIs and local TTS models for audio output

## Goal

The goal is to make it possible for two people to take turns speaking, with the system:

1. Capturing audio from one speaker
2. Transcribing the speech
3. Translating it into the target language
4. Generating output audio
5. Playing the translated audio back before the next speaker talks

This is a **single-speaker-at-a-time** workflow, not a simultaneous interpreter. The interaction model is closer to a walkie-talkie or push-to-talk experience: one person speaks, the machine processes, the translated audio plays, then the other person responds.

## Planned User Experience

- The user presses and holds a button to talk
- The app records the active speaker
- The app shows progress in the embedded web UI
- The backend transcribes, translates, and synthesizes speech
- The translated audio is played back to the listener
- The next speaker can then respond

The UI should clearly indicate which stage is in progress:

- Capturing audio
- Transcribing
- Translating
- Generating audio
- Playing audio

## Translation Flows

### Wolof -> English

```text
audio -> whisper-medium -> English text -> English TTS API -> English audio
```

Current assumption:

- A fine-tuned Whisper-based model can transcribe Wolof speech and produce English text
- English speech output can be produced with a standard English TTS API

### English -> Wolof

```text
audio -> Whisper -> English text -> NLLB translation -> Wolof text -> SpeechT5 Wolof TTS -> Wolof audio
```

Current assumption:

- A Whisper-based model is used to transcribe English speech
- Translation from English text to Wolof text is handled with an NLLB-style model
- Wolof speech output is generated with a Wolof-capable TTS model such as SpeechT5

## Model Notes

The current research direction is based on these components:

- A fine-tuned Whisper-based model for **English -> Wolof** [https://huggingface.co/bilalfaye/whisper-medium-english-2-wolof]
- Another model for **Wolof -> English** [https://huggingface.co/bilalfaye/whisper-medium-wolof-2-english]
- A Wolof audio generation model for Wolof TTS [https://huggingface.co/bilalfaye/speecht5_tts-wolof-v0.2]
- A standard English TTS system for English output audio

These model choices are still subject to validation based on latency, quality, and packaging constraints for a desktop app.

## High-Level Architecture

### Frontend

- Electron application shell
- Embedded web UI for controls and progress display
- Push-to-talk interaction and status updates

### Backend

- Python service layer for orchestration
- Audio capture and handoff
- whisper.cpp / Whisper model inference
- Translation model integration
- TTS generation
- Audio playback

## Processing Pipeline

```text
capture audio
-> transcribe
-> translate
-> generate output audio
-> playback
```

The system is intentionally turn-based so the translation pipeline has time to complete before the next utterance begins.

## Project Status

This repository is currently an early prototype / research workspace. The main focus is validating:

- Wolof speech recognition quality
- English <-> Wolof translation quality
- Wolof TTS quality
- End-to-end latency for a push-to-talk desktop workflow

## Open Questions

- Which Whisper or whisper.cpp-compatible models give the best latency / accuracy tradeoff for local use?
- Whether both directions can run fully on-device, or if some steps should use external APIs
- Which English TTS provider is the best fit for quality, speed, and packaging
- How to package Python + Electron + local models cleanly for distribution
