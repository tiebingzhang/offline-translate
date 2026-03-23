from pathlib import Path
import subprocess
import wave

import numpy as np
import torch
from transformers import SpeechT5ForTextToSpeech, SpeechT5Processor, SpeechT5HifiGan
#from IPython.display import Audio, display

DEFAULT_SPEAKER_EMBEDDING_PATH = Path("speaker_embeddings/default.npy")
processor = None
model = None
vocoder = None
device = None
speaker_embedding = None

def load_speech_model(checkpoint="bilalfaye/speecht5_tts-wolof-v0.2", vocoder_checkpoint="microsoft/speecht5_hifigan"):
    """ Load the SpeechT5 model, processor, and vocoder for text-to-speech. """
    global processor, model, vocoder, device

    if processor is None or model is None or vocoder is None or device is None:
        if torch.cuda.is_available():
            device = torch.device("cuda")
        elif torch.backends.mps.is_available():
            device = torch.device("mps")
        else:
            device = torch.device("cpu")

        processor = SpeechT5Processor.from_pretrained(checkpoint)
        model = SpeechT5ForTextToSpeech.from_pretrained(checkpoint).to(device)
        vocoder = SpeechT5HifiGan.from_pretrained(vocoder_checkpoint).to(device)

    return processor, model, vocoder, device

def load_speaker_embedding(embedding_path=DEFAULT_SPEAKER_EMBEDDING_PATH):
    """Load a local speaker embedding saved as .npy or .pt."""
    global speaker_embedding

    if speaker_embedding is not None and Path(embedding_path) == DEFAULT_SPEAKER_EMBEDDING_PATH:
        return speaker_embedding

    embedding_path = Path(embedding_path)
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

def save_wav_file(speech, output_path, sample_rate=16000):
    """Save a generated waveform tensor to a local WAV file."""

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    audio = speech.detach().cpu().numpy().squeeze()
    audio = np.clip(audio, -1.0, 1.0)
    audio_pcm = (audio * 32767).astype(np.int16)

    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_pcm.tobytes())

    return output_path


def generate_speech_from_text(
    text,
    output_path,
    speaker_embedding=None,
    processor=None,
    model=None,
    vocoder=None,
):  
    """ Generates speech from input text using SpeechT5 and HiFi-GAN vocoder. """  
    if processor is None or model is None or vocoder is None:
        processor, model, vocoder, _ = load_speech_model()

    if speaker_embedding is None:
        speaker_embedding = load_speaker_embedding()

    inputs = processor(text=text, return_tensors="pt", padding=True, truncation=True, max_length=model.config.max_text_positions)
    inputs = {key: value.to(model.device) for key, value in inputs.items()}

    speech = model.generate(
        inputs["input_ids"],
        speaker_embeddings=speaker_embedding.to(model.device),
        vocoder=vocoder,
        num_beams=7,
        temperature=0.6,
        no_repeat_ngram_size=3,
        repetition_penalty=1.5,
    )

    return save_wav_file(speech, output_path)

def play_wav_file(output_path):
    """Play a local WAV file on macOS using the default audio output."""

    output_path = Path(output_path)
    subprocess.run(["afplay", str(output_path)], check=True)


if __name__ == "__main__":
    french_text = "Bonjour, bienvenue dans le modèle de synthèse vocale Wolof et Français."
    generate_speech_from_text(french_text, "generated_audio/french_sample.wav")

    wolof_text = "ñu ne ñoom ñooy nattukaay satélite yi"
    generate_speech_from_text(wolof_text, "generated_audio/wolof_sample.wav")
