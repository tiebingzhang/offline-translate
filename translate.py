from transformers import NllbTokenizer, AutoModelForSeq2SeqLM
import torch

if torch.cuda.is_available():
    device = "cuda"
elif torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"

model_load_name = 'bilalfaye/nllb-200-distilled-600M-wolof-english'
model = None
tokenizer = None


def load_translation_model():
    global model, tokenizer

    if model is None or tokenizer is None:
        model = AutoModelForSeq2SeqLM.from_pretrained(model_load_name).to(device)
        tokenizer = NllbTokenizer.from_pretrained(model_load_name)

    return model, tokenizer

def translate(
    text, src_lang='wol_Latn', tgt_lang='eng_Latn',
    a=32, b=3, max_input_length=1024, num_beams=4, **kwargs
):
    """Turn a text or a list of texts into a list of translations"""
    model, tokenizer = load_translation_model()
    tokenizer.src_lang = src_lang
    tokenizer.tgt_lang = tgt_lang
    inputs = tokenizer(
        text, return_tensors='pt', padding=True, truncation=True,
        max_length=max_input_length
    )
    model.eval()
    result = model.generate(
        **inputs.to(model.device),
        forced_bos_token_id=tokenizer.convert_tokens_to_ids(tgt_lang),
        max_new_tokens=int(a + b * inputs.input_ids.shape[1]),
        num_beams=num_beams, **kwargs
    )
    return tokenizer.batch_decode(result, skip_special_tokens=True)

if __name__ == "__main__":
    print(translate("Ndax mën nga ko waxaat su la neexee?", src_lang="wol_Latn", tgt_lang="eng_Latn")[0])
    print(translate("This gentleman will pay for everything", src_lang="eng_Latn", tgt_lang="wol_Latn")[0])
    print(translate("Ku góor kii dina fay lépp", src_lang="wol_Latn", tgt_lang="eng_Latn")[0])
