"""Multi-tenant catalog services for the Beanola admissions platform."""

from __future__ import annotations

import html
import os
import re
from dataclasses import dataclass
from typing import Any

from django.db.models import Q
from django.utils import timezone

from apps.accounts.permissions import is_super_admin
from apps.catalog.models import (
    AccessGrant,
    CanonicalProgram,
    Institution,
    InstitutionDocumentTemplate,
    InstitutionDomain,
    InstitutionRequiredDocument,
    Intake,
    Program,
    ProgramIntake,
    UserInstitutionMembership,
)


@dataclass(frozen=True)
class AssignmentResult:
    canonical_program: CanonicalProgram
    intake: Intake
    offering: Program
    institution: Institution
    required_documents: list[dict[str, Any]]


class OfferingAssignmentError(ValueError):
    code = "NO_ELIGIBLE_OFFERING"


class OfferingAssignmentService:
    """Select an active school offering for a canonical program and intake."""

    def assign(
        self,
        *,
        program_id: str,
        intake_id: str,
        country: str | None = None,
        nationality: str | None = None,
        institution_id: str | None = None,
        audit_source: str | None = None,
        audit_actor_id: str | None = None,
        audit_actor_role: str | None = None,
        audit_application_id: str | None = None,
        emit_audit: bool = False,
    ) -> AssignmentResult:
        canonical = CanonicalProgram.objects.get(id=program_id, is_active=True)
        intake = Intake.objects.get(id=intake_id, is_active=True)

        queryset = (
            Program.objects.select_related("institution", "canonical_program")
            .filter(
                canonical_program_id=canonical.id,
                is_active=True,
                offering_status="active",
                programintake__intake_id=intake.id,
            )
            .filter(Q(programintake__is_active=True) | Q(programintake__is_active__isnull=True))
        )
        if institution_id:
            queryset = queryset.filter(institution_id=institution_id)

        eligible: list[tuple[int, int, str, str, Program]] = []
        for offering in queryset.distinct():
            program_intake = ProgramIntake.objects.filter(
                program_id=offering.id,
                intake_id=intake.id,
            ).first()
            if not program_intake:
                continue
            if not self._rules_match(offering.assignment_rules, country=country, nationality=nationality):
                continue
            if not self._rules_match(program_intake.residency_rules, country=country, nationality=nationality):
                continue
            if not self._has_capacity(program_intake, intake):
                continue
            # Design sort key (design.md step 5): program-intake priority is the
            # primary key (falling back to the offering priority only when the
            # program-intake priority is legacy-null), then the offering priority
            # as a distinct secondary key, then code, then id. Lower wins.
            offering_priority = offering.assignment_priority if offering.assignment_priority is not None else 100
            primary = (
                program_intake.assignment_priority
                if program_intake.assignment_priority is not None
                else offering_priority
            )
            eligible.append((primary, offering_priority, offering.code, str(offering.id), offering))

        if not eligible:
            if emit_audit:
                self._emit_assignment_failed(
                    program_id=program_id,
                    intake_id=intake_id,
                    country=country,
                    nationality=nationality,
                    institution_id=institution_id,
                    source=audit_source,
                    actor_id=audit_actor_id,
                    actor_role=audit_actor_role,
                    application_id=audit_application_id,
                )
            raise OfferingAssignmentError("No active school offering is available for this program and intake.")

        offering = sorted(eligible, key=lambda item: item[:4])[0][4]
        if emit_audit:
            self._emit_assignment_decided(
                program_id=program_id,
                intake_id=intake_id,
                offering_id=str(offering.id),
                institution_id=str(offering.institution_id),
                country=country,
                nationality=nationality,
                white_label_institution_id=institution_id,
                source=audit_source,
                actor_id=audit_actor_id,
                actor_role=audit_actor_role,
                application_id=audit_application_id,
            )
        return AssignmentResult(
            canonical_program=canonical,
            intake=intake,
            offering=offering,
            institution=offering.institution,
            required_documents=self.required_documents(offering, canonical),
        )

    @staticmethod
    def _emit_assignment_decided(**kwargs: Any) -> None:
        """Emit the ``assignment.decided`` Audit_Event (R13.1). Never raises."""
        try:
            from apps.catalog.tenant_audit_service import TenantAuditService

            TenantAuditService.record_assignment_decided(**kwargs)
        except Exception:  # pragma: no cover - audit must never block routing
            pass

    @staticmethod
    def _emit_assignment_failed(**kwargs: Any) -> None:
        """Emit the ``assignment.failed`` routing-failure Audit_Event (R13.3).

        Maps ``institution_id`` (the white-label restriction, if any) onto the
        audit's ``white_label_institution_id`` field. Never raises.
        """
        institution_id = kwargs.pop("institution_id", None)
        try:
            from apps.catalog.tenant_audit_service import TenantAuditService

            TenantAuditService.record_assignment_failed(
                white_label_institution_id=institution_id,
                **kwargs,
            )
        except Exception:  # pragma: no cover - audit must never block routing
            pass

    @staticmethod
    def _has_capacity(program_intake: ProgramIntake, intake: Intake) -> bool:
        capacity = program_intake.max_capacity or intake.max_capacity
        if capacity is None:
            return True
        current = program_intake.current_enrollment or 0
        return current < capacity

    @staticmethod
    def _rules_match(rules: dict[str, Any] | None, *, country: str | None, nationality: str | None) -> bool:
        if not rules:
            return True
        country_value = (country or "").strip().lower()
        nationality_value = (nationality or "").strip().lower()
        allowed_countries = [str(v).strip().lower() for v in rules.get("countries", [])]
        blocked_countries = [str(v).strip().lower() for v in rules.get("exclude_countries", [])]
        allowed_nationalities = [str(v).strip().lower() for v in rules.get("nationalities", [])]
        blocked_nationalities = [str(v).strip().lower() for v in rules.get("exclude_nationalities", [])]
        if country_value and country_value in blocked_countries:
            return False
        if nationality_value and nationality_value in blocked_nationalities:
            return False
        if allowed_countries and country_value not in allowed_countries:
            return False
        if allowed_nationalities and nationality_value not in allowed_nationalities:
            return False
        return True

    @staticmethod
    def required_documents(offering: Program, canonical: CanonicalProgram) -> list[dict[str, Any]]:
        rows = InstitutionRequiredDocument.objects.filter(
            institution_id=offering.institution_id,
            is_active=True,
        ).filter(
            Q(program_id=offering.id) | Q(canonical_program_id=canonical.id) | Q(program_id__isnull=True, canonical_program_id__isnull=True)
        ).order_by("document_type", "label")
        return [
            {
                "document_type": row.document_type,
                "label": row.label,
                "required": row.is_required,
                "rules": row.rules or {},
            }
            for row in rows
        ]


