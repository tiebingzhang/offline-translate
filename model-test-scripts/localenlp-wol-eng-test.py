from transformers import MarianTokenizer, AutoModelForSeq2SeqLM

model_name = "LocaleNLP/localenlp-wol-eng-0.03"
tokenizer = MarianTokenizer.from_pretrained(model_name)
model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

wolof_text = "fan la nekk leegi?"
inputs = tokenizer(">>eng<< " + wolof_text, return_tensors="pt", padding=True, truncation=True)
outputs = model.generate(**inputs, max_length=512, num_beams=4)
translation = tokenizer.decode(outputs[0], skip_special_tokens=True)

print("Wolof:", wolof_text)
print("English:", translation)
