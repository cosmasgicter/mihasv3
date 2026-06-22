"""Unit tests — Gate 1 Migration_Evidence_Gate recorder over captured fixtures.

Spec: ``.kiro/specs/beanola-launch-verification`` (task 14.5). Module under
test: ``scripts/launch-verification/record-migration-evidence.py``.

These tests exercise the **recorder** layer that folds operator-captured command
output into a launch-verification ``Evidence_Artifact``. They drive the recorder
over synthetic captured-output fixtures only — no database, no Neon/MCP, no
``subprocess``, no Django ``setup()``. The recorder imports its sibling pure core
``migration_eval`` (same directory) and the stdlib-only shared
``apps.common.launch_verification.{evidence,redaction}`` helpers from ``backend/``
on ``sys.path``, so the module imports cleanly without ``django.setup()``.

Coverage:

* **R1.2 — staging apply (one migration_history row per script).** With a
  ``migration_history`` carrying exactly one row per applied script the
  ``staging:apply`` check passes; a missing row or a duplicate row makes it fail.
* **R1.8 — branch-first posture.** A risky change recorded ``branch_first=True``
  passes the ``neon:branch-first`` check; ``branch_first=False`` fails it; a
  non-risky change omits the check entirely.
* **R1.9 — no secrets in the artifact (critical).** Captured output containing a
  connection string with an inline password, a raw phone number, and an NRC
  value is routed through the shared redaction helper, so the built/serialized
  artifact contains NONE of those secret values — only ``[REDACTED]`` markers.
* **Happy path + round-trip.** ``build_artifact(synthetic_inputs())`` produces a
  ``passed`` artifact that round-trips losslessly through ``evidence.from_dict``.

The hyphenated filename ``record-migration-evidence.py`` is an illegal dotted
module name, so it is loaded directly via
``importlib.util.spec_from_file_location`` and registered in ``sys.modules``
under a legal alias before ``exec_module``.

Validates: Requirements 1.2, 1.8, 1.9
"""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Load the hyphenated recorder module via importlib.
#
#   backend/tests/unit/test_*.py
#     parents[0] -> backend/tests/unit
#     parents[1] -> backend/tests
#     parents[2] -> backend
#     parents[3] -> <repo root>
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parents[3]
_MODULE_PATH = _REPO_ROOT / "scripts" / "launch-verification" / "record-migration-evidence.py"
_MODULE_NAME = "launch_verification_record_migration_evidence"