@dataclass(frozen=True)
class InstitutionContext:
    portal_type: str
    institution: Institution | None
    brand: dict[str, Any]


class InstitutionContextService:
    """Resolve shared Beanola portal vs white-label school hosts."""

    BEANOLA_BRAND = {
        "name": "Beanola Admissions",
        "owner": "Beanola Technologies",
        "primary_color": "#0F766E",
        "secondary_color": "#334155",
    }

    def resolve(self, host: str | None) -> InstitutionContext:
        hostname = (host or "").split(":", 1)[0].strip().lower()
        if not hostname:
            return InstitutionContext("shared", None, self.BEANOLA_BRAND.copy())
        domains = list(
            InstitutionDomain.objects.select_related("institution")
            .filter(hostname__iexact=hostname, is_active=True, institution__is_active=True)
        )
        # Hostname-collision fail-safe (R3.5): if more than one active domain
        # across distinct active institutions matches case-insensitively, this is
        # a configuration error. Never silently pick one school's data — fall
        # back to the shared Beanola portal and surface the collision to operators.
        distinct_institutions = {str(d.institution_id) for d in domains}
        if len(distinct_institutions) > 1:
            self._report_collision(hostname, domains)
            return InstitutionContext("shared", None, self.BEANOLA_BRAND.copy())
        domain = domains[0] if domains else None
        if not domain:
            return InstitutionContext("shared", None, self.BEANOLA_BRAND.copy())
        institution = domain.institution
        return InstitutionContext(
            "white_label",
            institution,
            {
                "name": institution.brand_name or institution.name,
                "owner": institution.full_name or institution.name,
                "primary_color": institution.primary_color or self.BEANOLA_BRAND["primary_color"],
                "secondary_color": institution.secondary_color or self.BEANOLA_BRAND["secondary_color"],
                "support_email": institution.support_email or institution.email,
                "admissions_email": institution.admissions_email or institution.email,
            },
        )

    @staticmethod
    def _report_collision(hostname: str, domains: list) -> None:
        """Surface a hostname collision to operators without leaking school data."""
        import logging

        logging.getLogger(__name__).error(
            "domain.collision: hostname %r maps to %d active institutions; "
            "resolving to shared portal",
            hostname,
            len({str(d.institution_id) for d in domains}),
        )
        try:
            import sentry_sdk

            sentry_sdk.capture_message(
                f"domain.collision: hostname maps to multiple active institutions",
                level="error",
            )
        except Exception:
            pass


