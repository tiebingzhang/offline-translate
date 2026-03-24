#!/usr/bin/env python3
import argparse
import json
from urllib import error, request
from pathlib import Path

DEFAULT_OUTPUT_PATH = Path("generated_audio/english_to_wolof.wav")
DEFAULT_SERVER_URL = "http://127.0.0.1:8000/speak"


def main():
    parser = argparse.ArgumentParser(
        description="Send English text to the local translation/TTS server."
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
    parser.add_argument(
        "--server-url",
        default=DEFAULT_SERVER_URL,
        help="Server endpoint to call.",
    )
    parser.add_argument(
        "--no-play",
        action="store_true",
        help="Generate translation/audio without playing it.",
    )
    parser.add_argument(
        "--wait",
        action="store_true",
        help="Wait for playback to finish before the request returns.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print request details before calling the server.",
    )
    args = parser.parse_args()

    english_text = " ".join(args.text).strip()
    payload = json.dumps(
        {
            "text": english_text,
            "output_path": args.output,
            "play": not args.no_play,
            "wait": args.wait,
        }
    ).encode("utf-8")
    req = request.Request(
        args.server_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    if args.verbose:
        print(f"POST {args.server_url}")
        print(
            "Payload:",
            json.dumps(
                {
                    "text_chars": len(english_text),
                    "output_path": args.output,
                    "play": not args.no_play,
                    "wait": args.wait,
                }
            ),
        )

    try:
        with request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Server request failed ({exc.code}): {body}") from exc

    print(f"English: {english_text}")
    print(f"Wolof: {result['wolof_text']}")
    if result.get("output_path"):
        print(f"Saved audio to: {result['output_path']}")
    if result.get("playback_started"):
        print("Playback started in the background.")


if __name__ == "__main__":
    main()
