"""Fixtures for contract parity tests.

Loads recorded Vercel request/response pairs from the recordings/ directory
and provides helpers for building Django test requests from them.
"""

import json
from pathlib import Path

import pytest

RECORDINGS_DIR = Path(__file__).parent / "recordings"

# Fields that are expected to differ between Vercel and Django responses
TOLERATED_FIELDS = frozenset({
    "timestamps",
    "request_ids",
    "token_values",
})


def _load_recordings() -> list[dict]:
    """Load all JSON recording fixtures from the recordings directory."""
    recordings = []
    if not RECORDINGS_DIR.exists():
        return recordings
    for filepath in sorted(RECORDINGS_DIR.glob("*.json")):
        with open(filepath) as f:
            data = json.load(f)
            data["_source_file"] = filepath.name
            recordings.append(data)
    return recordings


@pytest.fixture()
def all_recordings() -> list[dict]:
    """Return all recorded Vercel request/response pairs."""
    return _load_recordings()


@pytest.fixture(params=_load_recordings(), ids=lambda r: r.get("name", "unknown"))
def recording(request) -> dict:
    """Parametrized fixture — yields one recording at a time."""
    return request.param


@pytest.fixture()
def recording_by_name() -> dict[str, dict]:
    """Return recordings indexed by name for targeted lookups."""
    return {r["name"]: r for r in _load_recordings()}
