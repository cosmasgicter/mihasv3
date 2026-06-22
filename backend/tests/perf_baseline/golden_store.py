"""Persistence for golden-snapshot reference fixtures (task 2.1).

A :class:`GoldenStore` reads and writes normalized JSON snapshots under
``backend/tests/perf_baseline/fixtures/``. These files are the **frozen
pre-feature baseline**: the reference output every changed endpoint produced,
which the post-feature property/regression tests assert equality against
(R13.6).

Capture-or-compare contract
----------------------------

``assert_matches(name, candidate)`` is the workhorse:

- If no golden file exists for ``name``, the normalized candidate is **written**
  as the new baseline and the check passes (first capture seeds the baseline).
- If a golden file exists, the candidate is normalized and compared against it
  via :func:`tests.perf_baseline.divergence.diff_snapshots`; any divergence
  raises ``AssertionError`` with a full report.
- Setting the ``PERF_BASELINE_UPDATE=1`` environment variable forces a rewrite
  (used deliberately when an intended, reviewed contract change lands).

Because snapshots are normalized before storage (volatile ids/timestamps
collapsed to a sentinel), the committed fixtures are deterministic and stable
across machines and runs.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Iterable

from tests.perf_baseline.divergence import (
    OutputDivergence,
    diff_snapshots,
    normalize_snapshot,
)

#: Directory holding the committed golden JSON fixtures.
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

#: Env var that, when truthy, forces ``assert_matches`` to overwrite fixtures.
UPDATE_ENV_VAR = "PERF_BASELINE_UPDATE"


class GoldenStore:
    """Read/write/compare normalized golden snapshots in a fixtures directory."""

    def __init__(self, base_dir: Path | str = FIXTURES_DIR) -> None:
        self.base_dir = Path(base_dir)

    # -- paths -----------------------------------------------------------

    def path_for(self, name: str) -> Path:
        if not name or any(sep in name for sep in ("/", "\\", "..")):
            raise ValueError(f"invalid golden snapshot name: {name!r}")
        return self.base_dir / f"{name}.json"

    def exists(self, name: str) -> bool:
        return self.path_for(name).is_file()

    # -- io --------------------------------------------------------------

    def save(
        self,
        name: str,
        snapshot: Any,
        *,
        volatile_keys: Iterable[str] | None = None,
        drop_keys: Iterable[str] = (),
    ) -> Any:
        """Normalize and write ``snapshot`` as the golden fixture ``name``."""
        normalized = normalize_snapshot(snapshot, volatile_keys=volatile_keys, drop_keys=drop_keys)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        with self.path_for(name).open("w", encoding="utf-8") as handle:
            json.dump(normalized, handle, indent=2, sort_keys=True, ensure_ascii=False)
            handle.write("\n")
        return normalized

    def load(self, name: str) -> Any:
        """Load and return the (already-normalized) golden fixture ``name``."""
        with self.path_for(name).open(encoding="utf-8") as handle:
            return json.load(handle)

    # -- compare ---------------------------------------------------------

    def assert_matches(
        self,
        name: str,
        candidate: Any,
        *,
        volatile_keys: Iterable[str] | None = None,
        drop_keys: Iterable[str] = (),
    ) -> list[OutputDivergence]:
        """Compare ``candidate`` against golden ``name`` (capture-or-compare).

        Returns the list of divergences (empty on success). Writes the baseline
        on first capture or when ``PERF_BASELINE_UPDATE`` is set. Raises
        ``AssertionError`` with a readable report on any divergence.
        """
        normalized_candidate = normalize_snapshot(
            candidate, volatile_keys=volatile_keys, drop_keys=drop_keys
        )

        force_update = os.environ.get(UPDATE_ENV_VAR, "").lower() in ("1", "true", "yes")
        if force_update or not self.exists(name):
            self.save(name, candidate, volatile_keys=volatile_keys, drop_keys=drop_keys)
            return []

        baseline = self.load(name)
        divergences = diff_snapshots(baseline, normalized_candidate, normalized=True)
        if divergences:
            report = "\n".join(f"  - {d}" for d in divergences)
            raise AssertionError(
                f"golden snapshot '{name}': {len(divergences)} divergence(s) "
                f"vs the committed baseline:\n{report}\n"
                f"(re-run with {UPDATE_ENV_VAR}=1 only if this contract change is intended)"
            )
        return divergences


#: Shared default store pointed at the committed fixtures directory.
default_store = GoldenStore()
