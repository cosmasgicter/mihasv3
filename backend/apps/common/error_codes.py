"""Canonical error-code catalogue - single source of truth for the entire platform.

Every error code emitted by any backend endpoint MUST have an entry here.
The frontend mirror at ``apps/admissions/src/lib/errorMessages.ts`` keeps
a subset of these codes with user-facing copy. Drift is detected by
``apps/admissions/tests/unit/errorCodesDriftGuard.test.ts`` (frontend) and
``backend/tests/unit/test_error_codes_canonical.py`` (backend).

Categories: payment, application, auth, document, validation, common.
"""

from __future__ import annotations

from rest_framework import status

# ---------------------------------------------------------------------------
# Canonical catalogue
# ---------------------------------------------------------------------------

ERROR_CODES: dict[str, dict] = {}

# Re-export payment codes (preserves payment_error_codes.py as the
# payment-specific catalog - we just merge into the unified map).
# Imported lazily inside the function to avoid a module-level
# apps.common → apps.documents import cycle (see scripts/check_circular_imports.py).
def _merge_payment_codes() -> None:
    from apps.documents.payment_error_codes import PAYMENT_ERROR_CODES

    for code, entry in PAYMENT_ERROR_CODES.items():
        ERROR_CODES[code] = {
            "http_status": entry.http_status,
            "message": entry.message,
            "category": "payment",
        }


_merge_payment_codes()

# --- Common ---
ERROR_CODES.update({
    "NOT_FOUND": {
        "http_status": status.HTTP_404_NOT_FOUND,
        "message": "Resource not found",
        "category": "common",
    },
    "RATE_LIMITED": {
        "http_status": status.HTTP_429_TOO_MANY_REQUESTS,
        "message": "Too many requests. Please wait and try again.",
        "category": "common",
    },
})

# --- Auth ---
ERROR_CODES.update({
    "INSUFFICIENT_PERMISSIONS": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "You do not have permission for this action",
        "category": "auth",
    },
    "AUTHENTICATION_REQUIRED": {
        "http_status": status.HTTP_401_UNAUTHORIZED,
        "message": "Authentication required",
        "category": "auth",
    },
    "CSRF_MISSING": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "CSRF token missing",
        "category": "auth",
    },
    "CSRF_INVALID": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "CSRF token invalid",
        "category": "auth",
    },
    "NO_REFRESH_TOKEN": {
        "http_status": status.HTTP_401_UNAUTHORIZED,
        "message": "Refresh token not provided",
        "category": "auth",
    },
    "TOKEN_EXPIRED": {
        "http_status": status.HTTP_401_UNAUTHORIZED,
        "message": "Token has expired",
        "category": "auth",
    },
    "INVALID_TOKEN": {
        "http_status": status.HTTP_401_UNAUTHORIZED,
        "message": "Invalid token",
        "category": "auth",
    },
    "AUTH_SERVICE_ERROR": {
        "http_status": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "message": "Authentication service error",
        "category": "auth",
    },
    "PRIVILEGE_ESCALATION": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "Cannot assign a role higher than your own",
        "category": "auth",
    },
    "INSUFFICIENT_PRIVILEGES": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "Insufficient privileges for this operation",
        "category": "auth",
    },
    "SELF_DEACTIVATION_FORBIDDEN": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "Cannot deactivate your own account",
        "category": "auth",
    },
    "DUPLICATE_EMAIL": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "An account with this email already exists",
        "category": "auth",
    },
})

# --- Enterprise tenant authority (multi-tenant Beanola) ---
# Centralized authority + tenant-scoped staff management codes. Authority
# decisions resolve through ``AdminCapabilityService``; these stable codes
# back the fail-closed responses for capability resolution, scoped staff
# invitation, transactional staff creation, and domain-resolved institution
# binding (spec enterprise-tenant-authority — R1.6, R6.3/R6.5, R7.12).
ERROR_CODES.update({
    "CAPABILITY_RESOLUTION_FAILED": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "Your capabilities could not be resolved; the action is denied.",
        "category": "auth",
    },
    "STAFF_INVITE_FORBIDDEN": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "You cannot invite a user with that role into that institution.",
        "category": "auth",
    },
    "STAFF_CREATION_FAILED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Staff account could not be created. No changes were saved.",
        "category": "auth",
    },
    "INSTITUTION_OVERRIDE_NOT_PERMITTED": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "The submitted institution does not match the tenant resolved for this domain.",
        "category": "auth",
    },
})

