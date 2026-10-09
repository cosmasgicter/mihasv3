"""Application serializers.

Implements task 13.1, 3.3, 3.4.
Requirements: 4.1, 4.2, 10.1, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3
"""

import logging
from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta
from drf_spectacular.utils import extend_schema_field
from django.utils import timezone
from rest_framework import serializers

from apps.applications.models import (
    Application,
    ApplicationDraft,
    ApplicationInterview,
    ApplicationStatusHistory,
)
from apps.applications.identifier_resolver import IdentifierResolver
from apps.common.serializer_fields import SexField
from apps.common.validators import validate_nrc, validate_phone_e164, validate_zambian_phone
from apps.documents.models import ApplicationGrade, Payment
from apps.documents.payment_constants import COMPLETED_PAYMENT_STATUSES

logger = logging.getLogger(__name__)


def _institution_name_for_program(program_value):
    """Return the canonical institution name that owns ``program_value``, or None.

    Used as a fallback when a supplied institution label does not resolve on its
    own (e.g. a cosmetic frontend default like "Beanola Admissions", or a stale
    draft value). The program is the authoritative link to a school, so a valid
    program always yields a valid institution. ``program_value`` may be a name,
    code, or UUID — resolution goes through ``IdentifierResolver`` first.
    """
    if not program_value:
        return None
    try:
        from apps.catalog.models import Program

        resolved = IdentifierResolver.resolve_program(program_value)
        program = None
        if resolved.source != "not_found" and resolved.id:
            program = Program.objects.select_related("institution").filter(id=resolved.id).first()
        if program is None:
            program = (
                Program.objects.select_related("institution")
                .filter(name__iexact=str(program_value), is_active=True)
                .first()
            )
        institution = getattr(program, "institution", None) if program else None
        if institution is not None and getattr(institution, "is_active", True):
            return institution.name
    except Exception:  # pragma: no cover - fallback must never 500 a draft save
        logger.warning("institution-from-program fallback failed for %r", program_value, exc_info=True)
    return None


DRAFT_SAFE_FIELDS = frozenset({
    "full_name", "nrc_number", "passport_number", "date_of_birth", "sex",
    "phone", "email", "residence_town", "nationality", "country",
    "address_line_1", "address_line_2", "postal_code",
    "next_of_kin_name", "next_of_kin_phone",
    "additional_subjects",
    # ASSIGNMENT FIELDS ARE NOT DRAFT-SAFE (admissions-v2 task 6.4, R7.2/R10.5,
    # design §7.2 "Generic PATCH never accepts assignment identifiers or their
    # display snapshots"; finding STU-01).
    #
    #  * The canonical IDs (program_id / intake_id / institution_id /
    #    program_offering_id) are backend-controlled — declared read_only on the
    #    serializer and derived by the canonical assignment resolution.
    #  * The display snapshots (program / intake / institution) are ALSO not
    #    writable here. Allowing them created the STU-01 split identity: the
    #    display strings moved while the canonical routing IDs stayed behind.
    #
    # Reassignment is one transactional command:
    # ``POST /api/v1/applications/drafts/{id}/change-selection/``
    # (``apps.applications.change_selection_service``), which revalidates the
    # canonical graph and updates every ID, snapshot, configuration version,
    # requirement/eligibility snapshot, and dependent answer together.
    "result_slip_url", "extra_kyc_url",
})

# The assignment identity + display snapshots. Never writable through the
# generic application PATCH; only the change-selection command may move them
# (design §7.2). Kept as an explicit frozenset so tests and the grep-loop
# review can assert the exclusion instead of inferring it.
ASSIGNMENT_FIELDS = frozenset({
    "program", "intake", "institution",
    "program_id", "intake_id", "institution_id", "program_offering_id",
})

LIFECYCLE_FIELDS = frozenset({
    "status", "payment_status", "eligibility_status", "eligibility_score",
    "eligibility_notes", "review_started_at", "decision_date", "reviewed_by",
    "admin_feedback", "admin_feedback_date", "admin_feedback_by",
})


def validate_program_intake_compatibility(program_name: str, intake_name: str) -> None:
    """Validate that a program-intake combination is valid and active.

    Resolves program and intake using IdentifierResolver for flexible
    name/code lookup, then checks the program_intakes join table for a
    matching row. Also verifies the intake is currently active.

    Raises serializers.ValidationError with code INVALID_PROGRAM_INTAKE or
    INACTIVE_INTAKE on failure.

    Requirements: 2.2, 2.3, 10.1, 10.2, 10.3, 10.4
    """
    from apps.catalog.models import ProgramIntake

    resolved_program = IdentifierResolver.resolve_program(program_name)
    resolved_intake = IdentifierResolver.resolve_intake(intake_name)

    if resolved_program.source == "not_found" or resolved_intake.source == "not_found":
        raise serializers.ValidationError(
            {"program": "Program or intake not found."},
            code="INVALID_PROGRAM_INTAKE",
        )

    if not ProgramIntake.objects.filter(
        program_id=resolved_program.id, intake_id=resolved_intake.id
    ).exists():
        raise serializers.ValidationError(
            {"program": "The selected program is not available for this intake."},
            code="INVALID_PROGRAM_INTAKE",
        )

    # Re-fetch the intake to check is_active (resolver already filters by is_active,
    # but we verify explicitly for clarity)
    from apps.catalog.models import Intake
    intake = Intake.objects.filter(id=resolved_intake.id).first()
    if intake and not intake.is_active:
        raise serializers.ValidationError(
            {"intake": "The selected intake is not currently active."},
            code="INACTIVE_INTAKE",
        )