def _load_recorder():
    """Load ``record-migration-evidence.py`` under a legal alias (idempotent)."""
    if _MODULE_NAME in sys.modules:
        return sys.modules[_MODULE_NAME]
    assert _MODULE_PATH.is_file(), f"recorder script missing at {_MODULE_PATH}"
    spec = importlib.util.spec_from_file_location(_MODULE_NAME, _MODULE_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # Register before exec so re-import is a no-op and the module's own
    # sys.path inserts + sibling/backend imports resolve cleanly.
    sys.modules[_MODULE_NAME] = module
    spec.loader.exec_module(module)
    return module


recorder = _load_recorder()

# Convenience handles.
build_artifact = recorder.build_artifact
synthetic_inputs = recorder.synthetic_inputs
SYNTHETIC_SECRET = recorder.SYNTHETIC_SECRET
_staging_apply_check = recorder._staging_apply_check
_branch_first_check = recorder._branch_first_check
PASS = recorder.PASS
FAIL = recorder.FAIL
REDACTION_MARKER = recorder.REDACTION_MARKER

# The shared envelope helpers, loaded the same way the recorder loaded them.
from apps.common.launch_verification import evidence as evidence_mod  # noqa: E402


# A migration script identifier reused across the staging-apply cases.
_SCRIPT = "business_logic_densification.sql"


def _checks_by_id(artifact):
    """Return a ``{check_id: result}`` map for an artifact's checks."""
    return {c.id: c.result for c in artifact.checks}


# ===========================================================================
# R1.2 — staging apply: one migration_history row per applied script.
# ===========================================================================


def test_staging_apply_passes_with_one_row_per_script():
    """One migration_history entry per applied script ⇒ staging:apply passes."""
    history = [
        {"migration_name": _SCRIPT, "applied_at": "2026-06-20T08:40:00Z"},
        {"migration_name": "lenco_payment_integration.sql", "applied_at": "2026-06-20T08:41:00Z"},
    ]
    check = _staging_apply_check([_SCRIPT, "lenco_payment_integration.sql"], history)
    assert check["id"] == "staging:apply"
    assert check["result"] == PASS


def test_staging_apply_fails_with_missing_row():
    """A script with no corresponding migration_history row ⇒ staging:apply fails."""
    history = [{"migration_name": _SCRIPT, "applied_at": "2026-06-20T08:40:00Z"}]
    check = _staging_apply_check([_SCRIPT, "lenco_payment_integration.sql"], history)
    assert check["result"] == FAIL
    assert "no migration_history row" in check["detail"]


def test_staging_apply_fails_with_duplicate_row():
    """A script with two migration_history rows ⇒ staging:apply fails."""
    history = [
        {"migration_name": _SCRIPT, "applied_at": "2026-06-20T08:40:00Z"},
        {"migration_name": _SCRIPT, "applied_at": "2026-06-20T08:42:00Z"},
    ]
    check = _staging_apply_check([_SCRIPT], history)
    assert check["result"] == FAIL
    assert "multiple migration_history rows" in check["detail"]


def test_staging_apply_fails_with_no_scripts():
    """No applied scripts ⇒ staging:apply cannot pass (conservative)."""
    check = _staging_apply_check([], [])
    assert check["result"] == FAIL


def test_build_artifact_surfaces_staging_apply_pass():
    """The staging:apply check is wired through build_artifact for the happy path."""
    artifact = build_artifact(synthetic_inputs())
    results = _checks_by_id(artifact)
    assert results["staging:apply"] == PASS


def test_build_artifact_fails_when_staging_row_missing():
    """A missing migration_history row drives the whole artifact to failed."""
    inputs = copy.deepcopy(synthetic_inputs())
    inputs["staging"]["migration_history"] = []  # no rows for the declared script
    artifact = build_artifact(inputs)
    results = _checks_by_id(artifact)
    assert results["staging:apply"] == FAIL
    assert artifact.status == evidence_mod.EvidenceStatus.FAILED.value


# ===========================================================================
# R1.8 — branch-first posture for risky changes.
# ===========================================================================


def test_branch_first_passes_when_branch_first_true():
    """A risky change validated branch-first ⇒ neon:branch-first passes."""
    check = _branch_first_check(
        {"risky": True, "branch_first": True, "target": "branch:launch-2026"}
    )
    assert check is not None
    assert check["id"] == "neon:branch-first"
    assert check["result"] == PASS


def test_branch_first_fails_when_branch_first_false():
    """A risky change NOT validated branch-first ⇒ neon:branch-first fails."""
    check = _branch_first_check(
        {"risky": True, "branch_first": False, "target": "default"}
    )
    assert check is not None
    assert check["result"] == FAIL


def test_branch_first_omitted_for_non_risky_change():
    """A non-risky change omits the branch-first check entirely."""
    assert _branch_first_check({"risky": False}) is None


def test_build_artifact_fails_when_not_branch_first():
    """branch_first=False on a risky change drives the artifact to failed."""
    inputs = copy.deepcopy(synthetic_inputs())
    inputs["neon"]["branch_first"] = False
    inputs["neon"]["target"] = "default"
    artifact = build_artifact(inputs)
    results = _checks_by_id(artifact)
    assert results["neon:branch-first"] == FAIL
    assert artifact.status == evidence_mod.EvidenceStatus.FAILED.value


# ===========================================================================
# R1.9 — no secret value ever lands in the artifact (critical).
# ===========================================================================

_RAW_PHONE = "+260971234567"
_RAW_NRC = "123456/78/9"
_INLINE_PW = "sup3r-s3cret-pw"


def _inputs_with_embedded_secrets():
    """Synthetic inputs whose captured output embeds a secret + raw PII."""
    inputs = copy.deepcopy(synthetic_inputs())
    leak = (
        f"connecting via DATABASE_URL={SYNTHETIC_SECRET} ; "
        f"operator phone {_RAW_PHONE} ; applicant NRC {_RAW_NRC}"
    )
    inputs["neon"]["dry_run"]["output"] = "neon dry-run: " + leak
    inputs["staging"]["apply_output"] = "staging apply: " + leak
    inputs["validation"]["output"] = "validation SQL: " + leak
    inputs["production_apply"]["backup_output"] = "backup proof: " + leak
    return inputs


def test_built_artifact_contains_no_secret_values():
    """The serialized artifact contains none of the embedded secret values."""
    artifact = build_artifact(_inputs_with_embedded_secrets())
    serialized = json.dumps(evidence_mod.to_dict(artifact), ensure_ascii=False)

    # None of the secret/PII values may survive into the artifact.
    assert SYNTHETIC_SECRET not in serialized
    assert _INLINE_PW not in serialized
    assert _RAW_PHONE not in serialized
    assert _RAW_NRC not in serialized

    # And the redaction marker proves the captured output was actually scrubbed.
    assert REDACTION_MARKER in serialized


def test_synthetic_inputs_secret_is_redacted():
    """The recorder's own SYNTHETIC_SECRET is redacted out of the artifact."""
    artifact = build_artifact(synthetic_inputs())
    serialized = json.dumps(evidence_mod.to_dict(artifact), ensure_ascii=False)
    assert SYNTHETIC_SECRET not in serialized
    assert _INLINE_PW not in serialized
    # The synthetic backup/apply output also embeds a raw operator phone number.
    assert "+260971234567" not in serialized


# ===========================================================================
# Happy path + round-trip through the shared envelope.
# ===========================================================================


def test_build_artifact_synthetic_is_passing():
    """build_artifact(synthetic_inputs()) yields a passing artifact."""
    artifact = build_artifact(synthetic_inputs())
    assert artifact.status == evidence_mod.EvidenceStatus.PASSED.value
    assert artifact.gate_id == "migration-evidence"
    assert artifact.requirement == "R1"
    assert artifact.failures == []
    # Every check passed on the happy path.
    assert all(c.result == PASS for c in artifact.checks)


def test_build_artifact_round_trips_through_from_dict():
    """The artifact survives a to_dict → from_dict round-trip unchanged."""
    artifact = build_artifact(synthetic_inputs())
    payload = evidence_mod.to_dict(artifact)
    restored = evidence_mod.from_dict(payload)

    assert restored.gate_id == artifact.gate_id
    assert restored.requirement == artifact.requirement
    assert restored.status == artifact.status
    assert restored.generated_by == artifact.generated_by
    assert len(restored.checks) == len(artifact.checks)
    # Re-serializing the restored artifact reproduces the same dict.
    assert evidence_mod.to_dict(restored) == payload


if __name__ == "__main__":  # pragma: no cover - allow direct execution
    raise SystemExit(pytest.main([__file__, "-v"]))
