# Shared pytest fixtures for offline-translate BFF tests.
# (001-wolof-translate-mobile:T135b, amended T136/T144)

from __future__ import annotations

import io
from pathlib import Path

import av  # type: ignore
import numpy as np
import pytest

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
