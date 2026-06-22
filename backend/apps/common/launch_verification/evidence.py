"""The shared ``Evidence_Artifact`` envelope and JSON (de)serialize helpers.

This module defines the **single common envelope** that all eleven launch
gates emit and that the Gate 12 rollup aggregator reads. It is a **pure** value
layer — no Django ORM, no I/O beyond explicit (de)serialize helpers, no settings
or network access — so it stays trivially importable from CI scripts, operator
scripts, and tests alike.

The envelope shape (from the design "Data Models" section)::

    {
      "gate_id":      "bundle-guard",          // stable slug, one per gate
      "requirement":  "R5",                    // requirement this gate satisfies
      "status":       "passed",                // "passed" | "failed" | "unknown"
      "generated_at": "2026-06-20T09:15:00Z",  // ISO-8601 UTC
      "generated_by": "ci",                    // "ci" | "operator" | "deployed-target"
      "summary":      "Entry path 94.4 KB gz; no forbidden chunks.",
      "checks":       [ { "id": ..., "result": "pass", ... } ],
      "assets":       ["bundle-report.txt"],   // relative to the gate dir
      "failures":     []                        // populated when status != "passed"
    }

``status`` is a **closed enum**. The absence of an artifact, an unparseable
artifact, or ``status: "unknown"`` are all treated identically by the rollup as
*not passed* (that conservative handling lives in the rollup, task 2.1). Per-check
rows carry the common ``id``/``result``/``observed``/``threshold``/``detail``
fields plus any gate-specific fields, which are preserved verbatim through a
round-trip so each gate can record its own representative payload without a
bespoke schema.

No artifact ever stores a secret value: credential checks record
``{ "name": "LENCO_API_SECRET_KEY", "present": true }`` and never a value
(enforced by the redaction helper, task 1.2 / Property 16).

**Validates: Requirements 12.6**
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Mapping

__all__ = [
    "EvidenceStatus",
    "GeneratedBy",
    "CheckResult",
    "EvidenceCheck",
    "EvidenceArtifact",
    "EvidenceArtifactError",
    "utc_now_iso",
    "to_dict",
    "to_json",
    "from_dict",
    "from_json",
    # Gate 12 rollup status schema (task 1.4 / Requirement 12.1)
    "Verdict",
    "RollupGate",
    "RollupStatus",
    "rollup_to_dict",
    "rollup_to_json",
    "rollup_from_dict",
    "rollup_from_json",
]


class EvidenceArtifactError(ValueError):
    """Raised when an artifact (or one of its parts) violates the envelope contract."""


class EvidenceStatus(str, Enum):
    """The closed set of gate-level statuses (design: ``status`` enum)."""

    PASSED = "passed"
    FAILED = "failed"
    UNKNOWN = "unknown"


class GeneratedBy(str, Enum):
    """Who/what produced the artifact — mirrors the gate execution-world taxonomy."""

    CI = "ci"
    OPERATOR = "operator"
    DEPLOYED_TARGET = "deployed-target"


class CheckResult(str, Enum):
    """The closed set of per-check results (design: ``checks[].result``)."""

    PASS = "pass"
    FAIL = "fail"
    NOT_MEASURED = "not-measured"


# The named (common) fields every check row carries. Any other keys a gate
# supplies are gate-specific and preserved verbatim under ``EvidenceCheck.fields``.
_CHECK_COMMON_KEYS = ("id", "result", "observed", "threshold", "detail")


def utc_now_iso() -> str:
    """Return the current UTC time as a second-precision ISO-8601 ``...Z`` string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _coerce_status(value: Any) -> str:
    """Validate ``value`` against :class:`EvidenceStatus` and return its string form."""
    if isinstance(value, EvidenceStatus):
        return value.value
    try:
        return EvidenceStatus(value).value
    except ValueError as exc:
        allowed = ", ".join(s.value for s in EvidenceStatus)
        raise EvidenceArtifactError(
            f"invalid status {value!r}; must be one of: {allowed}"
        ) from exc


def _coerce_generated_by(value: Any) -> str:
    """Validate ``value`` against :class:`GeneratedBy` and return its string form."""
    if isinstance(value, GeneratedBy):
        return value.value
    try:
        return GeneratedBy(value).value
    except ValueError as exc:
        allowed = ", ".join(g.value for g in GeneratedBy)
        raise EvidenceArtifactError(
            f"invalid generated_by {value!r}; must be one of: {allowed}"
        ) from exc