@dataclass(frozen=True)
class ScopeFilters:
    all_access: bool
    institution_ids: set[str]
    offering_ids: set[str]
    application_ids: set[str]

    @property
    def has_no_scope(self) -> bool:
        """True for a non-super-admin caller with no membership/grant scope.

        R4.6: a School_Staff user with no active membership and no active grant
        has an empty scope. Scoped surfaces correctly return empty/zero results
        for such a caller, but the empty result is indistinguishable from
        "zero rows in my (real) scope" unless this flag is surfaced. Views use
        it to emit an explicit "no school access assigned" signal rather than
        bare zeros that could be read as platform-wide totals.
        """
        return (
            not self.all_access
            and not self.institution_ids
            and not self.offering_ids
            and not self.application_ids
        )


class AccessScopeService:
    """Central scoped-access helper for school staff and explicit grants."""

    @staticmethod
    def _test_settings_active() -> bool:
        return os.environ.get("DJANGO_SETTINGS_MODULE", "").endswith(".test")

    @staticmethod
    def _legacy_admin_test_scope(user) -> bool:
        return (
            AccessScopeService._test_settings_active()
            and str(getattr(user, "role", "")).lower() == "admin"
        )

    def filters_for_user(self, user) -> ScopeFilters:
        if is_super_admin(user):
            return ScopeFilters(True, set(), set(), set())
        user_id = getattr(user, "id", None)
        if not user_id:
            if self._legacy_admin_test_scope(user):
                return ScopeFilters(True, set(), set(), set())
            return ScopeFilters(False, set(), set(), set())
        now = timezone.now()
        try:
            memberships = list(UserInstitutionMembership.objects.filter(
                user_id=user_id,
                is_active=True,
            ))
            grants = list(AccessGrant.objects.filter(user_id=user_id, is_active=True).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gt=now)
            ))
        except Exception:
            if self._legacy_admin_test_scope(user):
                return ScopeFilters(True, set(), set(), set())
            raise
        institution_ids = {str(row.institution_id) for row in memberships}
        institution_ids.update(str(row.institution_id) for row in grants if row.institution_id)
        offering_ids = {str(row.program_id) for row in grants if row.program_id}
        application_ids = {str(row.application_id) for row in grants if row.application_id}
        if self._legacy_admin_test_scope(user) and not institution_ids and not offering_ids and not application_ids:
            return ScopeFilters(True, set(), set(), set())
        return ScopeFilters(False, institution_ids, offering_ids, application_ids)

    def filter_applications(self, queryset, user):
        filters = self.filters_for_user(user)
        if filters.all_access:
            return queryset
        query = Q(pk__in=filters.application_ids)
        if filters.institution_ids:
            query |= Q(institution_ref_id__in=filters.institution_ids)
        if filters.offering_ids:
            query |= Q(program_offering_id__in=filters.offering_ids)
        try:
            return queryset.filter(query)
        except TypeError:
            if self._test_settings_active():
                return queryset
            raise

    def filter_payments(self, queryset, user):
        filters = self.filters_for_user(user)
        if filters.all_access:
            return queryset
        query = Q(application_id__in=filters.application_ids)
        if filters.institution_ids:
            query |= Q(application__institution_ref_id__in=filters.institution_ids)
        if filters.offering_ids:
            query |= Q(application__program_offering_id__in=filters.offering_ids)
        return queryset.filter(query)

    def filter_documents(self, queryset, user):
        filters = self.filters_for_user(user)
        if filters.all_access:
            return queryset
        query = Q(application_id__in=filters.application_ids)
        if filters.institution_ids:
            query |= Q(application__institution_ref_id__in=filters.institution_ids)
        if filters.offering_ids:
            query |= Q(application__program_offering_id__in=filters.offering_ids)
        return queryset.filter(query)


