import argparse
from pathlib import Path

from app import generate_speech_from_text, play_wav_file
from translate import translate


DEFAULT_OUTPUT_PATH = Path("generated_audio/english_to_wolof.wav")


def translate_english_to_wolof(text):
    return translate(text, src_lang="eng_Latn", tgt_lang="wol_Latn")[0]


def main():
    parser = argparse.ArgumentParser(
        description="Translate English to Wolof, synthesize speech, and play it on macOS."
    )
    parser.add_argument(
        "text",
        nargs="+",
        help="English text to translate and speak.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help="Path for the generated WAV file.",
    )
    args = parser.parse_args()

    english_text = " ".join(args.text).strip()
    wolof_text = translate_english_to_wolof(english_text)
    output_path = generate_speech_from_text(wolof_text, args.output)

    print(f"English: {english_text}")
    print(f"Wolof: {wolof_text}")
    print(f"Saved audio to: {output_path}")

    play_wav_file(output_path)


if __name__ == "__main__":
    main()
