import torch
import soundfile as sf
from transformers import WhisperForConditionalGeneration, WhisperProcessor

# Load model and processor
device = "cuda:0" if torch.cuda.is_available() else "cpu"
model = WhisperForConditionalGeneration.from_pretrained("bilalfaye/whisper-medium-wolof-2-english").to(device)
processor = WhisperProcessor.from_pretrained("bilalfaye/whisper-medium-wolof-2-english")

# Load local audio file
AUDIO_PATH = "./utterance16k.wav"  # ← change this to your file path
audio_array, sampling_rate = sf.read(AUDIO_PATH)

# Preprocess audio
input_features = processor(
    audio_array,
    sampling_rate=sampling_rate,
    return_tensors="pt"
).input_features.to(device)

# Generate transcription
predicted_ids = model.generate(input_features)
transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)

print("Transcription:", transcription[0])
