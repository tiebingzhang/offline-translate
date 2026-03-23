# pip install transformers datasets torch

import torch
from transformers import WhisperForConditionalGeneration, WhisperProcessor
from datasets import load_dataset

# Load model and processor
device = "mps" if torch.backends.mps.is_available() else "cpu"
model = WhisperForConditionalGeneration.from_pretrained("bilalfaye/whisper-medium-wolof-2-english").to(device)
processor = WhisperProcessor.from_pretrained("bilalfaye/whisper-medium-wolof-2-english")

# Load dataset
streaming_dataset = load_dataset("bilalfaye/english-wolof-french-dataset", split="train", streaming=True)
iterator = iter(streaming_dataset)
sample = next(iterator)
sample = next(iterator)
sample = next(iterator)

print("wo_audio sample:", sample["wo_audio"])
print("en_audio sample:", sample["en_audio"])

# Preprocess audio
input_features = processor(sample["wo_audio"]["audio"]["array"],
                           sampling_rate=sample["wo_audio"]["audio"]["sampling_rate"],
                           return_tensors="pt").input_features.to(device)

# Generate transcription
predicted_ids = model.generate(input_features)
transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)

print("Correct sentence:", sample["wo"])
print("Transcription:", transcription[0])
