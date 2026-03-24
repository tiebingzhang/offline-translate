from pathlib import Path
import logging
import shutil
import subprocess
import tempfile
import wave

import numpy as np
import torch
from transformers import SpeechT5ForTextToSpeech, SpeechT5HifiGan, SpeechT5Processor

DEFAULT_SPEAKER_EMBEDDING_PATH = Path("speaker_embeddings/default.npy")
DEFAULT_SAMPLE_RATE = 16000

LOGGER = logging.getLogger("wolof_translate.audio")
processor = None
model = None
vocoder = None
device = None
speaker_embedding = None


def load_speech_model(
    checkpoint="bilalfaye/speecht5_tts-wolof-v0.2",
    vocoder_checkpoint="microsoft/speecht5_hifigan",
):
    """Load the SpeechT5 model, processor, and vocoder once."""
    global processor, model, vocoder, device

    if processor is None or model is None or vocoder is None or device is None:
        LOGGER.info("Loading speech model %s and vocoder %s", checkpoint, vocoder_checkpoint)
        if torch.cuda.is_available():
            device = torch.device("cuda")
        elif torch.backends.mps.is_available():
            device = torch.device("mps")
        else:
            device = torch.device("cpu")

        processor = SpeechT5Processor.from_pretrained(checkpoint)
        model = SpeechT5ForTextToSpeech.from_pretrained(checkpoint).to(device)
        vocoder = SpeechT5HifiGan.from_pretrained(vocoder_checkpoint).to(device)
        LOGGER.info("Speech model loaded on %s", device)

    return processor, model, vocoder, device


def load_speaker_embedding(embedding_path=DEFAULT_SPEAKER_EMBEDDING_PATH):
    """Load a local speaker embedding saved as .npy or .pt."""
    global speaker_embedding

    embedding_path = Path(embedding_path)

    if speaker_embedding is not None and embedding_path == DEFAULT_SPEAKER_EMBEDDING_PATH:
        return speaker_embedding

    if not embedding_path.exists():
        raise FileNotFoundError(
            f"Speaker embedding file not found: {embedding_path}. "
            "Save a 512-dim embedding to this path as .npy or .pt."
        )

    if embedding_path.suffix == ".npy":
        embedding = np.load(embedding_path)
        embedding = torch.tensor(embedding, dtype=torch.float32)
    elif embedding_path.suffix == ".pt":
        embedding = torch.load(embedding_path, map_location="cpu")
        if not isinstance(embedding, torch.Tensor):
            embedding = torch.tensor(embedding, dtype=torch.float32)
        else:
            embedding = embedding.to(dtype=torch.float32)
    else:
        raise ValueError(
            f"Unsupported embedding format: {embedding_path.suffix}. "
            "Use a .npy or .pt file."
        )

    if embedding.ndim == 1:
        embedding = embedding.unsqueeze(0)

    if embedding.shape != (1, 512):
        raise ValueError(
            f"Expected speaker embedding shape (1, 512), got {tuple(embedding.shape)}"
        )

    if embedding_path == DEFAULT_SPEAKER_EMBEDDING_PATH:
        speaker_embedding = embedding

    return embedding


def generate_speech_tensor_from_text(
    text,
    speaker_embedding_override=None,
    processor_override=None,
    model_override=None,
    vocoder_override=None,
):
    """Generate an in-memory waveform tensor for the provided text."""
    if processor_override is None or model_override is None or vocoder_override is None:
        processor_override, model_override, vocoder_override, _ = load_speech_model()

    if speaker_embedding_override is None:
        speaker_embedding_override = load_speaker_embedding()

    inputs = processor_override(
        text=text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=model_override.config.max_text_positions,
    )
    inputs = {key: value.to(model_override.device) for key, value in inputs.items()}

    return model_override.generate(
        inputs["input_ids"],
        speaker_embeddings=speaker_embedding_override.to(model_override.device),
        vocoder=vocoder_override,
        num_beams=7,
        temperature=0.6,
        no_repeat_ngram_size=3,
        repetition_penalty=1.5,
    )


def speech_to_pcm16_bytes(speech):
    """Convert a waveform tensor into signed 16-bit PCM bytes."""
    audio = speech.detach().cpu().numpy().squeeze()
    audio = np.clip(audio, -1.0, 1.0)
    audio_pcm = (audio * 32767).astype(np.int16)
    return audio_pcm.tobytes()