def validate_minimum_age(date_of_birth):
    """Validate that the applicant is at least 16 years old.

    Uses relativedelta for accurate leap-year-aware age calculation.

    Raises serializers.ValidationError with code MINIMUM_AGE_NOT_MET if underage.

    Requirements: 11.1, 11.2, 11.3
    """
    if date_of_birth is None:
        return
    age = relativedelta(date.today(), date_of_birth).years
    if age < 16:
        raise serializers.ValidationError(
            {"date_of_birth": "Applicants must be at least 16 years old."},
            code="MINIMUM_AGE_NOT_MET",
        )


def get_application_grades(application: Application) -> list[ApplicationGrade]:
    """Return prefetched grades when available to avoid N+1 queries."""
    cache = getattr(application, "_prefetched_objects_cache", {})
    if "applicationgrade_set" in cache:
        return list(application.applicationgrade_set.all())
    return list(
        ApplicationGrade.objects.select_related("subject")
        .filter(application_id=getattr(application, "id", None))
        .order_by("subject__name", "created_at", "id")
    )


def grades_summary_from_grades(grades: list[ApplicationGrade]) -> str:
    """Produce the text grade summary from an already-resolved grade list.

    Split out so the list serializer can derive summary/total/points from a
    single grade fetch (see ApplicationListSerializer._grade_summary) without
    re-resolving grades per field.
    """
    if not grades:
        return ""

    summary_lines: list[str] = []
    for entry in grades:
        subject_name = getattr(getattr(entry, "subject", None), "name", None) or str(entry.subject_id)
        summary_lines.append(f"{subject_name}: Grade {entry.grade}")
    return "\n".join(summary_lines)


def build_grades_summary(application: Application) -> str:
    """Produce the text format the admissions UI already knows how to parse."""
    return grades_summary_from_grades(get_application_grades(application))


def build_grades_payload(application: Application) -> list[dict[str, object]]:
    grades = get_application_grades(application)
    return [
        {
            "subject": getattr(getattr(entry, "subject", None), "name", None) or str(entry.subject_id),
            "subject_id": str(entry.subject_id),
            "grade": entry.grade,
        }
        for entry in grades
    ]


def points_from_grades(grades: list[ApplicationGrade]) -> int:
    """Compute ECZ points from an already-resolved grade list."""
    ordered = sorted(
        entry.grade for entry in grades
        if isinstance(entry.grade, int) and 1 <= entry.grade <= 9
    )
    return sum(ordered[:5]) if ordered else 0


def calculate_points_from_grades(application: Application) -> int:
    return points_from_grades(get_application_grades(application))


def calculate_application_age(application: Application) -> int:
    dob = getattr(application, "date_of_birth", None)
    if dob is None:
        return 0
    return relativedelta(date.today(), dob).years


def calculate_days_since_submission(application: Application) -> int:
    submitted_at = getattr(application, "submitted_at", None) or getattr(application, "created_at", None)
    if submitted_at is None:
        return 0
    submitted_date = submitted_at.date() if hasattr(submitted_at, "date") else submitted_at
    return max((date.today() - submitted_date).days, 0)


