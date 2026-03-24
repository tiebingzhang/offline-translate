#!/usr/bin/env python3
import argparse
import json
import logging
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from app import generate_speech_from_text, load_speaker_embedding, load_speech_model, play_wav_file

LOGGER = logging.getLogger("wolof_translate.wolof_speech_server")
SPEECH_LOCK = threading.Lock()


def configure_logging(verbose=False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def preload_models():
    LOGGER.info("Preloading Wolof speech models")
    load_speech_model()
    load_speaker_embedding()
    LOGGER.info("Wolof speech models loaded")


def synthesize_wolof_audio(text, output_path):
    with SPEECH_LOCK:
        return generate_speech_from_text(text, output_path)


def start_background_playback(audio_path):
    def runner():
        try:
            play_wav_file(audio_path)
        except Exception as exc:
            LOGGER.exception("Background playback failed: %s: %s", type(exc).__name__, exc)

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()
    return thread


class WolofSpeechRequestHandler(BaseHTTPRequestHandler):
    server_version = "WolofSpeechServer/0.1"

    def do_GET(self):
        if self.path == "/health":
            self._write_json(HTTPStatus.OK, {"status": "ok"})
            return

        self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/speak":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        try:
            payload = self._read_json_body()
        except ValueError as exc:
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return

        text = str(payload.get("text", "")).strip()
        if not text:
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "Request body must include non-empty 'text'."})
            return

        output_path_value = payload.get("output_path")
        output_path = Path(output_path_value) if output_path_value else Path("generated_audio/latest_wolof_output.wav")
        play = bool(payload.get("play", True))
        wait = bool(payload.get("wait", False))

        LOGGER.info(
            "Processing /speak request chars=%s play=%s wait=%s output_path=%s",
            len(text),
            play,
            wait,
            output_path,
        )

        try:
            generated_path = synthesize_wolof_audio(text, output_path)
            playback_started = False
            if play and wait:
                play_wav_file(generated_path)
                playback_started = True
            elif play:
                start_background_playback(generated_path)
                playback_started = True

            response = {
                "text": text,
                "output_path": str(generated_path),
                "play": play,
                "wait": wait,
                "playback_started": playback_started,
            }
        except Exception as exc:
            LOGGER.exception("Speech request failed: %s: %s", type(exc).__name__, exc)
            self._write_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"{type(exc).__name__}: {exc}"},
            )
            return

        self._write_json(HTTPStatus.OK, response)

    def log_message(self, format, *args):
        LOGGER.info("HTTP %s - %s", self.client_address[0], format % args)

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            raise ValueError("Missing request body.")

        raw_body = self.rfile.read(content_length)
        try:
            return json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON: {exc.msg}") from exc

    def _write_json(self, status, payload):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def serve(host="127.0.0.1", port=8001, preload=True, verbose=False):
    configure_logging(verbose=verbose)
    if preload:
        preload_models()

    server = ThreadingHTTPServer((host, port), WolofSpeechRequestHandler)
    LOGGER.info("Wolof speech server listening on http://%s:%s", host, port)
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(
        description="Run a local Wolof text-to-speech server.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind.")
    parser.add_argument("--port", type=int, default=8001, help="TCP port to bind.")
    parser.add_argument(
        "--lazy",
        action="store_true",
        help="Do not preload speech models at startup.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging.",
    )
    args = parser.parse_args()
    serve(host=args.host, port=args.port, preload=not args.lazy, verbose=args.verbose)


if __name__ == "__main__":
    main()
