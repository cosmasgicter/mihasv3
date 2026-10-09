"""Canonical assignment + requirement resolution (admissions-v2 task 5.2).

Spec:        .kiro/specs/admissions-v2-canonical-rebuild/
Requirements: R7.1-R7.3, R7.5, R10.5-R10.6, R11.6
Findings:    DATA-01, DATA-04, STU-01, STU-13
Design:      design.md §7.2 (Application Assignment), §8.3 (Readiness), §9.3
             (Required Documents snapshotted to the application assignment).

This module is the canonical resolution seam a StartDraft-style write uses to
turn *canonical* offering + intake IDs into the full assignment + configuration
snapshot stored on the application. It exists to close four findings:

* DATA-01 / STU-01 — resolution is **canonical IDs only**. It reuses
  :class:`apps.catalog.services.OfferingAssignmentService` (the existing routing
  authority) and never falls back to display-string / name / code lookup
  (``IdentifierResolver`` is not imported here).
* DATA-04 / STU-13 — requirement + eligibility resolution **fails closed**. When
  the canonical graph resolves but the dependent configuration cannot be
  evaluated, it raises :class:`AssignmentConfigurationError` (a stable retryable
  503 ``CONFIGURATION_UNAVAILABLE``) instead of silently returning an empty
  requirement list. "Resolved to no requirements" (a legitimately empty list) is
  distinct from "could not evaluate requirements" (an error).
* R7.2 / R11.6 — the resolved required documents + eligibility rules are
  captured under one transactionally consistent read and stamped with a
  deterministic ``configuration_version`` that readiness (task 6.5) can recompute
  and compare to detect drift, then snapshotted onto the application row.

Framework-neutral by design (design §3: services enforce business state, views
handle transport). ``AssignmentConfigurationError`` carries a stable ``code`` /
``retryable`` / ``status_code`` so both the V1 create view and the submission
service can translate it to the canonical envelope without importing DRF here.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from django.db import transaction

logger = logging.getLogger(__name__)

# Stable, registered error code (mirrors apps.common.v2.error_codes →
# CONFIGURATION_UNAVAILABLE, 503, retryable). Named here so the framework-neutral
# service does not import the DRF exception layer.
CONFIGURATION_UNAVAILABLE_CODE = "CONFIGURATION_UNAVAILABLE"
CONFIGURATION_UNAVAILABLE_MESSAGE = (
    "This programme is temporarily unavailable while its configuration is "
    "checked. Please try again shortly."
)


class AssignmentConfigurationError(Exception):
    """The canonical offering configuration could not be evaluated (fail closed).

    Raised when the assignment graph itself resolves (or would resolve) but the
    dependent configuration — the dynamic Required_Documents or eligibility
    rules — cannot be read. This is an infrastructure / configuration-integrity
    failure, NOT a genuine "no eligible offering" (which stays
    :class:`apps.catalog.services.OfferingAssignmentError`).

    It is deliberately a plain ``Exception`` (not a DRF ``APIException``) so the
    resolution service stays transport-agnostic. Callers translate it to the
    stable retryable 503 ``CONFIGURATION_UNAVAILABLE`` envelope (design §14.1,
    R11.6). It must never be swallowed into an empty-requirements result
    (DATA-04, STU-13).
    """

    code = CONFIGURATION_UNAVAILABLE_CODE
    retryable = True
    status_code = 503

    def __init__(self, message: str | None = None):
        super().__init__(message or CONFIGURATION_UNAVAILABLE_MESSAGE)
        self.message = str(self)


@dataclass(frozen=True)
class AssignmentSnapshot:
    """The resolved canonical assignment + configuration snapshot.

    Exposes both the primitive snapshot values (persisted onto the application)
    and the resolved model objects (``institution`` / ``canonical_program`` /
    ``offering`` / ``intake``) so the existing create call sites — which read
    ``assigned.canonical_program.id`` etc. — keep working unchanged.
    """

    # Canonical IDs derived server-side (never client-supplied display strings).
    institution_id: str
    canonical_program_id: str
    program_offering_id: str
    intake_id: str
    # Immutable display snapshots (design §7.2).
    institution_name: str
    program_name: str
    intake_name: str
    # Dynamic configuration snapshotted onto the application (design §9.3, §7.2).
    required_documents: list[dict[str, Any]]
    eligibility_rules: list[dict[str, Any]]
    # One transactionally consistent configuration version (R7.2).
    configuration_version: str
    # Resolved model objects — convenience for callers; excluded from equality.
    institution: Any = field(default=None, repr=False, compare=False)
    canonical_program: Any = field(default=None, repr=False, compare=False)
    offering: Any = field(default=None, repr=False, compare=False)
    intake: Any = field(default=None, repr=False, compare=False)

    def snapshot_columns(self) -> dict[str, Any]:
        """The application-row columns this snapshot writes (task 5.2 schema)."""
        return {
            "institution_ref_id": self.institution_id,
            "canonical_program_id": self.canonical_program_id,
            "program_offering_id": self.program_offering_id,
            "intake_ref_id": self.intake_id,
            "configuration_version": self.configuration_version,
            "requirements_snapshot": self.required_documents,
            "eligibility_snapshot": self.eligibility_rules,
            "assignment_version": 1,
        }


def _canonical_json(payload: Any) -> str:
    """Stable JSON encoding for content hashing (sorted keys, no whitespace)."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def compute_configuration_version(
    *,
    institution_id: Any,
    canonical_program_id: Any,
    program_offering_id: Any,
    intake_id: Any,
    required_documents: list[dict[str, Any]],
    eligibility_rules: list[dict[str, Any]],
) -> str:
    """Deterministic content version of the resolved configuration (R7.2).

    The version is a content hash over the canonical identity plus the resolved
    required documents and eligibility rules. Two tenants offering the same-name
    canonical program resolve to different institution/offering IDs and their own
    requirement rows, so they get different configuration versions — the version
    is tenant-isolated by construction. Readiness (task 6.5) recomputes this over
    the live configuration and compares to detect drift since assignment.
    """
    material = _canonical_json(
        {
            "institution_id": str(institution_id),
            "canonical_program_id": str(canonical_program_id),
            "program_offering_id": str(program_offering_id),
            "intake_id": str(intake_id),
            "required_documents": required_documents,
            "eligibility_rules": eligibility_rules,
        }
    )
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]
    return f"cfg-{digest}"