class ApplicationPaymentSummaryMixin(serializers.Serializer):
    """Expose payment summary fields from canonical payment records."""

    payment_method = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    paid_at = serializers.SerializerMethodField()
    receipt_number = serializers.SerializerMethodField()
    payment_reference = serializers.SerializerMethodField()
    last_payment_reference = serializers.SerializerMethodField()
    application_fee = serializers.SerializerMethodField()
    payment_currency = serializers.SerializerMethodField()

    def _get_payment_summary(self, obj) -> dict[str, object | None]:
        cache = getattr(self, "_payment_summary_cache", None)
        if cache is None:
            cache = {}
            self._payment_summary_cache = cache

        cache_key = getattr(obj, "id", id(obj))
        if cache_key in cache:
            return cache[cache_key]

        annotated_summary = {
            "payment_method": getattr(obj, "payment_summary_method", None),
            "paid_amount": getattr(obj, "payment_summary_paid_amount", None),
            "paid_at": getattr(obj, "payment_summary_paid_at", None),
            "receipt_number": getattr(obj, "payment_summary_receipt_number", None),
            "payment_reference": getattr(obj, "payment_summary_reference", None),
            "last_payment_reference": getattr(obj, "payment_summary_reference", None),
            "currency": getattr(obj, "payment_summary_currency", None),
        }
        if any(value is not None for value in annotated_summary.values()):
            cache[cache_key] = annotated_summary
            return annotated_summary

        direct_summary = {
            "payment_method": getattr(obj, "payment_method", None),
            "paid_amount": getattr(obj, "paid_amount", None),
            "paid_at": getattr(obj, "paid_at", None),
            "receipt_number": getattr(obj, "receipt_number", None),
            "payment_reference": getattr(obj, "payment_reference", None),
            "last_payment_reference": getattr(
                obj,
                "last_payment_reference",
                getattr(obj, "payment_reference", None),
            ),
            "currency": getattr(obj, "payment_currency", None),
        }
        if any(value is not None for value in direct_summary.values()):
            cache[cache_key] = direct_summary
            return direct_summary

        if not isinstance(obj, Application):
            cache[cache_key] = direct_summary
            return direct_summary

        # Prefer the prefetched payment_set to avoid 2 queries per row (N+1).
        # The list views attach a window-bounded Prefetch of 'payment_set'
        # (see _with_payment_summary); when present we compute the summary in
        # Python instead of issuing per-row queries. Verified states
        # (verified, paid, successful, force_approved) are treated as the same
        # verified value via COMPLETED_PAYMENT_STATUSES; deferred is distinct.
        prefetch_cache = getattr(obj, "_prefetched_objects_cache", {})
        if "payment_set" in prefetch_cache:
            payments = list(obj.payment_set.all())

            def _payment_recency(p):
                return (
                    getattr(p, "updated_at", None),
                    getattr(p, "created_at", None),
                )

            latest_payment = max(payments, key=_payment_recency, default=None)

            def _successful_recency(p):
                return (
                    getattr(p, "verified_at", None),
                    getattr(p, "updated_at", None),
                    getattr(p, "created_at", None),
                )

            successful = [p for p in payments if getattr(p, "status", None) in COMPLETED_PAYMENT_STATUSES]
            latest_successful_payment = max(successful, key=_successful_recency, default=None)
        else:
            latest_payment = (
                Payment.objects
                .filter(application_id=getattr(obj, "id", None))
                .order_by("-updated_at", "-created_at")
                .first()
            )
            latest_successful_payment = (
                Payment.objects
                .filter(application_id=getattr(obj, "id", None), status__in=COMPLETED_PAYMENT_STATUSES)
                .order_by("-verified_at", "-updated_at", "-created_at")
                .first()
            )

        summary = {
            "payment_method": getattr(latest_payment, "payment_method", None),
            "paid_amount": getattr(latest_successful_payment, "amount", None),
            "paid_at": getattr(latest_successful_payment, "verified_at", None)
            or getattr(latest_successful_payment, "updated_at", None)
            or getattr(latest_successful_payment, "created_at", None),
            "receipt_number": getattr(latest_successful_payment, "receipt_number", None),
            "payment_reference": getattr(latest_payment, "transaction_reference", None),
            "last_payment_reference": getattr(latest_payment, "transaction_reference", None),
            "currency": getattr(latest_successful_payment, "currency", None)
            or getattr(latest_payment, "currency", None),
            # Latest payment amount of ANY status — preserves the pre-feature
            # application_fee value (previously the payment_summary_amount
            # annotation) for pending/failed-only applications (R3.3).
            "latest_amount": getattr(latest_payment, "amount", None),
        }
        cache[cache_key] = summary
        return summary

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_payment_method(self, obj):
        return self._get_payment_summary(obj)["payment_method"]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_paid_amount(self, obj):
        return self._get_payment_summary(obj)["paid_amount"]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_paid_at(self, obj):
        return self._get_payment_summary(obj)["paid_at"]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_receipt_number(self, obj):
        return self._get_payment_summary(obj)["receipt_number"]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_payment_reference(self, obj):
        return self._get_payment_summary(obj)["payment_reference"]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_last_payment_reference(self, obj):
        return self._get_payment_summary(obj)["last_payment_reference"]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_payment_currency(self, obj):
        """Canonical currency of the payment (e.g. ZMW, USD).

        International applicants pay in USD; admin surfaces must not assume
        ZMW. Defaults to ZMW only when no payment record carries a currency.
        """
        return self._get_payment_summary(obj).get("currency") or "ZMW"

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True))
    def get_application_fee(self, obj):
        """Fee actually applicable to this application.

        ``Application.application_fee`` is a stale snapshot column that is
        frequently left at the historical default (e.g. 150) and is NOT
        updated when a program's ``ProgramFee`` changes — so it disagreed
        with what the student actually paid (the canonical Payment amount,
        resolved via FeeResolver/ProgramFee). Prefer the canonical payment
        amount so the admin UI shows e.g. "K1 / K1" instead of "K1 / K150".
        Falls back to the model column when no Payment row exists yet.
        """
        # List path: annotated latest-payment amount (no N+1). Retained for
        # back-compat with callers/tests that still set the annotation; the
        # always-on prefetch path no longer emits it.
        annotated = getattr(obj, "payment_summary_amount", None)
        if annotated is not None:
            return annotated
        # Prefetch/detail path: the latest payment amount of any status
        # (preserves the pre-feature payment_summary_amount value), then the
        # latest verified amount, else the legacy model column.
        summary = self._get_payment_summary(obj)
        latest_amount = summary.get("latest_amount")
        if latest_amount is not None:
            return latest_amount
        paid = summary.get("paid_amount")
        if paid is not None:
            return paid
        return getattr(obj, "application_fee", None)


