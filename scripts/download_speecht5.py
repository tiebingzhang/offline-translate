from transformers import SpeechT5ForTextToSpeech, SpeechT5HifiGan, SpeechT5Processor
from pathlib import Path

# Download and cache models locally into a folder called "models/"
processor = SpeechT5Processor.from_pretrained("bilalfaye/speecht5_tts-wolof-v0.2")
model = SpeechT5ForTextToSpeech.from_pretrained("bilalfaye/speecht5_tts-wolof-v0.2")
vocoder = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan")

processor.save_pretrained("models/processor")
model.save_pretrained("models/tts_model")
vocoder.save_pretrained("models/vocoder")