# --- Validation ---
ERROR_CODES.update({
    "VALIDATION_ERROR": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Validation failed",
        "category": "validation",
    },
    "INVALID_FORMAT": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid format",
        "category": "validation",
    },
    "INVALID_STATUS_TRANSITION": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid status transition",
        "category": "validation",
    },
})

# --- Application ---
ERROR_CODES.update({
    "DUPLICATE_APPLICATION": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "An application for this program already exists",
        "category": "application",
    },
    "DUPLICATE_SUBMITTED_APPLICATION": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "A submitted application for this program already exists",
        "category": "application",
    },
    "PAYMENT_REQUIRED": {
        "http_status": status.HTTP_402_PAYMENT_REQUIRED,
        "message": "Payment is required before submission",
        "category": "application",
    },
    "IDENTITY_DOCUMENT_REQUIRED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "NRC or Passport document is required",
        "category": "application",
    },
    "LATE_FEE_REQUIRED": {
        "http_status": status.HTTP_402_PAYMENT_REQUIRED,
        "message": "Late application fee is required",
        "category": "application",
    },
    "LATE_FEE_CHECK_FAILED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Late fee check failed",
        "category": "application",
    },
    "ALREADY_SUBMITTED": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "Application has already been submitted",
        "category": "application",
    },
    "INTAKE_DEADLINE_PASSED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "The intake deadline has passed",
        "category": "application",
    },
    "INTAKE_NOT_OPEN": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "This intake is not currently open",
        "category": "application",
    },
    "INTAKE_CAPACITY_REACHED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Intake capacity has been reached",
        "category": "application",
    },
    "PROGRAM_CAPACITY_REACHED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Program capacity has been reached",
        "category": "application",
    },
    "APPLICATION_NOT_EDITABLE": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "Application cannot be edited in its current state",
        "category": "application",
    },
    "CONFIRM_SUBMISSION_REQUIRED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Submission confirmation is required",
        "category": "application",
    },
    "DRAFT_HAS_PAYMENT_ACTIVITY": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "Draft has payment activity and cannot be modified",
        "category": "application",
    },
    "APPLICATION_DELETE_FAILED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Application could not be deleted",
        "category": "application",
    },
    "NOT_WAITLISTED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Application is not in waitlisted status",
        "category": "application",
    },
    "INVALID_STATUS_FOR_CONDITIONS": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Conditions cannot be set for this application status",
        "category": "application",
    },
    "NO_CONDITIONS_PROVIDED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "At least one condition must be provided",
        "category": "application",
    },
    "MISSING_DESCRIPTION": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Description is required",
        "category": "application",
    },
    "MISSING_DEADLINE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Deadline is required",
        "category": "application",
    },
    "INVALID_CONDITION_TYPE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid condition type",
        "category": "application",
    },
    "CONDITION_NOT_PENDING": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Condition is not in pending status",
        "category": "application",
    },
    "INVALID_CONDITION_STATUS": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid condition status",
        "category": "application",
    },
})

# --- Auth (extended) ---
ERROR_CODES.update({
    "ACCOUNT_LOCKED": {
        "http_status": status.HTTP_423_LOCKED,
        "message": "Account is temporarily locked due to too many failed login attempts",
        "category": "auth",
    },
    "INVALID_CREDENTIALS": {
        "http_status": status.HTTP_401_UNAUTHORIZED,
        "message": "Invalid email or password",
        "category": "auth",
    },
    "TOO_MANY_ATTEMPTS": {
        "http_status": status.HTTP_429_TOO_MANY_REQUESTS,
        "message": "Too many attempts. Please wait and try again.",
        "category": "auth",
    },
    "TOKEN_ALREADY_USED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "This token has already been used",
        "category": "auth",
    },
})

# --- Bulk operations ---
ERROR_CODES.update({
    "BATCH_SIZE_EXCEEDED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Batch size exceeds the maximum allowed",
        "category": "validation",
    },
    "BATCH_TOO_LARGE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Batch is too large",
        "category": "validation",
    },
    "BATCH_VALIDATION_FAILED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Batch validation failed",
        "category": "validation",
    },
    "BULK_UPDATE_ERROR": {
        "http_status": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "message": "Bulk update failed",
        "category": "validation",
    },
    "INVALID_CONFIRMATION_TOKEN": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid confirmation token",
        "category": "validation",
    },
})