class ApplicationEnrollmentReadinessMixin(serializers.Serializer):
    """Publish the server-authored enrollment readiness (admissions-v2 task 10.3).

    Requirements: R13.2, R13.9. Finding: STU-15.

    The enrollment deadline was absent from both application serializers while
    the browser was already reading ``enrollment_confirmation_deadline`` off the
    list row — so the field was permanently ``undefined``, the enrollment card in
    ``ApplicationListItem`` never rendered, and the only surviving rule was a
    client-side ``status === 'approved'`` test that contradicted the backend.
    That is STU-15.

    Both keys are additive:

    * ``enrollment_confirmation_deadline`` — the stored deadline, so the field
      the client already reads finally has a value.
    * ``enrollment`` — the whole readiness payload from the **one** evaluator
      ``confirm_enrollment`` re-runs under its locks
      (:func:`~apps.applications.enrollment_service.evaluate_enrollment_readiness`):
      state, its definition, the countdown, the condition tally, the capacity
      position, existing enrollment, stable blocker codes, ``can_confirm``, and
      the allowed actions. The browser renders the platform's answer instead of
      deriving a second one.

    Query cost: the readiness for a whole page is resolved once per serializer
    instance through ``enrollment_readiness_map`` — a bounded number of queries
    for the page, never one per row (R17.5). ``many=True`` and a single object
    both take that path, so there is one code path and one cost model.
    """

    enrollment = serializers.SerializerMethodField()

    def _enrollment_map(self) -> dict[str, dict]:
        cache = getattr(self, "_enrollment_readiness_cache", None)
        if cache is not None:
            return cache

        from apps.applications.enrollment_service import enrollment_readiness_map

        instance = self.instance
        if instance is None:
            rows = []
        elif isinstance(instance, Application):
            rows = [instance]
        else:
            try:
                rows = [row for row in instance if isinstance(row, Application)]
            except TypeError:
                rows = []

        try:
            cache = enrollment_readiness_map(rows)
        except Exception:
            # A read of the student's own application must not 500 because the
            # canonical capacity/condition configuration could not be resolved
            # (R11.6's fail-closed-but-honest rule, applied to a read): the
            # readiness is reported as absent, never as "nothing to do".
            logger.exception("Failed to evaluate enrollment readiness for a page")
            cache = {}

        self._enrollment_readiness_cache = cache
        return cache

    @extend_schema_field(serializers.JSONField(allow_null=True))
    def get_enrollment(self, obj):
        payload = self._enrollment_map().get(str(getattr(obj, "id", "") or ""))
        if payload is not None:
            return payload
        # Not part of the page the serializer was constructed with (a nested or
        # ad-hoc render). Evaluate this one application rather than publishing a
        # misleading null.
        from apps.applications.enrollment_service import evaluate_enrollment_readiness

        try:
            return evaluate_enrollment_readiness(obj).to_payload()
        except Exception:
            logger.exception(
                "Failed to evaluate enrollment readiness for application %s",
                getattr(obj, "id", None),
            )
            return None


