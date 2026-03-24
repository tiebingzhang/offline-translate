from peft import PeftModel
from transformers import WhisperForConditionalGeneration, WhisperProcessor

# 1. Load the full base model
base_model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-large-v2")

# 2. Load the adapter on top of it
peft_model = PeftModel.from_pretrained(base_model, "CAYTU/whosper-large-v2")

# 3. MERGE adapter weights permanently into the base model
merged_model = peft_model.merge_and_unload()

# 4. Save as a complete standalone model
merged_model.save_pretrained("./whosper-merged")

# Save the processor/tokenizer too
processor = WhisperProcessor.from_pretrained("openai/whisper-large-v2")
processor.save_pretrained("./whosper-merged")
