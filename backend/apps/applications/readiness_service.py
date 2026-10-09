"""Authoritative application readiness (admissions-v2 task 6.5).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/``
Requirements: R10.6, R11.2-R11.6, R12.3
Findings:     DATA-03, DATA-04, STU-11, STU-13
Design:       design.md §8.3 (Readiness — "``GET /api/v2/student/applications/
              {id}/readiness/`` is authoritative and returns: assignment/
              configuration version; profile and identity blockers; persisted
              canonical grade count and eligibility results; versioned
              required-document states; fee quote/payment/defer state;
              capacity/duplicate/late checks; declarations; allowed next actions
              and recoverability codes. Client validation provides immediate
              field UX but never declares the application submittable on its
              own. Submission reruns readiness under locks."), §7.3 (Capacity
              And Waitlist), §8.1 (State Machine), §9.2/§9.3 (deterministic
              grades + versioned required documents).

Why this module exists
----------------------
Readiness was a **client-side** computation (``wizardReadiness.ts``) with no
authoritative server counterpart:

* **STU-11** (P0) — the education UI could add selectable ``fallback-*`` subject
  IDs, client readiness counted them, persistence dropped them, and *submission
  had no authoritative five-grade gate at all*. Here the count is over
  **persisted** ``ApplicationGrade`` rows whose ``subject_id`` resolves to an
  active canonical ``Subject``; an unresolved/fake id can never count as
  complete (R11.5).
* **STU-13** (P0) / **DATA-04** (P0) — required-document state is rendered from
  the versioned requirements snapshot on the application (task 5.2), and a
  configuration that *cannot be evaluated* fails closed with the stable
  retryable ``CONFIGURATION_UNAVAILABLE`` instead of degrading to "no
  requirements" (R11.6).
* **DATA-03** (P0) — capacity is reported from the canonical Intake_Offering
  identity (task 5.3), and the *authoritative* last-seat decision stays inside
  the submission row lock (``CapacityService.take_seat_for_submission``).
* **R11.2** — the student summary is a deterministic projection of stored fields
  and current validation results. No generative AI, no persuasive prose.

Two consumers, one evaluator
----------------------------
1. :func:`evaluate_readiness` — the authoritative query behind
   ``GET /api/v2/student/applications/{id}/readiness/``. It re-resolves the live
   configuration to report **drift** against the assignment snapshot (the
   hand-off task 6.4 asked for) and returns every section design §8.3 names.
2. :func:`submission_blockers` — the same deterministic gates, evaluated on the
   **locked** row inside ``submit_application`` (R10.6). Submission trusts the
   application's versioned ``requirements_snapshot`` (the drift-free set task 5.2
   captured) and never re-resolves live configuration, so a transient dependency
   blip cannot block a legitimate submit — while an *unevaluable* configuration
   still fails closed.

Framework-neutral by design (design §3): no DRF import. Blockers carry a stable
``code`` and ``retryable`` flag so the V2 view and the V1 submission service both
map them onto their canonical envelope without this module knowing about either.

Strictly additive: an application without a full canonical identity (a legacy
pre-5.2 row, or a ``MagicMock`` in a unit test — both filtered by
:func:`_coerce_uuid`) skips the canonical-only gates entirely and keeps the
existing behaviour, exactly like the task 5.2/5.3 seams it reuses.
"""

from __future__ import annotations

import logging
import uuid as _uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------

#: Minimum number of unique **persisted canonical** Grade 12 records required
#: before an application may be submitted (R11.5, STU-11). Five is the ECZ
#: admissions floor already enforced by the batch grade endpoint and the wizard;
#: a tenant/platform operator can only raise it, never lower it below the policy
#: floor, through the ``minimum_persisted_grades`` setting.
DEFAULT_MINIMUM_PERSISTED_GRADES = 5

#: Settings key that may raise (never lower) the minimum grade count.
MINIMUM_GRADES_SETTING_KEY = "minimum_persisted_grades"

#: Profile fields that must be present before submission (R10.6 "profile").
#: ``nrc_or_passport`` is a compound rule handled separately.
REQUIRED_PROFILE_FIELDS: tuple[tuple[str, str], ...] = (
    ("full_name", "Full name"),
    ("date_of_birth", "Date of birth"),
    ("sex", "Sex"),
    ("phone", "Phone number"),
    ("email", "Email address"),
    ("residence_town", "Residence town"),
)

#: Document types that satisfy the platform identity-evidence gate. This gate is
#: enforced unconditionally by ``submit_application`` (``IDENTITY_DOCUMENT_REQUIRED``),
#: independently of the tenant requirement snapshot, so it is the *one* place the
#: accepted identity types are named. ``apps.applications.required_documents``
#: imports this tuple to publish the same set in the student upload contract, so
#: the rendered control and the submission gate can never disagree (R11.6).
IDENTITY_DOCUMENT_TYPES: tuple[str, ...] = ("nrc", "passport", "extra_kyc")

#: Verification statuses that mean "this evidence no longer counts". A document
#: in one of these states never satisfies a requirement, on any surface.
NON_COUNTING_VERIFICATION_STATUSES: tuple[str, ...] = ("deleted", "rejected")

#: The declarations a student must accept at submission time. The wizard's
#: ``confirm_submission`` flag is this declaration; the submit command re-checks
#: it under the row lock (R10.6 "declarations").
DECLARATIONS: tuple[dict[str, str], ...] = (
    {
        "code": "final_confirmation",
        "label": "I confirm the information in this application is accurate and complete.",
        "blocker_code": "CONFIRM_SUBMISSION_REQUIRED",
    },
)


# ---------------------------------------------------------------------------
# Stable blocker codes
# ---------------------------------------------------------------------------

PROFILE_INCOMPLETE = "PROFILE_INCOMPLETE"
IDENTITY_DOCUMENT_REQUIRED = "IDENTITY_DOCUMENT_REQUIRED"
MINIMUM_GRADES_REQUIRED = "MINIMUM_GRADES_REQUIRED"
PROGRAM_ELIGIBILITY_NOT_MET = "PROGRAM_ELIGIBILITY_NOT_MET"
REQUIRED_DOCUMENT_MISSING = "REQUIRED_DOCUMENT_MISSING"
PAYMENT_REQUIRED = "PAYMENT_REQUIRED"
FEE_NOT_CONFIGURED = "FEE_NOT_CONFIGURED"
DUPLICATE_SUBMITTED_APPLICATION = "DUPLICATE_SUBMITTED_APPLICATION"
CONFIRM_SUBMISSION_REQUIRED = "CONFIRM_SUBMISSION_REQUIRED"
ALREADY_SUBMITTED = "ALREADY_SUBMITTED"
APPLICATION_NOT_EDITABLE = "APPLICATION_NOT_EDITABLE"
CONFIGURATION_UNAVAILABLE = "CONFIGURATION_UNAVAILABLE"

#: Categories used to group blockers for the client (design §8.3).
CATEGORY_STATE = "state"
CATEGORY_PROFILE = "profile"
CATEGORY_GRADES = "grades"
CATEGORY_ELIGIBILITY = "eligibility"
CATEGORY_DOCUMENTS = "documents"
CATEGORY_PAYMENT = "payment"
CATEGORY_CAPACITY = "capacity"
CATEGORY_DUPLICATE = "duplicate"
CATEGORY_INTAKE = "intake"
CATEGORY_DECLARATION = "declaration"
CATEGORY_CONFIGURATION = "configuration"


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReadinessBlocker:
    """One reason an application is not submittable.

    ``code`` is stable and registered; ``retryable`` marks a service-side
    condition the student can simply retry (a configuration outage) versus work
    the student must actually do.
    """

    code: str
    category: str
    message: str
    retryable: bool = False
    fields: tuple[str, ...] = ()
    details: dict[str, Any] = field(default_factory=dict)

    def to_payload(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "category": self.category,
            "message": self.message,
            "retryable": self.retryable,
            "fields": list(self.fields),
            "details": dict(self.details),
        }


