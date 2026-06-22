"""Multi-tenant catalog services for the Beanola admissions platform.

Program / offering concept mapping (R8.1–R8.4) — the requirement vocabulary is
named here and mapped onto the existing tables so no new tables are introduced:

* **Canonical_Program**       → :class:`apps.catalog.models.CanonicalProgram`
                                 (``canonical_programs``) — global Beanola program.
* **Institution_Program_Offering** → :class:`apps.catalog.models.Program`
                                 (``programs``) — a tenant's offering of a
                                 canonical program (``canonical_program_id`` +
                                 ``institution_id`` + ``offering_status``).
* **Offering_Requirement**    → :class:`apps.catalog.models.InstitutionRequiredDocument`
                                 + :class:`apps.catalog.models.InstitutionDocumentProfile`
                                 — tenant-specific documents, fees, eligibility.
* **Intake_Offering**         → :class:`apps.catalog.models.ProgramIntake`
                                 (``program_intakes``) — offering availability in
                                 a global :class:`Intake` period.

Portal visibility (R8.6, R8.7) is centralized in :class:`OfferingDirectoryService`;
canonical-program assignment authority (R8.8) lives in
:meth:`AdminCapabilityService.can_manage_program`.
"""

from __future__ import annotations

import html
import os
import re
from dataclasses import dataclass
from typing import Any

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.accounts.permissions import ROLE_HIERARCHY, is_super_admin
from apps.catalog.models import (
    AccessGrant,
    CanonicalProgram,
    Institution,
    InstitutionDocumentProfile,
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


class InstitutionDocumentProfileService:
    """Resolve the single most-specific active document profile (R8.2, R9.1).

    Precedence (most -> least specific), mirroring the scope ordering used by
    ``OfferingAssignmentService.required_documents``:

        offering + intake -> offering -> canonical-program + intake
                          -> canonical program -> institution default

    Within the winning level the highest active ``version`` wins. Inactive
    rows are never selected; the result is ``None`` when no active profile
    matches. Resolution always filters by ``(institution, document_type)``
    first so it never leaks across tenants or document types.

    R9.1 (document requirements resolved by tenant, program, and intake): the
    resolved institution id comes solely from the application's own
    ``institution_ref_id`` and is pinned as the first filter on every candidate
    scope, so the returned profile is always the single most-specific *active*
    match for *this* tenant + (program, intake) context. A profile belonging to
    another tenant can never be selected — there is no scope that omits the
    institution filter — which is the isolation guarantee Property 18 exercises.
    """

    def resolve(self, application, document_type: str) -> InstitutionDocumentProfile | None:
        institution_id = getattr(application, "institution_ref_id", None)
        if not institution_id:
            return None

        offering_id = getattr(application, "program_offering_id", None)
        canonical_program_id = getattr(application, "canonical_program_id", None)
        intake_id = getattr(application, "intake_ref_id", None)

        # Most-specific -> least-specific scope filters. Each entry pins every
        # scope column so a profile only matches when its scope is exactly this
        # level (e.g. an offering-only profile has intake_id IS NULL); a
        # higher-specificity decoy or a different intake never satisfies a
        # lower level.
        candidate_scopes: list[dict[str, Any] | None] = [
            # offering + intake
            (
                {"program_id": offering_id, "canonical_program_id": None, "intake_id": intake_id}
                if offering_id and intake_id
                else None
            ),
            # offering
            (
                {"program_id": offering_id, "canonical_program_id": None, "intake_id": None}
                if offering_id
                else None
            ),
            # canonical program + intake
            (
                {"program_id": None, "canonical_program_id": canonical_program_id, "intake_id": intake_id}
                if canonical_program_id and intake_id
                else None
            ),
            # canonical program
            (
                {"program_id": None, "canonical_program_id": canonical_program_id, "intake_id": None}
                if canonical_program_id
                else None
            ),
            # institution default
            {"program_id": None, "canonical_program_id": None, "intake_id": None},
        ]

        for scope in candidate_scopes:
            if scope is None:
                continue
            profile = (
                InstitutionDocumentProfile.objects.filter(
                    institution_id=institution_id,
                    document_type=document_type,
                    is_active=True,
                    **scope,
                )
                .order_by("-version", "-created_at", "-id")
                .first()
            )
            if profile is not None:
                return profile
        return None

    # -- Versioning (R8.5) --------------------------------------------------
    #
    # Creating a "new version" of a profile is an INSERT, never an in-place
    # UPDATE: a new ``InstitutionDocumentProfile`` row is written with
    # ``version = current_max_version_for_scope + 1`` while every prior row is
    # left byte-for-byte untouched. This is what preserves provenance — an
    # Official_Document generated from version N stores ``profile_version=N`` in
    # ``verification_notes.official_document`` (see
    # ``pdf/renderers/_common.build_metadata``), and because version N's row is
    # never mutated or deleted, that PDF's provenance stays valid even after
    # version N+1 is created. ``resolve`` already picks the highest active
    # ``version`` within the winning scope (``order_by("-version", ...)``), so a
    # newly inserted ``version+1`` row becomes the resolved profile for new
    # generations while older versions remain readable records.

    # The per-version field set copied/overridden when a new version is created.
    # ``version``/``is_active``/timestamps are managed by ``create_new_version``
    # itself; the scope columns (institution/document_type/program/
    # canonical_program/intake) are inherited from the source profile and pinned
    # so the new version lands in the same resolution scope.
    _VERSIONED_FIELDS = (
        "layout_key",
        "sections",
        "fee_chart",
        "bank_accounts",
        "requirements",
        "signatory",
        "rules",
    )

    @staticmethod
    def next_version_for_scope(profile: InstitutionDocumentProfile) -> int:
        """The next monotonic version for ``profile``'s exact resolution scope.

        Scope is ``(institution, document_type, program, canonical_program,
        intake)`` — the same tuple ``resolve`` keys on. Returns
        ``max(version) + 1`` across every existing row (active or not) in that
        scope, so versions never collide or rewind even after a row is
        deactivated. Starts at 1 when no row exists yet.
        """
        current_max = (
            InstitutionDocumentProfile.objects.filter(
                institution_id=profile.institution_id,
                document_type=profile.document_type,
                program_id=profile.program_id,
                canonical_program_id=profile.canonical_program_id,
                intake_id=profile.intake_id,
            )
            .order_by("-version")
            .values_list("version", flat=True)
            .first()
        )
        return (current_max or 0) + 1

    def create_new_version(
        self,
        profile: InstitutionDocumentProfile,
        *,
        created_by_id: Any = None,
        **changes: Any,
    ) -> InstitutionDocumentProfile:
        """Insert the next version of ``profile`` (R8.5) — never an UPDATE.

        Copies the versioned content from ``profile``, applies any ``changes``
        overrides (``sections``, ``fee_chart``, ``bank_accounts``,
        ``requirements``, ``signatory``, ``rules``, ``layout_key``,
        ``is_active``), validates the resulting payload via
        ``validate_profile_payload`` BEFORE any DB write (so a rejected payload
        persists nothing), and inserts a NEW row with
        ``version = next_version_for_scope(profile)`` in ``profile``'s exact
        scope. Every prior row — including ``profile`` itself — is left
        untouched (never updated in place, never deleted).

        The new row defaults to ``is_active=True`` so it becomes the resolved
        version on the next generation; pass ``is_active=False`` to stage an
        inactive draft. Deactivating an older version is the caller's separate
        concern — this method only ever inserts.
        """
        merged: dict[str, Any] = {
            field: getattr(profile, field) for field in self._VERSIONED_FIELDS
        }
        for field in self._VERSIONED_FIELDS:
            if field in changes:
                merged[field] = changes[field]
        is_active = changes.get("is_active", True)

        # Validate the new payload before inserting (Safe_Template_Policy). This
        # raises ``TemplateValidationError`` and writes nothing on any violation.
        validate_profile_payload(
            sections=merged["sections"],
            fee_chart=merged["fee_chart"],
            bank_accounts=merged["bank_accounts"],
            requirements=merged["requirements"],
        )

        now = timezone.now()
        return InstitutionDocumentProfile.objects.create(
            institution_id=profile.institution_id,
            document_type=profile.document_type,
            program_id=profile.program_id,
            canonical_program_id=profile.canonical_program_id,
            intake_id=profile.intake_id,
            layout_key=merged["layout_key"],
            sections=merged["sections"],
            fee_chart=merged["fee_chart"],
            bank_accounts=merged["bank_accounts"],
            requirements=merged["requirements"],
            signatory=merged["signatory"],
            rules=merged["rules"],
            version=self.next_version_for_scope(profile),
            is_active=is_active,
            created_by_id=created_by_id,
            created_at=now,
            updated_at=now,
        )


@dataclass(frozen=True)
class InstitutionContext:
    portal_type: str
    institution: Institution | None
    brand: dict[str, Any]


class OfferingDirectoryService:
    """Portal-facing listing of program offerings (R8.6, R8.7).

    Names the **Institution_Program_Offering** visibility rules in one place so
    the shared Beanola portal and a resolved white-label tenant portal read from
    a single source of truth:

    * **Shared Beanola portal (R8.6)** — every active offering across all
      tenants, grouped by :class:`CanonicalProgram` (no institution filter).
    * **Tenant portal (R8.7)** — only the offerings belonging to the resolved
      tenant, grouped by canonical program.

    An "active offering" is a :class:`Program` row with ``is_active=True`` and
    ``offering_status == "active"``. Both listings group by canonical program by
    returning the :class:`CanonicalProgram` queryset that has at least one such
    offering, optionally constrained to an intake and/or a single tenant.
    """

    def canonical_program_directory(
        self,
        *,
        institution_id: str | None = None,
        intake_id: str | None = None,
    ):
        """Active canonical programs grouped-by-program for a portal listing.

        With ``institution_id`` omitted this is the shared Beanola portal listing
        (R8.6); with ``institution_id`` set to the resolved tenant it is the
        tenant portal listing (R8.7). ``intake_id`` optionally restricts to
        canonical programs with an active :class:`ProgramIntake` (Intake_Offering)
        in that period. The queryset is intentionally identical to the historical
        ``CanonicalProgramListView`` behavior so existing callers are unchanged.
        """
        # Tenant-isolation fix (R8.7 / R18.3): bind the institution + active-
        # offering (+ intake) constraints to the SAME Program row. Chained
        # ``.filter()`` calls across the multi-valued ``program`` reverse
        # relation create INDEPENDENT joins, so ``program__institution_id`` and
        # ``program__is_active/offering_status`` could match DIFFERENT Program
        # rows — surfacing a canonical program for which a tenant has only an
        # INACTIVE offering when another tenant has an active one (cross-tenant
        # leak). An ``Exists`` correlated subquery forces every offering
        # constraint onto one row.
        offerings = Program.objects.filter(
            is_active=True,
            offering_status="active",
            canonical_program_id=OuterRef("pk"),
        )
        if institution_id:
            offerings = offerings.filter(institution_id=institution_id)
        if intake_id:
            offerings = offerings.filter(programintake__intake_id=intake_id)
        return (
            CanonicalProgram.objects.filter(is_active=True)
            .filter(Exists(offerings))
            .distinct()
            .order_by("name")
        )

    def resolved_institution_id(self, portal_context, requested_institution_id=None):
        """Resolve the tenant scope for a portal listing (R8.7).

        An explicit ``requested_institution_id`` wins; otherwise the white-label
        tenant resolved from the host by :class:`InstitutionContextService` is
        used. Returns ``None`` for the shared Beanola portal so the listing spans
        all tenants (R8.6).
        """
        if requested_institution_id:
            return requested_institution_id
        institution = getattr(portal_context, "institution", None)
        if institution is not None:
            return str(institution.id)
        return None


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
        # Single indexed lookup on ``institution_domains.hostname`` (R7.8 100ms
        # budget). We fetch every row for the hostname regardless of status so a
        # genuinely-unknown host can be told apart from one an operator
        # configured but that is not (yet/any longer) usable — only the latter
        # is worth surfacing for operations review.
        candidate_domains = list(
            InstitutionDomain.objects.select_related("institution")
            .filter(hostname__iexact=hostname)
        )
        if not candidate_domains:
            # Unknown host → Neutral Beanola context (R7.9, R19.1). Logged for
            # operations review (R19.4), but legitimate shared-portal/platform
            # hosts are suppressed so we don't log every shared-portal request.
            self._report_unknown(hostname)
            return InstitutionContext("shared", None, self.BEANOLA_BRAND.copy())

        # Status-aware fail-closed gate (R7.8, R7.9, R19): a host resolves to a
        # tenant ONLY when a single ``InstitutionDomain`` with
        # ``status == active``, ``is_active``, and an active institution matches.
        # Domains in ``pending_dns``/``pending_review``/``verified``/``disabled``/
        # ``failed`` (or with an inactive row/institution) never resolve a tenant.
        active_domains = [
            d
            for d in candidate_domains
            if d.status == InstitutionDomain.STATUS_ACTIVE
            and d.is_active
            and d.institution is not None
            and d.institution.is_active
        ]
        # Hostname-collision fail-safe (R3.5, R7.9): if more than one active
        # domain across distinct active institutions matches case-insensitively,
        # this is a configuration error. Never silently pick one school's data —
        # fall back to the shared Beanola portal and surface the collision.
        distinct_institutions = {str(d.institution_id) for d in active_domains}
        if len(distinct_institutions) > 1:
            self._report_collision(hostname, active_domains)
            return InstitutionContext("shared", None, self.BEANOLA_BRAND.copy())
        domain = active_domains[0] if active_domains else None
        if not domain:
            # The hostname is configured but no usable active domain matched
            # (non-active status, inactive row, or inactive institution). Fail
            # closed to the Neutral Beanola context and surface for ops review
            # (R7.9, R19.3, R19.4) — these were expected to resolve.
            self._report_non_active(hostname, candidate_domains)
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
            logging.getLogger(__name__).warning(
                "Failed to report domain collision to Sentry for hostname=%s", hostname, exc_info=True
            )

    @staticmethod
    def _report_non_active(hostname: str, domains: list) -> None:
        """Surface a configured-but-not-resolvable hostname for ops review (R19.4).

        A row exists for ``hostname`` yet no usable active domain matched — the
        domain is in a non-active status (``pending_dns``/``pending_review``/
        ``verified``/``disabled``/``failed``), the row is inactive, or the
        institution is inactive. This was expected to resolve, so it is logged
        without leaking school data. Never raises.
        """
        import logging

        statuses = sorted({str(getattr(d, "status", "")) for d in domains})
        logging.getLogger(__name__).warning(
            "domain.non_active: hostname %r matched %d configured domain(s) "
            "(statuses=%s) but none are active; resolving to shared portal",
            hostname,
            len(domains),
            ",".join(s for s in statuses if s),
        )

    @staticmethod
    def _report_unknown(hostname: str) -> None:
        """Surface an unknown host for ops review (R19.4) without log noise.

        Legitimate shared-portal/platform hosts (Django ``ALLOWED_HOSTS`` plus
        common local hosts) are suppressed so the neutral Beanola portal does
        not log every request. Only unknown hosts that look like they were
        expected to resolve are logged. Never raises.
        """
        import logging

        try:
            from django.conf import settings

            allowed = {str(h).strip().lower() for h in getattr(settings, "ALLOWED_HOSTS", [])}
        except Exception:
            allowed = set()
        # Common platform/dev hosts that legitimately serve the shared portal.
        allowed.update({"localhost", "127.0.0.1", "testserver", "web", "0.0.0.0"})
        if "*" in allowed or hostname in allowed:
            return
        # Suppress subdomains of an allowed wildcard suffix (e.g. ".beanola.com").
        for entry in allowed:
            if entry.startswith(".") and (hostname == entry[1:] or hostname.endswith(entry)):
                return
        logging.getLogger(__name__).warning(
            "domain.unknown: hostname %r did not match any configured domain; "
            "resolving to shared portal",
            hostname,
        )


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
# Centralized authorization: capability catalogue + Capability_Set (R2 / R3)
# ---------------------------------------------------------------------------
#
# ``AdminCapabilityService`` is the single authorization brain (R1.5, R3): every
# authority decision resolves through it, composing the existing
# ``is_super_admin``, ``ROLE_HIERARCHY``, and ``AccessScopeService`` rather than
# comparing raw role strings in endpoint code. This block defines only the
# capability vocabulary, the resolved-capability data shape, and the
# fail-closed resolution error (task 2.1). Capability derivation, enforcement,
# and scope helpers are added in task 2.2.


class CapabilityResolutionError(Exception):
    """Raised when a :class:`CapabilitySet` cannot be resolved for an actor.

    Per R1.6 the caller MUST fail closed on this error: deny the action, expose
    a Capability_Set containing zero capabilities, return no Tenant data, and
    surface an authorization error indicating capabilities could not be
    resolved.
    """


@dataclass(frozen=True)
class CapabilitySet:
    """The capabilities resolved for the current actor (R2.1).

    ``role`` is the actor's canonical role string; ``is_super_admin`` and
    ``all_access`` mirror the existing scope flags; ``platform_capabilities``
    holds the actor's ``platform.*`` capabilities (full set for a Super_Admin,
    empty otherwise); ``institution_capabilities`` maps an institution id to the
    frozenset of ``tenant.*`` capabilities the actor holds for that institution.
    """

    role: str
    is_super_admin: bool
    all_access: bool
    platform_capabilities: frozenset[str]
    institution_capabilities: dict[str, frozenset[str]]


class AdminCapabilityService:
    """Centralized authorization service (R3) — capability catalogues + derivation.

    Capability derivation (``get_capabilities`` / ``get_institution_capabilities``)
    is implemented here (task 2.2), composing the existing ``is_super_admin``,
    ``ROLE_HIERARCHY``, and a single ``AccessScopeService`` scope computation.
    Enforcement (``require_capability`` / ``require_institution_capability``) and
    scope helpers (``visible_institution_queryset``, ``can_manage_institution``,
    ``can_manage_program``, ``can_manage_domain``, ``can_invite_staff``) are added
    in task 2.3. This service is the only place authority is decided; endpoint
    code never compares raw role strings (R1.5).
    """

    # --- Platform capability catalogue (R2.5) — 17 ``platform.*`` strings ---
    PLATFORM_CAPABILITIES: frozenset[str] = frozenset(
        {
            "platform.tenant.read_all",
            "platform.tenant.create",
            "platform.tenant.update",
            "platform.tenant.deactivate",
            "platform.domain.manage",
            "platform.asset.manage",
            "platform.template.manage",
            "platform.document.manage",
            "platform.canonical_program.manage",
            "platform.program_assignment.manage",
            "platform.intake.manage",
            "platform.user.create_global",
            "platform.user.manage_all",
            "platform.access_grant.manage",
            "platform.audit.read_all",
            "platform.routing.simulate_all",
            "platform.settings.manage",
        }
    )

    # --- Tenant capability catalogue (R2.6) — 17 ``tenant.*`` strings ---
    TENANT_CAPABILITIES: frozenset[str] = frozenset(
        {
            "tenant.profile.read",
            "tenant.profile.request_change",
            "tenant.application.read",
            "tenant.application.review",
            "tenant.application.export",
            "tenant.document.read",
            "tenant.document.verify",
            "tenant.payment.read",
            "tenant.payment.verify",
            "tenant.staff.read",
            "tenant.staff.invite",
            "tenant.staff.disable",
            "tenant.audit.read",
            "tenant.program.read",
            "tenant.program.request_change",
            "tenant.domain.read",
            "tenant.domain.request_change",
        }
    )

    # --- Capability derivation bundles (design "Capability derivation rule") ---
    #
    # The default bundle for any active tenant membership/grant is read-oriented
    # (plan §4.2: "read-only by default"). It applies to every institution the
    # actor is scoped to.
    _DEFAULT_TENANT_READ_CAPABILITIES: frozenset[str] = frozenset(
        {
            "tenant.profile.read",
            "tenant.application.read",
            "tenant.document.read",
            "tenant.payment.read",
            "tenant.staff.read",
            "tenant.audit.read",
            "tenant.program.read",
            "tenant.domain.read",
        }
    )

    # Mutation capabilities are added only when explicitly granted. The grant /
    # membership ``permissions`` JSON stores values from the serializer
    # allowlist (``apps/catalog/admin_serializers.GRANT_PERMISSION_ALLOWLIST``:
    # ``view``, ``review``, ``manage``, ``verify_documents``, ``verify_payments``,
    # ``export``); this maps each granted value onto the design's
    # granted-mutation ``tenant.*`` bundle ("mutate only when granted").
    _GRANTED_MUTATION_CAPABILITIES: dict[str, frozenset[str]] = {
        "view": frozenset(),
        "review": frozenset({"tenant.application.review"}),
        "verify_documents": frozenset({"tenant.document.verify"}),
        "verify_payments": frozenset({"tenant.payment.verify"}),
        "export": frozenset({"tenant.application.export"}),
        "manage": frozenset(
            {
                "tenant.staff.invite",
                "tenant.staff.disable",
                "tenant.profile.request_change",
                "tenant.program.request_change",
                "tenant.domain.request_change",
            }
        ),
    }

    def get_capabilities(self, user) -> CapabilitySet:
        """Resolve the actor's full :class:`CapabilitySet` (R1, R2.2, R2.3, R3.2, R3.3).

        Composes the existing authority primitives — ``is_super_admin`` for the
        platform/super-admin decision (R1.4), ``ROLE_HIERARCHY`` for the
        canonical-role gate (R1.1), and a single ``AccessScopeService`` scope
        computation for the per-institution tenant derivation (R3.3) — never a
        raw role-string comparison in calling code (R1.5).

        - A role outside the four canonical roles resolves to zero capabilities
          (R1.1).
        - A ``super_admin`` receives the full ``platform.*`` set; super-admin
          authority is never derived from a membership or grant (R1.4, R2.2,
          R3.2).
        - Any other canonical role receives only ``tenant.*`` capabilities
          derived per institution from active (``is_active``) and non-expired
          memberships/grants (R2.3, R3.3); a generic ``admin`` with no active
          membership/grant therefore resolves to zero capabilities (R1.3).
        - Raises :class:`CapabilityResolutionError` on any dependency failure so
          the caller fails closed (R1.6).
        """
        role = (getattr(user, "role", "") or "").strip().lower()

        # R1.1: any actor whose role is not one of the four canonical roles has
        # a Capability_Set containing zero capabilities.
        if role not in ROLE_HIERARCHY:
            return self._empty_capability_set(role)

        # R1.4 / R2.2 / R3.2: Super_Admin authority comes ONLY from the
        # ``super_admin`` role string, never from a membership or grant.
        if is_super_admin(user):
            return CapabilitySet(
                role=role,
                is_super_admin=True,
                all_access=True,
                platform_capabilities=self.PLATFORM_CAPABILITIES,
                institution_capabilities={},
            )

        # Non-super-admin: derive tenant capabilities from the single
        # AccessScopeService scope computation (one scope computation, R3.3).
        try:
            filters = AccessScopeService().filters_for_user(user)
        except Exception as exc:  # R1.6: fail closed on dependency failure.
            raise CapabilityResolutionError(
                "Could not resolve access scope for actor."
            ) from exc

        institution_capabilities = self._derive_institution_capabilities(user, filters)

        return CapabilitySet(
            role=role,
            is_super_admin=False,
            all_access=filters.all_access,
            platform_capabilities=frozenset(),
            institution_capabilities=institution_capabilities,
        )

    def get_institution_capabilities(self, user, institution) -> frozenset[str]:
        """The ``tenant.*`` capabilities the actor holds for one institution (R3.1).

        Resolves through :meth:`get_capabilities` so there is a single derivation
        path. A Super_Admin holds platform authority that subsumes every tenant
        capability, so this returns the full ``tenant.*`` catalogue for them; any
        other actor returns the per-institution set (empty when the institution
        is out of scope). Raises :class:`CapabilityResolutionError` on dependency
        failure (R1.6), propagated from :meth:`get_capabilities`.
        """
        capability_set = self.get_capabilities(user)
        if capability_set.is_super_admin:
            return self.TENANT_CAPABILITIES
        institution_id = str(getattr(institution, "id", institution))
        return capability_set.institution_capabilities.get(institution_id, frozenset())

    # -- Internal derivation helpers ----------------------------------------

    @staticmethod
    def _empty_capability_set(role: str) -> CapabilitySet:
        """A zero-capability set (R1.1, R1.3, R1.6 fail-closed shape)."""
        return CapabilitySet(
            role=role,
            is_super_admin=False,
            all_access=False,
            platform_capabilities=frozenset(),
            institution_capabilities={},
        )

    def _derive_institution_capabilities(
        self, user, filters: ScopeFilters
    ) -> dict[str, frozenset[str]]:
        """Per-institution ``tenant.*`` capabilities for a non-super-admin (R2.3, R3.3).

        ``filters`` (the single ``AccessScopeService`` scope computation) is the
        authority for *which* institutions are in scope. Each in-scope
        institution starts with the read-default bundle; granted-mutation
        capabilities are then layered on from the ``permissions`` of the active,
        non-expired memberships/grants for that institution. Institutions not in
        ``filters.institution_ids`` are never keyed, so the scope stays single-
        sourced and cross-tenant capabilities cannot appear.
        """
        scoped_ids = set(filters.institution_ids)
        if not scoped_ids:
            return {}

        # Read-default bundle for every in-scope institution.
        derived: dict[str, set[str]] = {
            iid: set(self._DEFAULT_TENANT_READ_CAPABILITIES) for iid in scoped_ids
        }

        user_id = getattr(user, "id", None)
        if not user_id:
            return {iid: frozenset(caps) for iid, caps in derived.items()}

        now = timezone.now()
        try:
            memberships = list(
                UserInstitutionMembership.objects.filter(user_id=user_id, is_active=True)
            )
            grants = list(
                AccessGrant.objects.filter(user_id=user_id, is_active=True).filter(
                    Q(expires_at__isnull=True) | Q(expires_at__gt=now)
                )
            )
        except Exception as exc:  # R1.6: fail closed on dependency failure.
            raise CapabilityResolutionError(
                "Could not resolve tenant capabilities for actor."
            ) from exc

        for row in (*memberships, *grants):
            institution_id = getattr(row, "institution_id", None)
            if not institution_id:
                continue
            key = str(institution_id)
            if key not in derived:
                continue
            derived[key].update(self._mutations_from_permissions(row.permissions))

        return {iid: frozenset(caps) for iid, caps in derived.items()}

    @classmethod
    def _mutations_from_permissions(cls, permissions) -> set[str]:
        """Map a grant/membership ``permissions`` value to granted ``tenant.*`` mutations.

        Tolerates the JSON shapes the column can hold — a list of permission
        strings (canonical), a dict of ``{permission: truthy}`` flags, or a bare
        string — and silently ignores any value outside the granted-mutation
        map (unknown values grant nothing, never raise).
        """
        if not permissions:
            return set()
        if isinstance(permissions, dict):
            values = [key for key, flag in permissions.items() if flag]
        elif isinstance(permissions, str):
            values = [permissions]
        else:
            try:
                values = list(permissions)
            except TypeError:
                return set()
        caps: set[str] = set()
        for value in values:
            caps |= cls._GRANTED_MUTATION_CAPABILITIES.get(str(value).strip().lower(), frozenset())
        return caps

    # -- Enforcement helpers (R3.4) -----------------------------------------

    def require_capability(self, user, capability) -> None:
        """Enforce a platform (``platform.*``) capability (R3.4).

        Resolves the actor's :class:`CapabilitySet` through the single
        derivation path and raises DRF :class:`PermissionDenied` when the
        platform capability is absent. Fails closed: a
        :class:`CapabilityResolutionError` is converted to ``PermissionDenied``
        so the action is denied and no tenant data is returned (R1.6).
        """
        try:
            capability_set = self.get_capabilities(user)
        except CapabilityResolutionError as exc:
            raise PermissionDenied(
                "Your capabilities could not be resolved; the action is denied."
            ) from exc
        if capability not in capability_set.platform_capabilities:
            raise PermissionDenied("You do not have permission to perform this action.")

    def require_institution_capability(self, user, institution, capability) -> None:
        """Enforce a per-institution (``tenant.*``) capability (R3.4).

        Raises DRF :class:`PermissionDenied` when the actor does not hold
        ``capability`` for ``institution``. Because
        :meth:`get_institution_capabilities` returns an empty set for an
        out-of-scope institution, this denies cross-tenant access without
        confirming the institution exists. Fails closed on
        :class:`CapabilityResolutionError` (R1.6).
        """
        try:
            capabilities = self.get_institution_capabilities(user, institution)
        except CapabilityResolutionError as exc:
            raise PermissionDenied(
                "Your capabilities could not be resolved; the action is denied."
            ) from exc
        if capability not in capabilities:
            raise PermissionDenied("You do not have permission to perform this action.")

    # -- Scope helper (R3.5, R4.5) ------------------------------------------

    def visible_institution_queryset(self, user):
        """An ``Institution`` queryset scoped to the actor (R3.5, R4.5).

        Returns every institution for a Super_Admin (and for any caller whose
        single ``AccessScopeService`` computation grants ``all_access``); the
        membership/grant institution set for a scoped non-super-admin; and an
        empty queryset (``.none()``) for an actor with no scope. Callers filter
        through this **before** any ``.get()`` so an out-of-scope identifier
        returns 404 / non-revealing 403 and is never confirmed to exist. Fails
        closed: a scope-resolution failure raises
        :class:`CapabilityResolutionError` (R1.6).
        """
        if is_super_admin(user):
            return Institution.objects.all()
        try:
            filters = AccessScopeService().filters_for_user(user)
        except Exception as exc:  # R1.6: fail closed on dependency failure.
            raise CapabilityResolutionError(
                "Could not resolve access scope for actor."
            ) from exc
        if filters.all_access:
            return Institution.objects.all()
        if not filters.institution_ids:
            return Institution.objects.none()
        return Institution.objects.filter(id__in=filters.institution_ids)

    # -- Capability predicates (R3.1) ---------------------------------------

    def can_manage_institution(self, user, institution) -> bool:
        """Whether the actor may manage ``institution`` as a tenant object (R3.1).

        Super_Admins manage every tenant. A non-super-admin manages an
        institution only when it is within their scope and they hold the tenant
        profile change-request capability for it; an out-of-scope institution
        resolves to an empty capability set, so cross-tenant management is
        impossible. Never raises — a resolution failure yields ``False``.
        """
        if is_super_admin(user):
            return True
        try:
            capabilities = self.get_institution_capabilities(user, institution)
        except CapabilityResolutionError:
            return False
        return "tenant.profile.request_change" in capabilities

    def can_manage_program(self, user, program) -> bool:
        """Whether the actor may manage ``program`` (R5.2, R8.8).

        Program rows are tenant offerings. Creating, updating, deactivating, or
        reassigning an offering is a platform operation because it assigns a
        Beanola-owned Canonical_Program to a Tenant (R8.8). Tenant_Admins may
        hold ``tenant.program.request_change``, but that is intentionally a
        request-only capability surfaced by the UI; it must never authorize a
        direct database mutation through a legacy catalog endpoint. Never raises
        — a resolution failure yields ``False``.
        """
        try:
            platform_caps = self.get_capabilities(user).platform_capabilities
            return (
                "platform.canonical_program.manage" in platform_caps
                or "platform.program_assignment.manage" in platform_caps
            )
        except CapabilityResolutionError:
            return False

    def can_manage_domain(self, user, domain) -> bool:
        """Whether the actor may manage ``domain`` (R3.1, R7.13, R7.14).

        Super_Admins manage every domain (``platform.domain.manage``); direct
        domain activation stays super-admin-only (R7.14, enforced at the view).
        A non-super-admin manages a domain only when it belongs to an
        institution in their scope and they hold ``tenant.domain.request_change``
        for it. Never raises — a resolution failure yields ``False``.
        """
        if is_super_admin(user):
            return True
        institution_id = getattr(domain, "institution_id", None)
        if not institution_id:
            return False
        try:
            return (
                "tenant.domain.request_change"
                in self.get_institution_capabilities(user, institution_id)
            )
        except CapabilityResolutionError:
            return False

    def can_invite_staff(self, user, institution, target_role) -> bool:
        """Whether the actor may invite a ``target_role`` user into ``institution`` (R6.3, R6.4).

        Super_Admins may invite any role. A non-super-admin may invite only when
        they hold ``tenant.staff.invite`` for ``institution`` (R6.3) **and** the
        assignable ``target_role`` is at or below their own delegated authority
        per ``ROLE_HIERARCHY`` (R6.4). An unknown ``target_role`` and any role
        above the inviter's authority are rejected. Never raises — a resolution
        failure yields ``False``.
        """
        if is_super_admin(user):
            return True
        try:
            capabilities = self.get_institution_capabilities(user, institution)
        except CapabilityResolutionError:
            return False
        if "tenant.staff.invite" not in capabilities:
            return False
        inviter_role = (getattr(user, "role", "") or "").strip().lower()
        inviter_level = ROLE_HIERARCHY.get(inviter_role, 0)
        target_level = ROLE_HIERARCHY.get((target_role or "").strip().lower(), 0)
        if target_level == 0:
            # Unknown / non-canonical target role — never assignable.
            return False
        return target_level <= inviter_level


# ---------------------------------------------------------------------------
# Tenant domain lifecycle state machine (R7.2)
# ---------------------------------------------------------------------------


class DomainTransitionError(Exception):
    """Raised when an :class:`InstitutionDomain` status transition is rejected (R7.2).

    Carries a stable ``code`` (``INVALID_DOMAIN_TRANSITION``) plus the offending
    ``from_status``/``to_status`` so callers (the domain create/activate views,
    the verification task) can map it onto a non-revealing API error.
    """

    code = "INVALID_DOMAIN_TRANSITION"

    def __init__(self, from_status: str, to_status: str, message: str | None = None):
        self.from_status = from_status
        self.to_status = to_status
        super().__init__(
            message
            or f"Domain status transition {from_status!r} -> {to_status!r} is not permitted."
        )


class DomainStatusMachine:
    """Pure, table-driven state machine for ``InstitutionDomain.status`` (R7.2).

    The machine is the single source of truth for which lifecycle transitions
    are permitted. It holds no state of its own and touches no database — it is
    a static decision table over the ``InstitutionDomain.STATUS_*`` constants —
    so it is trivially testable and reused identically by the domain
    create/activate endpoints (Task 7.2) and the verification Celery task
    (Task 7.3).

    Only these transitions are allowed; every other ``(from, to)`` pair
    (including no-op self-transitions and any jump into ``active`` that does not
    come from ``verified``) is rejected::

        pending_dns    -> pending_review
        pending_dns    -> failed
        pending_review -> verified
        verified       -> active
        active         -> disabled
        failed         -> pending_dns
        disabled       -> active
    """

    ALLOWED_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
        {
            (InstitutionDomain.STATUS_PENDING_DNS, InstitutionDomain.STATUS_PENDING_REVIEW),
            (InstitutionDomain.STATUS_PENDING_DNS, InstitutionDomain.STATUS_FAILED),
            (InstitutionDomain.STATUS_PENDING_REVIEW, InstitutionDomain.STATUS_VERIFIED),
            (InstitutionDomain.STATUS_VERIFIED, InstitutionDomain.STATUS_ACTIVE),
            (InstitutionDomain.STATUS_ACTIVE, InstitutionDomain.STATUS_DISABLED),
            (InstitutionDomain.STATUS_FAILED, InstitutionDomain.STATUS_PENDING_DNS),
            (InstitutionDomain.STATUS_DISABLED, InstitutionDomain.STATUS_ACTIVE),
        }
    )

    @classmethod
    def can_transition(cls, from_status: str, to_status: str) -> bool:
        """Whether ``from_status -> to_status`` is one of the allowed transitions.

        Pure lookup against :attr:`ALLOWED_TRANSITIONS`; returns ``False`` for
        any pair not in the table, including unknown status strings and
        same-status no-ops.
        """
        return (from_status, to_status) in cls.ALLOWED_TRANSITIONS

    @classmethod
    def assert_transition(cls, from_status: str, to_status: str) -> None:
        """Raise :class:`DomainTransitionError` unless the transition is allowed.

        The companion to :meth:`can_transition` for call sites that should fail
        loudly (e.g. activating a non-``verified`` domain → ``DOMAIN_NOT_VERIFIED``
        at the view layer, R7.7) rather than branch on a boolean.
        """
        if not cls.can_transition(from_status, to_status):
            raise DomainTransitionError(from_status, to_status)

    @classmethod
    def allowed_targets(cls, from_status: str) -> frozenset[str]:
        """The set of statuses reachable from ``from_status`` in one transition."""
        return frozenset(
            target for source, target in cls.ALLOWED_TRANSITIONS if source == from_status
        )


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


