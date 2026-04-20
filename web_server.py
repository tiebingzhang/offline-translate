#!/usr/bin/env python3
import argparse
import copy
import email.policy
import io
import json
import logging
import mimetypes
import shutil
import subprocess
import threading
import time
import uuid
import wave
from dataclasses import dataclass
from email.parser import BytesParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, parse, request

import av  # PyAV — FR-038 in-memory AAC/m4a transcoding (001-wolof-translate-mobile:T139)
import numpy as np
import soxr

WEB_ROOT = Path(__file__).parent / "webapp"
LOGGER = logging.getLogger("wolof_translate.web_server")
DEFAULT_DIRECTION = "english_to_wolof"
SUPPORTED_DIRECTIONS = frozenset({"english_to_wolof", "wolof_to_english"})
WHISPER_SAMPLE_RATE = 16000

# FR-038e pre-decode and post-decode resource caps on the non-WAV ingestion
# path. 60 s recording @ 48 kbps mono 16 kHz AAC is ~360 KB; 2 MiB gives ~5.6x
# budget for legitimate jitter while bounding decompression-bomb risk. 75 s =
# 60 s FR-002a cap + 25 % resampler slack.
# (001-wolof-translate-mobile:T139)
MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_DECODED_DURATION_SEC = 75.0

# FR-039b downlink encode settings — symmetric with the mobile upload codec
# and ~5x smaller than PCM WAV over the Cloudflare-Tunnel deployment topology.
# (001-wolof-translate-mobile:T146)
WOLOF_TTS_SAMPLE_RATE = 16_000
WOLOF_TTS_AAC_BITRATE = 48_000
ENGLISH_TTS_AAC_BITRATE = 48_000


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


@dataclass(frozen=True)
class SayConfig:
    play: bool
    voice: str | None
    rate: int | None


@dataclass(frozen=True)
class TranslationServiceConfig:
    url: str
    request_timeout_seconds: int


class JobStore:
    def __init__(self):
        self._jobs = {}
        self._lock = threading.Lock()

    def create(self, job):
        with self._lock:
            self._jobs[job["request_id"]] = copy.deepcopy(job)

    def get(self, request_id):
        with self._lock:
            job = self._jobs.get(request_id)
            if job is None:
                return None
            return copy.deepcopy(job)

    def mutate(self, request_id, mutator):
        with self._lock:
            job = self._jobs.get(request_id)
            if job is None:
                return None
            mutator(job)
            job["updated_at_ms"] = now_epoch_ms()
            return copy.deepcopy(job)


