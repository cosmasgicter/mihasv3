"""Unit tests for scoped-cache TTL bounds and the flag-off bypass.

Feature: system-performance-hardening (task 1.5).

Two concerns, both pure unit tests (no DB, no property-test machinery — the
property tests for this feature live under ``backend/tests/property/``):

1. **TTL bounds** — the TTL constant actually used by the flag-gated catalog
   cache sits within the requirement window:
     - catalog  TTL ∈ [300, 600]           (R4.2)
   We assert the *real* constant used in the production code (importing
   ``_CATALOG_CACHE_TTL``) rather than hard-coding a copy. The dashboard
   (R2.3) and capability (R5.2) TTL checks went with those caches
   (platform-simplification task 16.1, decision D7 option A).

2. **Flag-off bypass** — ``cached_or_compute(..., enabled=False)`` calls
   ``compute()`` on every invocation and never reads from or writes to the
   cache backend (the pre-feature behaviour the flags default to).

Requirements: 4.2.
"""

from __future__ import annotations

import inspect
import io
import textwrap
import token
import tokenize
from unittest.mock import MagicMock, patch

from apps.common.scoped_cache import cached_or_compute


# ---------------------------------------------------------------------------
# Helpers — extract the *actual* ttl literal used at each call site.
# ---------------------------------------------------------------------------


def _ttl_literals_in(source: str) -> list[int]:
    """All integer ``ttl=<int>`` keyword-argument literals in real code.

    Uses :mod:`tokenize` so docstrings and comments (which may also mention
    ``ttl=60``) are ignored — only the actual ``ttl = <number>`` keyword
    argument tokens count.
    """
    literals: list[int] = []
    tokens = list(
        tokenize.generate_tokens(io.StringIO(textwrap.dedent(source)).readline)
    )
    for i, tok in enumerate(tokens[:-2]):
        if tok.type == token.NAME and tok.string == "ttl":
            op, num = tokens[i + 1], tokens[i + 2]
            if (
                op.type == token.OP
                and op.string == "="
                and num.type == token.NUMBER
            ):
                literals.append(int(num.string))
    return literals


def _single_ttl(func) -> int:
    """The single ``ttl=`` literal passed at the call site inside ``func``."""
    literals = _ttl_literals_in(inspect.getsource(func))
    assert len(literals) == 1, (
        f"expected exactly one ttl= literal in {func!r}, found {literals}"
    )
    return literals[0]


# ---------------------------------------------------------------------------
# TTL bounds
# ---------------------------------------------------------------------------


def test_catalog_ttl_within_300_to_600():
    """Catalog cache TTL constant is within [300, 600] seconds (R4.2)."""
    from apps.catalog.views import _CATALOG_CACHE_TTL

    assert 300 <= _CATALOG_CACHE_TTL <= 600, (
        f"catalog TTL {_CATALOG_CACHE_TTL} outside [300, 600]"
    )


# ---------------------------------------------------------------------------
# Flag-off bypass — enabled=False computes every time, never touches the cache.
# ---------------------------------------------------------------------------


def test_flag_off_calls_compute_every_time():
    """enabled=False invokes compute() on every call (pre-feature behaviour)."""
    calls = []

    def compute():
        calls.append(1)
        return "value"

    for _ in range(5):
        assert cached_or_compute("ns", "sig", compute, ttl=45, enabled=False) == "value"

    assert len(calls) == 5  # never served from a cache entry


def test_flag_off_never_touches_cache_backend():
    """enabled=False must not read from or write to the cache backend."""
    mock_cache = MagicMock()

    def compute():
        return "value"

    with patch("apps.common.scoped_cache.cache", mock_cache):
        result = cached_or_compute("ns", "sig", compute, ttl=45, enabled=False)

    assert result == "value"
    mock_cache.get.assert_not_called()
    mock_cache.set.assert_not_called()
    mock_cache.incr.assert_not_called()


def test_flag_off_returns_empty_results_without_caching():
    """enabled=False returns the computed value verbatim, even when empty."""
    mock_cache = MagicMock()

    with patch("apps.common.scoped_cache.cache", mock_cache):
        assert cached_or_compute("ns", "sig", lambda: [], ttl=45, enabled=False) == []
        assert cached_or_compute("ns", "sig", lambda: None, ttl=45, enabled=False) is None

    mock_cache.get.assert_not_called()
    mock_cache.set.assert_not_called()
