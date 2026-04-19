# FR-038 contract tests for the BFF AAC/m4a ingestion path.
# Authored BEFORE `transcode_to_wav` is implemented per Constitution II (TDD).
# (001-wolof-translate-mobile:T137)

from __future__ import annotations

from pathlib import Path

import av  # type: ignore
import numpy as np
import pytest

from web_server import (
    _encode_pcm16_wav,
    _read_wav_samples,
    normalize_audio_for_whisper,
    sniff_audio_format,
    transcode_to_wav,
)

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "audio"


def test_ios_simulator_aac_transcodes_to_valid_wav():
    # FR-038a sniff guard + FR-038a/b happy path.
    # (001-wolof-translate-mobile:T137a)
    aac = (FIXTURES_DIR / "ios_sim_3s.m4a").read_bytes()
    assert sniff_audio_format(aac) == "m4a", (
        "sniff_audio_format must recognize AAC/m4a so contracts/bff-api.md "
        "§2 `detected_format: \"m4a\"` stays true."
    )

    wav = transcode_to_wav(aac)

    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"
    samples, sample_rate = _read_wav_samples(wav, "ios_sim_3s.wav")
    assert sample_rate == 16_000
    assert samples.shape[1] == 1


def test_existing_wav_upload_bypasses_transcoder(monkeypatch):
    # FR-038c regression — webapp WAV flow must not invoke PyAV.
    # (001-wolof-translate-mobile:T137b)
    silent_samples = np.zeros(16_000, dtype=np.float32)
    wav_in = _encode_pcm16_wav(silent_samples, 16_000)

    called = []

    def _spy_open(*args, **kwargs):
        called.append((args, kwargs))
        raise AssertionError("PyAV must not be invoked on the WAV legacy path.")

    monkeypatch.setattr(av, "open", _spy_open)

    wav_out = normalize_audio_for_whisper(wav_in, "webapp.wav")

    assert called == []
    samples, sample_rate = _read_wav_samples(wav_out, "webapp.wav")
    assert sample_rate == 16_000
    assert samples.shape[1] == 1


def test_malformed_m4a_raises_descriptive_runtime_error():
    # FR-038d corrupt-container branch.
    # (001-wolof-translate-mobile:T137c)
    malformed = (FIXTURES_DIR / "malformed_moov.m4a").read_bytes()
    with pytest.raises(RuntimeError, match="could not be decoded by PyAV"):
        transcode_to_wav(malformed)


def test_container_without_audio_stream_raises(video_only_mp4_bytes):
    # FR-038d no-audio-stream branch.
    # (001-wolof-translate-mobile:T137d)
    with pytest.raises(RuntimeError, match="no audio stream"):
        transcode_to_wav(video_only_mp4_bytes)


def test_empty_decoded_stream_raises(monkeypatch):
    # FR-038d empty-decoded-stream branch. The real-world trigger (container
    # with audio track declared but zero decoded samples) is hard to synthesize
    # deterministically because AAC decoders pad short inputs; this test mocks
    # the container so the code branch is exercised.
    # (001-wolof-translate-mobile:T137e)
    class _FakeStream:
        type = "audio"

    class _FakeContainer:
        streams = [_FakeStream()]

        def decode(self, stream):
            return iter(())

        def close(self):
            pass

    monkeypatch.setattr(av, "open", lambda *a, **kw: _FakeContainer())

    with pytest.raises(RuntimeError, match="Decoded audio stream was empty"):
        transcode_to_wav(b"\x00" * 64)


def test_upload_exceeding_2mib_rejected_before_pyav(monkeypatch):
    # FR-038e raw-size cap — reject BEFORE PyAV is invoked.
    # (001-wolof-translate-mobile:T137f1)
    called = []
    monkeypatch.setattr(av, "open", lambda *a, **kw: called.append((a, kw)))

    oversize = b"\x00" * (2 * 1024 * 1024 + 1)
    with pytest.raises(RuntimeError, match="exceeds 2 MiB size cap"):
        transcode_to_wav(oversize)

    assert called == [], "PyAV must not be invoked on oversize payloads."


def test_decoded_duration_exceeding_75s_rejected():
    # FR-038e post-decode duration cap.
    # (001-wolof-translate-mobile:T137f2)
    long_clip = (FIXTURES_DIR / "silence_90s.m4a").read_bytes()
    with pytest.raises(RuntimeError, match="Decoded audio duration exceeds 75s cap"):
        transcode_to_wav(long_clip)
