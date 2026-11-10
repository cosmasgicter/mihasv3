"""Student required-document upload contract (admissions-v2 task 7.2).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.2**.
Requirements: R11.6 (required document controls rendered from a versioned
              requirements snapshot, not a hardcoded type list; failure to
              evaluate canonical requirements blocks with a retryable service
              error), R11.7 (uploads carry type/size validation), R11.8 (replace
              preserves prior evidence).
Findings:     **STU-13** — "tenant-configured required documents can be returned
              by assignment but the wizard only uploads two hardcoded document
              types; requirement lookup errors fail open".
Design:       §9.3 (Required Documents — "Requirements are versioned and
              snapshotted to the application assignment. The wizard renders each
              server requirement, including custom tenant types.").

Why this module exists
----------------------
Before 7.2 there was no server contract a client could render upload controls
from. The wizard hardcoded two fields (``result_slip`` and ``extra_kyc``) and the
upload command hardcoded an eight-value ``document_type`` choice list, so a
tenant could configure ``nursing_council_letter``, the assignment would resolve
it, submission would *block* on it — and the student had no control to satisfy it
and no API that would accept it. This module is the one place that answers both
halves of that question:

1. **What must this application upload?** :func:`build_contract` resolves the
   application's versioned requirements (preferring the ``requirements_snapshot``
   task 5.2 stamped on the row) through the *same* fail-closed resolver readiness
   uses, adds the platform baseline the submission gate enforces unconditionally,
   and attaches the current evidence for each requirement.
2. **May this upload be accepted?** :func:`resolve_upload_target` answers for one
   ``document_type`` using the *same* contract, so a control the client rendered
   is always uploadable and a type nobody asked for never is.

Layering: this module depends on :mod:`apps.applications.readiness_service` (the
snapshot resolver, the identity-gate types, and the "which document counts"
definition) and never the other way round, so there is exactly one requirement
authority and no import cycle. It is framework-neutral — no DRF import — so the
V1 student view and the upload command both map its result onto their own
envelope.

Fail closed (R11.6, DATA-04): when a canonical application's requirement
configuration cannot be evaluated, the underlying resolver raises
``AssignmentConfigurationError`` and this module lets it propagate. Callers
translate it to the stable retryable ``CONFIGURATION_UNAVAILABLE`` (503). It is
never swallowed into "no requirements" and never into "upload accepted".
"""

from __future__ import annotations

import logging
from typing import Any

