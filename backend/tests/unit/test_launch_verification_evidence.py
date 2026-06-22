"""Unit tests — launch-verification shared Evidence_Artifact envelope.

Spec: ``beanola-launch-verification`` (task 1.1, Requirement 12.6).

Verifies:
   - the closed-enum validation for ``status``, ``generated_by``, and check ``result``
   - construction defaults (``generated_at`` auto-filled; empty collections)
   - a full serialize -> deserialize round-trip is lossless
   - gate-specific check fields survive a round-trip verbatim
   - malformed JSON and missing required fields raise ``EvidenceArtifactError``
"""

import json

import pytest

from apps.common.launch_verification.evidence import (
    CheckResult,
    EvidenceArtifact,
    EvidenceArtifactError,
    EvidenceCheck,
    EvidenceStatus,
    GeneratedBy,
    RollupGate,
    RollupStatus,
    Verdict,
    from_dict,
    from_json,
    rollup_from_dict,
    rollup_from_json,
    rollup_to_dict,
    rollup_to_json,
    to_dict,
    to_json,
    utc_now_iso,
)


def _sample_artifact() -> EvidenceArtifact:
    return EvidenceArtifact(
        gate_id="bundle-guard",
        requirement="R5",
        status=EvidenceStatus.PASSED,
        generated_by=GeneratedBy.CI,
        summary="Entry path 94.4 KB gz; no forbidden chunks.",
        checks=[
            EvidenceCheck(
                id="entry-gz-budget",
                result=CheckResult.PASS,
                observed="94.4 KB",
                threshold="150 KB",
            ),
            # A check carrying gate-specific fields (bundle gate payload).
            EvidenceCheck(
                id="forbidden-chunks",
                result="pass",
                fields={"entry_gz_bytes": 96665, "forbidden_present": []},
            ),
        ],
        assets=["bundle-report.txt"],
    )


def test_status_is_a_closed_enum():
    assert [s.value for s in EvidenceStatus] == ["passed", "failed", "unknown"]


def test_generated_by_is_a_closed_enum():
    assert [g.value for g in GeneratedBy] == ["ci", "operator", "deployed-target"]


def test_check_result_is_a_closed_enum():
    assert [r.value for r in CheckResult] == ["pass", "fail", "not-measured"]


def test_utc_now_iso_is_second_precision_zulu():
    stamp = utc_now_iso()
    assert stamp.endswith("Z")
    assert "." not in stamp  # second precision, no microseconds
    assert len(stamp) == len("2026-06-20T09:15:00Z")


def test_construction_defaults_generated_at_and_collections():
    artifact = EvidenceArtifact(
        gate_id="scope-gate",
        requirement="R11",
        status="passed",
        generated_by="ci",
    )
    assert artifact.generated_at  # auto-filled
    assert artifact.generated_at.endswith("Z")
    assert artifact.checks == []
    assert artifact.assets == []
    assert artifact.failures == []


def test_string_enum_values_are_accepted_on_construction():
    artifact = EvidenceArtifact(
        gate_id="smoke",
        requirement="R2",
        status="failed",
        generated_by="deployed-target",
    )
    assert artifact.status == "failed"
    assert artifact.generated_by == "deployed-target"


@pytest.mark.parametrize("bad_status", ["pass", "PASSED", "ok", "", None, "ready"])
def test_invalid_status_raises(bad_status):
    with pytest.raises(EvidenceArtifactError):
        EvidenceArtifact(
            gate_id="g",
            requirement="R1",
            status=bad_status,
            generated_by="ci",
        )


@pytest.mark.parametrize("bad_by", ["robot", "human", "", None])
def test_invalid_generated_by_raises(bad_by):
    with pytest.raises(EvidenceArtifactError):
        EvidenceArtifact(
            gate_id="g",
            requirement="R1",
            status="passed",
            generated_by=bad_by,
        )


@pytest.mark.parametrize("bad_result", ["passed", "ok", "skipped", "", None])
def test_invalid_check_result_raises(bad_result):
    with pytest.raises(EvidenceArtifactError):
        EvidenceCheck(id="c", result=bad_result)


def test_missing_gate_id_or_requirement_raises():
    with pytest.raises(EvidenceArtifactError):
        EvidenceArtifact(gate_id="", requirement="R1", status="passed", generated_by="ci")
    with pytest.raises(EvidenceArtifactError):
        EvidenceArtifact(gate_id="g", requirement="", status="passed", generated_by="ci")


def test_to_dict_shape_matches_envelope():
    data = to_dict(_sample_artifact())
    assert set(data) == {
        "gate_id",
        "requirement",
        "status",
        "generated_at",
        "generated_by",
        "summary",
        "checks",
        "assets",
        "failures",
    }
    assert data["status"] == "passed"
    assert data["checks"][0]["id"] == "entry-gz-budget"


def test_round_trip_is_lossless():
    original = _sample_artifact()
    restored = from_json(to_json(original))
    assert to_dict(restored) == to_dict(original)


def test_gate_specific_check_fields_survive_round_trip():
    restored = from_json(to_json(_sample_artifact()))
    forbidden_check = restored.checks[1]
    assert forbidden_check.fields["entry_gz_bytes"] == 96665
    assert forbidden_check.fields["forbidden_present"] == []
    # And they are flattened to the top level on serialize.
    flat = forbidden_check.to_dict()
    assert flat["entry_gz_bytes"] == 96665
    assert "fields" not in flat


def test_gate_specific_fields_never_overwrite_common_columns():
    # If a gate-specific field collides with a common column, the common column wins.
    check = EvidenceCheck(
        id="c",
        result="pass",
        observed="real",
        fields={"observed": "spoofed", "custom": 1},
    )
    flat = check.to_dict()
    assert flat["observed"] == "real"
    assert flat["custom"] == 1