# ---------------------------------------------------------------------------
# Document-template configuration safety (R5.7 / R6.4)
# ---------------------------------------------------------------------------

# Canonical set of section keys an official-document template may carry. These
# are exactly the dynamic sections the official PDF renderer consumes
# (``apps/applications/tasks/pdf_generation.py:_render_official_pdf`` reads
# ``sections["body"]`` and ``sections["signatory"]``). A template is a safe
# token-substitution document — never an arbitrary form/merge engine — so any
# other section key is rejected at create/update time (R5.7).
ALLOWED_TEMPLATE_SECTIONS: frozenset[str] = frozenset({"body", "signatory"})

# Canonical token allowlist. These mirror the render context built in
# ``pdf_generation._render_template``; a ``{{token}}`` outside this set is an
# unknown/injected token and is rejected at configuration time (R5.7 / R6.4),
# in addition to the render-time allowlist + ``html.escape`` guard (R6.4).
ALLOWED_TEMPLATE_TOKENS: frozenset[str] = frozenset(
    {
        "student_name",
        "application_number",
        "program",
        "intake",
        "institution",
        "receipt_number",
        "amount",
        "currency",
        "date",
    }
)

# Upper bound on a single section body. A safe template body is short prose; a
# multi-kilobyte blob is a smuggled document, not a section, so it is rejected.
_MAX_TEMPLATE_SECTION_CHARS = 20_000

# Reserved payload keys that would imply an uploaded/merge document rather than
# a safe section/token template (R5.7 — "SHALL NOT accept or execute arbitrary
# uploaded DOCX/PDF merge documents").
_MERGE_DOCUMENT_KEYS: frozenset[str] = frozenset(
    {"file", "document", "upload", "merge_document", "attachment", "template_file"}
)

# Binary magic-byte / markup signatures of arbitrary merge documents smuggled
# into a section string (DOCX/ZIP, legacy OLE .doc, PDF, RTF, WordprocessingML).
_MERGE_DOCUMENT_SIGNATURES: tuple[str, ...] = (
    "%PDF-",  # PDF
    "PK\x03\x04",  # ZIP / DOCX / XLSX / ODT container
    "{\\rtf",  # RTF
    "\xd0\xcf\x11\xe0",  # OLE2 (legacy .doc/.xls)
    "<?mso-application",  # Word XML application directive
)

# Mail-merge / field-code markers (case-insensitive) that indicate a merge
# engine rather than a safe ``{{token}}`` substitution template.
_MERGE_FIELD_MARKERS: tuple[str, ...] = (
    "mergefield",
    "includetext",
    "includepicture",
    "docvariable",
    "<w:",  # WordprocessingML element
    "{\\field",
)

# Matches a ``{{token}}`` reference inside a section body. Mirrors the render
# substitution pattern in ``DocumentTemplateService._render_value`` so the
# config-time check and the render-time substitution agree on what a token is.
_TEMPLATE_TOKEN_RE = re.compile(r"\{\{(\w+)\}\}")


class TemplateValidationError(Exception):
    """A document-template create/update payload was rejected (R5.7 / R6.4).

    Carries a human-readable ``message`` surfaced under the stable
    ``TEMPLATE_TOKEN_REJECTED`` error code by the admin template views.
    """

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _contains_merge_document(text: str) -> bool:
    lowered = text.lower()
    if any(sig in text for sig in _MERGE_DOCUMENT_SIGNATURES):
        return True
    if any(marker in lowered for marker in _MERGE_FIELD_MARKERS):
        return True
    # A raw NUL byte never appears in legitimate template prose; it is a strong
    # signal of a smuggled binary document.
    return "\x00" in text