class ApplicationSerializer(
    ApplicationPaymentSummaryMixin,
    ApplicationEnrollmentReadinessMixin,
    serializers.ModelSerializer,
):
    """Full application serializer with all fields."""

    user_id = serializers.UUIDField(read_only=True)
    tracking_code = serializers.CharField(source="public_tracking_code", read_only=True)
    payment_verified_by_name = serializers.SerializerMethodField()
    payment_verified_by_email = serializers.SerializerMethodField()
    last_payment_audit_notes = serializers.CharField(source="admin_feedback", read_only=True)
    institution_id = serializers.UUIDField(source="institution_ref_id", read_only=True)
    program_id = serializers.UUIDField(source="canonical_program_id", read_only=True)
    program_offering_id = serializers.UUIDField(read_only=True)
    intake_id = serializers.UUIDField(source="intake_ref_id", read_only=True)

    class Meta:
        model = Application
        fields = [
            "id", "user_id", "application_number", "public_tracking_code",
            "tracking_code",
            "full_name", "nrc_number", "passport_number", "date_of_birth",
            "sex", "phone", "email", "residence_town", "nationality",
            "country", "address_line_1", "address_line_2", "postal_code",
            "next_of_kin_name", "next_of_kin_phone",
            "institution_id", "program_id", "program_offering_id", "intake_id",
            "program", "intake", "institution", "status", "version",
            "student_number", "draft_name",
            "result_slip_url", "extra_kyc_url", "application_fee",
            "payment_method", "paid_amount", "paid_at", "receipt_number",
            "payment_status", "payment_verified_at", "payment_verified_by",
            "payment_reference", "last_payment_reference",
            "payment_verified_by_name", "payment_verified_by_email",
            "payment_currency",
            "eligibility_status", "eligibility_score", "eligibility_notes",
            "admin_feedback", "admin_feedback_date", "admin_feedback_by",
            "review_started_at", "decision_date", "reviewed_by",
            "additional_subjects", "submitted_at",
            "last_payment_audit_notes",
            # Enrollment readiness (admissions-v2 task 10.3, R13.2/R13.9, STU-15).
            "enrollment_confirmation_deadline", "enrollment",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "application_number", "public_tracking_code", "tracking_code",
            # Server-authored: the deadline is computed by EnrollmentService from
            # the academic calendar when the offer is made, and readiness is
            # derived. Neither is ever accepted from a request body.
            "enrollment_confirmation_deadline", "enrollment",
            "payment_reference", "last_payment_reference",
            "payment_verified_by_name", "payment_verified_by_email",
            "version", "created_at", "updated_at", "student_number",
            # Assignment display snapshots (admissions-v2 task 6.4, R7.2/R10.5,
            # design §7.2; finding STU-01). Declared read-only here — not only
            # through the request-scoped DRAFT_SAFE_FIELDS guard — so a generic
            # update can never move the display snapshots away from the
            # canonical IDs, regardless of who calls the serializer or whether a
            # request is in context. Reassignment goes through the
            # change-selection command (change_selection_service).
            "program", "intake", "institution",
        ]

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        instance = self.instance

        if request and request.method in ('PATCH', 'PUT'):
            user_role = getattr(request.user, 'role', 'student')
            app_status = getattr(instance, 'status', 'draft') if instance else 'draft'

            if user_role in ('admin', 'super_admin'):
                # Admins can edit draft-safe fields on any status, but never 'status' via PATCH
                for field_name in list(fields.keys()):
                    if field_name not in DRAFT_SAFE_FIELDS:
                        fields[field_name].read_only = True
            else:
                # Students: only draft-safe fields when status == 'draft'
                if app_status != 'draft':
                    for field_name in fields:
                        fields[field_name].read_only = True
                else:
                    for field_name in list(fields.keys()):
                        if field_name not in DRAFT_SAFE_FIELDS:
                            fields[field_name].read_only = True

        return fields

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.updated_at = timezone.now()
        try:
            instance.version = int(getattr(instance, "version", 0) or 0) + 1
        except (TypeError, ValueError):
            instance.version = 1

        update_fields = list(validated_data.keys())
        for field_name in ("updated_at", "version"):
            if field_name not in update_fields:
                update_fields.append(field_name)
        instance.save(update_fields=update_fields)
        return instance

    def get_payment_verified_by_name(self, obj) -> str | None:
        verifier = getattr(obj, "payment_verified_by", None)
        if verifier is None:
            return None

        full_name = " ".join(
            part for part in [getattr(verifier, "first_name", ""), getattr(verifier, "last_name", "")]
            if part
        ).strip()
        return full_name or None

    def get_payment_verified_by_email(self, obj) -> str | None:
        verifier = getattr(obj, "payment_verified_by", None)
        if verifier is None:
            return None
        return getattr(verifier, "email", None)

    def validate_phone(self, value):
        if value:
            return validate_zambian_phone(value)
        return value

    def validate_nrc_number(self, value):
        if value:
            return validate_nrc(value)
        return value

    def validate_date_of_birth(self, value):
        """Validate applicant meets minimum age requirement (>= 16)."""
        if value:
            validate_minimum_age(value)
        return value

    def validate_program(self, value):
        """Validate and canonicalize program via IdentifierResolver."""
        resolved = IdentifierResolver.resolve_program(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError("Invalid program reference.")
        return resolved.name

    def validate_intake(self, value):
        """Validate and canonicalize intake via IdentifierResolver."""
        resolved = IdentifierResolver.resolve_intake(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError("Invalid intake reference.")
        return resolved.name

    def validate_institution(self, value):
        """Validate and canonicalize institution via IdentifierResolver.

        A value that cannot be resolved on its own is NOT rejected here — it is
        deferred to ``validate()``, which can derive the institution from the
        chosen program (the program owns an institution). This prevents a
        cosmetic frontend fallback label (e.g. "Beanola Admissions") or a
        stale draft value from blocking an otherwise-valid draft save. The
        canonical name is substituted when resolution succeeds.

        Requirements: 2.1, 2.4
        """
        resolved = IdentifierResolver.resolve_institution(value)
        if resolved.source == "not_found":
            # Defer to cross-field validate() for program-derived fallback.
            return value
        return resolved.name

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program_name = attrs.get("program")
        intake_name = attrs.get("intake")
        # Institution fallback: if the supplied institution did not resolve to a
        # real catalog record (validate_institution returned it unchanged),
        # derive it from the chosen program's owning institution. Only raise
        # "Invalid institution reference." when neither path yields a real
        # institution — so a valid program always carries a valid institution.
        institution_value = attrs.get("institution")
        if institution_value:
            resolved_inst = IdentifierResolver.resolve_institution(institution_value)
            if resolved_inst.source == "not_found":
                derived = _institution_name_for_program(program_name)
                if derived:
                    attrs["institution"] = derived
                else:
                    raise serializers.ValidationError(
                        {"institution": "Invalid institution reference."},
                        code="INVALID_INSTITUTION",
                    )
            else:
                attrs["institution"] = resolved_inst.name
        if program_name and intake_name:
            validate_program_intake_compatibility(program_name, intake_name)
        return attrs


class ApplicationCreateSerializer(serializers.Serializer):
    """Serializer for application creation with field-level validation."""

    full_name = serializers.CharField(max_length=255)
    nrc_number = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True, default="")
    passport_number = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True, default="")
    date_of_birth = serializers.DateField()
    sex = SexField()
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField()
    residence_town = serializers.CharField(max_length=255)
    country = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True, default="Zambia")
    nationality = serializers.CharField(max_length=100, required=False, default="Zambian")
    next_of_kin_name = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True, default="")
    next_of_kin_phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True, default="")
    program_id = serializers.UUIDField(required=False)
    intake_id = serializers.UUIDField(required=False)
    institution_id = serializers.UUIDField(required=False)
    program = serializers.CharField(max_length=255, required=False)
    intake = serializers.CharField(max_length=100, required=False)
    institution = serializers.CharField(max_length=255, required=False, allow_blank=True)
    draft_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")

    def validate_phone(self, value):
        if value:
            return validate_zambian_phone(value)
        return value

    def validate_nrc_number(self, value):
        if value:
            return validate_nrc(value)
        return value

    def validate_date_of_birth(self, value):
        """Validate applicant meets minimum age requirement (>= 16)."""
        if value:
            validate_minimum_age(value)
        return value

    def validate_program(self, value):
        """Validate and canonicalize program via IdentifierResolver."""
        resolved = IdentifierResolver.resolve_program(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError("Invalid program reference.")
        return resolved.name

    def validate_program_id(self, value):
        from apps.catalog.models import CanonicalProgram

        if not CanonicalProgram.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid canonical program reference.")
        return value

    def validate_intake_id(self, value):
        from apps.catalog.models import Intake

        if not Intake.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid intake reference.")
        return value

    def validate_institution_id(self, value):
        from apps.catalog.models import Institution

        if not Institution.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid institution reference.")
        return value

    def validate_intake(self, value):
        """Validate and canonicalize intake via IdentifierResolver."""
        resolved = IdentifierResolver.resolve_intake(value)
        if resolved.source == "not_found":
            raise serializers.ValidationError("Invalid intake reference.")
        return resolved.name

    def validate_institution(self, value):
        """Validate and canonicalize institution via IdentifierResolver.

        A value that cannot resolve on its own is deferred to ``validate()``,
        which derives the institution from the chosen program. This mirrors the
        update serializer so a cosmetic frontend fallback label never blocks a
        create either.

        Requirements: 2.1, 2.4
        """
        resolved = IdentifierResolver.resolve_institution(value)
        if resolved.source == "not_found":
            return value
        return resolved.name

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program_id = attrs.get("program_id")
        intake_id = attrs.get("intake_id")
        program_name = attrs.get("program")
        intake_name = attrs.get("intake")
        if program_id or intake_id:
            if not program_id or not intake_id:
                raise serializers.ValidationError(
                    {"program_id": "program_id and intake_id are required together."},
                    code="INVALID_PROGRAM_INTAKE",
                )
            return attrs
        if not program_name or not intake_name:
            raise serializers.ValidationError(
                {"program": "Either program_id/intake_id or program/intake is required."},
                code="INVALID_PROGRAM_INTAKE",
            )
        if not attrs.get("institution"):
            raise serializers.ValidationError(
                {"institution": "Institution is required for legacy program/intake submissions."},
                code="INVALID_INSTITUTION",
            )
        # If the supplied institution did not resolve on its own, derive it from
        # the program's owning school; only reject when neither path yields a
        # real institution (mirrors ApplicationSerializer.validate).
        institution_value = attrs.get("institution")
        resolved_inst = IdentifierResolver.resolve_institution(institution_value)
        if resolved_inst.source == "not_found":
            derived = _institution_name_for_program(program_name)
            if derived:
                attrs["institution"] = derived
            else:
                raise serializers.ValidationError(
                    {"institution": "Invalid institution reference."},
                    code="INVALID_INSTITUTION",
                )
        else:
            attrs["institution"] = resolved_inst.name
        if program_name and intake_name:
            validate_program_intake_compatibility(program_name, intake_name)
        return attrs


class ApplicationListSerializer(
    ApplicationPaymentSummaryMixin,
    ApplicationEnrollmentReadinessMixin,
    serializers.ModelSerializer,
):
    """Lightweight serializer for list views."""

    user_id = serializers.UUIDField(read_only=True)
    tracking_code = serializers.CharField(source="public_tracking_code", read_only=True)
    payment_verified_by_name = serializers.SerializerMethodField()
    payment_verified_by_email = serializers.SerializerMethodField()
    last_payment_audit_notes = serializers.CharField(source="admin_feedback", read_only=True)
    grades_summary = serializers.SerializerMethodField()
    total_subjects = serializers.SerializerMethodField()
    points = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()
    days_since_submission = serializers.SerializerMethodField()
    institution_id = serializers.UUIDField(source="institution_ref_id", read_only=True)
    program_id = serializers.UUIDField(source="canonical_program_id", read_only=True)
    program_offering_id = serializers.UUIDField(read_only=True)
    intake_id = serializers.UUIDField(source="intake_ref_id", read_only=True)

    class Meta:
        model = Application
        fields = [
            "id", "user_id", "application_number", "public_tracking_code", "tracking_code",
            "full_name", "email", "phone", "program", "intake", "institution",
            "institution_id", "program_id", "program_offering_id", "intake_id",
            "draft_name",
            # Draft clients need both server-authored optimistic tokens on the
            # lightweight list row. Without them, resuming from the draft picker
            # forced the browser either to guess or to issue an unversioned write.
            "version", "assignment_version",
            "status", "payment_status", "payment_method", "paid_amount", "paid_at",
            "receipt_number",
            "payment_verified_at", "payment_reference", "last_payment_reference",
            "payment_verified_by_name", "payment_verified_by_email",
            "payment_currency",
            "submitted_at", "admin_feedback", "last_payment_audit_notes",
            "review_started_at", "decision_date", "application_fee",
            # Enrollment readiness (admissions-v2 task 10.3, R13.2/R13.9, STU-15).
            # ``ApplicationListItem`` has always read the deadline off this row;
            # until now the server never sent it.
            "enrollment_confirmation_deadline", "enrollment",
            "grades_summary", "total_subjects", "points", "age", "days_since_submission",
            "created_at", "updated_at",
        ]

    def get_payment_verified_by_name(self, obj) -> str | None:
        verifier = getattr(obj, "payment_verified_by", None)
        if verifier is None:
            return None

        full_name = " ".join(
            part for part in [getattr(verifier, "first_name", ""), getattr(verifier, "last_name", "")]
            if part
        ).strip()
        return full_name or None

    def get_payment_verified_by_email(self, obj) -> str | None:
        verifier = getattr(obj, "payment_verified_by", None)
        if verifier is None:
            return None
        return getattr(verifier, "email", None)

    def _grade_summary(self, obj) -> dict[str, object]:
        """Compute the grade summary, total subjects, and points once per
        application per serializer instance.

        Mirrors the ``_payment_summary_cache`` pattern: grades are resolved a
        single time (prefetch-first via ``get_application_grades``; at most one
        query when prefetch is absent) and the dependent fields are derived from
        that one fetch, preserving the exact Zambian ECZ grading output.
        """
        cache = getattr(self, "_grade_summary_cache", None)
        if cache is None:
            cache = {}
            self._grade_summary_cache = cache

        cache_key = getattr(obj, "id", id(obj))
        if cache_key not in cache:
            grades = get_application_grades(obj)
            cache[cache_key] = {
                "summary": grades_summary_from_grades(grades),
                "total": len(grades),
                "points": points_from_grades(grades),
            }
        return cache[cache_key]

    def get_grades_summary(self, obj) -> str:
        return self._grade_summary(obj)["summary"]

    def get_total_subjects(self, obj) -> int:
        return self._grade_summary(obj)["total"]

    def get_points(self, obj) -> int:
        return self._grade_summary(obj)["points"]

    def get_age(self, obj) -> int:
        return calculate_application_age(obj)

    def get_days_since_submission(self, obj) -> int:
        return calculate_days_since_submission(obj)


class ApplicationTrackingSerializer(serializers.ModelSerializer):
    """The public tracking contract — one shape, published under the names the
    client actually reads (admissions-v2 task 10.5, R13.12 / R14, STU-22).

    Two things changed here, both halves of STU-22's "frontend share/fields do
    not match the backend response":

    * **the names.** The tracker page reads ``program_name``, ``intake_name`` and
      ``updated_at``; this serializer published ``program``, ``intake`` and
      ``created_at``. The client papered over two of those with ``??`` fallbacks
      and simply rendered ``updated_at`` as "Not available" forever. The names are
      now the client's, so a future divergence is a failure rather than a blank.
    * **the fields that were never here.** The page also read
      ``feedback_summary``, ``admin_feedback`` and ``admin_feedback_date`` and
      rendered a "Message from Admissions" panel from them. The backend has never
      sent those — which is the only reason an unauthenticated page was not
      publishing internal reviewer notes. The panel is gone from the client, and
      this serializer states the whole contract so it cannot come back by
      accident.

    Still deliberately absent: every applicant identifier and contact field, the
    payment status, the eligibility notes, and ``public_tracking_code`` — which
    post-10.5 authorises nothing and therefore has no reason to be echoed to an
    unauthenticated caller.

    ``program_name`` / ``intake_name`` / ``institution`` prefer the canonical
    record's name and fall back to the legacy display snapshot on the row, which
    is what legacy applications have. They are display values, never authority.
    """

    program_name = serializers.SerializerMethodField()
    intake_name = serializers.SerializerMethodField()
    institution = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "application_number", "status",
            "program_name", "intake_name", "institution",
            "submitted_at", "updated_at",
        ]

    def get_program_name(self, obj) -> Optional[str]:
        canonical = getattr(obj, "canonical_program", None)
        return getattr(canonical, "name", None) or getattr(obj, "program", None)

    def get_intake_name(self, obj) -> Optional[str]:
        intake = getattr(obj, "intake_ref", None)
        return getattr(intake, "name", None) or getattr(obj, "intake", None)

    def get_institution(self, obj) -> Optional[str]:
        institution = getattr(obj, "institution_ref", None)
        return (
            getattr(institution, "brand_name", None)
            or getattr(institution, "name", None)
            or getattr(obj, "institution", None)
        )


