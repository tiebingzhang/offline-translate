import argparse
import json
import logging
import queue
import re
import threading
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import torch
from transformers import AutoModelForSeq2SeqLM, NllbTokenizer

from app import (
    DEFAULT_SAMPLE_RATE,
    generate_speech_tensor_from_text,
    load_speaker_embedding,
    load_speech_model,
    play_pcm16_chunk_via_temp_wav,
    save_pcm16_wav,
    speech_to_pcm16_bytes,
)

if torch.cuda.is_available():
    device = "cuda"
elif torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"

model_load_name = "bilalfaye/nllb-200-distilled-600M-wolof-english"
model = None
tokenizer = None

LOGGER = logging.getLogger("wolof_translate.server")
TRANSLATION_LOCK = threading.Lock()
TTS_LOCK = threading.Lock()
PLAYBACK_LOCK = threading.Lock()
DEFAULT_TTS_CHUNK_CHARS = 90


def configure_logging(verbose=False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def load_translation_model():
    global model, tokenizer

    if model is None or tokenizer is None:
        LOGGER.info("Loading translation model %s on %s", model_load_name, device)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_load_name).to(device)
        model.generation_config.max_length = None
        tokenizer = NllbTokenizer.from_pretrained(model_load_name)
        LOGGER.info("Translation model loaded")

    return model, tokenizer


def preload_models():
    LOGGER.info("Preloading translation and speech models")
    load_translation_model()
    load_speech_model()
    load_speaker_embedding()
    LOGGER.info("Model preload complete")


def translate(
    text,
    src_lang="wol_Latn",
    tgt_lang="eng_Latn",
    a=32,
    b=3,
    max_input_length=1024,
    num_beams=4,
    **kwargs,
):
    """Turn a text or a list of texts into a list of translations."""
    model, tokenizer = load_translation_model()
    tokenizer.src_lang = src_lang
    tokenizer.tgt_lang = tgt_lang
    inputs = tokenizer(
        text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=max_input_length,
    )
    model.eval()
    result = model.generate(
        **inputs.to(model.device),
        forced_bos_token_id=tokenizer.convert_tokens_to_ids(tgt_lang),
        max_new_tokens=int(a + b * inputs.input_ids.shape[1]),
        num_beams=num_beams,
        **kwargs,
    )
    return tokenizer.batch_decode(result, skip_special_tokens=True)


def chunk_text(text, chunk_chars=140):
    """Split text into sentence-like chunks so audio can start earlier."""
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []

    sentence_parts = re.split(r"(?<=[.!?;:])\s+", normalized)
    chunks = []

    for part in sentence_parts:
        if len(part) <= chunk_chars:
            chunks.append(part)
            continue

        words = part.split()
        current = []
        current_len = 0
        for word in words:
            projected = current_len + len(word) + (1 if current else 0)
            if current and projected > chunk_chars:
                chunks.append(" ".join(current))
                current = [word]
                current_len = len(word)
            else:
                current.append(word)
                current_len = projected

        if current:
            chunks.append(" ".join(current))

    return [chunk for chunk in chunks if chunk]


def translate_english_to_wolof_chunked(text, chunk_chars=140):
    english_chunks = chunk_text(text, chunk_chars=chunk_chars)
    wolof_chunks = []
    LOGGER.info("Split input into %s chunk(s) for translation", len(english_chunks))

    for index, chunk in enumerate(english_chunks, start=1):
        LOGGER.debug("Translating chunk %s/%s: %r", index, len(english_chunks), chunk)
        with TRANSLATION_LOCK:
            translated_chunk = translate(
                chunk,
                src_lang="eng_Latn",
                tgt_lang="wol_Latn",
            )[0]
        wolof_chunks.append(translated_chunk)
        LOGGER.debug("Translated chunk %s/%s -> %r", index, len(english_chunks), translated_chunk)

    return english_chunks, wolof_chunks