def save_pcm16_wav(pcm_bytes, output_path, sample_rate=DEFAULT_SAMPLE_RATE):
    """Save raw PCM16 audio bytes to a WAV file."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)

    return output_path


def save_wav_file(speech, output_path, sample_rate=DEFAULT_SAMPLE_RATE):
    """Save a generated waveform tensor to a local WAV file."""
    return save_pcm16_wav(speech_to_pcm16_bytes(speech), output_path, sample_rate=sample_rate)


def generate_speech_from_text(
    text,
    output_path,
    speaker_embedding=None,
    processor=None,
    model=None,
    vocoder=None,
):
    """Generate speech and save it to a WAV file."""
    speech = generate_speech_tensor_from_text(
        text,
        speaker_embedding_override=speaker_embedding,
        processor_override=processor,
        model_override=model,
        vocoder_override=vocoder,
    )
    return save_wav_file(speech, output_path)


def play_wav_file(output_path):
    """Play a local WAV file using ffplay when available, otherwise afplay."""
    output_path = Path(output_path)
    ffplay_path = shutil.which("ffplay")
    if ffplay_path:
        LOGGER.info("Playing %s via ffplay", output_path)
        subprocess.run(
            [
                ffplay_path,
                "-autoexit",
                "-nodisp",
                "-loglevel",
                "error",
                str(output_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        LOGGER.info("Finished playback via ffplay")
        return

    LOGGER.info("Playing %s via afplay", output_path)
    subprocess.run(["afplay", str(output_path)], check=True)
    LOGGER.info("Finished playback via afplay")


def play_pcm16_chunk_via_temp_wav(pcm_chunk, sample_rate=DEFAULT_SAMPLE_RATE):
    """Write a PCM16 audio buffer to a temp WAV and play it immediately."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        temp_path = Path(temp_file.name)

    try:
        LOGGER.debug("Writing %s PCM bytes to temporary WAV %s", len(pcm_chunk), temp_path)
        save_pcm16_wav(pcm_chunk, temp_path, sample_rate=sample_rate)
        play_wav_file(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)
        LOGGER.debug("Deleted temporary WAV %s", temp_path)


def stream_pcm16_chunks_via_ffplay(pcm_chunks, sample_rate=DEFAULT_SAMPLE_RATE):
    """Play chunked PCM audio through one ffplay process when available."""
    ffplay_path = shutil.which("ffplay")
    if not ffplay_path:
        LOGGER.warning("ffplay not found; falling back to per-chunk temp WAV playback")
        for pcm_chunk in pcm_chunks:
            play_pcm16_chunk_via_temp_wav(pcm_chunk, sample_rate=sample_rate)
        return

    LOGGER.info("Streaming PCM audio to ffplay at %s Hz", sample_rate)
    process = subprocess.Popen(
        [
            ffplay_path,
            "-autoexit",
            "-nodisp",
            "-loglevel",
            "error",
            "-f",
            "s16le",
            "-ar",
            str(sample_rate),
            "-ac",
            "1",
            "-i",
            "pipe:0",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        bufsize=0,
    )

    try:
        if process.stdin is None:
            raise RuntimeError("ffplay stdin is unavailable")

        for pcm_chunk in pcm_chunks:
            if not pcm_chunk:
                continue
            process.stdin.write(pcm_chunk)

        process.stdin.close()
        process.stdin = None
        _, stderr_data = process.communicate()
        return_code = process.returncode
    except BrokenPipeError as exc:
        stderr_data = b""
        if process.stdin is not None and not process.stdin.closed:
            process.stdin.close()
        process.stdin = None
        try:
            _, stderr_data = process.communicate(timeout=1)
        except Exception:
            process.kill()
            _, stderr_data = process.communicate()
        stderr_text = stderr_data.decode("utf-8", errors="replace").strip()
        if stderr_text:
            raise RuntimeError(f"ffplay exited before playback completed: {stderr_text}") from exc
        raise RuntimeError("ffplay exited before playback completed") from exc
    except Exception:
        if process.stdin is not None and not process.stdin.closed:
            process.stdin.close()
        process.kill()
        process.wait()
        raise

    if return_code != 0:
        stderr_text = stderr_data.decode("utf-8", errors="replace").strip()
        if stderr_text:
            raise RuntimeError(f"ffplay exited with status {return_code}: {stderr_text}")
        raise RuntimeError(f"ffplay exited with status {return_code}")

    LOGGER.info("Completed PCM stream playback")


if __name__ == "__main__":
    french_text = "Bonjour, bienvenue dans le modèle de synthèse vocale Wolof et Français."
    generate_speech_from_text(french_text, "generated_audio/french_sample.wav")

    wolof_text = "ñu ne ñoom ñooy nattukaay satélite yi"
    generate_speech_from_text(wolof_text, "generated_audio/wolof_sample.wav")