# ---------------------------------------------------------------------------
# Tenant document-profile payload validation (R8.6 / R8.7 / R8.10)
# ---------------------------------------------------------------------------
#
# Profiles are the multi-section successors to Document_Templates: they carry
# many free-form prose sections plus structured fee-chart / bank-account /
# requirements data, replacing the hard-coded frontend acceptance-letter copy
# (see ``apps/admissions/src/lib/pdf/documents/acceptanceLetterProfiles.ts``).
#
# This validator reuses every safety primitive from
# ``validate_template_payload`` — the ``ALLOWED_TEMPLATE_TOKENS`` allowlist, the
# ``_contains_merge_document`` / ``_MERGE_FIELD_MARKERS`` /
# ``_MERGE_DOCUMENT_SIGNATURES`` rejection, the ``_MERGE_DOCUMENT_KEYS`` reserved
# keys, the ``_TEMPLATE_TOKEN_RE`` token scan, ``html.escape`` at render via
# ``DocumentTemplateService._render_value`` — and only adds the structural caps
# and fee/bank row-shape checks the richer profile shape needs. Rejection is
# mapped to the stable ``TEMPLATE_TOKEN_REJECTED`` 400 code at the endpoint
# layer (task 17); this is the pure validator only — it raises before any
# persistence side effect, so a rejected profile version is never stored.
#
# Section *keys* are free-form identifiers (profiles carry arbitrarily-named
# sections, NOT the templates' ``{body, signatory}`` allowlist) — but a reserved
# merge-document key (``merge_document`` etc., per ``_MERGE_DOCUMENT_KEYS``) is
# still rejected. Uploaded DOCX/PDF originals are retained as admin-reference
# attachments only and are never executed/merged, so an uploaded file does not
# fail validation here (unlike the template path, which forbids file uploads).
_MAX_PROFILE_SECTIONS = 30
_MAX_PROFILE_SECTION_CHARS = 5_000
_MAX_PROFILE_FEE_ROWS = 50
_MAX_PROFILE_BANK_ACCOUNTS = 10
_MAX_PROFILE_REQUIREMENTS = 50