def resolve_required_documents(offering, canonical) -> list[dict[str, Any]]:
    """Fail-closed resolution of the assigned Required_Documents (R11.6, STU-13).

    Delegates to the existing ``OfferingAssignmentService.required_documents``
    (most-specific offering → canonical → institution-default scope). Distinguishes
    "resolved to no requirements" (a valid empty list, returned as-is) from
    "could not evaluate requirements" (raises :class:`AssignmentConfigurationError`).
    It NEVER returns ``[]`` to mask a resolution failure — that fail-open path was
    finding DATA-04.
    """
    from apps.catalog.services import OfferingAssignmentService

    try:
        return OfferingAssignmentService.required_documents(offering, canonical)
    except Exception as exc:  # noqa: BLE001 - deliberately fail closed
        logger.warning(
            "Required-document resolution failed for offering=%s (fail closed)",
            getattr(offering, "id", None),
            exc_info=True,
        )
        raise AssignmentConfigurationError() from exc


def resolve_eligibility_rules(offering) -> list[dict[str, Any]]:
    """Fail-closed snapshot of the offering's eligibility rules (design §7.2).

    Snapshots the ``CourseRequirement`` rows keyed by the offering. As with the
    required documents, an empty rule set is valid (returned as ``[]``) but a
    resolution failure fails closed with :class:`AssignmentConfigurationError`
    rather than silently degrading.
    """
    from apps.catalog.models import CourseRequirement

    try:
        rows = (
            CourseRequirement.objects.filter(program_id=offering.id)
            .select_related("subject")
            .order_by("subject__name", "id")
        )
        return [
            {
                "subject_id": str(row.subject_id) if row.subject_id else None,
                "subject_name": getattr(getattr(row, "subject", None), "name", None),
                "minimum_grade": row.minimum_grade,
                "is_mandatory": bool(row.is_mandatory),
                "weight": float(row.weight) if row.weight is not None else 1.0,
                "requirement_type": row.requirement_type,
            }
            for row in rows
        ]
    except Exception as exc:  # noqa: BLE001 - deliberately fail closed
        logger.warning(
            "Eligibility-rule resolution failed for offering=%s (fail closed)",
            getattr(offering, "id", None),
            exc_info=True,
        )
        raise AssignmentConfigurationError() from exc