def configure_logging(verbose=False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def now_epoch_ms():
    return int(time.time() * 1000)


def now_monotonic_ms():
    return int(time.monotonic() * 1000)


def get_target_language(direction):
    if direction == "english_to_wolof":
        return "wolof"
    if direction == "wolof_to_english":
        return "english"
    raise ValueError(f"Unsupported direction: {direction}")


def sniff_audio_format(data):
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if len(data) >= 4 and data[:4] == b"OggS":
        return "ogg"
    if len(data) >= 4 and data[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    # MP4/m4a magic: `ftyp` at offset 4 (001-wolof-translate-mobile:T139)
    if len(data) >= 8 and data[4:8] == b"ftyp":
        return "m4a"
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


def _decode_pcm_samples(raw_frames, sample_width):
    if sample_width == 1:
        samples = np.frombuffer(raw_frames, dtype=np.uint8).astype(np.float32)
        return (samples - 128.0) / 128.0
    if sample_width == 2:
        return np.frombuffer(raw_frames, dtype="<i2").astype(np.float32) / 32768.0
    if sample_width == 3:
        packed = np.frombuffer(raw_frames, dtype=np.uint8).reshape(-1, 3)
        samples = (
            packed[:, 0].astype(np.int32)
            | (packed[:, 1].astype(np.int32) << 8)
            | (packed[:, 2].astype(np.int32) << 16)
        )
        samples = (samples << 8) >> 8
        return samples.astype(np.float32) / 8388608.0
    if sample_width == 4:
        return np.frombuffer(raw_frames, dtype="<i4").astype(np.float32) / 2147483648.0
    raise RuntimeError(f"Unsupported WAV sample width: {sample_width * 8} bits.")


def _read_wav_samples(audio_bytes, input_filename):
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
            channel_count = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            compression_type = wav_file.getcomptype()
            frame_count = wav_file.getnframes()
            raw_frames = wav_file.readframes(frame_count)
    except wave.Error as exc:
        raise RuntimeError(f"Unsupported WAV file {input_filename!r}: {exc}") from exc

    if compression_type != "NONE":
        raise RuntimeError(f"WAV file {input_filename!r} must use PCM encoding.")
    if channel_count < 1:
        raise RuntimeError(f"WAV file {input_filename!r} must include at least one channel.")
    if sample_rate < 1:
        raise RuntimeError(f"WAV file {input_filename!r} has an invalid sample rate: {sample_rate}.")
    if not raw_frames:
        raise RuntimeError(f"WAV file {input_filename!r} does not contain audio frames.")

    samples = _decode_pcm_samples(raw_frames, sample_width)
    return samples.reshape(-1, channel_count), sample_rate


def _encode_pcm16_wav(samples, sample_rate):
    clipped = np.clip(samples, -1.0, 1.0 - (1.0 / 32768.0))
    pcm16 = np.round(clipped * 32768.0).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())
    return buffer.getvalue()


def transcode_to_wav(audio_bytes):
    """Decode any PyAV-supported container to 16 kHz mono PCM WAV bytes.

    Raises RuntimeError with a descriptive, FR-038d-compliant message on
    corrupt/unsupported input or when FR-038e resource bounds are exceeded.
    (001-wolof-translate-mobile:T139)
    """
    if len(audio_bytes) > MAX_UPLOAD_BYTES:
        raise RuntimeError("Upload exceeds 2 MiB size cap.")

    input_buf = io.BytesIO(audio_bytes)
    try:
        container = av.open(input_buf, format=None)
    except av.AVError as exc:
        raise RuntimeError(
            f"Audio container could not be decoded by PyAV: {exc}"
        ) from exc

    try:
        stream = next(
            (s for s in container.streams if s.type == "audio"),
            None,
        )
        if stream is None:
            raise RuntimeError("Upload contains no audio stream.")

        resampler = av.AudioResampler(
            format="s16",
            layout="mono",
            rate=WHISPER_SAMPLE_RATE,
        )

        pcm_chunks: list[np.ndarray] = []
        total_samples = 0
        max_samples = int(MAX_DECODED_DURATION_SEC * WHISPER_SAMPLE_RATE)

        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                arr = resampled.to_ndarray().reshape(-1)
                pcm_chunks.append(arr)
                total_samples += arr.size
                if total_samples > max_samples:
                    raise RuntimeError(
                        "Decoded audio duration exceeds 75s cap."
                    )
        for resampled in resampler.resample(None):
            arr = resampled.to_ndarray().reshape(-1)
            pcm_chunks.append(arr)
            total_samples += arr.size
            if total_samples > max_samples:
                raise RuntimeError(
                    "Decoded audio duration exceeds 75s cap."
                )
    finally:
        container.close()

    if not pcm_chunks:
        raise RuntimeError("Decoded audio stream was empty.")

    pcm_i16 = np.concatenate(pcm_chunks).astype(np.int16)
    # Reuse _encode_pcm16_wav by renormalizing back to float32 in [-1, 1).
    pcm_f32 = pcm_i16.astype(np.float32) / 32768.0
    return _encode_pcm16_wav(pcm_f32, WHISPER_SAMPLE_RATE)


def encode_pcm_to_aac_m4a(wav_bytes):
    """Encode 16 kHz mono PCM WAV bytes to AAC-in-MP4 (m4a) bytes in memory.

    Raises RuntimeError on encoder/container failure (FR-039f).
    (001-wolof-translate-mobile:T146)
    """
    in_buf = io.BytesIO(wav_bytes)
    out_buf = io.BytesIO()
    in_container = None
    out_container = None

    try:
        in_container = av.open(in_buf, mode="r", format="wav")
        out_container = av.open(out_buf, mode="w", format="mp4")

        in_stream = next(s for s in in_container.streams if s.type == "audio")
        out_stream = out_container.add_stream(
            "aac",
            rate=WOLOF_TTS_SAMPLE_RATE,
            layout="mono",
        )
        out_stream.bit_rate = WOLOF_TTS_AAC_BITRATE

        for frame in in_container.decode(in_stream):
            frame.pts = None
            for packet in out_stream.encode(frame):
                out_container.mux(packet)
        for packet in out_stream.encode(None):
            out_container.mux(packet)
    except av.AVError as exc:
        raise RuntimeError(f"Failed to encode output audio: {exc}") from exc
    finally:
        if out_container is not None:
            try:
                out_container.close()
            except Exception:  # pragma: no cover - defensive close
                pass
        if in_container is not None:
            try:
                in_container.close()
            except Exception:  # pragma: no cover - defensive close
                pass

    encoded = out_buf.getvalue()
    if not encoded:
        raise RuntimeError("Failed to encode output audio: empty output stream.")
    return encoded


def normalize_audio_for_whisper(audio_bytes, input_filename):
    if sniff_audio_format(audio_bytes) != "wav":
        # FR-038b: transcode any non-WAV upload (m4a/AAC, OGG, WebM)
        # in-memory to 16 kHz mono PCM WAV before the legacy pipeline runs.
        # (001-wolof-translate-mobile:T140)
        audio_bytes = transcode_to_wav(audio_bytes)

    samples, sample_rate = _read_wav_samples(audio_bytes, input_filename)

    # Downmix before resampling so the resampler only processes one stream.
    mono_samples = samples.mean(axis=1, dtype=np.float32) if samples.shape[1] > 1 else samples[:, 0]
    normalized_samples = (
        soxr.resample(mono_samples, sample_rate, WHISPER_SAMPLE_RATE, quality="HQ")
        if sample_rate != WHISPER_SAMPLE_RATE
        else mono_samples
    )
    return _encode_pcm16_wav(np.asarray(normalized_samples, dtype=np.float32), WHISPER_SAMPLE_RATE)


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


def call_wolof_to_english_translation_service(text, translation_config):
    payload = json.dumps({"text": text}).encode("utf-8")
    req = request.Request(
        translation_config.url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=translation_config.request_timeout_seconds) as response:
            result = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Wolof-to-English translation server returned HTTP {exc.code}: {body_text}"
        ) from exc
    except error.URLError as exc:
        raise RuntimeError(f"Wolof-to-English translation server request failed: {exc.reason}") from exc

    translated_text = str(result.get("translated_text", "")).strip()
    if not translated_text:
        raise RuntimeError("Translation server response did not include non-empty 'translated_text'.")

    return result