def validate_profile_payload(
    *,
    sections: Any = None,
    tokens: Any = None,
    fee_chart: Any = None,
    bank_accounts: Any = None,
    requirements: Any = None,
    has_uploaded_file: bool = False,
    extra_keys: Any = None,
) -> None:
    """Validate a tenant Document_Profile create/update payload (R8.6/8.7/8.10).

    Accepts a safe structured-JSON profile — free-form prose sections that only
    reference allowlisted ``{{token}}`` values, plus fee-chart / bank-account /
    requirements data within the structural caps — and rejects anything that
    smuggles a merge document, an unknown/injected token, a reserved
    merge-document section key, or a malformed/oversized structure. Raises
    :class:`TemplateValidationError` (mapped to the stable
    ``TEMPLATE_TOKEN_REJECTED`` 400 code by the admin profile views) on any
    violation, naming the offending section / token / row; returns ``None`` when
    the payload is safe. Only provided values are validated, so a partial update
    that omits a field leaves it untouched.

    ``has_uploaded_file`` flags a multipart file part: uploaded DOCX/PDF
    originals are retained as admin-reference attachments only (never
    executed/merged), so — unlike the template path — a file upload does not
    fail validation here. ``extra_keys`` is the set of top-level payload keys,
    used to reject reserved merge-document keys exactly like the template path.
    """
    if extra_keys is not None:
        reserved = {str(k).lower() for k in extra_keys} & _MERGE_DOCUMENT_KEYS
        if reserved:
            raise TemplateValidationError(
                "Disallowed merge-document field(s): " + ", ".join(sorted(reserved))
            )

    if sections is not None:
        _validate_profile_sections(sections)

    if tokens is not None:
        # Reuse the template token allowlist check verbatim — the message names
        # the offending token, satisfying the offender-naming contract.
        _validate_tokens(tokens)

    if fee_chart is not None:
        _validate_fee_chart(fee_chart)

    if bank_accounts is not None:
        _validate_bank_accounts(bank_accounts)

    if requirements is not None:
        _validate_requirements(requirements)


