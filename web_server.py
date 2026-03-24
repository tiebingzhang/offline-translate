#!/usr/bin/env python3
import argparse
import email.policy
import json
import logging
import mimetypes
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from email.parser import BytesParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request

WEB_ROOT = Path(__file__).parent / "webapp"
LOGGER = logging.getLogger("wolof_translate.web_server")


@dataclass(frozen=True)
class WhisperConfig:
    url: str
    temperature: str
    temperature_inc: str
    response_format: str
    request_timeout_seconds: int


@dataclass(frozen=True)
class SpeechConfig:
    url: str
    play: bool
    wait: bool
    output_path: str | None
    request_timeout_seconds: int


def configure_logging(verbose=False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def sniff_audio_format(data):
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if len(data) >= 4 and data[:4] == b"OggS":
        return "ogg"
    if len(data) >= 4 and data[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    return "unknown"


def build_multipart_form_data(fields, files):
    boundary = f"----woloftranslate{uuid.uuid4().hex}"
    body = bytearray()

    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")

    for file_item in files:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            (
                f'Content-Disposition: form-data; name="{file_item["field_name"]}"; '
                f'filename="{file_item["filename"]}"\r\n'
            ).encode("utf-8")
        )
        body.extend(f'Content-Type: {file_item["content_type"]}\r\n\r\n'.encode("utf-8"))
        body.extend(file_item["content"])
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return boundary, bytes(body)


def normalize_audio_for_whisper(audio_bytes, input_filename):
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise RuntimeError("ffmpeg is required to normalize audio for whisper.cpp.")

    input_suffix = Path(input_filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=input_suffix, delete=False) as input_file:
        input_path = Path(input_file.name)
        input_file.write(audio_bytes)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output_file:
        output_path = Path(output_file.name)

    try:
        subprocess.run(
            [
                ffmpeg_path,
                "-y",
                "-i",
                str(input_path),
                "-ar",
                "16000",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                str(output_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        return output_path.read_bytes()
    except subprocess.CalledProcessError as exc:
        stderr_text = exc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"ffmpeg normalization failed: {stderr_text}") from exc
    finally:
        input_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)


def call_whisper_server(audio_bytes, whisper_config):
    boundary, body = build_multipart_form_data(
        fields={
            "temperature": whisper_config.temperature,
            "temperature_inc": whisper_config.temperature_inc,
            "response_format": whisper_config.response_format,
        },
        files=[
            {
                "field_name": "file",
                "filename": "utterance.wav",
                "content_type": "audio/wav",
                "content": audio_bytes,
            }
        ],
    )

    req = request.Request(
        whisper_config.url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=whisper_config.request_timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"whisper.cpp returned HTTP {exc.code}: {body_text}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"whisper.cpp request failed: {exc.reason}") from exc

    text = str(payload.get("text", "")).strip()
    if not text:
        raise RuntimeError("whisper.cpp response did not include non-empty 'text'.")

    return {
        "text": text,
        "raw_response": payload,
    }


def call_speech_server(text, speech_config):
    payload = json.dumps(
        {
            "text": text,
            "play": speech_config.play,
            "wait": speech_config.wait,
            "output_path": speech_config.output_path,
        }
    ).encode("utf-8")
    req = request.Request(
        speech_config.url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=speech_config.request_timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Wolof speech server returned HTTP {exc.code}: {body_text}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Wolof speech server request failed: {exc.reason}") from exc


class WebAppRequestHandler(BaseHTTPRequestHandler):
    server_version = "WolofTranslateWebServer/0.1"

    def do_GET(self):
        if self.path in {"/health", "/api/health"}:
            self._write_json(HTTPStatus.OK, {"status": "ok"})
            return

        relative_path = "index.html" if self.path == "/" else self.path.lstrip("/")
        asset_path = (WEB_ROOT / relative_path).resolve()

        if WEB_ROOT not in asset_path.parents and asset_path != WEB_ROOT / "index.html":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        if not asset_path.exists() or not asset_path.is_file():
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        content_type, _ = mimetypes.guess_type(asset_path.name)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(asset_path.stat().st_size))
        self.end_headers()
        with asset_path.open("rb") as file_obj:
            self.wfile.write(file_obj.read())

    def do_POST(self):
        request_id = uuid.uuid4().hex[:8]
        if self.path != "/api/translate-speak":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        try:
            upload = self._read_multipart_audio()
        except ValueError as exc:
            LOGGER.warning("[%s] Invalid upload: %s", request_id, exc)
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc), "request_id": request_id})
            return

        detected_format = sniff_audio_format(upload["bytes"])

        LOGGER.info(
            "[%s] Received upload filename=%s bytes=%s content_type=%s detected_format=%s",
            request_id,
            upload["filename"],
            len(upload["bytes"]),
            upload["content_type"],
            detected_format,
        )

        try:
            normalized_wav = normalize_audio_for_whisper(upload["bytes"], upload["filename"])
            whisper_result = call_whisper_server(normalized_wav, self.server.whisper_config)
            speech_result = call_speech_server(whisper_result["text"], self.server.speech_config)
        except Exception as exc:
            LOGGER.exception("[%s] Pipeline failed: %s", request_id, exc)
            self._write_json(
                HTTPStatus.BAD_GATEWAY,
                {
                    "error": str(exc),
                    "request_id": request_id,
                },
            )
            return

        response = {
            "request_id": request_id,
            "status": "completed",
            "filename": upload["filename"],
            "content_type": upload["content_type"],
            "bytes_received": len(upload["bytes"]),
            "detected_format": detected_format,
            "normalized_format": "wav",
            "normalized_sample_rate_hz": 16000,
            "normalized_channels": 1,
            "normalized_codec": "pcm_s16le",
            "whisper_text": whisper_result["text"],
            "whisper_response": whisper_result["raw_response"],
            "speech_result": speech_result,
        }
        self._write_json(HTTPStatus.OK, response)

    def log_message(self, format, *args):
        LOGGER.info("HTTP %s - %s", self.client_address[0], format % args)

    def _read_multipart_audio(self):
        content_type = self.headers.get("Content-Type", "")
        content_length = self.headers.get("Content-Length", "")

        if not content_type.startswith("multipart/form-data"):
            raise ValueError("Expected multipart/form-data upload.")
        if not content_length:
            raise ValueError("Missing Content-Length header.")

        body = self.rfile.read(int(content_length))
        message = BytesParser(policy=email.policy.default).parsebytes(
            (
                f"Content-Type: {content_type}\r\n"
                "MIME-Version: 1.0\r\n\r\n"
            ).encode("utf-8")
            + body
        )

        if not message.is_multipart():
            raise ValueError("Invalid multipart payload.")

        upload_part = None
        for part in message.iter_parts():
            if part.get_param("name", header="content-disposition") == "file":
                upload_part = part
                break

        if upload_part is None:
            raise ValueError("Missing 'file' field in multipart upload.")

        filename = upload_part.get_filename() or "upload.wav"
        payload = upload_part.get_payload(decode=True) or b""
        if not payload:
            raise ValueError("Uploaded file is empty.")

        return {
            "filename": Path(filename).name,
            "content_type": upload_part.get_content_type() or "application/octet-stream",
            "bytes": payload,
        }

    def _write_json(self, status, payload):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def serve(host="127.0.0.1", port=8090, whisper_config=None, speech_config=None, verbose=False):
    configure_logging(verbose=verbose)
    server = ThreadingHTTPServer((host, port), WebAppRequestHandler)
    server.whisper_config = whisper_config or WhisperConfig(
        url="http://127.0.0.1:8080/inference",
        temperature="0.0",
        temperature_inc="0.2",
        response_format="json",
        request_timeout_seconds=120,
    )
    server.speech_config = speech_config or SpeechConfig(
        url="http://127.0.0.1:8001/speak",
        play=True,
        wait=False,
        output_path=None,
        request_timeout_seconds=120,
    )
    LOGGER.info("Web app server listening on http://%s:%s", host, port)
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(
        description="Serve the browser prototype and accept audio uploads.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind.")
    parser.add_argument("--port", type=int, default=8090, help="TCP port to bind.")
    parser.add_argument(
        "--whisper-url",
        default="http://127.0.0.1:8080/inference",
        help="whisper.cpp inference endpoint.",
    )
    parser.add_argument(
        "--whisper-temperature",
        default="0.0",
        help="temperature form field for whisper.cpp.",
    )
    parser.add_argument(
        "--whisper-temperature-inc",
        default="0.2",
        help="temperature_inc form field for whisper.cpp.",
    )
    parser.add_argument(
        "--whisper-response-format",
        default="json",
        help="response_format form field for whisper.cpp.",
    )
    parser.add_argument(
        "--whisper-timeout-seconds",
        type=int,
        default=120,
        help="Timeout when waiting for whisper.cpp.",
    )
    parser.add_argument(
        "--speech-server-url",
        default="http://127.0.0.1:8001/speak",
        help="Wolof speech server endpoint.",
    )
    parser.add_argument(
        "--speech-no-play",
        action="store_true",
        help="Generate Wolof audio without triggering playback.",
    )
    parser.add_argument(
        "--speech-wait",
        action="store_true",
        help="Wait for playback to finish before returning from the speech server.",
    )
    parser.add_argument(
        "--speech-output-path",
        default=None,
        help="Optional fixed output path for generated Wolof audio.",
    )
    parser.add_argument(
        "--speech-timeout-seconds",
        type=int,
        default=120,
        help="Timeout when waiting for the Wolof speech server.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging.",
    )
    args = parser.parse_args()
    serve(
        host=args.host,
        port=args.port,
        whisper_config=WhisperConfig(
            url=args.whisper_url,
            temperature=args.whisper_temperature,
            temperature_inc=args.whisper_temperature_inc,
            response_format=args.whisper_response_format,
            request_timeout_seconds=args.whisper_timeout_seconds,
        ),
        speech_config=SpeechConfig(
            url=args.speech_server_url,
            play=not args.speech_no_play,
            wait=args.speech_wait,
            output_path=args.speech_output_path,
            request_timeout_seconds=args.speech_timeout_seconds,
        ),
        verbose=args.verbose,
    )


if __name__ == "__main__":
    main()