def resolve_assignment_snapshot(
    *,
    program_id: Any,
    intake_id: Any,
    country: str | None = None,
    nationality: str | None = None,
    institution_id: Any = None,
    **audit_kwargs: Any,
) -> AssignmentSnapshot:
    """Resolve the canonical assignment + configuration snapshot (fail closed).

    Canonical IDs only — ``program_id`` is a ``CanonicalProgram`` id and
    ``intake_id`` an ``Intake`` id; no display-string / name / code fallback
    (R7.1, DATA-01). Reuses :class:`OfferingAssignmentService` for routing.

    Raises:
        OfferingAssignmentError: a genuine "no eligible offering" (client 400).
        AssignmentConfigurationError: the graph resolves but the dependent
            configuration cannot be evaluated — a stable retryable 503
            ``CONFIGURATION_UNAVAILABLE`` (R11.6, DATA-04). Any unexpected error
            during routing/resolution also fails closed this way rather than
            surfacing as a misleading client error.

    All reads run inside one ``atomic`` block so the required documents,
    eligibility rules, and configuration version describe a single consistent
    snapshot of the offering configuration (R7.2).
    """
    from apps.catalog.services import (
        OfferingAssignmentError,
        OfferingAssignmentService,
    )

    with transaction.atomic():
        # 1) Resolve the canonical graph. A genuine no-eligible-offering stays a
        #    client error; anything else (unreadable canonical row, requirement
        #    query failure inside assign(), infra hiccup) fails closed.
        try:
            result = OfferingAssignmentService().assign(
                program_id=str(program_id),
                intake_id=str(intake_id),
                country=country,
                nationality=nationality,
                institution_id=str(institution_id) if institution_id else None,
                **audit_kwargs,
            )
        except OfferingAssignmentError:
            raise
        except AssignmentConfigurationError:
            raise
        except Exception as exc:  # noqa: BLE001 - deliberately fail closed
            logger.warning(
                "Canonical assignment resolution failed (fail closed)",
                exc_info=True,
            )
            raise AssignmentConfigurationError() from exc

        offering = result.offering
        canonical = result.canonical_program
        intake = result.intake
        institution = result.institution

        # 2) Snapshot the dependent configuration, fail-closed. ``assign`` already
        #    resolved required_documents; the eligibility rules are resolved here.
        required_documents = result.required_documents
        eligibility_rules = resolve_eligibility_rules(offering)

        # 3) Stamp the transactionally consistent configuration version.
        configuration_version = compute_configuration_version(
            institution_id=institution.id,
            canonical_program_id=canonical.id,
            program_offering_id=offering.id,
            intake_id=intake.id,
            required_documents=required_documents,
            eligibility_rules=eligibility_rules,
        )

    return AssignmentSnapshot(
        institution_id=str(institution.id),
        canonical_program_id=str(canonical.id),
        program_offering_id=str(offering.id),
        intake_id=str(intake.id),
        institution_name=institution.name,
        program_name=canonical.name,
        intake_name=intake.name,
        required_documents=required_documents,
        eligibility_rules=eligibility_rules,
        configuration_version=configuration_version,
        institution=institution,
        canonical_program=canonical,
        offering=offering,
        intake=intake,
    )