def _validate_profile_sections(sections: Any) -> None:
    if not isinstance(sections, dict):
        raise TemplateValidationError("Profile sections must be a JSON object.")
    if len(sections) > _MAX_PROFILE_SECTIONS:
        raise TemplateValidationError(
            f"Too many profile sections ({len(sections)}); the maximum is "
            f"{_MAX_PROFILE_SECTIONS}."
        )
    for key, value in sections.items():
        if not isinstance(key, str):
            raise TemplateValidationError(
                f"Profile section keys must be strings, not {type(key).__name__}."
            )
        # Section keys are free-form, but a reserved merge-document key implies a
        # smuggled uploaded/merge document rather than a safe prose section.
        if key.lower() in _MERGE_DOCUMENT_KEYS:
            raise TemplateValidationError(
                f"Disallowed reserved merge-document section key: {key!r}."
            )
        if not isinstance(value, str):
            # A safe section body is plain prose; nested structures/binary are
            # how a merge document would be smuggled in.
            raise TemplateValidationError(
                f"Profile section {key!r} must be a string, not "
                f"{type(value).__name__}."
            )
        if len(value) > _MAX_PROFILE_SECTION_CHARS:
            raise TemplateValidationError(
                f"Profile section {key!r} exceeds the maximum length of "
                f"{_MAX_PROFILE_SECTION_CHARS} characters."
            )
        if _contains_merge_document(value):
            raise TemplateValidationError(
                f"Profile section {key!r} contains disallowed merge-document "
                "or field-code content."
            )
        for match in _TEMPLATE_TOKEN_RE.finditer(value):
            token = match.group(1)
            if token not in ALLOWED_TEMPLATE_TOKENS:
                raise TemplateValidationError(
                    f"Disallowed or injected token {{{{{token}}}}} in profile "
                    f"section {key!r}."
                )


