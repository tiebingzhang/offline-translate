# Wolof Translate

`wolof-translate` is a local browser-based prototype for spoken **English <-> Wolof** translation.

Current pipeline:

- `english_to_wolof`: browser audio -> `whisper.cpp` -> Wolof text -> local Wolof TTS server -> Wolof audio
- `wolof_to_english`: browser audio -> `whisper.cpp` -> Wolof text -> local translation server -> English text -> macOS `say`

The UI is served from `web_server.py` and lives in `webapp/`.

## Requirements

- Python `3.12+`
- `pip` (or uv)
- A separate `whisper.cpp` checkout with the HTTP server binary built
- Two GGUF Whisper models:
  - `whisper-medium-english-2-wolof.gguf`
  - `whisper-small-wolof.gguf`
- Audio playback:
  - macOS: built-in `say` is used for English playback

## Installation

### 1. Create a virtual environment

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install .
```

This installs the Python dependencies declared in `pyproject.toml`:

- `numpy`
- `soxr`
- `torch`
- `transformers`

The first time you start the Python services, Hugging Face model weights may be downloaded and cached locally. That can take a while.

### 2. Prepare `whisper.cpp`

This repository does not vendor `whisper.cpp`. Build it separately, then point the run commands below at the server binary from that checkout.

Recent `whisper.cpp` builds often expose the server as:

```bash
~/code/whisper.cpp/build/bin/whisper-server
```

The examples below use an environment variable so you can swap in whichever binary your checkout produced.

## Run It

Start each service in its own terminal from the repository root.

### 1. Start the English -> Wolof `whisper.cpp` server

```bash
export WHISPER_SERVER=~/code/whisper.cpp/build/bin/whisper-server

$WHISPER_SERVER \
  --port 8080 \
  -m /absolute/path/to/whisper-medium-english-2-wolof.gguf
```

If your checkout uses `whisper-server` instead of `build/bin/server`, set `WHISPER_SERVER` accordingly.

### 2. Start the Wolof -> English `whisper.cpp` server

```bash
$WHISPER_SERVER \
  --port 8081 \
  -m /absolute/path/to/whisper-small-wolof.gguf
```

### 3. Start the Wolof speech server

```bash
source .venv/bin/activate
python wolof_speech_server.py --port 8001
```

This server loads the Wolof SpeechT5 model and writes generated WAV files under `generated_audio/`.

### 4. Start the Wolof -> English translation server

```bash
source .venv/bin/activate
python wolof_to_english_translate_server.py --port 8002
```

### 5. Start the web app server

```bash
source .venv/bin/activate
python web_server.py --port 8090
```

### 6. Open the UI

Open:

```text
http://127.0.0.1:8090
```

Then:

1. Press and hold `English -> Wolof` or `Wolof -> English`
2. Speak
3. Release to upload the WAV recording
4. Wait for the job stages to complete in the UI

The browser client records audio and uploads it as `utterance.wav`, so you do not need to prepare WAV files manually for normal use.

## Notes

- `speaker_embeddings/default.npy` is already included in the repo and is used by the Wolof TTS server by default.
- `web_server.py` expects the `whisper.cpp` inference endpoints at:
  - `http://127.0.0.1:8080/inference`
  - `http://127.0.0.1:8081/inference`
- If you want faster server startup, both Python model servers support `--lazy` to defer model loading until the first request.
- `start-all.sh` shows the expected port layout, but it hardcodes local paths and is not a general-purpose launcher as-is.