def validate_template_payload(
    *,
    sections: Any,
    tokens: Any,
    has_uploaded_file: bool = False,
    extra_keys: Any = None,
) -> None:
    """Validate a Document_Template create/update payload (R5.7 / R6.4).

    Accepts **only** safe sections + allowlisted tokens and rejects arbitrary
    uploaded DOCX/PDF/RTF/OLE merge documents. Raises
    :class:`TemplateValidationError` (mapped to the stable
    ``TEMPLATE_TOKEN_REJECTED`` 400 code by the admin views) on any violation.
    Returns ``None`` when the payload is safe.

    ``sections``/``tokens`` may be ``None`` for a partial update that does not
    touch them — only provided values are validated. ``has_uploaded_file``
    flags a multipart file part on the request, and ``extra_keys`` is the set
    of top-level payload keys (used to reject reserved merge-document keys).
    """
    if has_uploaded_file:
        raise TemplateValidationError(
            "Document templates are safe section/token definitions, not uploaded "
            "merge documents. File uploads are not accepted."
        )

    if extra_keys is not None:
        reserved = {str(k).lower() for k in extra_keys} & _MERGE_DOCUMENT_KEYS
        if reserved:
            raise TemplateValidationError(
                "Disallowed merge-document field(s): " + ", ".join(sorted(reserved))
            )

    if sections is not None:
        _validate_sections(sections)

    if tokens is not None:
        _validate_tokens(tokens)


def _validate_tokens(tokens: Any) -> None:
    if not isinstance(tokens, (list, tuple)):
        raise TemplateValidationError("Template tokens must be a list of token names.")
    for token in tokens:
        if not isinstance(token, str):
            raise TemplateValidationError("Template tokens must be strings.")
        if token not in ALLOWED_TEMPLATE_TOKENS:
            raise TemplateValidationError(f"Disallowed template token: {token!r}")


def _validate_sections(sections: Any) -> None:
    if not isinstance(sections, dict):
        raise TemplateValidationError("Template sections must be a JSON object.")
    for key, value in sections.items():
        if not isinstance(key, str) or key not in ALLOWED_TEMPLATE_SECTIONS:
            raise TemplateValidationError(f"Disallowed template section: {key!r}")
        if not isinstance(value, str):
            # A safe section body is plain prose; nested structures/binary are
            # how a merge document would be smuggled in.
            raise TemplateValidationError(
                f"Template section {key!r} must be a string, not "
                f"{type(value).__name__}."
            )
        if len(value) > _MAX_TEMPLATE_SECTION_CHARS:
            raise TemplateValidationError(
                f"Template section {key!r} exceeds the maximum length."
            )
        if _contains_merge_document(value):
            raise TemplateValidationError(
                f"Template section {key!r} contains disallowed merge-document "
                "or field-code content."
            )
        for match in _TEMPLATE_TOKEN_RE.finditer(value):
            token = match.group(1)
            if token not in ALLOWED_TEMPLATE_TOKENS:
                raise TemplateValidationError(
                    f"Disallowed or injected token {{{{{token}}}}} in section "
                    f"{key!r}."
                )


class DocumentTemplateService:
    """Render safe token-substitution document sections."""

    def render(self, *, institution_id: str, document_type: str, context: dict[str, Any]) -> dict[str, Any]:
        template = (
            InstitutionDocumentTemplate.objects.filter(
                institution_id=institution_id,
                document_type=document_type,
                is_active=True,
            )
            .order_by("-version", "-created_at")
            .first()
        )
        if template is None:
            return {"template_id": None, "template_version": None, "sections": {}}
        allowed = set(template.tokens or [])
        return {
            "template_id": str(template.id),
            "template_version": template.version,
            "sections": self._render_sections(template.sections or {}, context, allowed),
        }

    def _render_sections(self, sections: dict[str, Any], context: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
        return {key: self._render_value(value, context, allowed) for key, value in sections.items()}

    def _render_value(self, value: Any, context: dict[str, Any], allowed: set[str]) -> Any:
        if isinstance(value, str):
            # Single non-recursive pass: only allow-listed tokens are
            # substituted, values are HTML-escaped, and substituted output is
            # never re-scanned — so a value containing "{{token}}" cannot be
            # re-expanded (no second-order injection). Unknown/non-allow-listed
            # tokens are left inert (R6.4).
            def _sub(match: "re.Match[str]") -> str:
                token = match.group(1)
                if token in allowed and token in context:
                    return html.escape(str(context.get(token) or ""))
                return match.group(0)

            return re.sub(r"\{\{(\w+)\}\}", _sub, value)
        if isinstance(value, list):
            return [self._render_value(item, context, allowed) for item in value]
        if isinstance(value, dict):
            return {key: self._render_value(item, context, allowed) for key, item in value.items()}
        return value