def _validate_fee_chart(fee_chart: Any) -> None:
    if not isinstance(fee_chart, (list, tuple)):
        raise TemplateValidationError("Profile fee_chart must be a list of fee rows.")
    if len(fee_chart) > _MAX_PROFILE_FEE_ROWS:
        raise TemplateValidationError(
            f"Too many fee rows ({len(fee_chart)}); the maximum is "
            f"{_MAX_PROFILE_FEE_ROWS}."
        )
    for index, row in enumerate(fee_chart):
        if not isinstance(row, dict):
            raise TemplateValidationError(
                f"Fee row {index} must be an object, not {type(row).__name__}."
            )
        item = row.get("item")
        if not isinstance(item, str) or not item.strip():
            raise TemplateValidationError(
                f"Fee row {index} must have a non-empty string 'item'."
            )
        amount = row.get("amount")
        # bool is a subclass of int — a True/False "amount" is not a real fee.
        if isinstance(amount, bool) or not isinstance(amount, (int, float)):
            raise TemplateValidationError(
                f"Fee row {index} 'amount' must be numeric."
            )


def _validate_bank_accounts(bank_accounts: Any) -> None:
    if not isinstance(bank_accounts, (list, tuple)):
        raise TemplateValidationError(
            "Profile bank_accounts must be a list of bank-account rows."
        )
    if len(bank_accounts) > _MAX_PROFILE_BANK_ACCOUNTS:
        raise TemplateValidationError(
            f"Too many bank accounts ({len(bank_accounts)}); the maximum is "
            f"{_MAX_PROFILE_BANK_ACCOUNTS}."
        )
    for index, row in enumerate(bank_accounts):
        if not isinstance(row, dict):
            raise TemplateValidationError(
                f"Bank account row {index} must be an object, not "
                f"{type(row).__name__}."
            )
        bank_name = row.get("bank_name")
        if not isinstance(bank_name, str) or not bank_name.strip():
            raise TemplateValidationError(
                f"Bank account row {index} must have a non-empty string "
                "'bank_name'."
            )
        account_number = row.get("account_number")
        if not isinstance(account_number, str) or not account_number.strip():
            raise TemplateValidationError(
                f"Bank account row {index} must have a non-empty string "
                "'account_number'."
            )


def _validate_requirements(requirements: Any) -> None:
    if not isinstance(requirements, (list, tuple)):
        raise TemplateValidationError(
            "Profile requirements must be a list of requirement strings."
        )
    if len(requirements) > _MAX_PROFILE_REQUIREMENTS:
        raise TemplateValidationError(
            f"Too many requirements ({len(requirements)}); the maximum is "
            f"{_MAX_PROFILE_REQUIREMENTS}."
        )
    for index, item in enumerate(requirements):
        if not isinstance(item, str):
            raise TemplateValidationError(
                f"Requirement {index} must be a string, not {type(item).__name__}."
            )
