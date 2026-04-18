# FR-039 contract tests for GET /api/requests/{id}/audio and the
# generating_speech stage's eager WAV->AAC m4a encode.
# Authored BEFORE `process_request_job` is extended with the encode call
# per Constitution II (TDD).
# (001-wolof-translate-mobile:T145)

from __future__ import annotations

import json
from pathlib import Path

import pytest

import web_server
from web_server import (
    _encode_pcm16_wav,
    encode_pcm_to_aac_m4a,
    transcode_to_wav,
)


# ---------------------------------------------------------------------------
# Route-level: GET /api/requests/{id}/audio
# ---------------------------------------------------------------------------


def test_audio_endpoint_happy_path(client, run_english_to_wolof_job):
    # FR-039a happy path + FR-039b downlink format + SC-013a/b/c.
    # (001-wolof-translate-mobile:T145a)
    request_id = run_english_to_wolof_job(b"Good morning", duration_sec=1.0)

    status, body, headers = client.get(f"/api/requests/{request_id}/audio")
    assert status == 200, body
    content_type = headers.get("Content-Type", "").lower()
    assert content_type == "audio/m4a", content_type
    assert int(headers["Content-Length"]) == len(body)
    disposition = headers.get("Content-Disposition", "")
    assert f'filename="{request_id}.m4a"' in disposition
    # MP4 magic: "ftyp" at offset 4-8.
    assert body[4:8] == b"ftyp"
    # Symmetric round-trip: the produced bytes must decode back via the
    # same helper the BFF uses on the upload path.
    wav = transcode_to_wav(body)
    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"


def test_audio_endpoint_404_unknown_request(client):
    # FR-039a 404 branch.
    # (001-wolof-translate-mobile:T145b)
    status, body, _ = client.get("/api/requests/does-not-exist/audio")
    assert status == 404
    payload = json.loads(body)
    assert payload["error"]["type"] == "NotFound"


def test_audio_endpoint_409_wrong_output_mode(client, enqueue_wolof_to_english_job):
    # FR-039a 409 branch — wolof_to_english has output_mode != "wolof_audio".
    # (001-wolof-translate-mobile:T145c)
    request_id = enqueue_wolof_to_english_job(b"na nga def")
    status, body, _ = client.get(f"/api/requests/{request_id}/audio")
    assert status == 409
    payload = json.loads(body)
    assert payload["error"]["type"] == "InvalidState"


def test_audio_endpoint_409_still_processing(client, run_english_to_wolof_job):
    # FR-039a 409 branch — job still processing.
    # (001-wolof-translate-mobile:T145c)
    request_id = run_english_to_wolof_job(
        b"...", duration_sec=1.0, expect_status="queued"
    )
    status, _body, _ = client.get(f"/api/requests/{request_id}/audio")
    assert status == 409


def test_audio_endpoint_404_evicted_file(client, run_english_to_wolof_job):
    # FR-039a — completed job whose .m4a has been evicted from disk.
    # (001-wolof-translate-mobile:T145c)
    request_id = run_english_to_wolof_job(
        b"gone", duration_sec=1.0, with_m4a=False
    )
    status, body, _ = client.get(f"/api/requests/{request_id}/audio")
    assert status == 404
    payload = json.loads(body)
    assert payload["error"]["type"] == "NotFound"


# ---------------------------------------------------------------------------
# Unit: encode_pcm_to_aac_m4a helper (satisfies T145d)
# ---------------------------------------------------------------------------


def test_encode_pcm_to_aac_m4a_roundtrip_and_bandwidth():
    # SC-013d bandwidth bound is sized for typical real-world utterances
    # (~3-10 s). Sub-1 s clips are container-overhead-dominated and do not
    # meaningfully reflect the cellular-budget gain the metric targets; a
    # 3 s clip is the minimum useful measurement.
    # (001-wolof-translate-mobile:T145d + SC-013d bandwidth bound)
    import numpy as np

    # 3 s of a 200 Hz sine @ 16 kHz mono = 48 000 samples.
    duration_samples = 48_000
    samples = (
        0.2 * np.sin(np.linspace(0, 600 * np.pi, duration_samples, dtype=np.float32))
    ).astype(np.float32)
    wav = _encode_pcm16_wav(samples, 16_000)
    m4a = encode_pcm_to_aac_m4a(wav)

    assert m4a[4:8] == b"ftyp"
    assert len(m4a) * 5 <= len(wav), (
        f"SC-013 bandwidth bound: m4a={len(m4a)} wav={len(wav)} "
        f"ratio={len(wav)/len(m4a):.2f}x"
    )
    wav_again = transcode_to_wav(m4a)
    assert wav_again[:4] == b"RIFF"


def test_encode_failure_raises_with_descriptive_message(monkeypatch):
    # FR-039f encode-failure surface — drive the empty-output branch of
    # encode_pcm_to_aac_m4a by mocking the output container so it never
    # writes any bytes to the destination buffer.
    # (001-wolof-translate-mobile:T145d)
    import numpy as np
    import av as av_mod  # type: ignore

    class _FakeStream:
        codec_context = type("_CC", (), {"frame_size": 1024})()
        bit_rate = 0

        def encode(self, frame):
            return iter(())

    class _FakeOut:
        def __init__(self):
            self.streams = []

        def add_stream(self, *a, **kw):
            return _FakeStream()

        def mux(self, packet):  # pragma: no cover - never called
            pass

        def close(self):
            pass

    original_open = av_mod.open

    def _fake_open(buf_or_path, mode="r", format=None):
        if mode == "w":
            return _FakeOut()
        return original_open(buf_or_path, mode=mode, format=format)

    monkeypatch.setattr(av_mod, "open", _fake_open)

    with pytest.raises(RuntimeError, match="Failed to encode output audio"):
        encode_pcm_to_aac_m4a(
            _encode_pcm16_wav(np.zeros(16_000, dtype=np.float32), 16_000)
        )