# --- Document & file uploads ---
ERROR_CODES.update({
    "FILE_TOO_LARGE": {
        "http_status": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        "message": "File exceeds maximum upload size",
        "category": "document",
    },
    "INVALID_FILE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid file format or content",
        "category": "document",
    },
    "NO_FILE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "No file provided",
        "category": "document",
    },
    "STORAGE_ERROR": {
        "http_status": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "message": "File storage operation failed",
        "category": "document",
    },
    # Official (system-generated) documents are immutable to anyone who is not
    # a super-admin (multi-tenant Beanola — R4.1). Students and ordinary school
    # staff cannot delete a system-generated official document.
    "OFFICIAL_DOCUMENT_IMMUTABLE": {
        "http_status": status.HTTP_403_FORBIDDEN,
        "message": "Official generated documents cannot be deleted",
        "category": "document",
    },
    # Tenant asset upload (multi-tenant Beanola — R5.3). Stable code for any
    # MIME / magic-byte / size validation failure on an institution asset
    # upload. Always 400 — an invalid asset is a client error, not a payload
    # too large (413), so the size guard funnels here too.
    "ASSET_INVALID": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Asset file failed MIME, magic-byte, or size validation",
        "category": "document",
    },
    # Document-template safety (multi-tenant Beanola — R5.7 / R6.4). Raised when
    # a Document_Template create/update carries a disallowed section key, a
    # token outside the canonical allowlist, an injected/unknown token in a
    # section body, or an arbitrary uploaded DOCX/PDF/RTF/OLE merge document.
    # Always 400 — a disallowed template is a client error.
    "TEMPLATE_TOKEN_REJECTED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Disallowed section or token in document template",
        "category": "document",
    },
    # Profile-driven official documents (multi-tenant Beanola — R8.9). Raised by
    # the official-document renderer when a profile-required document type
    # (acceptance letter / conditional offer) has no active
    # Institution_Document_Profile resolved for the institution + document type.
    # The generation is marked ``failed`` and NO document is produced from
    # frontend/default content. 422 — the render input (tenant config) is
    # missing, not a malformed client request.
    "DOCUMENT_PROFILE_NOT_CONFIGURED": {
        "http_status": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "message": "No document profile configured for this institution and document type",
        "category": "document",
    },
    # ------------------------------------------------------------------
    # Immutable document evidence versions (admissions-v2 task 7.3 —
    # R11.7-R11.8, R17.1; finding STU-19). The upload command spans object
    # storage and the database, so every way it can stop half-way needs a code
    # a client can act on rather than an opaque 500.
    # ------------------------------------------------------------------
    # The file did not attach (a zero-byte selection). Distinct from
    # INVALID_FILE: nothing is wrong with the student's document, so the copy
    # must not tell them it is invalid.
    "EMPTY_FILE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "That file is empty. Please choose the file again.",
        "category": "document",
    },
    # The bytes are a valid PDF/JPEG/PNG but carry an executable action or a
    # script polyglot. Refused before anything reaches object storage.
    "UNSAFE_FILE_CONTENT": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "This file contains active content and cannot be accepted",
        "category": "document",
    },
    # The object was written but the provider could not confirm it is durable
    # (missing, or a stored length that disagrees with the streamed length).
    # Fails closed: no version is committed, the previous version stays
    # authoritative, and the staged object is compensated. Retryable.
    "DOCUMENT_STORAGE_UNVERIFIED": {
        "http_status": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "message": "The upload could not be confirmed as stored. Please try again.",
        "category": "document",
    },
    # The metadata transaction failed after the object write. The staged object
    # is compensated (or left for the reconciliation sweeper) and no version is
    # recorded. Retryable.
    "DOCUMENT_COMMIT_FAILED": {
        "http_status": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "message": "The upload could not be saved. Please try again.",
        "category": "document",
    },
    # Two uploads raced for the same requirement and the database's one-current
    # partial unique index rejected the loser. 409, not 500: reloading shows the
    # version that won.
    "DOCUMENT_VERSION_CONFLICT": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "Another upload for this document finished first. Please reload and try again.",
        "category": "document",
    },
    # A lifecycle command was issued against a version that can no longer accept
    # it (for example verifying a superseded version, or removing a deleted one).
    "DOCUMENT_TRANSITION_REJECTED": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "This document version can no longer accept that change",
        "category": "document",
    },
    # A reviewer decision that is neither verified nor rejected.
    "INVALID_VERIFICATION_DECISION": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "A document decision must be verified or rejected",
        "category": "document",
    },
})

# --- Catalog (programs/intakes/institutions) ---
ERROR_CODES.update({
    "INACTIVE_INTAKE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "The selected intake is not active",
        "category": "common",
    },
    "INVALID_INSTITUTION": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid institution",
        "category": "common",
    },
    "INVALID_PROGRAM_INTAKE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "The program is not available for this intake",
        "category": "common",
    },
})