def speak_english_with_say(text, say_config, output_path):
    say_path = shutil.which("say")
    if not say_path:
        raise RuntimeError("macOS 'say' command is not available on this system.")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    render_command = [say_path]
    if say_config.voice:
        render_command.extend(["-v", say_config.voice])
    if say_config.rate is not None:
        render_command.extend(["-r", str(say_config.rate)])
    render_command.extend(
        [
            "-o",
            str(output_path),
            "--file-format=m4af",
            "--data-format=aac",
            f"--bit-rate={ENGLISH_TTS_AAC_BITRATE}",
            text,
        ]
    )

    try:
        subprocess.run(
            render_command,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as exc:
        stderr_text = exc.stderr.decode("utf-8", errors="replace").strip()
        if stderr_text:
            raise RuntimeError(f"say failed: {stderr_text}") from exc
        raise RuntimeError(f"say failed with status {exc.returncode}") from exc

    if not output_path.is_file():
        raise RuntimeError("say failed to create the requested output audio file.")

    playback_started = False
    if say_config.play:
        afplay_path = shutil.which("afplay")
        playback_command = [afplay_path, str(output_path)] if afplay_path else [say_path]
        if not afplay_path:
            if say_config.voice:
                playback_command.extend(["-v", say_config.voice])
            if say_config.rate is not None:
                playback_command.extend(["-r", str(say_config.rate)])
            playback_command.append(text)
        try:
            subprocess.run(
                playback_command,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
            playback_started = True
        except subprocess.CalledProcessError as exc:
            stderr_text = exc.stderr.decode("utf-8", errors="replace").strip()
            if stderr_text:
                raise RuntimeError(f"say playback failed: {stderr_text}") from exc
            raise RuntimeError(f"say playback failed with status {exc.returncode}") from exc

    return {
        "text": text,
        "engine": "say",
        "play": say_config.play,
        "playback_started": playback_started,
        "voice": say_config.voice,
        "rate": say_config.rate,
        "output_path_m4a": str(output_path),
    }


def update_job_stage(job_store, request_id, stage, detail):
    stage_started_at_ms = now_monotonic_ms()

    def mutator(job):
        job["status"] = "processing"
        job["stage"] = stage
        job["stage_detail"] = detail
        job["current_stage_started_at_ms"] = stage_started_at_ms

    job_store.mutate(request_id, mutator)
    return stage_started_at_ms


def record_stage_timing(job_store, request_id, stage, started_at_ms, extra_updates=None):
    duration_ms = now_monotonic_ms() - started_at_ms

    def mutator(job):
        job["timings_ms"][stage] = duration_ms
        if extra_updates:
            job.update(extra_updates)

    job_store.mutate(request_id, mutator)


def fail_job(job_store, request_id, stage, exc):
    LOGGER.exception("[%s] Pipeline failed during %s: %s", request_id, stage, exc)

    def mutator(job):
        job["status"] = "failed"
        job["stage"] = "failed"
        job["stage_detail"] = f"Failed during {stage}."
        job["error"] = {
            "message": str(exc),
            "type": type(exc).__name__,
            "stage": stage,
        }
        job["completed_at_ms"] = now_epoch_ms()
        if "started_processing_at_ms" in job:
            job["timings_ms"]["total"] = now_monotonic_ms() - job["started_processing_at_ms"]

    job_store.mutate(request_id, mutator)


def complete_job(job_store, request_id, result):
    def mutator(job):
        job["status"] = "completed"
        job["stage"] = "completed"
        job["stage_detail"] = "Processing finished."
        job["result"] = result
        job["completed_at_ms"] = now_epoch_ms()
        if "started_processing_at_ms" in job:
            job["timings_ms"]["total"] = now_monotonic_ms() - job["started_processing_at_ms"]

    job_store.mutate(request_id, mutator)


def serialize_job_for_response(job):
    payload = copy.deepcopy(job)
    payload.pop("started_processing_at_ms", None)
    payload.pop("current_stage_started_at_ms", None)
    payload["poll_after_ms"] = 500
    return payload


def process_request_job(
    request_id,
    upload,
    whisper_configs,
    speech_config,
    say_config,
    translation_service_config,
    job_store,
):
    stage = "queued"
    direction = upload["direction"]
    whisper_config = whisper_configs[direction]

    def start_processing(job):
        job["status"] = "processing"
        job["stage"] = "queued"
        job["stage_detail"] = f"Upload accepted for {direction}. Preparing pipeline."
        job["started_processing_at_ms"] = now_monotonic_ms()

    job_store.mutate(request_id, start_processing)

    try:
        stage = "normalizing"
        started_at_ms = update_job_stage(
            job_store,
            request_id,
            stage,
            "Normalizing audio to 16 kHz mono PCM WAV.",
        )
        normalized_wav = normalize_audio_for_whisper(upload["bytes"], upload["filename"])
        record_stage_timing(
            job_store,
            request_id,
            stage,
            started_at_ms,
            extra_updates={
                "normalized_format": "wav",
                "normalized_sample_rate_hz": 16000,
                "normalized_channels": 1,
                "normalized_codec": "pcm_s16le",
            },
        )

        stage = "transcribing"
        started_at_ms = update_job_stage(
            job_store,
            request_id,
            stage,
            "Calling whisper.cpp for transcription and translation.",
        )
        whisper_result = call_whisper_server(normalized_wav, whisper_config)
        record_stage_timing(job_store, request_id, stage, started_at_ms)

        speech_result = None
        translation_result = None
        translated_text = whisper_result["text"]
        # The english_to_wolof pipeline uses an end-to-end speech-to-Wolof-text
        # model, so no English transcript is produced. Emit empty string so the
        # client can hide the "you said" field instead of showing the Wolof
        # translation twice. wolof_to_english gets the Wolof ASR output below.
        # (001-wolof-translate-mobile:bugfix-transcript-translation)
        transcribed_text = "" if direction == "english_to_wolof" else whisper_result["text"]
        output_mode = "text_only"
        if direction == "english_to_wolof":
            stage = "generating_speech"
            started_at_ms = update_job_stage(
                job_store,
                request_id,
                stage,
                "Sending Wolof text to the speech server.",
            )
            speech_result = call_speech_server(whisper_result["text"], speech_config)
            # FR-039c — eagerly encode the TTS WAV to AAC/m4a inside the same
            # generating_speech stage so FR-003a step-label vocabulary is
            # unchanged and the mobile client receives `audio_url` on the
            # completion response. timings_ms.generating_speech absorbs the
            # ~100 ms encode cost. The .wav is retained on disk for webapp
            # playback + debugging per FR-039d.
            # (001-wolof-translate-mobile:T147)
            wav_disk_path = Path(speech_result["output_path"])
            wav_bytes = wav_disk_path.read_bytes()
            m4a_bytes = encode_pcm_to_aac_m4a(wav_bytes)
            m4a_disk_path = wav_disk_path.parent / f"{request_id}.m4a"
            m4a_disk_path.write_bytes(m4a_bytes)
            speech_result["output_path_m4a"] = str(m4a_disk_path)
            record_stage_timing(job_store, request_id, stage, started_at_ms)
            output_mode = "wolof_audio"
        elif direction == "wolof_to_english":
            stage = "translating"
            started_at_ms = update_job_stage(
                job_store,
                request_id,
                stage,
                "Translating Wolof text to English.",
            )
            translation_result = call_wolof_to_english_translation_service(
                whisper_result["text"],
                translation_service_config,
            )
            translated_text = translation_result["translated_text"]
            record_stage_timing(job_store, request_id, stage, started_at_ms)

            stage = "generating_speech"
            started_at_ms = update_job_stage(
                job_store,
                request_id,
                stage,
                "Speaking English with macOS say.",
            )
            speech_result = speak_english_with_say(
                translated_text,
                say_config,
                Path("generated_audio") / f"{request_id}.m4a",
            )
            record_stage_timing(job_store, request_id, stage, started_at_ms)
            output_mode = "english_audio"

        # Expose downloadable audio whenever the speech stage wrote an m4a.
        audio_url = (
            f"/api/requests/{request_id}/audio"
            if speech_result and speech_result.get("output_path_m4a")
            else None
        )
        complete_job(
            job_store,
            request_id,
            {
                "direction": direction,
                "target_language": get_target_language(direction),
                "transcribed_text": transcribed_text,
                "translated_text": translated_text,
                "whisper_response": whisper_result["raw_response"],
                "translation_result": translation_result,
                "output_mode": output_mode,
                "speech_result": speech_result,
                "audio_url": audio_url,
            },
        )
    except Exception as exc:
        fail_job(job_store, request_id, stage, exc)


class WebAppRequestHandler(BaseHTTPRequestHandler):
    server_version = "WolofTranslateWebServer/0.1"

    def do_GET(self):
        parsed_path = parse.urlparse(self.path)
        route_path = parsed_path.path

        if route_path in {"/health", "/api/health"}:
            self._write_json(HTTPStatus.OK, {"status": "ok"})
            return

        if route_path.startswith("/api/requests/"):
            remaining = route_path[len("/api/requests/"):]
            parts = remaining.split("/")
            # FR-039a — `/api/requests/{id}/audio` must be matched BEFORE the
            # plain `/api/requests/{id}` branch so `audio` isn't mistakenly
            # treated as a request-id.
            # (001-wolof-translate-mobile:T148)
            if len(parts) == 2 and parts[1] == "audio":
                self._serve_request_audio(parts[0])
                return
            if len(parts) == 1 and parts[0]:
                request_id = parts[0]
                job = self.server.job_store.get(request_id)
                if job is None:
                    self._write_json(
                        HTTPStatus.NOT_FOUND,
                        {"error": {"message": "Request not found.", "type": "NotFound"}, "request_id": request_id},
                    )
                    return
                self._write_json(HTTPStatus.OK, serialize_job_for_response(job))
                return
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        relative_path = "index.html" if route_path == "/" else route_path.lstrip("/")
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
        parsed_path = parse.urlparse(self.path)
        route_path = parsed_path.path

        if route_path != "/api/translate-speak":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        request_id = uuid.uuid4().hex[:8]
        try:
            upload = self._read_multipart_audio()
        except ValueError as exc:
            LOGGER.warning("[%s] Invalid upload: %s", request_id, exc)
            self._write_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "request_id": request_id,
                    "status": "failed",
                    "error": {
                        "message": str(exc),
                        "type": "BadRequest",
                        "stage": "upload_validation",
                    },
                },
            )
            return

        if upload["direction"] not in SUPPORTED_DIRECTIONS:
            self._write_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "request_id": request_id,
                    "status": "failed",
                    "error": {
                        "message": f"Unsupported direction: {upload['direction']}",
                        "type": "BadRequest",
                        "stage": "upload_validation",
                    },
                },
            )
            return

        detected_format = sniff_audio_format(upload["bytes"])
        LOGGER.info(
            "[%s] Received upload direction=%s filename=%s bytes=%s content_type=%s detected_format=%s",
            request_id,
            upload["direction"],
            upload["filename"],
            len(upload["bytes"]),
            upload["content_type"],
            detected_format,
        )

        job = {
            "request_id": request_id,
            "status": "queued",
            "stage": "queued",
            "stage_detail": "Upload accepted. Waiting to start processing.",
            "direction": upload["direction"],
            "target_language": get_target_language(upload["direction"]),
            "filename": upload["filename"],
            "content_type": upload["content_type"],
            "bytes_received": len(upload["bytes"]),
            "detected_format": detected_format,
            "created_at_ms": now_epoch_ms(),
            "updated_at_ms": now_epoch_ms(),
            "timings_ms": {},
            "result": None,
            "error": None,
        }
        self.server.job_store.create(job)

        worker = threading.Thread(
            target=process_request_job,
            args=(
                request_id,
                upload,
                self.server.whisper_configs,
                self.server.speech_config,
                self.server.say_config,
                self.server.translation_service_config,
                self.server.job_store,
            ),
            daemon=True,
        )
        worker.start()

        self._write_json(
            HTTPStatus.ACCEPTED,
            {
                "request_id": request_id,
                "status": "queued",
                "stage": "queued",
                "direction": upload["direction"],
                "status_url": f"/api/requests/{request_id}",
                "poll_after_ms": 500,
            },
        )

    def _serve_request_audio(self, request_id):
        # FR-039a route: GET /api/requests/{id}/audio
        # (001-wolof-translate-mobile:T148)
        job = self.server.job_store.get(request_id)
        if job is None:
            self._write_json(
                HTTPStatus.NOT_FOUND,
                {
                    "error": {"message": "Request not found.", "type": "NotFound"},
                    "request_id": request_id,
                },
            )
            return

        result = job.get("result") or {}
        if (
            job.get("status") != "completed"
            or result.get("output_mode") not in {"wolof_audio", "english_audio"}
            or not result.get("audio_url")
        ):
            self._write_json(
                HTTPStatus.CONFLICT,
                {
                    "error": {"message": "Audio not available for this job.", "type": "InvalidState"},
                    "request_id": request_id,
                },
            )
            return

        speech_result = result.get("speech_result") or {}
        m4a_path_str = speech_result.get("output_path_m4a")
        if not m4a_path_str:
            self._write_json(
                HTTPStatus.NOT_FOUND,
                {
                    "error": {"message": "Audio file evicted or missing.", "type": "NotFound"},
                    "request_id": request_id,
                },
            )
            return

        m4a_path = Path(m4a_path_str)
        if not m4a_path.is_file():
            self._write_json(
                HTTPStatus.NOT_FOUND,
                {
                    "error": {"message": "Audio file evicted or missing.", "type": "NotFound"},
                    "request_id": request_id,
                },
            )
            return

        size = m4a_path.stat().st_size
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "audio/m4a")
        self.send_header("Content-Length", str(size))
        self.send_header(
            "Content-Disposition",
            f'attachment; filename="{request_id}.m4a"',
        )
        self.end_headers()
        with m4a_path.open("rb") as file_obj:
            shutil.copyfileobj(file_obj, self.wfile)

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
        direction = DEFAULT_DIRECTION
        for part in message.iter_parts():
            part_name = part.get_param("name", header="content-disposition")
            if part_name == "file":
                upload_part = part
                continue
            if part_name == "direction":
                direction = (part.get_content() or "").strip() or DEFAULT_DIRECTION

        if upload_part is None:
            raise ValueError("Missing 'file' field in multipart upload.")

        filename = upload_part.get_filename() or "upload.wav"
        payload = upload_part.get_payload(decode=True) or b""
        if not payload:
            raise ValueError("Uploaded file is empty.")

        return {
            "direction": direction,
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


def serve(
    host="127.0.0.1",
    port=8090,
    whisper_configs=None,
    speech_config=None,
    say_config=None,
    translation_service_config=None,
    verbose=False,
):
    configure_logging(verbose=verbose)
    server = ThreadingHTTPServer((host, port), WebAppRequestHandler)
    server.whisper_configs = whisper_configs or {
        "english_to_wolof": WhisperConfig(
            url="http://127.0.0.1:8080/inference",
            temperature="0.0",
            temperature_inc="0.2",
            response_format="json",
            request_timeout_seconds=120,
        ),
        "wolof_to_english": WhisperConfig(
            url="http://127.0.0.1:8081/inference",
            temperature="0.0",
            temperature_inc="0.2",
            response_format="json",
            request_timeout_seconds=120,
        ),
    }
    server.speech_config = speech_config or SpeechConfig(
        url="http://127.0.0.1:8001/speak",
        play=False,
        wait=False,
        output_path=None,
        request_timeout_seconds=120,
    )
    server.say_config = say_config or SayConfig(
        play=False,
        voice=None,
        rate=None,
    )
    server.translation_service_config = translation_service_config or TranslationServiceConfig(
        url="http://127.0.0.1:8002/translate",
        request_timeout_seconds=120,
    )
    server.job_store = JobStore()
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
        help="English-to-Wolof whisper.cpp inference endpoint.",
    )
    parser.add_argument(
        "--whisper-url-wolof-to-english",
        default="http://127.0.0.1:8081/inference",
        help="Wolof-to-English whisper.cpp inference endpoint.",
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
        "--speech-play",
        action="store_true",
        help="Enable Wolof audio playback on the server.",
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
        "--english-play",
        action="store_true",
        help="Enable macOS say playback for Wolof-to-English requests.",
    )
    parser.add_argument(
        "--english-say-voice",
        default=None,
        help="Optional macOS say voice for English playback.",
    )
    parser.add_argument(
        "--english-say-rate",
        type=int,
        default=None,
        help="Optional macOS say speaking rate in words per minute.",
    )
    parser.add_argument(
        "--wolof-translate-server-url",
        default="http://127.0.0.1:8002/translate",
        help="Wolof-to-English translation service endpoint.",
    )
    parser.add_argument(
        "--wolof-translate-timeout-seconds",
        type=int,
        default=120,
        help="Timeout when waiting for the Wolof-to-English translation service.",
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
        whisper_configs={
            "english_to_wolof": WhisperConfig(
                url=args.whisper_url,
                temperature=args.whisper_temperature,
                temperature_inc=args.whisper_temperature_inc,
                response_format=args.whisper_response_format,
                request_timeout_seconds=args.whisper_timeout_seconds,
            ),
            "wolof_to_english": WhisperConfig(
                url=args.whisper_url_wolof_to_english,
                temperature=args.whisper_temperature,
                temperature_inc=args.whisper_temperature_inc,
                response_format=args.whisper_response_format,
                request_timeout_seconds=args.whisper_timeout_seconds,
            ),
        },
        speech_config=SpeechConfig(
            url=args.speech_server_url,
            play=args.speech_play,
            wait=args.speech_wait,
            output_path=args.speech_output_path,
            request_timeout_seconds=args.speech_timeout_seconds,
        ),
        say_config=SayConfig(
            play=args.english_play,
            voice=args.english_say_voice,
            rate=args.english_say_rate,
        ),
        translation_service_config=TranslationServiceConfig(
            url=args.wolof_translate_server_url,
            request_timeout_seconds=args.wolof_translate_timeout_seconds,
        ),
        verbose=args.verbose,
    )


if __name__ == "__main__":
    main()
