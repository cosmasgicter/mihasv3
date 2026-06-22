"""Unit tests for the Gate 9 operator-gated operational-readiness recorder.

# Feature: beanola-launch-verification — task 15.4

This drives the **integration/recording wrapper**
``scripts/launch-verification/check-operational-readiness.py`` over config
fixtures (no live production configuration is read). The wrapper is the thin
layer around the pure :mod:`operational_eval` core (task 15.1): it derives
present/absent indicators, builds the Gate 9 ``Evidence_Artifact``, and routes
the emitted envelope through the shared redaction helper.

The behaviour these tests pin down comes straight from Requirement 9:

* **R9.4 / R9.9 (critical secret-handling guarantee)** — credential checks
  record only the credential *name* plus a present/absent boolean, never the
  value. Even if a value sneaks into the supplied ``credentials`` map it is
  reduced to a bool and never lands in ``to_dict(artifact)`` / the serialized
  output, and each credential row carries ``{name, present}`` with no ``value``
  field.
* A failing fact set (``DEBUG`` on, a missing required credential) yields a
  ``failed`` artifact whose ``failures`` / ``failed_settings`` name the failing
  setting/credential **by name without its value** (R9.9).
* ``_derive_secret_key_indicators`` returns only ``(length, is_example)`` and
  never the key itself.

The checker filename is hyphenated, so the module is loaded via ``importlib``
(its module object is registered in ``sys.modules`` before ``exec_module`` so
its ``from __future__`` annotations and sibling imports resolve cleanly). The
checker is pure (it only touches ``operational_eval`` + the evidence/redaction
helpers here), so these tests run without a database — the repo conftest pulls
in Postgres-backed Django fixtures unavailable in some sandboxes, so the module
also exposes a ``__main__`` runner that drives every test function directly.

**Validates: Requirements 9.4, 9.9**
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path

# ---------------------------------------------------------------------------
# Load the hyphenated checker by file path.
#
# test file = backend/tests/unit/test_...py
#   parents[0]=unit [1]=tests [2]=backend [3]=<repo root>
# The pure core ``operational_eval`` is pre-loaded and registered under its
# plain name so the checker's top-level ``import operational_eval`` reuses it,
# and the backend dir is put on the path so the evidence/redaction imports
# resolve. We register the checker module in ``sys.modules`` before exec so its
# stringized annotations can resolve the module by name if needed.
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parents[3]
_LV_DIR = _REPO_ROOT / "scripts" / "launch-verification"
_BACKEND_DIR = _REPO_ROOT / "backend"
_OPERATIONAL_EVAL_PATH = _LV_DIR / "operational_eval.py"
_CHECKER_PATH = _LV_DIR / "check-operational-readiness.py"


def _load_by_path(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec and spec.loader, f"cannot build import spec for {path}"
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module  # register before exec (sibling/annotation resolution)
    spec.loader.exec_module(module)
    return module


def _load_checker():
    for directory in (_LV_DIR, _BACKEND_DIR):
        as_str = str(directory)
        if as_str not in sys.path:
            sys.path.insert(0, as_str)
    # Pre-load the pure core under the plain name the checker imports.
    if "operational_eval" not in sys.modules:
        _load_by_path("operational_eval", _OPERATIONAL_EVAL_PATH)
    return _load_by_path("check_operational_readiness", _CHECKER_PATH)


_checker = _load_checker()

build_artifact = _checker.build_artifact
synthetic_facts = _checker.synthetic_facts
facts_from_inputs = _checker.facts_from_inputs
write_artifact = _checker.write_artifact
_derive_secret_key_indicators = _checker._derive_secret_key_indicators
_CREDENTIAL_SETTINGS = _checker._CREDENTIAL_SETTINGS
_required_credential_names = _checker._required_credential_names

# Evidence envelope helpers (the wrapper builds an EvidenceArtifact).
from apps.common.launch_verification.evidence import (  # noqa: E402
    EvidenceArtifact,
    from_dict,
    to_dict,
    to_json,
)
# A fake credential value that must NEVER appear in any recorded artifact.
# Keep it deliberately non-provider-shaped so repository push protection does
# not classify the test fixture itself as a live secret.
FAKE_SECRET = "redaction-fixture-secret-value-0987654321-abcdef"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _credential_rows(artifact: EvidenceArtifact):
    """Return the credential check rows (as flat dicts) from an artifact."""
    return [
        c.to_dict()
        for c in artifact.checks
        if c.id.startswith("operational:credential:")
    ]


# ---------------------------------------------------------------------------
# R9.4 / R9.9 — present/absent only, NEVER the value.
# ---------------------------------------------------------------------------


def test_credential_rows_record_name_and_present_only_never_value():
    """Each credential row carries {name, present} and no value field (R9.4)."""
    facts, _ = synthetic_facts()
    # Build a credentials map whose VALUES would be present. We deliberately
    # smuggle a real-looking secret STRING in as a "present" value to prove the
    # wrapper reduces it to a bool and never records the value.
    credentials = {name: True for name, _env, _req in _CREDENTIAL_SETTINGS}
    credentials["LENCO_API_SECRET_KEY"] = FAKE_SECRET  # truthy string, not a bool

    artifact, _passed = build_artifact(
        facts, credentials, source_label="unit-fixture"
    )

    rows = _credential_rows(artifact)
    assert rows, "expected one credential check row per credential"
    assert len(rows) == len(credentials)

    for row in rows:
        # Only a NAME + a present/absent boolean indicator — never a value.
        assert "name" in row
        assert "present" in row
        assert isinstance(row["present"], bool)
        assert "value" not in row
        assert "secret" not in row
        # The smuggled secret string was reduced to a boolean.
        assert row["present"] is True or row["present"] is False
        # observed is the non-secret indicator word only.
        assert row["observed"] in ("present", "absent")


def test_fake_secret_value_never_appears_in_serialized_artifact():
    """A planted secret value appears nowhere in to_dict/JSON output (R9.4/R9.9)."""
    facts, _ = synthetic_facts()
    credentials = {name: True for name, _env, _req in _CREDENTIAL_SETTINGS}
    # Plant the fake secret as a credential map value.
    credentials["AWS_S3_SECRET_ACCESS_KEY"] = FAKE_SECRET

    artifact, _passed = build_artifact(
        facts, credentials, source_label="unit-fixture"
    )

    as_dict = to_dict(artifact)
    as_json = to_json(artifact)

    assert FAKE_SECRET not in json.dumps(as_dict)
    assert FAKE_SECRET not in as_json
    # The credential NAME is still recorded (present/absent transparency).
    assert "AWS_S3_SECRET_ACCESS_KEY" in as_json


def test_write_artifact_output_is_redacted_and_value_free(tmp_path=None):
    """The written evidence file routes through redaction and holds no value."""
    base = Path(tmp_path) if tmp_path else Path(tempfile.mkdtemp())
    facts, _ = synthetic_facts()
    credentials = {name: True for name, _env, _req in _CREDENTIAL_SETTINGS}
    credentials["RESEND_API_KEY"] = FAKE_SECRET

    artifact, _passed = build_artifact(
        facts, credentials, source_label="unit-fixture"
    )
    out_path = base / "operational-evidence.json"
    write_artifact(artifact, out_path)

    written = out_path.read_text(encoding="utf-8")
    assert FAKE_SECRET not in written
    # The file is valid JSON and re-parses into a well-formed artifact.
    reparsed = from_dict(json.loads(written))
    assert reparsed.gate_id == artifact.gate_id


# ---------------------------------------------------------------------------
# Passing synthetic fixture → status passed + round-trips through from_dict.
# ---------------------------------------------------------------------------


def test_synthetic_facts_build_passing_artifact_that_round_trips():
    """build_artifact(synthetic_facts()) passes and round-trips (envelope)."""
    facts, credentials = synthetic_facts()
    artifact, passed = build_artifact(
        facts, credentials, source_label="synthetic dry-run"
    )

    assert passed is True
    assert artifact.status == "passed"
    assert artifact.gate_id == "operational-readiness"
    assert artifact.requirement == "R9"
    assert artifact.failures == []

    # Every required credential is recorded present in the synthetic fixture.
    rows = _credential_rows(artifact)
    required = _required_credential_names()
    by_name = {r["name"]: r for r in rows}
    for name in required:
        assert by_name[name]["present"] is True
        assert by_name[name]["result"] == "pass"

    # Round-trip through the shared envelope (de)serializer.
    round_tripped = from_dict(to_dict(artifact))
    assert round_tripped.status == "passed"
    assert round_tripped.gate_id == artifact.gate_id
    assert len(round_tripped.checks) == len(artifact.checks)


# ---------------------------------------------------------------------------
# Failing fixture → status failed; failures name settings/creds without value.
# ---------------------------------------------------------------------------


def test_failing_facts_name_failures_by_name_without_value():
    """DEBUG on + a missing required credential → failed, named without value (R9.9)."""
    facts, credentials = synthetic_facts()
    # Break two independent rules:
    facts["debug"] = True  # R9.1 — DEBUG must be off.
    # Drop a required credential to absent.
    credentials = dict(credentials)
    credentials["LENCO_API_SECRET_KEY"] = False

    artifact, passed = build_artifact(
        facts, credentials, source_label="unit-fixture"
    )

    assert passed is False
    assert artifact.status == "failed"
    assert artifact.failures, "failed artifact must list its failures"

    # The failing DEBUG setting is named by its setting name.
    setting_failures = [
        f for f in artifact.failures if f.get("type") == "setting"
    ]
    assert any(f["name"] == "DEBUG" for f in setting_failures)

    # The absent required credential is named, typed credential-absent.
    cred_failures = [
        f for f in artifact.failures if f.get("type") == "credential-absent"
    ]
    assert any(f["name"] == "LENCO_API_SECRET_KEY" for f in cred_failures)

    # Every failure entry is a name-only record — no value/secret leaks.
    for failure in artifact.failures:
        assert set(failure.keys()) <= {"type", "name"}
        assert "value" not in failure
        # Names are short identifiers, never a credential value.
        assert FAKE_SECRET not in json.dumps(failure)

    # The absent credential row records absent, not its value.
    by_name = {r["name"]: r for r in _credential_rows(artifact)}
    assert by_name["LENCO_API_SECRET_KEY"]["present"] is False
    assert by_name["LENCO_API_SECRET_KEY"]["observed"] == "absent"
    assert by_name["LENCO_API_SECRET_KEY"]["result"] == "fail"


def test_optional_credential_absent_does_not_fail_gate():
    """An absent *optional* credential is recorded absent but does not fail."""
    facts, credentials = synthetic_facts()
    credentials = dict(credentials)
    # GLITCHTIP_DSN is optional (required=False) in the catalogue.
    credentials["GLITCHTIP_DSN"] = False

    artifact, passed = build_artifact(
        facts, credentials, source_label="unit-fixture"
    )

    assert passed is True
    assert artifact.status == "passed"
    by_name = {r["name"]: r for r in _credential_rows(artifact)}
    assert by_name["GLITCHTIP_DSN"]["present"] is False
    # Optional + absent still passes its own row.
    assert by_name["GLITCHTIP_DSN"]["result"] == "pass"


# ---------------------------------------------------------------------------
# _derive_secret_key_indicators — only (length, is_example), never the key.
# ---------------------------------------------------------------------------


def test_derive_secret_key_indicators_returns_only_length_and_is_example():
    """A real-looking key reduces to (length, is_example=False); key not retained."""
    length, is_example = _derive_secret_key_indicators(FAKE_SECRET)
    assert length == len(FAKE_SECRET)
    assert is_example is False
    # The returned tuple holds exactly two non-secret indicators.
    result = (length, is_example)
    assert len(result) == 2
    assert FAKE_SECRET not in [str(x) for x in result]
    assert isinstance(length, int)
    assert isinstance(is_example, bool)


def test_derive_secret_key_indicators_flags_example_value():
    """A tracked example/placeholder value is flagged is_example=True."""
    example = "insecure-dev-key-change-me-do-not-use-in-prod"
    length, is_example = _derive_secret_key_indicators(example)
    assert length == len(example)
    assert is_example is True


def test_derive_secret_key_indicators_handles_missing_key():
    """A missing/non-string key yields (None, True) — conservative + value-free."""
    assert _derive_secret_key_indicators(None) == (None, True)
    assert _derive_secret_key_indicators("") == (None, True)
    assert _derive_secret_key_indicators(12345) == (None, True)


# ---------------------------------------------------------------------------
# facts_from_inputs coerces any supplied credential value to a bool.
# ---------------------------------------------------------------------------


def test_facts_from_inputs_coerces_credential_values_to_bool():
    """An operator inputs file with a credential VALUE is coerced to present-bool."""
    base = Path(tempfile.mkdtemp())
    inputs_path = base / "derived-facts.json"
    inputs_path.write_text(
        json.dumps(
            {
                "facts": {"debug": False},
                # A misbehaving inputs file that put a value here must not leak.
                "credentials": {"LENCO_API_SECRET_KEY": FAKE_SECRET},
            }
        ),
        encoding="utf-8",
    )

    facts, credentials = facts_from_inputs(inputs_path)
    assert facts["debug"] is False
    assert "credentials" not in facts
    # The value was coerced to a present boolean — never retained as a string.
    assert credentials["LENCO_API_SECRET_KEY"] is True
    assert isinstance(credentials["LENCO_API_SECRET_KEY"], bool)


# ---------------------------------------------------------------------------
# Standalone runner — drive every test directly without pytest collection (the
# repo conftest pulls in Postgres-backed Django fixtures unavailable in some
# sandboxes).
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    _tests = [
        test_credential_rows_record_name_and_present_only_never_value,
        test_fake_secret_value_never_appears_in_serialized_artifact,
        test_write_artifact_output_is_redacted_and_value_free,
        test_synthetic_facts_build_passing_artifact_that_round_trips,
        test_failing_facts_name_failures_by_name_without_value,
        test_optional_credential_absent_does_not_fail_gate,
        test_derive_secret_key_indicators_returns_only_length_and_is_example,
        test_derive_secret_key_indicators_flags_example_value,
        test_derive_secret_key_indicators_handles_missing_key,
        test_facts_from_inputs_coerces_credential_values_to_bool,
    ]
    for _t in _tests:
        _t()
        print(f"PASS  {_t.__name__}")
    print(f"\nAll {len(_tests)} operational-checker unit tests passed.")
