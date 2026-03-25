#!/usr/bin/env python3
import argparse
import json
import logging
import threading
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from transformers import AutoModelForSeq2SeqLM, NllbTokenizer

if torch.cuda.is_available():
    DEVICE = "cuda"
elif torch.backends.mps.is_available():
    DEVICE = "mps"
else:
    DEVICE = "cpu"

MODEL_NAME = "bilalfaye/nllb-200-distilled-600M-wolof-english"
#MODEL_NAME = "bilalfaye/nllb-200-distilled-600M-wo-fr-en"
LOGGER = logging.getLogger("wolof_translate.wolof_to_english_server")
TRANSLATION_LOCK = threading.Lock()
MODEL = None
TOKENIZER = None


def configure_logging(verbose=False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def load_translation_model():
    global MODEL, TOKENIZER

    if MODEL is None or TOKENIZER is None:
        LOGGER.info("Loading translation model %s on %s", MODEL_NAME, DEVICE)
        MODEL = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME).to(DEVICE)
        MODEL.generation_config.max_length = None
        TOKENIZER = NllbTokenizer.from_pretrained(MODEL_NAME)
        LOGGER.info("Translation model loaded")

    return MODEL, TOKENIZER


def translate_wolof_to_english(text, a=32, b=3, max_input_length=1024, num_beams=4, **kwargs):
    model, tokenizer = load_translation_model()
    tokenizer.src_lang = "wol_Latn"
    tokenizer.tgt_lang = "eng_Latn"
    inputs = tokenizer(
        text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=max_input_length,
    )
    model.eval()
    with TRANSLATION_LOCK:
        result = model.generate(
            **inputs.to(model.device),
            forced_bos_token_id=tokenizer.convert_tokens_to_ids("eng_Latn"),
            max_new_tokens=int(a + b * inputs.input_ids.shape[1]),
            num_beams=num_beams,
            **kwargs,
        )

    return tokenizer.batch_decode(result, skip_special_tokens=True)[0]


class TranslateRequestHandler(BaseHTTPRequestHandler):
    server_version = "WolofToEnglishTranslateServer/0.1"

    def do_GET(self):
        if self.path == "/health":
            self._write_json(HTTPStatus.OK, {"status": "ok"})
            return

        self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self):
        request_id = uuid.uuid4().hex[:8]
        if self.path != "/translate":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        try:
            payload = self._read_json_body()
        except ValueError as exc:
            LOGGER.warning("[%s] Invalid request body: %s", request_id, exc)
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc), "request_id": request_id})
            return

        source_text = str(payload.get("text", "")).strip()
        if not source_text:
            self._write_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Request body must include non-empty 'text'.", "request_id": request_id},
            )
            return

        LOGGER.info("[%s] Translating Wolof text chars=%s", request_id, len(source_text))

        try:
            translated_text = translate_wolof_to_english(source_text)
        except Exception as exc:
            LOGGER.exception("[%s] Translation failed: %s: %s", request_id, type(exc).__name__, exc)
            self._write_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"{type(exc).__name__}: {exc}", "request_id": request_id},
            )
            return

        self._write_json(
            HTTPStatus.OK,
            {
                "request_id": request_id,
                "source_language": "wolof",
                "target_language": "english",
                "source_text": source_text,
                "translated_text": translated_text,
            },
        )

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


def serve(host="127.0.0.1", port=8002, preload=True, verbose=False):
    configure_logging(verbose=verbose)
    if preload:
        load_translation_model()

    server = ThreadingHTTPServer((host, port), TranslateRequestHandler)
    LOGGER.info("Wolof-to-English translation server listening on http://%s:%s", host, port)
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(
        description="Run a persistent Wolof-to-English translation server.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind.")
    parser.add_argument("--port", type=int, default=8002, help="TCP port to bind.")
    parser.add_argument(
        "--lazy",
        action="store_true",
        help="Do not preload models at startup.",
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