def synthesize_wolof_chunks(wolof_chunks):
    pcm_chunks = []

    LOGGER.info("Synthesizing %s Wolof chunk(s) to audio", len(wolof_chunks))
    for index, chunk in enumerate(wolof_chunks, start=1):
        LOGGER.debug("Synthesizing chunk %s/%s: %r", index, len(wolof_chunks), chunk)
        with TTS_LOCK:
            speech = generate_speech_tensor_from_text(chunk)
        pcm_chunk = speech_to_pcm16_bytes(speech)
        pcm_chunks.append(pcm_chunk)
        LOGGER.debug("Synthesized chunk %s/%s into %s bytes", index, len(wolof_chunks), len(pcm_chunk))

    return pcm_chunks


def expand_wolof_chunks_for_tts(wolof_chunks, tts_chunk_chars=DEFAULT_TTS_CHUNK_CHARS):
    tts_chunks = []
    for chunk in wolof_chunks:
        tts_chunks.extend(chunk_text(chunk, chunk_chars=tts_chunk_chars))

    LOGGER.info(
        "Expanded %s translated chunk(s) into %s TTS chunk(s) using tts_chunk_chars=%s",
        len(wolof_chunks),
        len(tts_chunks),
        tts_chunk_chars,
    )
    for index, chunk in enumerate(tts_chunks, start=1):
        LOGGER.debug("TTS chunk %s/%s: len=%s text=%r", index, len(tts_chunks), len(chunk), chunk)

    return tts_chunks


def synthesize_and_play_wolof_chunks(wolof_chunks):
    total_chunks = len(wolof_chunks)
    pcm_chunks = []
    pcm_queue = queue.Queue(maxsize=2)
    producer_error = []
    sentinel = object()

    def producer():
        try:
            LOGGER.info("Synthesizing %s Wolof chunk(s) to audio", total_chunks)
            for index, chunk in enumerate(wolof_chunks, start=1):
                LOGGER.debug("Synthesizing chunk %s/%s: %r", index, total_chunks, chunk)
                with TTS_LOCK:
                    speech = generate_speech_tensor_from_text(chunk)
                pcm_chunk = speech_to_pcm16_bytes(speech)
                LOGGER.debug(
                    "Synthesized chunk %s/%s into %s bytes",
                    index,
                    total_chunks,
                    len(pcm_chunk),
                )
                pcm_queue.put((index, pcm_chunk))
        except Exception as exc:
            producer_error.append(exc)
        finally:
            pcm_queue.put((None, sentinel))

    producer_thread = threading.Thread(target=producer, daemon=True)
    producer_thread.start()

    while True:
        index, item = pcm_queue.get()
        if item is sentinel:
            break
        pcm_chunks.append(item)
        LOGGER.info("Starting playback for chunk %s/%s (%s bytes)", index, total_chunks, len(item))
        with PLAYBACK_LOCK:
            play_pcm16_chunk_via_temp_wav(item, sample_rate=DEFAULT_SAMPLE_RATE)
        LOGGER.info("Finished playback for chunk %s/%s", index, total_chunks)

    producer_thread.join()
    if producer_error:
        raise producer_error[0]

    return pcm_chunks


def process_text_to_audio(text, play=False, output_path=None, chunk_chars=140):
    LOGGER.info(
        "Processing /speak request: chars=%s play=%s output_path=%s chunk_chars=%s",
        len(text),
        play,
        output_path,
        chunk_chars,
    )
    english_chunks, wolof_chunks = translate_english_to_wolof_chunked(text, chunk_chars=chunk_chars)
    tts_chunks = expand_wolof_chunks_for_tts(wolof_chunks)
    if play:
        pcm_chunks = synthesize_and_play_wolof_chunks(tts_chunks)
    else:
        pcm_chunks = synthesize_wolof_chunks(tts_chunks)
    combined_pcm = b"".join(pcm_chunks)
    LOGGER.info(
        "Combined %s audio chunk(s) into %s bytes",
        len(pcm_chunks),
        len(combined_pcm),
    )

    saved_path = None
    if output_path:
        saved_path = str(save_pcm16_wav(combined_pcm, output_path, sample_rate=DEFAULT_SAMPLE_RATE))
        LOGGER.info("Saved audio to %s", saved_path)

    return {
        "english_chunks": english_chunks,
        "wolof_chunks": wolof_chunks,
        "wolof_text": " ".join(wolof_chunks),
        "output_path": saved_path,
    }


