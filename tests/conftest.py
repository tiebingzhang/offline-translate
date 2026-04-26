# Shared pytest fixtures for offline-translate BFF tests.
# (001-wolof-translate-mobile:T135b, amended T136/T144)

from __future__ import annotations

import io
import threading
from dataclasses import dataclass
from http.server import ThreadingHTTPServer
from pathlib import Path

import av  # type: ignore
import numpy as np
import pytest

from web_server import (
    JobStore,
    TextSpeechConfig,
    WebAppRequestHandler,
    _encode_pcm16_wav,
    encode_pcm_to_aac_m4a,
    now_epoch_ms,
)

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "audio"


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    return FIXTURES_DIR


def _make_video_only_mp4_fixture() -> bytes:
    # Build a minimal valid MP4 container carrying a single-frame mpeg4 video
    # track and no `soun` audio track. Exercises FR-038d "no audio stream"
    # branch without requiring a committed binary fixture.
    # (001-wolof-translate-mobile:T136)
    buffer = io.BytesIO()
    with av.open(buffer, mode="w", format="mp4") as out:
        stream = out.add_stream("mpeg4", rate=1)
        stream.width = 16
        stream.height = 16
        stream.pix_fmt = "yuv420p"
        frame = av.VideoFrame.from_ndarray(
            np.zeros((16, 16, 3), dtype=np.uint8),
            format="rgb24",
        )
        for packet in stream.encode(frame):
            out.mux(packet)
        for packet in stream.encode(None):
            out.mux(packet)
    return buffer.getvalue()


@pytest.fixture(scope="session")
def video_only_mp4_bytes() -> bytes:
    return _make_video_only_mp4_fixture()


# ---------------------------------------------------------------------------
# FR-039 test-client scaffolding (001-wolof-translate-mobile:T144)
# ---------------------------------------------------------------------------


@dataclass
class _BffTestServer:
    base_url: str
    job_store: JobStore
    server: ThreadingHTTPServer