def _coerce_check_result(value: Any) -> str:
    """Validate ``value`` against :class:`CheckResult` and return its string form."""
    if isinstance(value, CheckResult):
        return value.value
    try:
        return CheckResult(value).value
    except ValueError as exc:
        allowed = ", ".join(r.value for r in CheckResult)
        raise EvidenceArtifactError(
            f"invalid check result {value!r}; must be one of: {allowed}"
        ) from exc


@dataclass
class EvidenceCheck:
    """A single per-check row inside an artifact's ``checks[]`` list.

    The common columns (``id``, ``result``, ``observed``, ``threshold``,
    ``detail``) are typed first-class; any gate-specific columns (e.g. the bundle
    gate's ``entry_gz_bytes`` or the operational gate's ``name``/``present``) are
    carried in :attr:`fields` and flattened back to the top level on serialize.
    """

    id: str
    result: str
    observed: str = ""
    threshold: str = ""
    detail: str = ""
    fields: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        # Normalize/validate the closed-enum result up front so a malformed
        # check can never reach an artifact.
        self.result = _coerce_check_result(self.result)

    def to_dict(self) -> Dict[str, Any]:
        """Return the flat dict form: common keys first, then gate-specific fields."""
        data: Dict[str, Any] = {
            "id": self.id,
            "result": self.result,
            "observed": self.observed,
            "threshold": self.threshold,
            "detail": self.detail,
        }
        # Gate-specific fields never overwrite the common columns.
        for key, value in self.fields.items():
            if key not in _CHECK_COMMON_KEYS:
                data[key] = value
        return data

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "EvidenceCheck":
        """Build a check from a flat dict, routing unknown keys into :attr:`fields`."""
        if not isinstance(data, Mapping):
            raise EvidenceArtifactError(
                f"check must be an object, got {type(data).__name__}"
            )
        if "id" not in data or "result" not in data:
            raise EvidenceArtifactError("check requires 'id' and 'result'")
        extra = {k: v for k, v in data.items() if k not in _CHECK_COMMON_KEYS}
        return cls(
            id=str(data["id"]),
            result=data["result"],
            observed=str(data.get("observed", "")),
            threshold=str(data.get("threshold", "")),
            detail=str(data.get("detail", "")),
            fields=extra,
        )


@dataclass
class EvidenceArtifact:
    """The common evidence envelope emitted by every launch gate.

    ``status`` and ``generated_by`` are validated against their closed enums on
    construction so an out-of-contract artifact cannot be created. ``generated_at``
    defaults to the current UTC instant when omitted.
    """

    gate_id: str
    requirement: str
    status: str
    generated_by: str
    generated_at: str = ""
    summary: str = ""
    checks: List[EvidenceCheck] = field(default_factory=list)
    assets: List[str] = field(default_factory=list)
    failures: List[Any] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.gate_id:
            raise EvidenceArtifactError("gate_id is required")
        if not self.requirement:
            raise EvidenceArtifactError("requirement is required")
        self.status = _coerce_status(self.status)
        self.generated_by = _coerce_generated_by(self.generated_by)
        if not self.generated_at:
            self.generated_at = utc_now_iso()
        # Allow callers to pass plain dicts for checks for ergonomics.
        self.checks = [
            c if isinstance(c, EvidenceCheck) else EvidenceCheck.from_dict(c)
            for c in self.checks
        ]


def to_dict(artifact: EvidenceArtifact) -> Dict[str, Any]:
    """Serialize an :class:`EvidenceArtifact` to a plain JSON-ready dict."""
    if not isinstance(artifact, EvidenceArtifact):
        raise EvidenceArtifactError(
            f"expected EvidenceArtifact, got {type(artifact).__name__}"
        )
    return {
        "gate_id": artifact.gate_id,
        "requirement": artifact.requirement,
        "status": artifact.status,
        "generated_at": artifact.generated_at,
        "generated_by": artifact.generated_by,
        "summary": artifact.summary,
        "checks": [c.to_dict() for c in artifact.checks],
        "assets": list(artifact.assets),
        "failures": list(artifact.failures),
    }


def to_json(artifact: EvidenceArtifact, *, indent: int = 2) -> str:
    """Serialize an artifact to a stable, human-reviewable JSON string."""
    return json.dumps(to_dict(artifact), indent=indent, sort_keys=False, ensure_ascii=False)