class ApplicationDraftSerializer(serializers.ModelSerializer):
    """Deprecated compatibility serializer for wizard snapshot payloads."""

    application_id = serializers.UUIDField(read_only=True, allow_null=True)
    user_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ApplicationDraft
        fields = [
            "id", "application_id", "user_id", "draft_data", "draft_name",
            "step_completed", "is_active", "last_accessed_at",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ApplicationGradeSerializer(serializers.Serializer):
    """ECZ grade serializer."""

    subject_id = serializers.UUIDField()
    grade = serializers.IntegerField(min_value=1, max_value=9)

    def validate_subject_id(self, value):
        """Only an **active canonical** subject is a writable grade identity.

        R11.5 / STU-11 (admissions-v2 task 7.1): server readiness counts a grade
        only when its ``subject_id`` resolves to an active canonical ``Subject``.
        Accepting a write against a missing or deactivated subject would persist a
        row that can never count toward completeness and that the student has no
        way to see, so the write boundary and the readiness evaluator share one
        definition of "resolvable". The message is deliberately identical for both
        cases so the error discloses nothing about catalogue state.
        """
        from apps.catalog.subject_catalog import active_subjects_queryset

        if not active_subjects_queryset().filter(id=value).exists():
            raise serializers.ValidationError("Invalid subject reference.")
        return value


class ApplicationInterviewSerializer(serializers.ModelSerializer):
    """Interview scheduling serializer."""

    application_id = serializers.UUIDField()
    program = serializers.CharField(source="application.program", read_only=True)
    application_number = serializers.CharField(source="application.application_number", read_only=True)

    class Meta:
        model = ApplicationInterview
        fields = [
            "id", "application_id", "scheduled_at", "mode", "location",
            "status", "notes", "program", "application_number", "created_by", "updated_by",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ApplicationReviewSerializer(serializers.Serializer):
    """Admin review - status update."""

    new_status = serializers.CharField(max_length=50)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    force = serializers.BooleanField(required=False, default=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class PaymentStatusUpdateSerializer(serializers.Serializer):
    """Validates payment status updates (P1-SEC-027)."""

    PAYMENT_STATUS_CHOICES = [
        ("not_paid", "Not Paid"),
        ("pending_review", "Pending Review"),
        ("verified", "Verified"),
        ("rejected", "Rejected"),
        ("deferred", "Deferred"),
    ]

    payment_status = serializers.ChoiceField(choices=PAYMENT_STATUS_CHOICES)
    notes = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class ApplicationBulkStatusSerializer(serializers.Serializer):
    """Admin bulk status update."""

    application_ids = serializers.ListField(child=serializers.UUIDField())
    new_status = serializers.CharField(max_length=50)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


# ---------------------------------------------------------------------------
# Applications remediation serializers (T15 - API remediation Phase 3)
# ---------------------------------------------------------------------------


class ApplicationAmendmentRequestSerializer(serializers.Serializer):
    """POST /api/v1/applications/{id}/amendments/ request body."""

    AMENDABLE_FIELD_CHOICES = (
        ("phone", "Phone"),
        ("email", "Email"),
        ("address_line_1", "Address line 1"),
        ("address_line_2", "Address line 2"),
        ("residence_town", "Residence town"),
        ("next_of_kin_name", "Next of kin name"),
        ("next_of_kin_phone", "Next of kin phone"),
    )

    field_name = serializers.ChoiceField(
        choices=AMENDABLE_FIELD_CHOICES,
        help_text="Name of the application field being amended",
    )
    new_value = serializers.CharField(
        max_length=255,
        trim_whitespace=True,
        help_text="Proposed new value for the field",
    )
    reason = serializers.CharField(
        max_length=1000,
        trim_whitespace=True,
        help_text="Student-provided explanation for the amendment",
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        field_name = attrs["field_name"]
        new_value = attrs["new_value"]

        if field_name == "email":
            try:
                serializers.EmailField().run_validation(new_value)
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({"new_value": exc.detail}) from exc
        elif field_name in {"phone", "next_of_kin_phone"}:
            try:
                attrs["new_value"] = validate_phone_e164(new_value)
            except Exception as exc:
                raise serializers.ValidationError({"new_value": str(exc)}) from exc

        return attrs


class ApplicationAmendmentReviewRequestSerializer(serializers.Serializer):
    """POST /api/v1/applications/{id}/amendments/{aid}/review/ request body."""

    status = serializers.ChoiceField(
        choices=[("approved", "Approved"), ("rejected", "Rejected")],
        help_text="Review decision",
    )


class ApplicationAssignRequestSerializer(serializers.Serializer):
    """POST /api/v1/applications/{id}/assign/ request body."""

    reviewer_id = serializers.UUIDField(
        help_text="Profile ID of the reviewer to assign (must have admin/reviewer/super_admin role)"
    )


class ApplicationFeeWaiverRequestSerializer(serializers.Serializer):
    """POST /api/v1/applications/{id}/fee-waiver/ request body."""

    waiver_type = serializers.ChoiceField(
        choices=[("full", "Full"), ("partial", "Partial"), ("scholarship", "Scholarship")],
        help_text="Waiver type. 'full' sets payment to force_approved.",
    )
    reason_code = serializers.CharField(
        max_length=50,
        help_text="Short code identifying the waiver reason (e.g. 'need_based', 'scholarship')",
    )
    discount_percentage = serializers.IntegerField(
        min_value=0,
        max_value=100,
        required=False,
        default=100,
        help_text="Discount percentage (0-100). Full waivers default to 100.",
    )
    notes = serializers.CharField(
        required=False, allow_blank=True, default="",
        help_text="Optional admin notes explaining the waiver decision",
    )


class ApplicationConfirmEnrollmentRequestSerializer(serializers.Serializer):
    """POST /api/v1/applications/{id}/confirm-enrollment/ request body.

    Body is intentionally empty - this endpoint is idempotent and takes no
    user-supplied data. We declare an empty serializer so drf-spectacular
    generates an explicit (empty) request schema rather than fallback text.
    """


class ApplicationAutoAssignRequestSerializer(serializers.Serializer):
    """POST /api/v1/applications/auto-assign/ request body (empty)."""


class ApplicationEnvelopeResponseSerializer(serializers.Serializer):
    """Generic {success, data} envelope for application business-logic responses.

    The `data` field is kept as an unconstrained dict because each endpoint
    returns a different payload shape (amendment, assignment, waitlist position,
    enrollment deadline, AI summary text). The envelope contract is what matters
    for frontend consumers; per-endpoint detail shapes are documented in view
    docstrings and response examples.
    """

    success = serializers.BooleanField()
    data = serializers.DictField(required=False)


class ApplicationWaitlistPositionDataSerializer(serializers.Serializer):
    """Shape of `data` for GET /applications/{id}/waitlist-position/."""

    position = serializers.IntegerField(allow_null=True)
    total = serializers.IntegerField()
    application_id = serializers.UUIDField()


class ApplicationWaitlistPositionResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = ApplicationWaitlistPositionDataSerializer()