def start_background_playback(wolof_chunks, output_path=None):
    def runner():
        try:
            LOGGER.info("Background playback thread started for %s chunk(s)", len(wolof_chunks))
            tts_chunks = expand_wolof_chunks_for_tts(wolof_chunks)
            pcm_chunks = synthesize_and_play_wolof_chunks(tts_chunks)
            combined_pcm = b"".join(pcm_chunks)
            LOGGER.info("Background playback finished with %s bytes", len(combined_pcm))
            if output_path:
                save_pcm16_wav(combined_pcm, output_path, sample_rate=DEFAULT_SAMPLE_RATE)
                LOGGER.info("Saved background audio to %s", output_path)
        except Exception as exc:
            LOGGER.exception("Background playback failed: %s: %s", type(exc).__name__, exc)

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()
    return thread


def process_text_translation(text, chunk_chars=140):
    english_chunks, wolof_chunks = translate_english_to_wolof_chunked(text, chunk_chars=chunk_chars)
    return {
        "english_chunks": english_chunks,
        "wolof_chunks": wolof_chunks,
        "wolof_text": " ".join(wolof_chunks),
    }

class TranslateRequestHandler(BaseHTTPRequestHandler):
    server_version = "WolofTranslateServer/0.1"

    def do_GET(self):
        if self.path == "/health":
            self._write_json(HTTPStatus.OK, {"status": "ok"})
            return

        self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self):
        request_id = uuid.uuid4().hex[:8]
        if self.path not in {"/translate", "/speak"}:
            LOGGER.warning("[%s] Unknown path %s", request_id, self.path)
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        try:
            payload = self._read_json_body()
        except ValueError as exc:
            LOGGER.warning("[%s] Invalid request body: %s", request_id, exc)
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return

        text = str(payload.get("text", "")).strip()
        if not text:
            LOGGER.warning("[%s] Missing non-empty text", request_id)
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "Request body must include non-empty 'text'."})
            return

        chunk_chars = int(payload.get("chunk_chars", 140))
        LOGGER.info(
            "[%s] Received %s request from %s text_chars=%s chunk_chars=%s",
            request_id,
            self.path,
            self.client_address[0],
            len(text),
            chunk_chars,
        )
        LOGGER.debug("[%s] Request payload keys: %s", request_id, sorted(payload.keys()))

        try:
            if self.path == "/translate":
                result = process_text_translation(text, chunk_chars=chunk_chars)
            else:
                output_path_value = payload.get("output_path")
                output_path = Path(output_path_value) if output_path_value else None
                play = bool(payload.get("play", True))
                wait = bool(payload.get("wait", False))
                if play and not wait:
                    LOGGER.info("[%s] Starting background playback response", request_id)
                    english_chunks, wolof_chunks = translate_english_to_wolof_chunked(
                        text,
                        chunk_chars=chunk_chars,
                    )
                    start_background_playback(wolof_chunks, output_path=output_path)
                    result = {
                        "english_chunks": english_chunks,
                        "wolof_chunks": wolof_chunks,
                        "wolof_text": " ".join(wolof_chunks),
                        "output_path": str(output_path) if output_path else None,
                        "playback_started": True,
                    }
                else:
                    LOGGER.info("[%s] Running synchronous audio flow play=%s wait=%s", request_id, play, wait)
                    result = process_text_to_audio(
                        text,
                        play=play,
                        output_path=output_path,
                        chunk_chars=chunk_chars,
                    )
        except Exception as exc:
            LOGGER.exception("[%s] Request failed: %s: %s", request_id, type(exc).__name__, exc)
            self._write_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"{type(exc).__name__}: {exc}"},
            )
            return

        LOGGER.info("[%s] Completed %s request", request_id, self.path)
        self._write_json(HTTPStatus.OK, result)

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


def serve(host="127.0.0.1", port=8000, preload=True, verbose=False):
    configure_logging(verbose=verbose)
    if preload:
        preload_models()

    server = ThreadingHTTPServer((host, port), TranslateRequestHandler)
    LOGGER.info("Server listening on http://%s:%s", host, port)
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(
        description="Run a persistent English-to-Wolof translation and TTS server."
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind.")
    parser.add_argument("--port", type=int, default=8000, help="TCP port to bind.")
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