def from_dict(data: Mapping[str, Any]) -> EvidenceArtifact:
    """Build an :class:`EvidenceArtifact` from a parsed dict, validating the envelope."""
    if not isinstance(data, Mapping):
        raise EvidenceArtifactError(
            f"artifact must be an object, got {type(data).__name__}"
        )
    for required in ("gate_id", "requirement", "status", "generated_by"):
        if required not in data:
            raise EvidenceArtifactError(f"artifact missing required field {required!r}")
    raw_checks = data.get("checks", []) or []
    if not isinstance(raw_checks, list):
        raise EvidenceArtifactError("'checks' must be a list")
    return EvidenceArtifact(
        gate_id=str(data["gate_id"]),
        requirement=str(data["requirement"]),
        status=data["status"],
        generated_by=data["generated_by"],
        generated_at=str(data.get("generated_at", "")),
        summary=str(data.get("summary", "")),
        checks=[EvidenceCheck.from_dict(c) for c in raw_checks],
        assets=list(data.get("assets", []) or []),
        failures=list(data.get("failures", []) or []),
    )


def from_json(text: str) -> EvidenceArtifact:
    """Parse a JSON string into an :class:`EvidenceArtifact`, validating the envelope.

    Raises :class:`EvidenceArtifactError` on malformed JSON so callers (notably the
    rollup) can treat an unparseable artifact as *not passed* by catching one type.
    """
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise EvidenceArtifactError(f"artifact is not valid JSON: {exc}") from exc
    return from_dict(parsed)


# ---------------------------------------------------------------------------
# Gate 12 — rollup status schema (task 1.4 / Requirement 12.1)
# ---------------------------------------------------------------------------
#
# The rollup status object is the single launch verdict the Gate 12 aggregator
# (task 2.1, ``scripts/launch-verification/rollup.py``) emits after reading all
# eleven gate artifacts. This module defines only the **schema** — the value
# shape and its (de)serialize helpers — exactly as the design "Data Models" ->
# "Rollup status object" section specifies::
#
#     {
#       "verdict": "not-production-launch-ready",  // closed enum, exactly two
#       "generated_at": "2026-06-20T10:00:00Z",
#       "gates": [
#         { "gate_id": "migration-evidence", "requirement": "R1",
#           "status": "passed", "artifact": "01-migration/migration-evidence.json",
#           "artifact_readable": true }
#         // ... all 11 gates ...
#       ],
#       "not_passed": ["performance"],             // every gate blocking the verdict
#       "missing_or_unreadable": ["performance"]   // subset absent/unreadable
#     }
#
# The *aggregation rule* (verdict is ``production-launch-ready`` iff every gate
# passed and every artifact is readable) is the rollup aggregator's job; this
# layer only validates and round-trips the recorded value, keeping it a pure,
# trivially importable schema like the rest of this module.


class Verdict(str, Enum):
    """The closed set of launch verdicts (design: rollup ``verdict`` enum)."""

    READY = "production-launch-ready"
    NOT_READY = "not-production-launch-ready"


def _coerce_verdict(value: Any) -> str:
    """Validate ``value`` against :class:`Verdict` and return its string form."""
    if isinstance(value, Verdict):
        return value.value
    try:
        return Verdict(value).value
    except ValueError as exc:
        allowed = ", ".join(v.value for v in Verdict)
        raise EvidenceArtifactError(
            f"invalid verdict {value!r}; must be one of: {allowed}"
        ) from exc