# ---------------------------------------------------------------------------
# Integration: generating_speech extension (T147) — encode failure marks the
# job as failed and leaves audio_url unset.
# ---------------------------------------------------------------------------


def test_generating_speech_encode_failure_fails_job(monkeypatch, tmp_path):
    # FR-039f — when encode_pcm_to_aac_m4a raises, the generating_speech
    # stage must set job.status="failed" with descriptive error.message
    # and not populate audio_url.
    # (001-wolof-translate-mobile:T145d)
    from web_server import JobStore, _encode_pcm16_wav, process_request_job

    import numpy as np

    job_store = JobStore()
    request_id = "enc-fail-01"
    generated_dir = tmp_path / "generated_audio"
    generated_dir.mkdir()
    wav_path = generated_dir / "latest_wolof_output.wav"
    wav_path.write_bytes(_encode_pcm16_wav(np.zeros(16_000, dtype=np.float32), 16_000))

    # Seed the queued job as the real do_POST would.
    job_store.create(
        {
            "request_id": request_id,
            "status": "queued",
            "stage": "queued",
            "stage_detail": "",
            "direction": "english_to_wolof",
            "target_language": "wolof",
            "filename": "upload.m4a",
            "content_type": "audio/m4a",
            "bytes_received": 128,
            "detected_format": "m4a",
            "created_at_ms": 0,
            "updated_at_ms": 0,
            "timings_ms": {},
            "result": None,
            "error": None,
        }
    )

    # Mock the external HTTP-called services.
    monkeypatch.setattr(
        web_server,
        "normalize_audio_for_whisper",
        lambda audio_bytes, filename: audio_bytes,
    )
    monkeypatch.setattr(
        web_server,
        "call_whisper_server",
        lambda wav, whisper_config: {
            "text": "Good morning",
            "raw_response": {"text": "Good morning"},
        },
    )
    monkeypatch.setattr(
        web_server,
        "call_speech_server",
        lambda text, speech_config: {"output_path": str(wav_path)},
    )
    # Boom on the m4a encode.
    def _boom(wav_bytes):
        raise RuntimeError("Failed to encode output audio: synthetic")

    monkeypatch.setattr(web_server, "encode_pcm_to_aac_m4a", _boom)

    upload = {
        "direction": "english_to_wolof",
        "filename": "upload.m4a",
        "content_type": "audio/m4a",
        "bytes": b"ignored-by-mocked-normalize",
    }

    process_request_job(
        request_id,
        upload,
        whisper_configs={"english_to_wolof": None, "wolof_to_english": None},
        speech_config=None,
        say_config=None,
        translation_service_config=None,
        job_store=job_store,
    )

    job = job_store.get(request_id)
    assert job["status"] == "failed"
    assert "Failed to encode output audio" in job["error"]["message"]
    assert job["result"] is None or job["result"].get("audio_url") is None


def test_generating_speech_happy_path_populates_audio_url(monkeypatch, tmp_path):
    # FR-039a/c/e — on successful english_to_wolof completion, the result
    # must carry `audio_url = "/api/requests/{id}/audio"`, and the .m4a
    # file must exist on disk next to the .wav.
    # (001-wolof-translate-mobile:T145a)
    from web_server import JobStore, _encode_pcm16_wav, process_request_job

    import numpy as np

    job_store = JobStore()
    request_id = "happy-01"
    generated_dir = tmp_path / "generated_audio"
    generated_dir.mkdir()
    wav_path = generated_dir / "latest_wolof_output.wav"
    wav_path.write_bytes(_encode_pcm16_wav(np.zeros(16_000, dtype=np.float32), 16_000))

    job_store.create(
        {
            "request_id": request_id,
            "status": "queued",
            "stage": "queued",
            "stage_detail": "",
            "direction": "english_to_wolof",
            "target_language": "wolof",
            "filename": "upload.m4a",
            "content_type": "audio/m4a",
            "bytes_received": 128,
            "detected_format": "m4a",
            "created_at_ms": 0,
            "updated_at_ms": 0,
            "timings_ms": {},
            "result": None,
            "error": None,
        }
    )

    monkeypatch.setattr(
        web_server,
        "normalize_audio_for_whisper",
        lambda audio_bytes, filename: audio_bytes,
    )
    monkeypatch.setattr(
        web_server,
        "call_whisper_server",
        lambda wav, whisper_config: {
            "text": "Good morning",
            "raw_response": {"text": "Good morning"},
        },
    )
    monkeypatch.setattr(
        web_server,
        "call_speech_server",
        lambda text, speech_config: {"output_path": str(wav_path)},
    )

    upload = {
        "direction": "english_to_wolof",
        "filename": "upload.m4a",
        "content_type": "audio/m4a",
        "bytes": b"ignored-by-mocked-normalize",
    }

    process_request_job(
        request_id,
        upload,
        whisper_configs={"english_to_wolof": None, "wolof_to_english": None},
        speech_config=None,
        say_config=None,
        translation_service_config=None,
        job_store=job_store,
    )

    job = job_store.get(request_id)
    assert job["status"] == "completed", job.get("error")
    assert job["result"]["audio_url"] == f"/api/requests/{request_id}/audio"
    m4a_path = Path(job["result"]["speech_result"]["output_path_m4a"])
    assert m4a_path.is_file()
    assert m4a_path.stat().st_size > 0