from apps.applications.readiness_service import (
    IDENTITY_DOCUMENT_TYPES,
    required_documents as resolve_requirement_snapshot,
    uploaded_document_rows,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Platform upload policy (the ceiling a tenant rule may narrow, never widen)
# ---------------------------------------------------------------------------

#: MIME types the platform can accept for applicant evidence. This is a *subset*
#: of ``apps.documents.validators.ALLOWED_MIME_TYPES`` on purpose: every type
#: advertised here must survive the magic-byte check, so the contract can never
#: promise something the upload command will then refuse. Enforced by
#: ``tests/unit/test_required_documents_contract.py``.
PLATFORM_ACCEPTED_MIME_TYPES: tuple[str, ...] = (
    "application/pdf",
    "image/jpeg",
    "image/png",
)

#: File extensions per accepted MIME type — published so a client can build an
#: ``accept`` attribute and a human-readable hint without its own table.
MIME_EXTENSIONS: dict[str, tuple[str, ...]] = {
    "application/pdf": (".pdf",),
    "image/jpeg": (".jpg", ".jpeg"),
    "image/png": (".png",),
}

#: Hard platform ceiling on a single applicant upload (bytes). Mirrors the limit
#: the upload command has always enforced. A tenant rule may lower this for a
#: requirement; it can never raise it.
PLATFORM_MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024

#: The smallest max-size a tenant rule may configure. Below this the rule is
#: unusable (no real scan or photo fits) and is treated as misconfiguration.
MIN_CONFIGURABLE_MAX_BYTES: int = 1024

#: Document types the platform itself owns, independent of tenant configuration.
#: They stay uploadable so existing student and operator flows (identity
#: evidence, result slips, admin-attached transcripts) keep working on tenants
#: that have configured nothing. ``application_slip`` remains system-generated
#: and is authorised separately by the upload command.
LEGACY_PLATFORM_DOCUMENT_TYPES: tuple[str, ...] = (
    "nrc",
    "passport",
    "result_slip",
    "extra_kyc",
    "application_slip",
    "transcript",
    "certificate",
    "other",
)

#: Requirement source labels published in the contract.
SOURCE_TENANT = "tenant"
SOURCE_PLATFORM = "platform"

#: Constraint provenance published per requirement, so an operator can see when a
#: tenant rule was narrowed or ignored instead of silently guessing.
CONSTRAINTS_DEFAULT = "platform_default"
CONSTRAINTS_TENANT = "tenant"
CONSTRAINTS_TENANT_NARROWED = "tenant_narrowed"

#: Stable client-facing codes (registered in ``docs/canonical-truth-map.md``).
#: Mirrored by ``apps/admissions/src/lib/requiredDocuments.ts``
#: (``UPLOAD_REJECTION_CODES``) and drift-guarded by
#: ``apps/admissions/tests/unit/requiredDocumentsDrift.test.ts``.
DOCUMENT_TYPE_NOT_REQUIRED = "DOCUMENT_TYPE_NOT_REQUIRED"
INVALID_FILE_TYPE = "INVALID_FILE_TYPE"
FILE_TOO_LARGE = "FILE_TOO_LARGE"
EMPTY_FILE = "EMPTY_FILE"
UNSAFE_FILE_CONTENT = "UNSAFE_FILE_CONTENT"

#: The full rejection vocabulary the upload command can return for a contract
#: decision. Kept as a tuple so both sides of the mirror can enumerate it.
UPLOAD_REJECTION_CODES: tuple[str, ...] = (
    DOCUMENT_TYPE_NOT_REQUIRED,
    EMPTY_FILE,
    FILE_TOO_LARGE,
    INVALID_FILE_TYPE,
    UNSAFE_FILE_CONTENT,
)

#: The requirements every application carries regardless of tenant configuration.
#:
#: ``extra_kyc`` is the platform identity gate ``submit_application`` enforces
#: unconditionally (``IDENTITY_DOCUMENT_REQUIRED``) — publishing it here is what
#: keeps the rendered controls and the submission gate in agreement. It accepts
#: any of :data:`IDENTITY_DOCUMENT_TYPES`, so an ``nrc`` or ``passport`` already
#: on file satisfies it.
#:
#: ``result_slip`` is the platform grade-evidence requirement the student wizard
#: has always enforced; keeping it server-side (rather than in the UI) is what
#: makes the control list configuration-driven while preserving today's behaviour
#: for a tenant that has configured nothing. A tenant row for either type
#: supersedes the baseline entry.
PLATFORM_BASELINE_REQUIREMENTS: tuple[dict[str, Any], ...] = (
    {
        "document_type": "result_slip",
        "label": "Grade 12 result slip",
        "required": True,
        "description": "Your Grade 12 statement of results. A clear phone photo is fine.",
        "accepts_document_types": ("result_slip",),
    },
    {
        "document_type": "extra_kyc",
        "label": "NRC or passport",
        "required": True,
        "description": "Photo or scan of your NRC or passport.",
        "accepts_document_types": IDENTITY_DOCUMENT_TYPES,
    },
)


# ---------------------------------------------------------------------------
# Constraint resolution
# ---------------------------------------------------------------------------


def _coerce_mime_types(candidates: list[str]) -> list[str]:
    """Keep only platform-supported MIME types, in the platform's own order."""
    normalised = {candidate.strip().lower() for candidate in candidates}
    return [mime for mime in PLATFORM_ACCEPTED_MIME_TYPES if mime in normalised]


def _coerce_max_bytes(rules: dict[str, Any]) -> int | None:
    """Read a configured max size in bytes (or MB), ignoring nonsense values."""
    raw_bytes = rules.get("max_size_bytes", rules.get("max_bytes"))
    if raw_bytes is None:
        raw_mb = rules.get("max_size_mb")
        if raw_mb is None:
            return None
        try:
            raw_bytes = float(raw_mb) * 1024 * 1024
        except (TypeError, ValueError):
            return None
    try:
        value = int(raw_bytes)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return value


def resolve_constraints(rules: Any) -> dict[str, Any]:
    """Resolve the upload constraints for one requirement.

    The platform values are the ceiling. A tenant rule may narrow the accepted
    MIME set or lower the maximum size; it can never widen either. An
    unrecognised or unusable rule falls back to the platform default rather than
    advertising a control the student could never satisfy — the fallback is
    reported through ``constraints_source`` and logged, so a misconfiguration is
    visible to operators instead of silently blocking an applicant.
    """
    rules = rules if isinstance(rules, dict) else {}

    requested_mimes = _as_list(
        rules.get("accepted_mime_types", rules.get("mime_types", rules.get("accept")))
    )
    supported_mimes = _coerce_mime_types(requested_mimes)
    accepted_mime_types = supported_mimes or list(PLATFORM_ACCEPTED_MIME_TYPES)

    configured_max = _coerce_max_bytes(rules)
    max_size_bytes = (
        PLATFORM_MAX_UPLOAD_BYTES
        if configured_max is None
        else max(MIN_CONFIGURABLE_MAX_BYTES, min(configured_max, PLATFORM_MAX_UPLOAD_BYTES))
    )

    # ``narrowed`` says the effective constraints are stricter than the platform
    # ceiling; ``constraints_source`` says where they came from and whether the
    # platform had to clamp or ignore part of the tenant rule.
    narrowed = len(accepted_mime_types) < len(PLATFORM_ACCEPTED_MIME_TYPES) or (
        max_size_bytes < PLATFORM_MAX_UPLOAD_BYTES
    )
    clamped = (configured_max is not None and max_size_bytes != configured_max) or (
        len(supported_mimes) != len(requested_mimes)
    )
    if not requested_mimes and configured_max is None:
        constraints_source = CONSTRAINTS_DEFAULT
    elif clamped:
        constraints_source = CONSTRAINTS_TENANT_NARROWED
    else:
        constraints_source = CONSTRAINTS_TENANT

    if requested_mimes and not supported_mimes:
        logger.warning(
            "Required-document rule configured no platform-supported MIME type; "
            "falling back to the platform default set",
        )

    extensions: list[str] = []
    for mime in accepted_mime_types:
        for extension in MIME_EXTENSIONS.get(mime, ()):
            if extension not in extensions:
                extensions.append(extension)

    return {
        "accepted_mime_types": accepted_mime_types,
        "accepted_extensions": extensions,
        "max_size_bytes": max_size_bytes,
        "constraints_source": constraints_source,
        "constraints_narrowed": narrowed,
    }


def _as_list(raw: Any) -> list[str]:
    if isinstance(raw, str):
        return [raw]
    if isinstance(raw, (list, tuple, set)):
        return [str(value) for value in raw]
    return []


# ---------------------------------------------------------------------------
# Contract assembly
# ---------------------------------------------------------------------------


def _requirement_row(
    requirement: dict[str, Any],
    *,
    source: str,
    accepts: tuple[str, ...] | None = None,
) -> dict[str, Any] | None:
    """Project one resolved requirement onto the published contract row."""
    document_type = requirement.get("document_type")
    if not document_type:
        return None
    document_type = str(document_type)
    rules = requirement.get("rules")
    rules = rules if isinstance(rules, dict) else {}
    description = requirement.get("description") or rules.get("description") or rules.get("help_text")
    accepts_document_types = accepts or tuple(
        _as_list(rules.get("accepts_document_types")) or (document_type,)
    )

    row: dict[str, Any] = {
        "document_type": document_type,
        "label": str(requirement.get("label") or document_type),
        "required": bool(requirement.get("required", requirement.get("is_required", False))),
        "description": str(description) if description else None,
        "source": source,
        "accepts_document_types": list(dict.fromkeys(accepts_document_types)),
    }
    row.update(resolve_constraints(rules))
    return row


def _baseline_row(baseline: dict[str, Any]) -> dict[str, Any]:
    row = _requirement_row(
        {
            "document_type": baseline["document_type"],
            "label": baseline["label"],
            "required": baseline["required"],
            "description": baseline["description"],
            "rules": {},
        },
        source=SOURCE_PLATFORM,
        accepts=tuple(baseline["accepts_document_types"]),
    )
    # ``_requirement_row`` only returns None for a requirement with no type, and
    # every baseline entry has one.
    assert row is not None  # noqa: S101 - module-local invariant, not user input
    return row


def resolve_requirements(application, *, allow_live_resolution: bool = True) -> list[dict[str, Any]]:
    """The ordered requirement rows for *application* (no evidence attached).

    Tenant-configured requirements come first, in the resolver's own order, then
    any platform baseline requirement the tenant configuration did not already
    cover. A tenant row always supersedes the baseline entry for the same type,
    so the tenant's own label/rules win.

    Raises:
        AssignmentConfigurationError: the canonical requirement configuration
            could not be evaluated (fail closed, retryable 503).
    """
    resolved = resolve_requirement_snapshot(
        application, allow_live_resolution=allow_live_resolution
    )

    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for requirement in resolved or []:
        if not isinstance(requirement, dict):
            continue
        row = _requirement_row(requirement, source=SOURCE_TENANT)
        if row is None or row["document_type"] in seen:
            continue
        seen.add(row["document_type"])
        rows.append(row)

    covered: set[str] = set()
    for row in rows:
        covered.add(row["document_type"])
        covered.update(row["accepts_document_types"])

    for baseline in PLATFORM_BASELINE_REQUIREMENTS:
        if baseline["document_type"] in covered:
            continue
        if any(alias in covered for alias in baseline["accepts_document_types"]):
            continue
        rows.append(_baseline_row(baseline))

    return rows


def build_contract(application, *, allow_live_resolution: bool = True) -> dict[str, Any]:
    """The full student-facing required-document contract for *application*.

    Every row carries what a client needs to render one accessible upload
    control — label, whether it is required, help text, accepted MIME types and
    extensions, the maximum size — plus the current evidence state and, when
    present, the identity of the current document so a replace command targets a
    real server record rather than local UI state (STU-19).

    Raises:
        AssignmentConfigurationError: the canonical requirement configuration
            could not be evaluated (fail closed, retryable 503).
    """
    requirements = resolve_requirements(
        application, allow_live_resolution=allow_live_resolution
    )
    evidence = uploaded_document_rows(application)
    history = _version_history(application)

    missing_required: list[dict[str, str]] = []
    for row in requirements:
        document = None
        for candidate_type in row["accepts_document_types"]:
            candidate = evidence.get(candidate_type)
            if candidate is not None:
                document = candidate
                break
        # Prior versions for every type this requirement accepts, newest first.
        # Published so the student can see that a replace produced a *new server
        # record* and the old one is preserved rather than overwritten
        # (R11.8, STU-19) — and so a reviewer's client can show the same chain.
        row["history"] = [
            entry
            for candidate_type in row["accepts_document_types"]
            for entry in history.get(candidate_type, [])
        ]
        if document is None:
            row["state"] = "missing"
            row["document"] = None
            if row["required"]:
                missing_required.append(
                    {"document_type": row["document_type"], "label": row["label"]}
                )
        else:
            row["state"] = (
                "verified" if document["verification_status"] == "verified" else "uploaded"
            )
            uploaded_at = document.get("uploaded_at")
            row["document"] = {
                "id": document["id"],
                "document_type": document["document_type"],
                "document_name": document["document_name"],
                "verification_status": document["verification_status"],
                "file_size": document["file_size"],
                "mime_type": document["mime_type"],
                "uploaded_at": uploaded_at.isoformat() if hasattr(uploaded_at, "isoformat") else uploaded_at,
                # Immutable-version identity (task 7.3, R11.7-R11.8). ``version``
                # and ``checksum`` are what let a client prove the stored evidence
                # actually changed after a replace instead of trusting local state.
                "version": document.get("version"),
                "lifecycle_state": document.get("lifecycle_state"),
                "checksum": document.get("content_hash"),
            }

    return {
        "application_id": str(getattr(application, "id", "") or ""),
        "application_status": getattr(application, "status", None),
        "configuration_version": getattr(application, "configuration_version", None),
        "requirements": requirements,
        "missing_required": sorted(missing_required, key=lambda row: row["document_type"]),
        "satisfied": not missing_required,
        "policy": {
            "max_size_bytes": PLATFORM_MAX_UPLOAD_BYTES,
            "accepted_mime_types": list(PLATFORM_ACCEPTED_MIME_TYPES),
        },
        # Whether this application's institution has opted in to OCR grade
        # suggestions (platform-simplification task 18.2, decision D4). The
        # wizard calls extract and polls only when this is true.
        "ocr_available": _ocr_available(application),
    }


def _ocr_available(application) -> bool:
    """Never blocks the contract: a policy read failure means "not available"."""
    try:
        from apps.documents.ocr_policy import is_ocr_enabled_for_application

        return bool(is_ocr_enabled_for_application(application))
    except Exception:  # pragma: no cover - the contract must still publish
        logger.warning("OCR availability read failed; publishing ocr_available=false")
        return False


# ---------------------------------------------------------------------------
# Upload authorisation + validation
# ---------------------------------------------------------------------------


def _version_history(application) -> dict[str, list[dict[str, Any]]]:
    """Superseded/removed versions per document type (task 7.3).

    Read through the evidence authority so the contract cannot develop its own
    idea of which versions are history. Never blocks the contract: if the history
    read fails, the requirement rows still publish, because a student must not be
    denied their upload controls by a bookkeeping query.
    """
    application_id = getattr(application, "id", None)
    if application_id is None:
        return {}
    try:
        from apps.documents.document_evidence import history_rows

        return history_rows(application_id)
    except Exception:  # pragma: no cover - history is additive to the contract
        logger.warning("Document version history read failed; publishing contract without it")
        return {}


class UploadRejected(Exception):
    """An upload the contract cannot accept, with a stable client code."""

    def __init__(self, code: str, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def resolve_upload_target(
    application, document_type: str, *, allow_live_resolution: bool = True
) -> dict[str, Any]:
    """The requirement an upload of *document_type* satisfies.

    Falls back to the platform policy for a :data:`LEGACY_PLATFORM_DOCUMENT_TYPES`
    type that the tenant did not configure, so existing student and operator
    flows keep working unchanged.

    Raises:
        UploadRejected: the type is neither configured for this application nor a
            platform type — ``DOCUMENT_TYPE_NOT_REQUIRED``.
        AssignmentConfigurationError: the configuration could not be evaluated.
    """
    requested = str(document_type or "").strip()
    requirements = resolve_requirements(
        application, allow_live_resolution=allow_live_resolution
    )

    for row in requirements:
        if requested == row["document_type"] or requested in row["accepts_document_types"]:
            return row

    if requested in LEGACY_PLATFORM_DOCUMENT_TYPES:
        return _baseline_row(
            {
                "document_type": requested,
                "label": requested.replace("_", " ").strip().capitalize(),
                "required": False,
                "description": None,
                "accepts_document_types": (requested,),
            }
        )

    raise UploadRejected(
        DOCUMENT_TYPE_NOT_REQUIRED,
        "This document is not requested for this application.",
    )


def validate_upload(requirement: dict[str, Any], *, size: int | None, mime_type: str | None) -> None:
    """Enforce the requirement's own size and type constraints.

    Runs *before* the magic-byte check so a client sees the constraint it was
    shown, not a generic content error. The magic-byte check then remains the
    authority on what the bytes actually are.

    Raises:
        UploadRejected: ``EMPTY_FILE``, ``FILE_TOO_LARGE`` or ``INVALID_FILE_TYPE``.
    """
    max_size_bytes = int(requirement.get("max_size_bytes") or PLATFORM_MAX_UPLOAD_BYTES)
    if size == 0:
        # The client refuses an empty selection locally with this same code; the
        # magic-byte validator would otherwise report it as a generic content
        # error, which reads to a student as "your document is wrong".
        raise UploadRejected(
            EMPTY_FILE,
            "That file is empty. Please choose the file again.",
        )
    if size is not None and size > max_size_bytes:
        raise UploadRejected(
            FILE_TOO_LARGE,
            f"File exceeds the {_format_size(max_size_bytes)} limit for {requirement.get('label') or 'this document'}.",
        )

    accepted = requirement.get("accepted_mime_types") or list(PLATFORM_ACCEPTED_MIME_TYPES)
    normalised = str(mime_type or "").strip().lower()
    if normalised not in accepted:
        readable = ", ".join(
            extension for extension in (requirement.get("accepted_extensions") or [])
        )
        raise UploadRejected(
            INVALID_FILE_TYPE,
            f"Unsupported file type. Accepted: {readable}." if readable else "Unsupported file type.",
        )


def _format_size(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        megabytes = num_bytes / (1024 * 1024)
        return f"{megabytes:.0f}MB" if megabytes.is_integer() else f"{megabytes:.1f}MB"
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.0f}KB"
    return f"{num_bytes} bytes"


__all__ = [
    "CONSTRAINTS_DEFAULT",
    "CONSTRAINTS_TENANT",
    "CONSTRAINTS_TENANT_NARROWED",
    "DOCUMENT_TYPE_NOT_REQUIRED",
    "EMPTY_FILE",
    "FILE_TOO_LARGE",
    "INVALID_FILE_TYPE",
    "UNSAFE_FILE_CONTENT",
    "UPLOAD_REJECTION_CODES",
    "LEGACY_PLATFORM_DOCUMENT_TYPES",
    "MIME_EXTENSIONS",
    "MIN_CONFIGURABLE_MAX_BYTES",
    "PLATFORM_ACCEPTED_MIME_TYPES",
    "PLATFORM_BASELINE_REQUIREMENTS",
    "PLATFORM_MAX_UPLOAD_BYTES",
    "SOURCE_PLATFORM",
    "SOURCE_TENANT",
    "UploadRejected",
    "build_contract",
    "resolve_constraints",
    "resolve_requirements",
    "resolve_upload_target",
    "validate_upload",
]