@pytest.fixture
def bff_server():
    """Start a real WebAppRequestHandler on port 0 with an isolated JobStore.

    Yields a `_BffTestServer` bundle and shuts down the server on teardown.
    (001-wolof-translate-mobile:T144)
    """
    server = ThreadingHTTPServer(("127.0.0.1", 0), WebAppRequestHandler)
    # Minimal config — the /audio route and serialize_job_for_response read
    # only `job_store`; the other configs are unused for the FR-039 test suite
    # but must be present to avoid AttributeError in unrelated routes.
    server.whisper_configs = {}
    server.speech_config = None
    server.text_speech_config = TextSpeechConfig(
        url="http://127.0.0.1:8000/speak",
        request_timeout_seconds=5,
    )
    server.say_config = None
    server.translation_service_config = None
    server.job_store = JobStore()

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    try:
        yield _BffTestServer(
            base_url=f"http://{host}:{port}",
            job_store=server.job_store,
            server=server,
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


@pytest.fixture
def client(bff_server):
    """Minimal urllib-based client for the started bff_server."""
    from urllib import error as urlerr
    from urllib import request as urlreq

    class _Client:
        def __init__(self, base_url: str):
            self.base_url = base_url

        def get(self, path: str):
            req = urlreq.Request(self.base_url + path, method="GET")
            try:
                resp = urlreq.urlopen(req, timeout=5)
                return resp.status, resp.read(), dict(resp.headers)
            except urlerr.HTTPError as exc:
                return exc.code, exc.read(), dict(exc.headers)

        def post_json(self, path: str, payload: dict):
            import json

            body = json.dumps(payload).encode("utf-8")
            req = urlreq.Request(
                self.base_url + path,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                resp = urlreq.urlopen(req, timeout=5)
                return resp.status, resp.read(), dict(resp.headers)
            except urlerr.HTTPError as exc:
                return exc.code, exc.read(), dict(exc.headers)

    return _Client(bff_server.base_url)


def _write_completed_english_to_wolof_job(
    bff_server: _BffTestServer,
    request_id: str,
    transcribed_text: str,
    generated_audio_dir: Path,
    with_m4a: bool = True,
) -> tuple[Path, Path]:
    """Populate bff_server.job_store with a completed english_to_wolof job
    including a real WAV (1 s silent 16 kHz mono) and an optional .m4a
    encoded via the real `encode_pcm_to_aac_m4a` helper.

    Returns (wav_path, m4a_path). If with_m4a=False, m4a_path points to a
    non-existent file (exercises the FR-039a "evicted" 404 branch).
    """
    generated_audio_dir.mkdir(parents=True, exist_ok=True)
    wav_path = generated_audio_dir / "latest_wolof_output.wav"
    m4a_path = generated_audio_dir / f"{request_id}.m4a"

    # Real 1 s silent WAV @ 16 kHz mono so encode_pcm_to_aac_m4a has valid
    # input; size is ~32 KB which is plenty for the SC-013d 5x comparison.
    silent_samples = np.zeros(16_000, dtype=np.float32)
    wav_bytes = _encode_pcm16_wav(silent_samples, 16_000)
    wav_path.write_bytes(wav_bytes)

    if with_m4a:
        m4a_bytes = encode_pcm_to_aac_m4a(wav_bytes)
        m4a_path.write_bytes(m4a_bytes)

    job = {
        "request_id": request_id,
        "status": "completed",
        "stage": "completed",
        "stage_detail": "Processing finished.",
        "direction": "english_to_wolof",
        "target_language": "wolof",
        "filename": "upload.m4a",
        "content_type": "audio/m4a",
        "bytes_received": 1234,
        "detected_format": "m4a",
        "created_at_ms": now_epoch_ms(),
        "updated_at_ms": now_epoch_ms(),
        "completed_at_ms": now_epoch_ms(),
        "timings_ms": {"generating_speech": 120, "total": 2500},
        "result": {
            "direction": "english_to_wolof",
            "target_language": "wolof",
            "transcribed_text": transcribed_text,
            "translated_text": "[wolof translation placeholder]",
            "whisper_response": {"text": transcribed_text},
            "translation_result": None,
            "output_mode": "wolof_audio",
            "speech_result": {
                "output_path": str(wav_path),
                "output_path_m4a": str(m4a_path),
            },
            "audio_url": f"/api/requests/{request_id}/audio",
        },
        "error": None,
    }
    bff_server.job_store.create(job)
    return wav_path, m4a_path


@pytest.fixture
def run_english_to_wolof_job(bff_server, tmp_path):
    """Factory fixture: create a completed english_to_wolof job with real
    WAV + m4a files written to a per-test `generated_audio` subdir.

    Usage:
        request_id = run_english_to_wolof_job(b"Good morning", duration_sec=1)
    (001-wolof-translate-mobile:T144)
    """
    counter = {"n": 0}

    def _factory(
        utterance_bytes: bytes = b"hello",
        duration_sec: float = 1.0,
        expect_status: str = "completed",
        with_m4a: bool = True,
    ) -> str:
        counter["n"] += 1
        request_id = f"test{counter['n']:04d}"
        generated_audio_dir = tmp_path / "generated_audio"
        _write_completed_english_to_wolof_job(
            bff_server,
            request_id,
            transcribed_text=utterance_bytes.decode("utf-8", errors="replace"),
            generated_audio_dir=generated_audio_dir,
            with_m4a=with_m4a,
        )
        # If a test wants a non-completed status, downgrade the stored job.
        if expect_status != "completed":
            def _mutator(job):
                job["status"] = expect_status
                job["stage"] = expect_status if expect_status in {"queued", "failed"} else "processing"
                if expect_status == "failed":
                    job["error"] = {
                        "message": "synthetic",
                        "type": "SyntheticFailure",
                        "stage": "generating_speech",
                    }
                    job["result"] = None
            bff_server.job_store.mutate(request_id, _mutator)
        return request_id

    return _factory


@pytest.fixture
def enqueue_wolof_to_english_job(bff_server, tmp_path):
    """Factory fixture: create a completed wolof_to_english job. The result
    has `output_mode != "wolof_audio"` so `/audio` must return 409.
    (001-wolof-translate-mobile:T144)
    """
    counter = {"n": 0}

    def _factory(utterance_bytes: bytes = b"hello", with_m4a: bool = False) -> str:
        counter["n"] += 1
        request_id = f"w2e{counter['n']:04d}"
        generated_audio_dir = tmp_path / "generated_audio"
        generated_audio_dir.mkdir(parents=True, exist_ok=True)
        m4a_path = generated_audio_dir / f"{request_id}.m4a"
        if with_m4a:
            silent_samples = np.zeros(16_000, dtype=np.float32)
            wav_bytes = _encode_pcm16_wav(silent_samples, 16_000)
            m4a_path.write_bytes(encode_pcm_to_aac_m4a(wav_bytes))
        job = {
            "request_id": request_id,
            "status": "completed",
            "stage": "completed",
            "stage_detail": "Processing finished.",
            "direction": "wolof_to_english",
            "target_language": "english",
            "filename": "upload.m4a",
            "content_type": "audio/m4a",
            "bytes_received": 2048,
            "detected_format": "m4a",
            "created_at_ms": now_epoch_ms(),
            "updated_at_ms": now_epoch_ms(),
            "completed_at_ms": now_epoch_ms(),
            "timings_ms": {},
            "result": {
                "direction": "wolof_to_english",
                "target_language": "english",
                "transcribed_text": utterance_bytes.decode("utf-8", errors="replace"),
                "translated_text": "hello back",
                "whisper_response": {"text": "..."},
                "translation_result": {"translated_text": "hello back"},
                "output_mode": "english_audio",
                "speech_result": {
                    "engine": "say",
                    "play": True,
                    **({"output_path_m4a": str(m4a_path)} if with_m4a else {}),
                },
                "audio_url": f"/api/requests/{request_id}/audio" if with_m4a else None,
            },
            "error": None,
        }
        bff_server.job_store.create(job)
        return request_id

    return _factory