@dataclass
class RollupGate:
    """A single gate row inside the rollup's ``gates[]`` list.

    Carries the gate's identity (``gate_id``/``requirement``), its recorded
    ``status`` (validated against the same closed :class:`EvidenceStatus` enum as
    an artifact), the relative ``artifact`` path under ``docs/launch-evidence/``,
    and a filesystem ``artifact_readable`` probe result.
    """

    gate_id: str
    requirement: str
    status: str
    artifact: str
    artifact_readable: bool = False

    def __post_init__(self) -> None:
        if not self.gate_id:
            raise EvidenceArtifactError("gate_id is required")
        if not self.requirement:
            raise EvidenceArtifactError("requirement is required")
        self.status = _coerce_status(self.status)
        self.artifact_readable = bool(self.artifact_readable)

    def to_dict(self) -> Dict[str, Any]:
        """Return the flat dict form matching the rollup ``gates[]`` shape."""
        return {
            "gate_id": self.gate_id,
            "requirement": self.requirement,
            "status": self.status,
            "artifact": self.artifact,
            "artifact_readable": self.artifact_readable,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "RollupGate":
        """Build a gate row from a flat dict, validating the closed-enum status."""
        if not isinstance(data, Mapping):
            raise EvidenceArtifactError(
                f"rollup gate must be an object, got {type(data).__name__}"
            )
        for required in ("gate_id", "requirement", "status"):
            if required not in data:
                raise EvidenceArtifactError(
                    f"rollup gate missing required field {required!r}"
                )
        return cls(
            gate_id=str(data["gate_id"]),
            requirement=str(data["requirement"]),
            status=data["status"],
            artifact=str(data.get("artifact", "")),
            artifact_readable=bool(data.get("artifact_readable", False)),
        )


@dataclass
class RollupStatus:
    """The single launch verdict produced by the Gate 12 rollup aggregator.

    ``verdict`` is validated against the closed :class:`Verdict` enum on
    construction so an out-of-contract rollup cannot be created. ``generated_at``
    defaults to the current UTC instant when omitted. ``gates`` enumerates all
    eleven gates; ``not_passed`` lists every gate blocking the verdict, and
    ``missing_or_unreadable`` is the subset whose artifact was absent/unreadable.
    """

    verdict: str
    generated_at: str = ""
    gates: List[RollupGate] = field(default_factory=list)
    not_passed: List[str] = field(default_factory=list)
    missing_or_unreadable: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.verdict = _coerce_verdict(self.verdict)
        if not self.generated_at:
            self.generated_at = utc_now_iso()
        # Allow callers to pass plain dicts for gate rows for ergonomics.
        self.gates = [
            g if isinstance(g, RollupGate) else RollupGate.from_dict(g)
            for g in self.gates
        ]
        self.not_passed = [str(g) for g in self.not_passed]
        self.missing_or_unreadable = [str(g) for g in self.missing_or_unreadable]

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a plain JSON-ready dict matching the rollup object shape."""
        return {
            "verdict": self.verdict,
            "generated_at": self.generated_at,
            "gates": [g.to_dict() for g in self.gates],
            "not_passed": list(self.not_passed),
            "missing_or_unreadable": list(self.missing_or_unreadable),
        }

    def to_json(self, *, indent: int = 2) -> str:
        """Serialize the rollup to a stable, human-reviewable JSON string."""
        return json.dumps(
            self.to_dict(), indent=indent, sort_keys=False, ensure_ascii=False
        )

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "RollupStatus":
        """Build a :class:`RollupStatus` from a parsed dict, validating the schema."""
        if not isinstance(data, Mapping):
            raise EvidenceArtifactError(
                f"rollup must be an object, got {type(data).__name__}"
            )
        if "verdict" not in data:
            raise EvidenceArtifactError("rollup missing required field 'verdict'")
        raw_gates = data.get("gates", []) or []
        if not isinstance(raw_gates, list):
            raise EvidenceArtifactError("'gates' must be a list")
        return cls(
            verdict=data["verdict"],
            generated_at=str(data.get("generated_at", "")),
            gates=[RollupGate.from_dict(g) for g in raw_gates],
            not_passed=list(data.get("not_passed", []) or []),
            missing_or_unreadable=list(data.get("missing_or_unreadable", []) or []),
        )

    @classmethod
    def from_json(cls, text: str) -> "RollupStatus":
        """Parse a JSON string into a :class:`RollupStatus`, validating the schema.

        Raises :class:`EvidenceArtifactError` on malformed JSON so callers can treat
        an unparseable rollup the same conservative way the rollup treats a missing
        gate artifact.
        """
        try:
            parsed = json.loads(text)
        except (json.JSONDecodeError, TypeError) as exc:
            raise EvidenceArtifactError(f"rollup is not valid JSON: {exc}") from exc
        return cls.from_dict(parsed)


def rollup_to_dict(rollup: RollupStatus) -> Dict[str, Any]:
    """Module-level mirror of :meth:`RollupStatus.to_dict` (envelope-helper style)."""
    if not isinstance(rollup, RollupStatus):
        raise EvidenceArtifactError(
            f"expected RollupStatus, got {type(rollup).__name__}"
        )
    return rollup.to_dict()


def rollup_to_json(rollup: RollupStatus, *, indent: int = 2) -> str:
    """Module-level mirror of :meth:`RollupStatus.to_json` (envelope-helper style)."""
    if not isinstance(rollup, RollupStatus):
        raise EvidenceArtifactError(
            f"expected RollupStatus, got {type(rollup).__name__}"
        )
    return rollup.to_json(indent=indent)


def rollup_from_dict(data: Mapping[str, Any]) -> RollupStatus:
    """Module-level mirror of :meth:`RollupStatus.from_dict` (envelope-helper style)."""
    return RollupStatus.from_dict(data)


def rollup_from_json(text: str) -> RollupStatus:
    """Module-level mirror of :meth:`RollupStatus.from_json` (envelope-helper style)."""
    return RollupStatus.from_json(text)
