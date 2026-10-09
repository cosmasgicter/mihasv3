"""Where a backend test writes its evidence artifacts — **run-scoped by default**.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/``, item **L8** of
``docs/v2-evidence/13.6/README.md`` §8.1.
Requirements: **R2.7** (an evidence artifact is immutable), **R18.5** (an evidence
artifact is a run record, not a claim).
Finding: **GATE-13.1-07** — three instruments write into ``docs/v2-evidence/**``, so
five earlier tasks' Required_Evidence artifacts are not immutable.
Evidence: ``docs/v2-evidence/13.6/remediation/L7-L8-L12/README.md`` §5.

The third of 13.1's three mechanisms is
``tests/property/test_authority_matrix_generated.py``, which wrote task **2.2**'s
``authority-conformance-summary.json`` on every backend run — including the whole-tree
runs six other tasks have made since, none of which had any interest in 2.2. That is a
recorded artifact being replaced by whoever ran the suite last.

This module is the **Python half of one convention**, not a second one. It reads the
same three environment variables the harness helper reads
(``apps/admissions/tests/harness-e2e/helpers/evidence-dir.ts``), in the same order,
with the same meanings:

===============================  ==========================================  ===========
env                              resolves to                                 when
===============================  ==========================================  ===========
``V2_EVIDENCE_DIR=<rel path>``   ``<repo>/<rel path>``                       a task writing this run into **its own** directory (L5-L6's case)
``V2_EVIDENCE_TASK_DIRS=1``      ``<repo>/docs/v2-evidence/<task_id>``       regenerating the artifact in its **canonical home**, on purpose
*(neither)*                      ``<repo>/backend/test-results/v2-evidence/<run_id>/<task_id>``  **the default** — an ordinary run, writing nobody's evidence
===============================  ==========================================  ===========

Two names, one rule, two languages. ``test_evidence_dir_convention_l8.py`` fails if
either side's variable names or resolution order drifts from the other's, because a
convention spelled twice in two languages is a convention that will eventually mean two
things.

The default sits under ``backend/test-results/`` because ``test-results/`` is already
gitignored (``.gitignore:54``) and is already the repo's scratch convention. It is
deliberately **not** under ``docs/v2-evidence/``: a throwaway run directory inside the
evidence tree would eventually be read as evidence.
"""

from __future__ import annotations

import os
from pathlib import Path

#: Repository root — ``backend/tests/v2_evidence.py`` -> ``tests`` -> ``backend`` -> repo.
_REPO_ROOT = Path(__file__).resolve().parents[2]

#: The env var L5-L6 established: one repo-relative home for the whole run.
EVIDENCE_DIR_ENV = "V2_EVIDENCE_DIR"

#: The env var that opts a run into writing the canonical ``docs/v2-evidence/<task>/``.
EVIDENCE_TASK_DIRS_ENV = "V2_EVIDENCE_TASK_DIRS"

#: The env var that names the run, so every writer in one run agrees.
EVIDENCE_RUN_ID_ENV = "V2_EVIDENCE_RUN_ID"

#: Repo-relative parent of every run-scoped backend evidence directory.
RUN_SCOPED_EVIDENCE_ROOT = "backend/test-results/v2-evidence"

#: Accepted spellings of "on". Anything else — including unset — is off.
_TRUTHY = {"1", "true", "yes", "on"}


def is_truthy_flag(value: str | None) -> bool:
    """``'1' | 'true' | 'yes' | 'on'``, case-insensitively; everything else is off."""
    return (value or "").strip().lower() in _TRUTHY


def evidence_run_id() -> str:
    """The id of the current run, or ``'current'``.

    A CI job or a remediation batch can set ``V2_EVIDENCE_RUN_ID`` so several
    instruments in one run share a directory. The fallback is a stable
    ``current`` rather than a per-process timestamp: pytest-xdist workers would
    each compute a different timestamp and scatter one run's artifacts, and a
    scattered scratch run is harder to read than an overwritten one.
    """
    explicit = (os.environ.get(EVIDENCE_RUN_ID_ENV) or "").strip()
    return explicit or "current"


def _inside_repo(path: Path) -> Path:
    """Reject a resolved path that escapes the repository.

    Added after this batch's own slip: a ``V2_EVIDENCE_DIR`` of ``"../docs/v2-evidence/…"``
    (repo-relative, but written as though it were cwd-relative) resolved outside the repo
    and wrote a plausible-looking evidence tree into the parent directory. The resolver
    had done exactly what the convention says; nothing complained. L5-L6 hit the same
    class of slip from the other side and recorded it in its §8.4.

    A directory nobody will ever look in is the failure GATE-13.1-07 is about, so a
    resolver that can silently produce one is worth one comparison. Recorded in
    ``docs/v2-evidence/13.6/remediation/L7-L8-L12/raw/23-l8-own-instrument-slip.txt``.
    """
    resolved = path.resolve()
    root = _REPO_ROOT.resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError(
            f"{EVIDENCE_DIR_ENV} resolves outside the repository: {resolved}. "
            f"It is a path relative to the REPOSITORY ROOT ({root}), not to the "
            f"current working directory."
        )
    return path


def evidence_dir(task_id: str) -> Path:
    """The directory this run writes ``task_id``'s artifacts into.

    :param task_id: the evidence directory this artifact **belongs** to, relative to
        ``docs/v2-evidence/`` — e.g. ``"2.2"``. Used as the canonical home under
        ``V2_EVIDENCE_TASK_DIRS``, and as the per-task subdirectory of the run-scoped
        default so two instruments in one run do not share a directory.
    :raises ValueError: if ``V2_EVIDENCE_DIR`` names a path outside the repository.
    """
    override = (os.environ.get(EVIDENCE_DIR_ENV) or "").strip()
    if override:
        return _inside_repo(_REPO_ROOT / override)
    if is_truthy_flag(os.environ.get(EVIDENCE_TASK_DIRS_ENV)):
        return _REPO_ROOT / "docs" / "v2-evidence" / task_id
    return _REPO_ROOT / RUN_SCOPED_EVIDENCE_ROOT / evidence_run_id() / task_id