# --- Offering assignment (multi-tenant Beanola — submission revalidation) ---
# Raised when submission-time re-validation of the locked offering assignment
# fails (spec multi-tenant-beanola-admissions, R2.7 / R2.4). Both are 409 and
# carry a recoverable next action — submission never silently succeeds on a
# stale draft assignment.
ERROR_CODES.update({
    "NO_ELIGIBLE_OFFERING": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "No eligible school offering is available for this program and intake",
        "category": "application",
    },
    "OFFERING_NO_LONGER_AVAILABLE": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "The previously assigned school offering is no longer available",
        "category": "application",
    },
    "OFFERING_CAPACITY_FULL": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "The assigned offering's capacity filled before submission",
        "category": "application",
    },
})

# --- Interview ---
ERROR_CODES.update({
    "INTERVIEWER_CONFLICT": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "Interviewer schedule conflict",
        "category": "application",
    },
    "INVALID_MODE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid interview mode",
        "category": "application",
    },
    "INVALID_STATUS": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid status",
        "category": "application",
    },
})

# --- Reviewer assignment ---
ERROR_CODES.update({
    "INVALID_REVIEWER_ROLE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "User does not have a reviewer role",
        "category": "application",
    },
    "NO_REVIEWERS": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "No reviewers available for assignment",
        "category": "application",
    },
    "REVIEWER_NOT_FOUND": {
        "http_status": status.HTTP_404_NOT_FOUND,
        "message": "Reviewer not found",
        "category": "application",
    },
})

# --- Application review ---
ERROR_CODES.update({
    "INVALID_TRANSITION": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Invalid status transition",
        "category": "application",
    },
    "PAYMENT_RECORD_REQUIRED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Payment record required to perform this action",
        "category": "payment",
    },
    "PAYMENT_UNVERIFIED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Payment has not been verified",
        "category": "payment",
    },
})

# --- Validation (extended) ---
ERROR_CODES.update({
    "DUPLICATE_KEY": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "Duplicate key — record already exists",
        "category": "validation",
    },
    # Emitted by ProgramFeeViewSet.create/update when uq_program_fees_one_active
    # (task 3.3) rejects a concurrent double-submit. Registered here so the
    # emitted code has a canonical entry (see module docstring).
    "DUPLICATE_ACTIVE_FEE": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "An active fee for this program, fee type, and residency already exists.",
        "category": "validation",
    },
    # Emitted by the canonical draft-start command when the request carries no
    # canonical program + intake selection (finding STU-12).
    "MINIMUM_SELECTION_REQUIRED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Select a programme and intake to start an application.",
        "category": "validation",
    },
    "DUPLICATE_SUBJECT": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Subject already exists in the application",
        "category": "validation",
    },
    "MINIMUM_AGE_NOT_MET": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Minimum age requirement not met",
        "category": "validation",
    },
    "MINIMUM_SUBJECTS_REQUIRED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Minimum number of subjects required",
        "category": "validation",
    },
})

# --- Payment (extended) ---
ERROR_CODES.update({
    "PAYMENT_ERROR": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Payment processing error",
        "category": "payment",
    },
    "VERIFICATION_ERROR": {
        "http_status": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "message": "Payment verification failed",
        "category": "payment",
    },
})

# --- Common operational ---
ERROR_CODES.update({
    "DASHBOARD_ERROR": {
        "http_status": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "message": "Dashboard data could not be loaded",
        "category": "common",
    },
    "SERVICE_UNAVAILABLE": {
        "http_status": status.HTTP_503_SERVICE_UNAVAILABLE,
        "message": "Service temporarily unavailable",
        "category": "common",
    },
})

# --- Document ---
# (Document-specific codes beyond payment are added here as needed)

# --- Security hardening (May 2026) ---
ERROR_CODES.update({
    "BLACKLIST_UNAVAILABLE": {
        "http_status": status.HTTP_503_SERVICE_UNAVAILABLE,
        "message": "Token blacklist service unavailable",
        "category": "auth",
    },
    "DRAFT_TOO_LARGE": {
        "http_status": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        "message": "Draft data exceeds maximum size",
        "category": "application",
    },
    "DRAFT_TOO_NESTED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Draft data exceeds maximum nesting depth",
        "category": "application",
    },
    "INVALID_DRAFT_DATA": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Draft data is not valid JSON",
        "category": "application",
    },
    "FIELD_NAME_TOO_LONG": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Field name exceeds maximum length",
        "category": "application",
    },
    "VALUE_TOO_LONG": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Value exceeds maximum length",
        "category": "application",
    },
    "REASON_TOO_LONG": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "Reason exceeds maximum length",
        "category": "application",
    },
})