def test_from_dict_requires_core_fields():
    with pytest.raises(EvidenceArtifactError):
        from_dict({"requirement": "R5", "status": "passed", "generated_by": "ci"})


def test_from_json_rejects_malformed_json():
    with pytest.raises(EvidenceArtifactError):
        from_json("{not valid json")


def test_from_json_rejects_non_object_json():
    with pytest.raises(EvidenceArtifactError):
        from_json(json.dumps([1, 2, 3]))


def test_to_json_is_parseable_and_ordered():
    text = to_json(_sample_artifact())
    parsed = json.loads(text)
    assert parsed["gate_id"] == "bundle-guard"
    assert parsed["requirement"] == "R5"


# ---------------------------------------------------------------------------
# Gate 12 rollup status schema (task 1.4 / Requirement 12.1)
# ---------------------------------------------------------------------------


def _sample_rollup() -> RollupStatus:
    return RollupStatus(
        verdict=Verdict.NOT_READY,
        gates=[
            RollupGate(
                gate_id="migration-evidence",
                requirement="R1",
                status=EvidenceStatus.PASSED,
                artifact="01-migration/migration-evidence.json",
                artifact_readable=True,
            ),
            RollupGate(
                gate_id="performance",
                requirement="R3",
                status="unknown",
                artifact="03-performance/performance-evidence.json",
                artifact_readable=False,
            ),
        ],
        not_passed=["performance"],
        missing_or_unreadable=["performance"],
    )


def test_verdict_is_a_closed_enum():
    assert [v.value for v in Verdict] == [
        "production-launch-ready",
        "not-production-launch-ready",
    ]


@pytest.mark.parametrize(
    "bad_verdict",
    ["ready", "launch-ready", "PRODUCTION-LAUNCH-READY", "passed", "", None],
)
def test_invalid_verdict_raises(bad_verdict):
    with pytest.raises(EvidenceArtifactError):
        RollupStatus(verdict=bad_verdict)


def test_verdict_string_value_is_accepted():
    rollup = RollupStatus(verdict="production-launch-ready")
    assert rollup.verdict == "production-launch-ready"


def test_rollup_defaults_generated_at_and_collections():
    rollup = RollupStatus(verdict=Verdict.READY)
    assert rollup.generated_at.endswith("Z")
    assert rollup.gates == []
    assert rollup.not_passed == []
    assert rollup.missing_or_unreadable == []


def test_rollup_gate_validates_status_enum():
    with pytest.raises(EvidenceArtifactError):
        RollupGate(
            gate_id="g",
            requirement="R1",
            status="ready",  # not a valid EvidenceStatus
            artifact="x.json",
        )


def test_rollup_gate_requires_identity_fields():
    with pytest.raises(EvidenceArtifactError):
        RollupGate(gate_id="", requirement="R1", status="passed", artifact="x.json")
    with pytest.raises(EvidenceArtifactError):
        RollupGate(gate_id="g", requirement="", status="passed", artifact="x.json")


def test_rollup_to_dict_shape_matches_design():
    data = rollup_to_dict(_sample_rollup())
    assert set(data) == {
        "verdict",
        "generated_at",
        "gates",
        "not_passed",
        "missing_or_unreadable",
    }
    assert data["verdict"] == "not-production-launch-ready"
    gate = data["gates"][0]
    assert set(gate) == {
        "gate_id",
        "requirement",
        "status",
        "artifact",
        "artifact_readable",
    }
    assert gate["gate_id"] == "migration-evidence"
    assert gate["artifact_readable"] is True


def test_rollup_round_trip_is_lossless():
    original = _sample_rollup()
    restored = rollup_from_json(rollup_to_json(original))
    assert rollup_to_dict(restored) == rollup_to_dict(original)


def test_rollup_method_and_module_helpers_agree():
    rollup = _sample_rollup()
    assert rollup.to_dict() == rollup_to_dict(rollup)
    assert rollup.to_json() == rollup_to_json(rollup)
    assert rollup_from_dict(rollup.to_dict()).to_dict() == rollup.to_dict()


def test_rollup_accepts_plain_dict_gate_rows():
    rollup = RollupStatus(
        verdict="not-production-launch-ready",
        gates=[
            {
                "gate_id": "scope",
                "requirement": "R11",
                "status": "passed",
                "artifact": "11-scope/scope-evidence.json",
                "artifact_readable": True,
            }
        ],
    )
    assert isinstance(rollup.gates[0], RollupGate)
    assert rollup.gates[0].gate_id == "scope"


def test_rollup_from_dict_requires_verdict():
    with pytest.raises(EvidenceArtifactError):
        rollup_from_dict({"gates": [], "not_passed": []})


def test_rollup_from_json_rejects_malformed_json():
    with pytest.raises(EvidenceArtifactError):
        rollup_from_json("{not valid json")


def test_rollup_from_json_rejects_non_object_json():
    with pytest.raises(EvidenceArtifactError):
        rollup_from_json(json.dumps([1, 2, 3]))


def test_rollup_gate_from_dict_requires_core_fields():
    with pytest.raises(EvidenceArtifactError):
        RollupGate.from_dict({"requirement": "R1", "status": "passed"})


def test_rollup_to_json_is_parseable_and_ordered():
    parsed = json.loads(rollup_to_json(_sample_rollup()))
    assert parsed["verdict"] == "not-production-launch-ready"
    assert parsed["gates"][1]["status"] == "unknown"
    assert parsed["missing_or_unreadable"] == ["performance"]