@dataclass(frozen=True)
class ApplicationReadiness:
    """The authoritative readiness report (design §8.3)."""

    application_id: str
    status: str
    version: int
    assignment: dict[str, Any]
    configuration: dict[str, Any]
    profile: dict[str, Any]
    identity: dict[str, Any]
    grades: dict[str, Any]
    eligibility: dict[str, Any]
    documents: dict[str, Any]
    payment: dict[str, Any]
    capacity: dict[str, Any]
    duplicates: dict[str, Any]
    intake: dict[str, Any]
    declarations: list[dict[str, Any]]
    blockers: list[ReadinessBlocker]
    can_submit: bool
    allowed_next_actions: list[dict[str, Any]]
    evaluated_at: str

    def to_payload(self) -> dict[str, Any]:
        return {
            "application_id": self.application_id,
            "status": self.status,
            "version": self.version,
            "assignment": self.assignment,
            "configuration": self.configuration,
            "profile": self.profile,
            "identity": self.identity,
            "grades": self.grades,
            "eligibility": self.eligibility,
            "documents": self.documents,
            "payment": self.payment,
            "capacity": self.capacity,
            "duplicates": self.duplicates,
            "intake": self.intake,
            "declarations": self.declarations,
            "blockers": [blocker.to_payload() for blocker in self.blockers],
            "can_submit": self.can_submit,
            "allowed_next_actions": self.allowed_next_actions,
            "evaluated_at": self.evaluated_at,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _coerce_uuid(value: Any) -> str | None:
    """Canonical string form of *value* iff it is a real UUID, else ``None``.

    Mirrors ``apps.applications.services._coerce_uuid`` so a legacy row with null
    canonical IDs — and any object that does not carry genuine canonical UUIDs
    (e.g. a ``MagicMock`` attribute in a unit test) — falls straight through to
    the additive skip.
    """
    try:
        return str(_uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def _present(value: Any) -> bool:
    """Whether a scalar profile value is non-empty."""
    if value is None:
        return False
    try:
        return len(str(value).strip()) > 0
    except Exception:  # noqa: BLE001 - defensive: any unstringable value is absent
        return False


def canonical_ids(application) -> dict[str, str | None]:
    """The canonical assignment identity of *application* (UUID strings)."""
    return {
        "institution_id": _coerce_uuid(getattr(application, "institution_ref_id", None)),
        "canonical_program_id": _coerce_uuid(getattr(application, "canonical_program_id", None)),
        "program_offering_id": _coerce_uuid(getattr(application, "program_offering_id", None)),
        "intake_id": _coerce_uuid(getattr(application, "intake_ref_id", None)),
    }


def is_canonical(application) -> bool:
    """True when the offering + canonical program identity is fully present.

    The gate for every canonical-only check. Identical in spirit to
    ``services._missing_assigned_required_documents``: a legacy row (or a mock)
    keeps the pre-canonical behaviour instead of being blocked by a
    configuration that cannot be resolved for it.
    """
    ids = canonical_ids(application)
    return bool(ids["program_offering_id"] and ids["canonical_program_id"])


def resolve_minimum_grades() -> int:
    """The configured minimum unique persisted grade count (floor 5).

    Reads the ``minimum_persisted_grades`` setting when present. The policy floor
    (:data:`DEFAULT_MINIMUM_PERSISTED_GRADES`) always wins over a lower
    configured value, so a misconfigured/blank setting can never weaken the
    R11.5 five-grade requirement.
    """
    try:
        from apps.common.models import Setting

        row = Setting.objects.filter(key=MINIMUM_GRADES_SETTING_KEY).first()
        if row is not None and row.value not in (None, ""):
            configured = int(row.value)
            return max(configured, DEFAULT_MINIMUM_PERSISTED_GRADES)
    except Exception:  # noqa: BLE001 - a settings read must never break readiness
        logger.debug(
            "Could not read %s setting; using the policy floor",
            MINIMUM_GRADES_SETTING_KEY,
            exc_info=True,
        )
    return DEFAULT_MINIMUM_PERSISTED_GRADES


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------


def evaluate_profile(application) -> dict[str, Any]:
    """Profile completeness (R10.6 "profile", design §8.3 "profile blockers")."""
    missing = [
        {"field": name, "label": label}
        for name, label in REQUIRED_PROFILE_FIELDS
        if not _present(getattr(application, name, None))
    ]
    has_identity_number = _present(getattr(application, "nrc_number", None)) or _present(
        getattr(application, "passport_number", None)
    )
    if not has_identity_number:
        missing.append({"field": "nrc_number", "label": "NRC or passport number"})
    return {
        "satisfied": not missing,
        "missing_fields": missing,
    }


def evaluate_identity_document(application, *, has_identity_document: bool | None = None) -> dict[str, Any]:
    """Identity-evidence state (NRC/passport/extra KYC upload).

    ``has_identity_document`` lets the submission path pass the value it already
    computed through its own patchable helper instead of re-querying.
    """
    if has_identity_document is None:
        from apps.documents.models import ApplicationDocument

        application_id = _coerce_uuid(getattr(application, "id", None))
        if application_id is None:
            has_identity_document = False
        else:
            has_identity_document = (
                ApplicationDocument.objects.filter(
                    application_id=application_id,
                    document_type__in=list(IDENTITY_DOCUMENT_TYPES),
                )
                .exclude(verification_status__in=list(NON_COUNTING_VERIFICATION_STATUSES))
                .exists()
            )
    return {
        "satisfied": bool(has_identity_document),
        "accepted_document_types": list(IDENTITY_DOCUMENT_TYPES),
    }


def evaluate_grades(application, *, minimum: int | None = None) -> dict[str, Any]:
    """Persisted canonical grade state (R11.5, STU-11).

    Counts **unique persisted** ``ApplicationGrade`` rows whose ``subject_id``
    resolves to an active canonical ``Subject``. A row pointing at a subject that
    no longer resolves is reported as ``unresolved`` and never counts toward the
    minimum — "fake or unresolved subject IDs SHALL never count as complete".
    """
    from apps.catalog.models import Subject
    from apps.documents.models import ApplicationGrade
    from django.db.models import Q

    required = resolve_minimum_grades() if minimum is None else minimum
    application_id = _coerce_uuid(getattr(application, "id", None))
    if application_id is None:
        return {
            "persisted_count": 0,
            "unique_canonical_count": 0,
            "unresolved_subject_count": 0,
            "minimum_required": required,
            "satisfied": False,
            "subjects": [],
        }

    rows = list(
        ApplicationGrade.objects.filter(application_id=application_id).values(
            "subject_id", "grade"
        )
    )
    subject_ids = {str(row["subject_id"]) for row in rows if row.get("subject_id")}
    resolved: dict[str, str] = {}
    if subject_ids:
        resolved = {
            str(subject.id): subject.name
            for subject in Subject.objects.filter(id__in=list(subject_ids)).filter(
                Q(is_active=True) | Q(is_active__isnull=True)
            )
        }

    unique_canonical: dict[str, int] = {}
    unresolved: list[str] = []
    for row in rows:
        subject_id = str(row["subject_id"]) if row.get("subject_id") else None
        if subject_id is None:
            continue
        if subject_id in resolved:
            unique_canonical[subject_id] = row["grade"]
        elif subject_id not in unresolved:
            unresolved.append(subject_id)

    return {
        "persisted_count": len(rows),
        "unique_canonical_count": len(unique_canonical),
        "unresolved_subject_count": len(unresolved),
        "minimum_required": required,
        "satisfied": len(unique_canonical) >= required,
        "subjects": [
            {"subject_id": subject_id, "subject_name": resolved[subject_id], "grade": grade}
            for subject_id, grade in sorted(
                unique_canonical.items(), key=lambda item: resolved[item[0]]
            )
        ],
    }


def _persisted_grade_map(application) -> dict[str, int]:
    from apps.documents.models import ApplicationGrade

    application_id = _coerce_uuid(getattr(application, "id", None))
    if application_id is None:
        return {}
    return {
        str(row["subject_id"]): row["grade"]
        for row in ApplicationGrade.objects.filter(application_id=application_id).values(
            "subject_id", "grade"
        )
        if row.get("subject_id")
    }


def _eligibility_rules(application, *, allow_live_resolution: bool) -> list[dict[str, Any]]:
    """The canonical eligibility rules for the assignment.

    Prefers the versioned ``eligibility_snapshot`` captured at assignment time
    (task 5.2). A canonical application that predates the snapshot may
    live-resolve (readiness query only) through the fail-closed resolver.
    """
    snapshot = getattr(application, "eligibility_snapshot", None)
    if isinstance(snapshot, list):
        return snapshot
    if not allow_live_resolution:
        return []

    from apps.applications.assignment_resolution import resolve_eligibility_rules
    from apps.catalog.models import Program

    offering_id = canonical_ids(application)["program_offering_id"]
    if offering_id is None:
        return []
    offering = Program.objects.filter(id=offering_id).first()
    if offering is None:
        return []
    return resolve_eligibility_rules(offering)


def evaluate_eligibility(application, *, allow_live_resolution: bool = False) -> dict[str, Any]:
    """Deterministic program-eligibility result (R11.5, design §9.1/§9.2).

    Evaluates the canonical rules against the persisted grades. ECZ semantics:
    a lower numeric grade is better, so a rule passes when
    ``student_grade <= minimum_grade``.

    * A **mandatory** rule that is unmet (missing grade or a grade worse than the
      minimum) is a hard blocker — "program eligibility" in R11.5.
    * An optional rule that is unmet is advisory only (``conditional``), keeping
      the product rule that advisory eligibility never blocks a student.
    * No configured rules → ``not_configured``, advisory, never a blocker.
    """
    rules = [row for row in _eligibility_rules(application, allow_live_resolution=allow_live_resolution) if isinstance(row, dict)]
    grades = _persisted_grade_map(application) if rules else {}

    mandatory_unmet: list[dict[str, Any]] = []
    optional_unmet: list[dict[str, Any]] = []
    evaluated = 0
    for rule in rules:
        subject_id = rule.get("subject_id")
        if not subject_id:
            continue
        evaluated += 1
        minimum_grade = rule.get("minimum_grade")
        student_grade = grades.get(str(subject_id))
        met = (
            student_grade is not None
            and minimum_grade is not None
            and int(student_grade) <= int(minimum_grade)
        )
        if met:
            continue
        entry = {
            "subject_id": str(subject_id),
            "subject_name": rule.get("subject_name"),
            "minimum_grade": minimum_grade,
            "student_grade": student_grade,
            "reason": "missing_grade" if student_grade is None else "grade_below_minimum",
        }
        if rule.get("is_mandatory"):
            mandatory_unmet.append(entry)
        else:
            optional_unmet.append(entry)

    if evaluated == 0:
        status = "not_configured"
    elif mandatory_unmet:
        status = "not_eligible"
    elif optional_unmet:
        status = "conditional"
    else:
        status = "eligible"

    return {
        "status": status,
        "rules_evaluated": evaluated,
        "mandatory_unmet": mandatory_unmet,
        "optional_unmet": optional_unmet,
        # Only a mandatory rule blocks; everything else stays advisory.
        "advisory": not mandatory_unmet,
        "satisfied": not mandatory_unmet,
    }


def uploaded_document_rows(application) -> dict[str, dict[str, Any]]:
    """Map of ``document_type -> current counting document row``.

    The single definition of "this application has evidence of type X" used by
    every surface: the readiness document gate, and the student upload contract
    in :mod:`apps.applications.required_documents`. A document whose
    verification status is in :data:`NON_COUNTING_VERIFICATION_STATUSES` never
    appears here, so a deleted/rejected upload returns the requirement to
    ``missing`` on both surfaces at once.

    Only ``is_current`` versions are considered (task 7.3, R11.8): a superseded
    version is preserved history, not this application's evidence, and the
    database's ``uq_application_documents_one_current`` partial unique index makes
    "exactly one current row per (application, document_type)" an invariant rather
    than a hope. The newest-by-timestamp tiebreak is retained for legacy rows
    written before that index existed, so the reported document never flickers.
    """
    from apps.documents.models import ApplicationDocument

    application_id = _coerce_uuid(getattr(application, "id", None))
    if application_id is None:
        return {}

    newest: dict[str, dict[str, Any]] = {}
    for row in (
        ApplicationDocument.objects.filter(application_id=application_id, is_current=True)
        .exclude(verification_status__in=list(NON_COUNTING_VERIFICATION_STATUSES))
        .values(
            "id",
            "document_type",
            "document_name",
            "verification_status",
            "file_size",
            "mime_type",
            "uploaded_at",
            "updated_at",
            "created_at",
            "version",
            "is_current",
            "lifecycle_state",
            "content_hash",
        )
    ):
        document_type = str(row["document_type"])
        candidate = {
            "id": str(row["id"]),
            "document_type": document_type,
            "document_name": row["document_name"],
            "verification_status": row["verification_status"] or "pending",
            "file_size": row["file_size"],
            "mime_type": row["mime_type"],
            "uploaded_at": row["uploaded_at"] or row["updated_at"] or row["created_at"],
            # Immutable-version identity (task 7.3, R11.7): what makes a replace
            # verifiable on the server rather than a local UI flag (STU-19).
            "version": row["version"],
            "lifecycle_state": _lifecycle_state_of(row),
            "content_hash": row["content_hash"],
        }
        current = newest.get(document_type)
        if current is None or _document_sort_key(candidate) >= _document_sort_key(current):
            newest[document_type] = candidate
    return newest


def _lifecycle_state_of(row: dict[str, Any]) -> str:
    """Canonical lifecycle state for a document ``.values()`` row (task 7.3).

    Delegates to the one authority in :mod:`apps.documents.document_evidence` so
    the readiness read and the evidence commands can never disagree about what
    state a version is in.
    """
    from apps.documents.document_evidence import lifecycle_from_row

    return lifecycle_from_row(row)


def _document_sort_key(row: dict[str, Any]):
    """Sortable recency key that tolerates a missing timestamp."""
    uploaded_at = row.get("uploaded_at")
    if uploaded_at is None:
        # Rows with no timestamp sort oldest; the id breaks remaining ties
        # deterministically so the "current" document never flickers.
        return (0, "", str(row.get("id") or ""))
    return (1, uploaded_at.isoformat() if hasattr(uploaded_at, "isoformat") else str(uploaded_at), str(row.get("id") or ""))


def _uploaded_documents(application) -> dict[str, str]:
    """Map of ``document_type -> verification_status`` for live evidence."""
    return {
        document_type: row["verification_status"]
        for document_type, row in uploaded_document_rows(application).items()
    }


def required_documents(application, *, allow_live_resolution: bool) -> list[dict[str, Any]]:
    """The versioned Required_Documents for the assignment (fail closed).

    Prefers the application's ``requirements_snapshot`` (the drift-free set task
    5.2 captured — design §9.3). When a canonical application predates the
    snapshot, live-resolves through the fail-closed resolver, which raises
    :class:`AssignmentConfigurationError` rather than degrading to an empty list
    (DATA-04, STU-13, R11.6).
    """
    snapshot = getattr(application, "requirements_snapshot", None)
    if isinstance(snapshot, list):
        return snapshot
    if not allow_live_resolution:
        return []
    if not is_canonical(application):
        # A pre-canonical (legacy) row has no canonical offering to resolve
        # requirements from — that is the additive skip, NOT a configuration
        # outage, so it must not fail closed. Mirrors
        # ``services._missing_assigned_required_documents``, which returns no
        # missing documents for exactly the same rows.
        return []

    from apps.applications.assignment_resolution import (
        AssignmentConfigurationError,
        resolve_required_documents,
    )
    from apps.catalog.models import CanonicalProgram, Program

    ids = canonical_ids(application)
    offering = Program.objects.filter(id=ids["program_offering_id"]).first()
    canonical = CanonicalProgram.objects.filter(id=ids["canonical_program_id"]).first()
    if offering is None or canonical is None:
        # Canonical IDs present but the referenced rows are unreadable — the
        # configuration cannot be evaluated, so fail closed (never an empty set).
        raise AssignmentConfigurationError()
    return resolve_required_documents(offering, canonical)


def evaluate_documents(application, *, allow_live_resolution: bool = False) -> dict[str, Any]:
    """Versioned required-document states (R11.6, STU-13)."""
    requirements = required_documents(application, allow_live_resolution=allow_live_resolution)
    uploaded = _uploaded_documents(application) if requirements else {}

    rows: list[dict[str, Any]] = []
    missing_required: list[dict[str, str]] = []
    for requirement in requirements:
        if not isinstance(requirement, dict):
            continue
        document_type = requirement.get("document_type")
        if not document_type:
            continue
        label = requirement.get("label") or document_type
        is_required = bool(requirement.get("required"))
        verification_status = uploaded.get(str(document_type))
        state = "missing" if verification_status is None else (
            "verified" if verification_status == "verified" else "uploaded"
        )
        rows.append(
            {
                "document_type": str(document_type),
                "label": label,
                "required": is_required,
                "state": state,
                "verification_status": verification_status,
            }
        )
        if is_required and verification_status is None:
            missing_required.append({"document_type": str(document_type), "label": label})

    return {
        "requirements": rows,
        "missing_required": sorted(missing_required, key=lambda row: row["document_type"]),
        "satisfied": not missing_required,
    }


def evaluate_fee(application) -> dict[str, Any]:
    """Canonical fee state for the assignment (R12.1-R12.2, task 5.4).

    Never invents an amount: a missing/ambiguous canonical ``FeeSchedule``
    reports ``configured: false`` with the stable ``FEE_NOT_CONFIGURED`` /
    ``FEE_AMBIGUOUS`` code (DATA-05, STU-08).
    """
    ids = canonical_ids(application)
    if ids["program_offering_id"] is None:
        return {
            "configured": False,
            "code": None,
            "amount": None,
            "currency": None,
            "residency_category": None,
            "source": None,
        }

    from apps.catalog.models import Program
    from apps.documents.fee_resolver import FeeConfigurationError, FeeResolver

    offering = Program.objects.filter(id=ids["program_offering_id"]).first()
    if offering is None:
        return {
            "configured": False,
            "code": FEE_NOT_CONFIGURED,
            "amount": None,
            "currency": None,
            "residency_category": None,
            "source": None,
        }

    try:
        resolved = FeeResolver().resolve_for_offering(
            offering,
            getattr(application, "nationality", None),
            getattr(application, "country", None),
        )
    except FeeConfigurationError as exc:
        return {
            "configured": False,
            "code": exc.code,
            "message": exc.message,
            "amount": None,
            "currency": None,
            "residency_category": None,
            "source": None,
        }

    return {
        "configured": True,
        "code": None,
        "amount": str(resolved.amount),
        "currency": resolved.currency,
        "residency_category": resolved.residency_category,
        "source": resolved.source,
    }


def evaluate_payment(
    application,
    *,
    has_completed_payment: bool | None = None,
    include_fee: bool = True,
    include_provider_detail: bool = True,
) -> dict[str, Any]:
    """Payment / defer state for the application (R12.3, design §10.2).

    Distinguishes ``paid`` (settled or admin-resolved), ``deferred`` (an allowed
    pre-submission deferral), ``processing`` (the provider holds it), and
    ``action_required`` (the student must act) instead of collapsing everything
    into one boolean.

    ``include_provider_detail=False`` is the gate-only mode used inside the
    submission transaction: the ``paid``/``deferred`` decision is unchanged, but
    the informational latest-provider-status lookup is skipped so the in-lock
    pass adds no query (``processing`` collapses into ``action_required``, which
    is the same gate outcome).
    """
    from apps.documents.payment_constants import (
        COMPLETED_PAYMENT_STATUSES,
        RECEIPT_ELIGIBLE_STATUSES,
    )

    application_id = _coerce_uuid(getattr(application, "id", None))
    application_status = getattr(application, "payment_status", None)

    if has_completed_payment is None and application_id is not None:
        from apps.documents.models import Payment

        has_completed_payment = Payment.objects.filter(
            application_id=application_id, status__in=RECEIPT_ELIGIBLE_STATUSES
        ).exists()

    paid = bool(has_completed_payment) or application_status in COMPLETED_PAYMENT_STATUSES
    deferred = application_status == "deferred"

    provider_status = None
    if include_provider_detail and application_id is not None and not paid:
        from apps.documents.models import Payment

        latest = (
            Payment.objects.filter(application_id=application_id)
            .order_by("-created_at")
            .values("status")
            .first()
        )
        provider_status = latest["status"] if latest else None

    if paid:
        state = "paid"
    elif deferred:
        state = "deferred"
    elif provider_status == "pending":
        state = "processing"
    else:
        state = "action_required"

    payload: dict[str, Any] = {
        "state": state,
        "application_payment_status": application_status,
        "provider_status": provider_status,
        "deferral_allowed": True,
        "satisfied": state in ("paid", "deferred"),
    }
    if include_fee:
        payload["fee"] = evaluate_fee(application)
    return payload


def evaluate_capacity(application) -> dict[str, Any]:
    """Capacity state from the canonical Intake_Offering identity (task 5.3).

    Advisory only: the authoritative last-seat decision is made under the
    ``ProgramIntake`` row lock during submission (DATA-03).
    """
    from apps.applications.capacity_service import CapacityService

    offering_id, intake_id = CapacityService.offering_ids(application)
    if not (offering_id and intake_id):
        return {
            "canonical": False,
            "limit": None,
            "occupied": None,
            "seats_available": None,
            "satisfied": True,
            "code": None,
        }

    from apps.catalog.models import Intake, ProgramIntake

    program_intake = ProgramIntake.objects.filter(
        program_id=offering_id, intake_id=intake_id
    ).first()
    if program_intake is None:
        # No configured Intake_Offering link → unconstrained, mirroring
        # CapacityService.take_seat_for_submission.
        return {
            "canonical": True,
            "limit": None,
            "occupied": None,
            "seats_available": None,
            "satisfied": True,
            "code": None,
        }

    intake = Intake.objects.filter(id=intake_id).first()
    limit = CapacityService.capacity_limit(program_intake, intake)
    occupied = CapacityService.live_seat_count(
        offering_id, intake_id, exclude_application_id=getattr(application, "id", None)
    )
    if limit is None:
        return {
            "canonical": True,
            "limit": None,
            "occupied": occupied,
            "seats_available": None,
            "satisfied": True,
            "code": None,
        }

    seats_available = max(limit - occupied, 0)
    return {
        "canonical": True,
        "limit": limit,
        "occupied": occupied,
        "seats_available": seats_available,
        "satisfied": seats_available > 0,
        "code": None if seats_available > 0 else "PROGRAM_CAPACITY_REACHED",
    }


def evaluate_duplicates(application) -> dict[str, Any]:
    """Duplicate-application state through the canonical duplicate gate."""
    from apps.applications.duplicate_checker import DuplicateChecker

    application_id = _coerce_uuid(getattr(application, "id", None))
    user_id = getattr(application, "user_id", None)
    if application_id is None or user_id is None:
        return {"has_duplicate": False, "existing_id": None, "existing_status": None, "satisfied": True}

    ids = canonical_ids(application)
    result = DuplicateChecker.check_at_submit(
        user_id=str(user_id),
        program=getattr(application, "program", None),
        intake=getattr(application, "intake", None),
        exclude_id=application_id,
        program_id=ids["canonical_program_id"],
        intake_id=ids["intake_id"],
    )
    return {
        "has_duplicate": bool(result.has_duplicate),
        "existing_id": result.existing_id,
        "existing_status": result.existing_status,
        "satisfied": not result.has_duplicate,
    }


def evaluate_intake_window(application) -> dict[str, Any]:
    """Intake deadline / grace-period (late) state, keyed canonically."""
    from apps.applications.capacity_service import CapacityService
    from apps.applications.intake_enforcer import IntakeEnforcer

    offering_id, intake_id = CapacityService.offering_ids(application)
    result = IntakeEnforcer.check_submission(
        getattr(application, "intake", None),
        getattr(application, "program", None),
        offering_id=offering_id,
        intake_id=intake_id,
    )
    payload: dict[str, Any] = {
        "satisfied": bool(result.allowed),
        "is_late": bool(result.is_late),
        "code": result.code,
        "message": result.message,
        "deadline": None,
        "grace_period_days": None,
    }
    if intake_id:
        from apps.catalog.models import Intake

        intake = Intake.objects.filter(id=intake_id).values(
            "application_deadline", "grace_period_days"
        ).first()
        if intake:
            deadline = intake["application_deadline"]
            payload["deadline"] = deadline.isoformat() if deadline else None
            payload["grace_period_days"] = intake["grace_period_days"]
    return payload


def evaluate_declarations(*, declarations_accepted: bool) -> list[dict[str, Any]]:
    """Declaration state (R10.6 "declarations")."""
    return [
        {
            "code": declaration["code"],
            "label": declaration["label"],
            "required": True,
            "accepted": bool(declarations_accepted),
            "blocker_code": declaration["blocker_code"],
        }
        for declaration in DECLARATIONS
    ]


def evaluate_configuration(application, *, live_requirements_probe: bool) -> dict[str, Any]:
    """Assignment/configuration version + drift health (design §8.3, task 6.4).

    Recomputes the deterministic ``configuration_version`` over the **live**
    offering configuration and compares it with the version stamped on the
    application, so readiness surfaces the drift task 6.4 handed over. Drift is
    reported, never guessed: when the live probe cannot run, health is
    ``drift_unknown`` rather than a false ``ok``.
    """
    stored_version = getattr(application, "configuration_version", None)
    snapshot = getattr(application, "requirements_snapshot", None)
    payload: dict[str, Any] = {
        "version": stored_version,
        "live_version": None,
        "drift": False,
        "health": "ok",
        "requirements_source": "snapshot" if isinstance(snapshot, list) else "live",
    }
    if not (live_requirements_probe and is_canonical(application)):
        payload["health"] = "not_applicable" if not is_canonical(application) else "drift_unknown"
        return payload

    from apps.applications.assignment_resolution import (
        AssignmentConfigurationError,
        compute_configuration_version,
        resolve_eligibility_rules,
        resolve_required_documents,
    )
    from apps.catalog.models import CanonicalProgram, Program

    ids = canonical_ids(application)
    offering = Program.objects.filter(id=ids["program_offering_id"]).first()
    canonical = CanonicalProgram.objects.filter(id=ids["canonical_program_id"]).first()
    if offering is None or canonical is None:
        raise AssignmentConfigurationError()

    try:
        live_requirements = resolve_required_documents(offering, canonical)
        live_rules = resolve_eligibility_rules(offering)
    except AssignmentConfigurationError:
        if isinstance(snapshot, list):
            # The authoritative snapshot is still readable, so requirements CAN
            # be evaluated — only the drift probe is unavailable. Report that
            # honestly instead of failing the whole query or claiming "ok".
            payload["health"] = "drift_unknown"
            return payload
        raise

    live_version = compute_configuration_version(
        institution_id=ids["institution_id"],
        canonical_program_id=ids["canonical_program_id"],
        program_offering_id=ids["program_offering_id"],
        intake_id=ids["intake_id"],
        required_documents=live_requirements,
        eligibility_rules=live_rules,
    )
    payload["live_version"] = live_version
    if stored_version and stored_version != live_version:
        payload["drift"] = True
        payload["health"] = "drifted"
        stored_types = {
            str(row.get("document_type"))
            for row in (snapshot or [])
            if isinstance(row, dict) and row.get("document_type")
        }
        live_types = {
            str(row.get("document_type"))
            for row in live_requirements
            if isinstance(row, dict) and row.get("document_type")
        }
        payload["requirements_added"] = sorted(live_types - stored_types)
        payload["requirements_removed"] = sorted(stored_types - live_types)
    return payload


# ---------------------------------------------------------------------------
# Blockers + next actions
# ---------------------------------------------------------------------------

#: Deterministic blocker → next action mapping (design §8.3 "allowed next
#: actions and recoverability codes"). Every blocker resolves to exactly one
#: labelled action so the student is never dead-ended.
_NEXT_ACTION_BY_CODE: dict[str, dict[str, str]] = {
    PROFILE_INCOMPLETE: {"action": "complete-profile", "label": "Complete your personal details", "step": "personal"},
    MINIMUM_GRADES_REQUIRED: {"action": "add-grades", "label": "Add your Grade 12 results", "step": "education"},
    PROGRAM_ELIGIBILITY_NOT_MET: {"action": "review-eligibility", "label": "Review the programme requirements", "step": "education"},
    IDENTITY_DOCUMENT_REQUIRED: {"action": "upload-identity-document", "label": "Upload your NRC or passport", "step": "education"},
    REQUIRED_DOCUMENT_MISSING: {"action": "upload-required-documents", "label": "Upload the required documents", "step": "education"},
    PAYMENT_REQUIRED: {"action": "complete-payment", "label": "Pay or defer the application fee", "step": "payment"},
    FEE_NOT_CONFIGURED: {"action": "contact-admissions", "label": "Contact admissions about the application fee", "step": "payment"},
    "PROGRAM_CAPACITY_REACHED": {"action": "change-selection", "label": "Choose another intake or join the waitlist", "step": "program"},
    "INTAKE_CAPACITY_REACHED": {"action": "change-selection", "label": "Choose another intake", "step": "program"},
    "INTAKE_DEADLINE_PASSED": {"action": "change-selection", "label": "Choose an open intake", "step": "program"},
    DUPLICATE_SUBMITTED_APPLICATION: {"action": "open-existing-application", "label": "Open your existing application", "step": "program"},
    CONFIRM_SUBMISSION_REQUIRED: {"action": "confirm-and-submit", "label": "Confirm and submit your application", "step": "submit"},
    CONFIGURATION_UNAVAILABLE: {"action": "retry", "label": "Try again in a moment", "step": "submit"},
    ALREADY_SUBMITTED: {"action": "view-status", "label": "Track your submitted application", "step": "submit"},
    APPLICATION_NOT_EDITABLE: {"action": "view-status", "label": "Track your application", "step": "submit"},
}


def _blockers_from_sections(
    *,
    status: str,
    profile: dict[str, Any],
    grades: dict[str, Any] | None,
    eligibility: dict[str, Any] | None,
    identity: dict[str, Any],
    documents: dict[str, Any],
    payment: dict[str, Any],
    capacity: dict[str, Any],
    duplicates: dict[str, Any],
    intake: dict[str, Any],
    declarations: list[dict[str, Any]],
) -> list[ReadinessBlocker]:
    """Assemble the ordered blocker list.

    The order is the submission gate order: state, then the intake window, then
    the student's own work (profile → grades → eligibility → evidence →
    payment), then the contended/global checks (duplicate, capacity), then the
    declaration. It preserves the relative precedence of the pre-existing
    submission codes so no client contract shifts.
    """
    blockers: list[ReadinessBlocker] = []

    if status == "submitted":
        blockers.append(
            ReadinessBlocker(
                ALREADY_SUBMITTED,
                CATEGORY_STATE,
                "This application has already been submitted.",
            )
        )
    elif status != "draft":
        blockers.append(
            ReadinessBlocker(
                APPLICATION_NOT_EDITABLE,
                CATEGORY_STATE,
                f"An application with status '{status}' can no longer be submitted.",
                details={"status": status},
            )
        )

    if not intake["satisfied"]:
        blockers.append(
            ReadinessBlocker(
                intake["code"] or "INTAKE_NOT_AVAILABLE",
                CATEGORY_INTAKE,
                intake["message"] or "This intake is not open for applications.",
            )
        )

    if not profile["satisfied"]:
        labels = ", ".join(row["label"] for row in profile["missing_fields"])
        blockers.append(
            ReadinessBlocker(
                PROFILE_INCOMPLETE,
                CATEGORY_PROFILE,
                f"Complete your personal details before submitting: {labels}.",
                fields=tuple(row["field"] for row in profile["missing_fields"]),
            )
        )

    if not payment["satisfied"]:
        blockers.append(
            ReadinessBlocker(
                PAYMENT_REQUIRED,
                CATEGORY_PAYMENT,
                "Payment must be completed or deferred before submitting the application.",
                details={"payment_state": payment["state"]},
            )
        )
        fee = payment.get("fee") or {}
        if fee.get("configured") is False and fee.get("code"):
            blockers.append(
                ReadinessBlocker(
                    FEE_NOT_CONFIGURED,
                    CATEGORY_PAYMENT,
                    fee.get("message")
                    or "The application fee is not configured for this option.",
                )
            )

    if not identity["satisfied"]:
        blockers.append(
            ReadinessBlocker(
                IDENTITY_DOCUMENT_REQUIRED,
                CATEGORY_DOCUMENTS,
                "An NRC or Passport document must be uploaded before submission.",
            )
        )

    if not documents["satisfied"]:
        labels = ", ".join(row["label"] for row in documents["missing_required"])
        blockers.append(
            ReadinessBlocker(
                REQUIRED_DOCUMENT_MISSING,
                CATEGORY_DOCUMENTS,
                f"Required document(s) must be uploaded before submission: {labels}.",
                details={"missing_required": documents["missing_required"]},
            )
        )

    if grades is not None and not grades["satisfied"]:
        blockers.append(
            ReadinessBlocker(
                MINIMUM_GRADES_REQUIRED,
                CATEGORY_GRADES,
                (
                    f"At least {grades['minimum_required']} unique Grade 12 subject results "
                    f"must be saved before submission "
                    f"({grades['unique_canonical_count']}/{grades['minimum_required']} saved)."
                ),
                details={
                    "unique_canonical_count": grades["unique_canonical_count"],
                    "minimum_required": grades["minimum_required"],
                    "unresolved_subject_count": grades["unresolved_subject_count"],
                },
            )
        )

    if eligibility is not None and not eligibility["satisfied"]:
        blockers.append(
            ReadinessBlocker(
                PROGRAM_ELIGIBILITY_NOT_MET,
                CATEGORY_ELIGIBILITY,
                "Your saved results do not meet the mandatory subject requirements for this programme.",
                details={"mandatory_unmet": eligibility["mandatory_unmet"]},
            )
        )

    if not duplicates["satisfied"]:
        blockers.append(
            ReadinessBlocker(
                DUPLICATE_SUBMITTED_APPLICATION,
                CATEGORY_DUPLICATE,
                "Another application for this programme and intake has already been submitted.",
                details={"existing_id": duplicates["existing_id"]},
            )
        )

    if not capacity["satisfied"]:
        blockers.append(
            ReadinessBlocker(
                capacity["code"] or "PROGRAM_CAPACITY_REACHED",
                CATEGORY_CAPACITY,
                "This offering has reached maximum capacity for the selected intake.",
                details={"limit": capacity["limit"], "occupied": capacity["occupied"]},
            )
        )

    for declaration in declarations:
        if not declaration["accepted"]:
            blockers.append(
                ReadinessBlocker(
                    declaration["blocker_code"],
                    CATEGORY_DECLARATION,
                    declaration["label"],
                    details={"declaration": declaration["code"]},
                )
            )

    return blockers


def build_next_actions(blockers: list[ReadinessBlocker], *, can_submit: bool, status: str) -> list[dict[str, Any]]:
    """Deterministic allowed next actions (design §8.3)."""
    actions: list[dict[str, Any]] = []
    seen: set[str] = set()

    if can_submit:
        actions.append(
            {
                "action": "submit-application",
                "label": "Submit your application",
                "step": "submit",
                "blocker_code": None,
            }
        )

    for blocker in blockers:
        mapped = _NEXT_ACTION_BY_CODE.get(blocker.code)
        if mapped is None:
            mapped = {
                "action": "contact-admissions",
                "label": "Contact admissions for help",
                "step": "submit",
            }
        if mapped["action"] in seen:
            continue
        seen.add(mapped["action"])
        actions.append({**mapped, "blocker_code": blocker.code})

    if not actions:
        actions.append(
            {
                "action": "view-status",
                "label": "Track your application",
                "step": "submit",
                "blocker_code": None,
            }
        )
    return actions


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def evaluate_readiness(application, *, declarations_accepted: bool = False) -> ApplicationReadiness:
    """The authoritative readiness report for one application (design §8.3).

    Raises:
        apps.applications.assignment_resolution.AssignmentConfigurationError:
            the canonical required-document configuration could not be evaluated
            and no versioned snapshot is available — readiness fails closed with
            the stable retryable ``CONFIGURATION_UNAVAILABLE`` (R11.6).
    """
    status = str(getattr(application, "status", "") or "")
    canonical = is_canonical(application)

    configuration = evaluate_configuration(application, live_requirements_probe=True)
    profile = evaluate_profile(application)
    identity = evaluate_identity_document(application)
    documents = evaluate_documents(application, allow_live_resolution=True)
    grades = evaluate_grades(application) if canonical else None
    eligibility = evaluate_eligibility(application, allow_live_resolution=True) if canonical else None
    payment = evaluate_payment(application)
    capacity = evaluate_capacity(application)
    duplicates = evaluate_duplicates(application)
    intake = evaluate_intake_window(application)
    declarations = evaluate_declarations(declarations_accepted=declarations_accepted)

    blockers = _blockers_from_sections(
        status=status,
        profile=profile,
        grades=grades,
        eligibility=eligibility,
        identity=identity,
        documents=documents,
        payment=payment,
        capacity=capacity,
        duplicates=duplicates,
        intake=intake,
        declarations=declarations,
    )

    # Only a draft can become submittable, and the declaration is captured *by*
    # the submit command itself — so an un-ticked declaration never keeps a
    # fully-prepared draft from reporting ``can_submit``, and it is not reported
    # as a blocker either. Keeping it out of both preserves the invariant clients
    # rely on: ``can_submit == (status == "draft" and blockers == [])``. The
    # declaration's real state stays in the ``declarations`` section, and the
    # submit command still re-checks it under the row lock (R10.6).
    blockers = [
        blocker for blocker in blockers if blocker.category != CATEGORY_DECLARATION
    ]
    can_submit = status == "draft" and not blockers

    ids = canonical_ids(application)
    return ApplicationReadiness(
        application_id=str(getattr(application, "id", "")),
        status=status,
        version=int(getattr(application, "version", 1) or 1),
        assignment={
            **ids,
            "canonical": canonical,
            "assignment_version": int(getattr(application, "assignment_version", 1) or 1),
            "institution": getattr(application, "institution", None),
            "program": getattr(application, "program", None),
            "intake": getattr(application, "intake", None),
        },
        configuration=configuration,
        profile=profile,
        identity=identity,
        grades=grades
        or {
            "persisted_count": 0,
            "unique_canonical_count": 0,
            "unresolved_subject_count": 0,
            "minimum_required": resolve_minimum_grades(),
            "satisfied": True,
            "subjects": [],
            "applicable": False,
        },
        eligibility=eligibility
        or {
            "status": "not_configured",
            "rules_evaluated": 0,
            "mandatory_unmet": [],
            "optional_unmet": [],
            "advisory": True,
            "satisfied": True,
            "applicable": False,
        },
        documents=documents,
        payment=payment,
        capacity=capacity,
        duplicates=duplicates,
        intake=intake,
        declarations=declarations,
        blockers=blockers,
        can_submit=can_submit,
        allowed_next_actions=build_next_actions(
            blockers, can_submit=can_submit, status=status
        ),
        evaluated_at=timezone.now().isoformat(),
    )


#: Section stubs used when a gate is delegated away from this module (the
#: submission service owns the contended checks) or deliberately bypassed
#: (admin force-submit). ``satisfied`` means "this pass contributes no blocker".
_SATISFIED_DOCUMENTS: dict[str, Any] = {
    "requirements": [],
    "missing_required": [],
    "satisfied": True,
}
_SATISFIED_PAYMENT: dict[str, Any] = {
    "state": "bypassed",
    "application_payment_status": None,
    "provider_status": None,
    "deferral_allowed": True,
    "satisfied": True,
}
_SATISFIED_IDENTITY: dict[str, Any] = {
    "satisfied": True,
    "accepted_document_types": ["nrc", "passport", "extra_kyc"],
}
_SATISFIED_CAPACITY: dict[str, Any] = {
    "canonical": False,
    "limit": None,
    "occupied": None,
    "seats_available": None,
    "satisfied": True,
    "code": None,
}
_SATISFIED_DUPLICATES: dict[str, Any] = {
    "has_duplicate": False,
    "existing_id": None,
    "existing_status": None,
    "satisfied": True,
}
_SATISFIED_INTAKE: dict[str, Any] = {
    "satisfied": True,
    "is_late": False,
    "code": None,
    "message": None,
    "deadline": None,
    "grace_period_days": None,
}


def submission_blockers(
    locked_application,
    *,
    declarations_accepted: bool = True,
    has_completed_payment: bool | None = None,
    has_identity_document: bool | None = None,
    skip_evidence_gates: bool = False,
    evaluate_contended: bool = True,
) -> list[ReadinessBlocker]:
    """Re-evaluate the submission gates on a **locked** application row (R10.6).

    Called from inside ``submit_application``'s transaction, after the capacity
    row and the application row are locked, so every gate reads committed state
    that cannot change under it.

    Differences from :func:`evaluate_readiness`, all deliberate:

    * ``allow_live_resolution`` is **False** for eligibility — submission trusts
      the versioned ``eligibility_snapshot`` captured at assignment time (the
      drift-free set; task 5.2/6.4). Required documents still resolve live when a
      canonical application has *no* ``requirements_snapshot``, so an unevaluable
      configuration still fails closed with ``CONFIGURATION_UNAVAILABLE``
      (DATA-04, STU-13).
    * Payment / identity results may be passed in, because the submission
      service computes them through its own (patchable) module-level helpers —
      passing them keeps this pass query-free for those two gates.
    * ``skip_evidence_gates`` mirrors ``submit_application(admin_force=True)``:
      the operator is force-submitting an offline/paper application, so the
      student-evidence gates (payment, identity, required documents, canonical
      grades, program eligibility) are bypassed exactly as they were before this
      pass existed. State, and the declaration, still apply.
    * ``evaluate_contended`` lets the caller keep ownership of the contended
      global checks — intake window, duplicates, capacity. ``submit_application``
      sets it ``False`` because it already re-checks the intake window and the
      duplicate gate inside the same lock and makes the authoritative last-seat
      decision under the ``ProgramIntake`` row lock
      (``CapacityService.take_seat_for_submission``, DATA-03); re-deriving them
      here would only duplicate the work and the queries.

    Returns the ordered blocker list; empty means the locked row is submittable.
    """
    canonical = is_canonical(locked_application) and not skip_evidence_gates
    status = str(getattr(locked_application, "status", "") or "")

    profile = evaluate_profile(locked_application)
    if skip_evidence_gates:
        identity = _SATISFIED_IDENTITY
        payment = _SATISFIED_PAYMENT
        documents = _SATISFIED_DOCUMENTS
    else:
        identity = evaluate_identity_document(
            locked_application, has_identity_document=has_identity_document
        )
        payment = evaluate_payment(
            locked_application,
            has_completed_payment=has_completed_payment,
            include_fee=False,
            include_provider_detail=False,
        )
        documents = (
            evaluate_documents(locked_application, allow_live_resolution=True)
            if canonical
            else _SATISFIED_DOCUMENTS
        )

    grades = evaluate_grades(locked_application) if canonical else None
    # Prefer the versioned ``eligibility_snapshot`` (drift-free, task 5.2). A
    # canonical row that predates the snapshot must still be *evaluated* — before
    # admissions-v2 task 7.1 a missing snapshot read as "no rules configured", so
    # the readiness query (which live-resolves) reported
    # ``PROGRAM_ELIGIBILITY_NOT_MET`` while submission accepted the same row. That
    # disagreement is the R11.5 hole 7.1 closes; the live fallback mirrors exactly
    # what the required-document gate above already does with a missing
    # ``requirements_snapshot``, so an unevaluable configuration still fails
    # closed instead of degrading to "no rules".
    eligibility = (
        evaluate_eligibility(
            locked_application,
            allow_live_resolution=not isinstance(
                getattr(locked_application, "eligibility_snapshot", None), list
            ),
        )
        if canonical
        else None
    )

    if evaluate_contended:
        capacity = evaluate_capacity(locked_application)
        duplicates = evaluate_duplicates(locked_application)
        intake = evaluate_intake_window(locked_application)
    else:
        capacity = _SATISFIED_CAPACITY
        duplicates = _SATISFIED_DUPLICATES
        intake = _SATISFIED_INTAKE

    declarations = evaluate_declarations(declarations_accepted=declarations_accepted)

    return _blockers_from_sections(
        status=status,
        profile=profile,
        grades=grades,
        eligibility=eligibility,
        identity=identity,
        documents=documents,
        payment=payment,
        capacity=capacity,
        duplicates=duplicates,
        intake=intake,
        declarations=declarations,
    )


def student_summary(readiness: ApplicationReadiness) -> dict[str, Any]:
    """Deterministic student submission summary (R11.2).

    A projection of stored fields and the current validation results — no
    generative model, no persuasive prose, no recommendation. It names what is
    done, what is outstanding, and the next action.
    """
    outstanding = [
        {"code": blocker.code, "message": blocker.message, "category": blocker.category}
        for blocker in readiness.blockers
    ]
    return {
        "programme": readiness.assignment.get("program"),
        "intake": readiness.assignment.get("intake"),
        "institution": readiness.assignment.get("institution"),
        "grades_saved": readiness.grades.get("unique_canonical_count", 0),
        "grades_required": readiness.grades.get("minimum_required"),
        "documents_uploaded": sum(
            1 for row in readiness.documents["requirements"] if row["state"] != "missing"
        ),
        "documents_required": sum(
            1 for row in readiness.documents["requirements"] if row["required"]
        ),
        "payment_state": readiness.payment["state"],
        "can_submit": readiness.can_submit,
        "outstanding": outstanding,
        "next_actions": readiness.allowed_next_actions,
    }


def reviewer_summary(readiness: ApplicationReadiness) -> dict[str, Any]:
    """Deterministic reviewer readiness checklist (R11.3, task 7.4).

    The structured replacement for the retired generative "AI review summary".
    Every row is a verified fact already computed by this module's evaluators —
    payment gate, required-document state, identity verification state,
    grade/eligibility results, duplicate/late flags — plus the allowed next
    actions. There is no prose, no score, and no recommendation: a reviewer
    reads facts and decides.

    ``state`` is one of ``satisfied`` / ``attention`` / ``blocked``:

    * ``blocked``    — a registered blocker names this check;
    * ``attention``  — the check is not satisfied but does not block submission
                       (an advisory eligibility rule, a late/duplicate flag);
    * ``satisfied``  — the deterministic evaluator is satisfied.
    """
    blocked_categories = {blocker.category for blocker in readiness.blockers}

    def _state(*, satisfied: bool, category: str | None, advisory: bool = False) -> str:
        if satisfied:
            return "satisfied"
        if not advisory and category is not None and category in blocked_categories:
            return "blocked"
        return "attention"

    documents = readiness.documents
    requirements = documents.get("requirements") or []
    missing_required = documents.get("missing_required") or []
    verified_documents = sum(1 for row in requirements if row.get("state") == "verified")
    uploaded_documents = sum(1 for row in requirements if row.get("state") != "missing")
    required_documents_count = sum(1 for row in requirements if row.get("required"))

    grades = readiness.grades
    eligibility = readiness.eligibility
    payment = readiness.payment
    identity = readiness.identity
    duplicates = readiness.duplicates
    intake = readiness.intake

    checks: list[dict[str, Any]] = [
        {
            "code": "payment_gate",
            "label": "Payment gate",
            "state": _state(satisfied=bool(payment.get("satisfied")), category="payment"),
            "detail": {
                "payment_state": payment.get("state"),
                "application_payment_status": payment.get("application_payment_status"),
                "provider_status": payment.get("provider_status"),
            },
        },
        {
            "code": "required_documents",
            "label": "Required documents",
            "state": _state(satisfied=bool(documents.get("satisfied")), category="documents"),
            "detail": {
                "required": required_documents_count,
                "uploaded": uploaded_documents,
                "verified": verified_documents,
                "missing_required": list(missing_required),
                "requirements": list(requirements),
            },
        },
        {
            "code": "identity_verification",
            "label": "Identity document",
            "state": _state(satisfied=bool(identity.get("satisfied")), category="identity"),
            "detail": {
                "accepted_document_types": identity.get("accepted_document_types") or [],
            },
        },
        {
            "code": "grades",
            "label": "Canonical grades",
            "state": _state(satisfied=bool(grades.get("satisfied")), category="grades"),
            "detail": {
                "unique_canonical_count": grades.get("unique_canonical_count"),
                "minimum_required": grades.get("minimum_required"),
                "non_canonical_count": grades.get("non_canonical_count"),
            },
        },
        {
            "code": "eligibility",
            "label": "Programme eligibility",
            "state": _state(
                satisfied=bool(eligibility.get("satisfied")),
                category="eligibility",
                advisory=bool(eligibility.get("advisory")),
            ),
            "detail": {
                "status": eligibility.get("status"),
                "mandatory_unmet": eligibility.get("mandatory_unmet") or [],
                "optional_unmet": eligibility.get("optional_unmet") or [],
                "advisory": bool(eligibility.get("advisory")),
            },
        },
        {
            "code": "duplicates",
            "label": "Duplicate application",
            "state": _state(satisfied=bool(duplicates.get("satisfied")), category="duplicates"),
            "detail": {
                "has_duplicate": bool(duplicates.get("has_duplicate")),
                "existing_id": duplicates.get("existing_id"),
                "existing_status": duplicates.get("existing_status"),
            },
        },
        {
            "code": "intake_window",
            "label": "Intake window",
            # A late-but-allowed submission is a flag a reviewer must see, not a
            # blocker: ``satisfied`` stays true and ``is_late`` carries the fact.
            "state": _state(
                satisfied=bool(intake.get("satisfied")) and not bool(intake.get("is_late")),
                category="intake",
                advisory=bool(intake.get("satisfied")),
            ),
            "detail": {
                "is_late": bool(intake.get("is_late")),
                "deadline": intake.get("deadline"),
                "grace_period_days": intake.get("grace_period_days"),
                "code": intake.get("code"),
            },
        },
    ]

    return {
        "application_id": readiness.application_id,
        "status": readiness.status,
        "programme": readiness.assignment.get("program"),
        "intake": readiness.assignment.get("intake"),
        "institution": readiness.assignment.get("institution"),
        "checks": checks,
        "blocked_checks": [check["code"] for check in checks if check["state"] == "blocked"],
        "attention_checks": [check["code"] for check in checks if check["state"] == "attention"],
        "can_submit": readiness.can_submit,
        "allowed_next_actions": readiness.allowed_next_actions,
        "evaluated_at": readiness.evaluated_at,
    }


__all__ = [
    "ApplicationReadiness",
    "DECLARATIONS",
    "DEFAULT_MINIMUM_PERSISTED_GRADES",
    "IDENTITY_DOCUMENT_TYPES",
    "MINIMUM_GRADES_SETTING_KEY",
    "NON_COUNTING_VERIFICATION_STATUSES",
    "ReadinessBlocker",
    "REQUIRED_PROFILE_FIELDS",
    "uploaded_document_rows",
    "build_next_actions",
    "canonical_ids",
    "evaluate_capacity",
    "evaluate_configuration",
    "evaluate_declarations",
    "evaluate_documents",
    "evaluate_duplicates",
    "evaluate_eligibility",
    "evaluate_fee",
    "evaluate_grades",
    "evaluate_identity_document",
    "evaluate_intake_window",
    "evaluate_payment",
    "evaluate_profile",
    "evaluate_readiness",
    "is_canonical",
    "required_documents",
    "resolve_minimum_grades",
    "reviewer_summary",
    "student_summary",
    "submission_blockers",
]