__all__ = ["ERROR_CODES"]


# ---------------------------------------------------------------------------
# Admissions V2 codes this catalogue had drifted behind (13.6 remediation M3)
# ---------------------------------------------------------------------------
#
# Ten codes were being emitted by real V1 endpoints while absent from the
# catalogue, so ``tests/unit/test_error_codes_canonical.py`` failed. Each entry
# below is transcribed from its emission site rather than invented: the
# ``http_status`` is the status that site actually returns and the ``message``
# is that site's own user-facing sentence (shortened only where the site
# interpolates a runtime value). The emitting file is named so the next reader
# can re-check the pair instead of trusting this comment.
#
# This is a governance gap, not cosmetics: the catalogue is what the frontend
# mirror (``apps/admissions/src/lib/errorMessages.ts``) and its drift guard are
# checked against, so an unregistered code reaches the browser with no
# user-facing copy behind it.
ERROR_CODES.update({
    # apps/applications/official_document_views.py — the official-document email
    # path (task 10.4). 409 because the document may become ready later.
    "DOCUMENT_NOT_READY": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": "This document is not ready to send yet. Nothing was emailed.",
        "category": "document",
    },
    "RECIPIENT_NOT_PERMITTED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": (
            "An official document can only be sent to the applicant's own "
            "account email address."
        ),
        "category": "document",
    },
    "NO_RECIPIENT": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "This application has no account email address to send to.",
        "category": "document",
    },
    # The one bounded-export refusal, emitted identically by all four scoped
    # export surfaces (tasks 8.4 / 9.1 / 9.3):
    #   apps/applications/admin_query_views.py, apps/documents/fee_admin_views.py,
    #   apps/documents/payment_query_views.py, apps/accounts/user_directory_views.py.
    "EXPORT_TOO_LARGE": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "This export is too large. Narrow the filters and try again.",
        "category": "common",
    },
    # apps/applications/admin_query_views.py — the saved-query surface (task 9.1).
    # The endpoint interpolates the actual limit; the catalogue default does not.
    "SAVED_FILTER_LIMIT": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "You have reached the saved-filter limit. Delete one first.",
        "category": "application",
    },
    "UNREGISTERED_QUERY_PARAMETER": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": (
            "The saved query contains parameters this contract does not implement."
        ),
        "category": "validation",
    },
    # apps/accounts/user_directory_views.py + user_import_service.py (task 9.3).
    "UNSUPPORTED_FIELD": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "This request carries fields the platform does not accept here.",
        "category": "validation",
    },
    # apps/applications/student_tracking_views.py — issuing a tracking link
    # depends on a secret the platform may fail to write right now, so this one
    # is retryable and 503 rather than 400.
    "TRACKING_LINK_UNAVAILABLE": {
        "http_status": status.HTTP_503_SERVICE_UNAVAILABLE,
        "message": (
            "A tracking link could not be issued right now. Please try again "
            "in a moment."
        ),
        "category": "application",
    },
    # apps/applications/public_views.py — an application number offered where a
    # tracking link is required. 400 and deliberately non-revealing: it does not
    # say whether the number exists.
    "TRACKING_SECRET_REQUIRED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": (
            "That looks like an application number, not a tracking link. Public "
            "tracking needs the tracking link issued to you."
        ),
        "category": "application",
    },
    # The optimistic-concurrency refusal shared by submission, admin review, the
    # review workspace, bulk status, document writes and change-of-selection.
    # Already registered for /api/v2/ in apps/common/v2/error_codes.py at the
    # same 409; this is the V1 half of the same contract, with the same wording.
    "VERSION_CONFLICT": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": (
            "This resource changed since you loaded it. Please reload and try again."
        ),
        "category": "common",
    },
    "CANONICAL_DRAFT_UPDATE_REQUIRED": {
        "http_status": status.HTTP_409_CONFLICT,
        "message": (
            "Student draft answers must be saved through the versioned draft endpoint."
        ),
        "category": "application",
    },
    "IDEMPOTENCY_KEY_REQUIRED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "An Idempotency-Key header is required to save this draft.",
        "category": "validation",
    },
    "EXPECTED_VERSION_REQUIRED": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "The current draft version is required to save changes.",
        "category": "validation",
    },
    "EXPECTED_VERSION_INVALID": {
        "http_status": status.HTTP_400_BAD_REQUEST,
        "message": "The draft version must be a positive integer.",
        "category": "validation",
    },
})
