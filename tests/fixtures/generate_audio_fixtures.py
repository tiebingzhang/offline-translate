"""Generate the FR-038 test-fixture m4a files.

Run once to (re)create `tests/fixtures/audio/*.m4a`. The outputs are committed
to git so CI doesn't need PyAV to collect tests; this script exists only as
reproducibility documentation.

Usage:
    .venv/bin/python tests/fixtures/generate_audio_fixtures.py

Fixtures produced:
  ios_sim_3s.m4a          3 s sine tone @ 48 kbps mono 16 kHz AAC/m4a
                          (surrogate for iOS simulator capture; real device
                           recording should replace this file when available
                           per T136.)
  ios_sim_10s.m4a         10 s sine tone — same encoder settings.
  silence_90s.m4a         90 s zero-sample AAC/m4a — exercises FR-038e
                          75 s decoded-duration cap.
  malformed_moov.m4a      Synthetic truncated MP4 header — exercises the
                          FR-038d "could not be decoded by PyAV" branch.
  empty_decoded.m4a       Copy of a known-empty decoder output. Generated
                          via the helper below; if the encoder disagrees
                          with our "zero frames" expectation, the test uses
                          `_make_empty_decoded_payload()` as a fallback.

(001-wolof-translate-mobile:T136)
"""
from __future__ import annotations

import io
import math
import struct
from pathlib import Path

import av  # type: ignore
import numpy as np

FIXTURES_DIR = Path(__file__).resolve().parent / "audio"
FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 16_000
BIT_RATE = 48_000


def _make_sine_wave(duration_sec: float, freq_hz: float = 440.0) -> np.ndarray:
    total_samples = int(duration_sec * SAMPLE_RATE)
    t = np.arange(total_samples, dtype=np.float32) / SAMPLE_RATE
    return (0.3 * np.sin(2.0 * math.pi * freq_hz * t)).astype(np.float32)


def _make_silence(duration_sec: float) -> np.ndarray:
    total_samples = int(duration_sec * SAMPLE_RATE)
    return np.zeros(total_samples, dtype=np.float32)


def _encode_pcm_to_m4a(samples_f32_mono: np.ndarray, output_path: Path) -> None:
    # Write float32 mono PCM -> AAC in MP4 container at 48 kbps 16 kHz mono.
    # Mirrors the iOS client's `expo-audio` recorder settings.
    with av.open(str(output_path), mode="w", format="mp4") as out_container:
        out_stream = out_container.add_stream("aac", rate=SAMPLE_RATE, layout="mono")
        out_stream.bit_rate = BIT_RATE

        frame_size = out_stream.codec_context.frame_size or 1024
        total = samples_f32_mono.size
        pts = 0
        for start in range(0, total, frame_size):
            chunk = samples_f32_mono[start : start + frame_size]
            if chunk.size == 0:
                break
            # fltp = planar float; build (1, N) for mono
            frame = av.AudioFrame.from_ndarray(
                chunk.reshape(1, -1),
                format="fltp",
                layout="mono",
            )
            frame.sample_rate = SAMPLE_RATE
            frame.pts = pts
            pts += chunk.size
            for packet in out_stream.encode(frame):
                out_container.mux(packet)
        for packet in out_stream.encode(None):
            out_container.mux(packet)


def _write_ios_sim_3s() -> None:
    _encode_pcm_to_m4a(_make_sine_wave(3.0), FIXTURES_DIR / "ios_sim_3s.m4a")


def _write_ios_sim_10s() -> None:
    _encode_pcm_to_m4a(_make_sine_wave(10.0), FIXTURES_DIR / "ios_sim_10s.m4a")


def _write_silence_90s() -> None:
    _encode_pcm_to_m4a(_make_silence(90.0), FIXTURES_DIR / "silence_90s.m4a")


def _write_malformed_moov() -> None:
    # MP4 ftyp atom followed by garbage — enough for PyAV to reject when it
    # can't parse the moov atom. 64 bytes is plenty for the sniff guards.
    ftyp = struct.pack(">I4s4s", 32, b"ftyp", b"isom")
    ftyp += struct.pack(">I4s4s", 0, b"mp42", b"mp41")[:16]
    garbage = b"\x00" * 32
    (FIXTURES_DIR / "malformed_moov.m4a").write_bytes(ftyp + garbage)


def _write_empty_decoded() -> None:
    # Encode a single sample so the container is structurally valid AAC but
    # the decoder yields zero frames after resampling at 16 kHz mono.
    # (If the AAC encoder rejects zero-length input, fall back to writing
    # a minimal valid moov with zero samples declared.)
    try:
        _encode_pcm_to_m4a(np.zeros(1, dtype=np.float32), FIXTURES_DIR / "empty_decoded.m4a")
    except av.AVError:
        # Fallback: hand-craft a valid ftyp+moov with zero-length mdat.
        ftyp = struct.pack(">I4s4s", 24, b"ftyp", b"isom") + b"\x00\x00\x02\x00" + b"mp42mp41"
        moov = struct.pack(">I4s", 8, b"moov")
        mdat = struct.pack(">I4s", 8, b"mdat")
        (FIXTURES_DIR / "empty_decoded.m4a").write_bytes(ftyp + moov + mdat)


def main() -> None:
    _write_ios_sim_3s()
    _write_ios_sim_10s()
    _write_silence_90s()
    _write_malformed_moov()
    _write_empty_decoded()
    for path in sorted(FIXTURES_DIR.glob("*.m4a")):
        print(f"{path.name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
