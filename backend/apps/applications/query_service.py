"""The one scoped applications query authority (task 9.1).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.1 — "Create one
scoped applications query and aggregate contract".
Requirements: **R8.1** (list, filters, facets, search, pagination, aggregates,
and dashboard links are served by one scoped query contract and never infer
portfolio totals from one page), **R8.6** (metrics are authoritative,
scope-aware, definition-labelled, and explicit about unknown states — missing
data never becomes a healthy zero).
Findings: **ADM-01** — "Application totals, filters, and select options are
derived from the currently loaded page. A dashboard link emits a filter the
parser ignores."
Design: §13.2 ("Applications: server query, saved filters, queue,
detail/review"), §10.2's rule applied to the roster ("expose backend
aggregates, never a client-filtered global list").

Why this module exists
----------------------
Before 9.1 the admin applications roster was assembled in the browser:

1. **Totals were counted over the loaded rows.**
   ``buildApplicationsOverview(applications, totalCount)`` filtered the
   *currently loaded page* to produce "decision queue", "payment proof review",
   "accepted path" and eleven other numbers an operator reads as portfolio
   facts. Load page 1 of 9 and the decision queue silently described 25 rows.
2. **Filter options were harvested from the loaded rows.**
   ``[...new Set(applications.map(a => a.program))]`` — so a program with no
   application on the current page was *not offered as a filter*, and the set of
   options changed as the operator paged.
3. **A dashboard link emitted a parameter nothing parsed.** The "Deadlines in
   48h" tile linked to ``?deadlinePressureFilter=true``, which is not in
   ``APPLICATION_FILTER_KEYS``; the roster dropped it and showed an unfiltered
   list, so the tile's number and the page it opened disagreed.

This service is the server-side answer to all three. It is the single place that
decides *which applications an actor may see*, *how they are filtered and
sorted*, *what the whole-set totals are*, *which filter options exist in scope*,
and *what an export may contain*. Views are thin.

Authority, in one sentence: **scope is computed before any lookup.** A requested
``institution_id`` / ``program_offering_id`` / ``intake_id`` /
``assigned_reviewer_id`` is resolved against the actor's scope **before** it is
allowed into a filter, so an out-of-scope identifier is indistinguishable from
one that does not exist (masked 404 + a ``scope.denied`` Audit_Event) and can
never be confirmed to exist by a count, a facet label, or an
empty-but-different response.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any, Iterable, Optional

from django.db.models import Count, Exists, F, Max, Min, OuterRef, Q, QuerySet, TextField, Value
from django.db.models.functions import Coalesce, NullIf
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.catalog.services import (
    AccessScopeService,
    AdminCapabilityService,
    CapabilityResolutionError,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Vocabulary (all derived from what the platform already defines)
# ---------------------------------------------------------------------------

#: Statuses whose applications are waiting on a staff decision. Read from the
#: same pair ``ApplicationFilter.filter_review_queue`` uses, so the roster's
#: "decision queue" number and the ``review_queue=true`` filter cannot disagree.
REVIEW_QUEUE_STATUSES: tuple[str, ...] = ("submitted", "under_review")

#: Statuses that mean the applicant has an offer or a place. Mirrors the
#: frontend ``ACCEPTED_APPLICATION_STATUSES`` (drift-guarded by
#: ``tests/unit/test_application_query_contract_9_1.py``).
ACCEPTED_STATUSES: tuple[str, ...] = (
    "approved",
    "conditionally_approved",
    "enrolled",
)

#: Payment statuses the platform treats as money resolved. Imported from the
#: canonical payment tuple rather than restated (ADR-001).
def _resolved_payment_statuses() -> tuple[str, ...]:
    from apps.documents.payment_constants import RESOLVED_PAYMENT_STATUSES

    return tuple(RESOLVED_PAYMENT_STATUSES)


#: Document verification states that mean "not yet verified" — the same set
#: ``ApplicationFilter.filter_pending_documents`` and the dashboard's
#: needs-attention counter use.
UNVERIFIED_DOCUMENT_STATES: tuple[Optional[str], ...] = (None, "", "pending", "uploaded")

#: How far ahead a deadline counts as *pressure*. This is the dashboard's own
#: "Deadlines in 48h" window (``Dashboard.tsx``), promoted from a tile label to
#: a registered, server-side query parameter so the tile's number and the roster
#: it links to describe the same set (ADM-01's ignored-filter half).
DEADLINE_PRESSURE_HOURS = 48

#: Default review SLA when the ``review_sla_days`` Setting is absent. Same
#: default and same Setting key ``ApplicationFilter.filter_overdue_review`` and
#: ``review_sla_reminder_task`` read, so "past SLA" means one thing.
DEFAULT_REVIEW_SLA_DAYS = 5

#: Payment statuses that mean *a human must look at this payment*. The dashboard
#: "Payments pending" tile links to ``payment_status=pending_review``, so the
#: tile's population is defined here once and read by both sides rather than the
#: tile counting ``Payment`` rows while its link filters applications.
PAYMENT_REVIEW_STATUSES: tuple[str, ...] = ("pending_review",)

#: The six admin-dashboard exception tiles, each as **the registered roster query
#: its link opens** plus the counter that answers it (task 9.2, R8.6).
#:
#: This is the closure of ADM-02's first half. The dashboard used to state a
#: number computed one way and link to a roster computed another way — and three
#: of these six numbers were not computed at all: ``overdue_reviews``,
#: ``conditions_expiring_soon`` and ``enrollments_expiring_soon`` had no backend
#: field, so the frontend normalizer turned the absent key into ``0`` and an
#: operator read "0 reviews past SLA" as "nothing to do".
#:
#: Pairing the query with the counter here means a tile cannot drift from the
#: page it opens: the counter is computed with the same ``Q`` the query parses to.
#: ``apps/admissions/src/pages/admin/lib/rosterDeepLinks.ts`` mirrors the query
#: half and is drift-guarded both ways.
DASHBOARD_TILES: dict[str, dict[str, str]] = {
    "overdue_reviews": {
        "roster_query": "overdue_review=true",
        "counter": "overdue_review_count",
    },
    "decision_queue": {
        "roster_query": "review_queue=true",
        "counter": "decision_queue_count",
    },
    "pending_documents": {
        "roster_query": "has_pending_documents=true",
        "counter": "pending_documents_count",
    },
    "payment_review": {
        "roster_query": "payment_status=pending_review",
        "counter": "payment_review_count",
    },
    "upcoming_interviews": {
        "roster_query": "has_upcoming_interviews=true",
        "counter": "upcoming_interviews_count",
    },
    "deadline_pressure": {
        "roster_query": "deadline_pressure=true",
        "counter": "deadline_pressure_count",
    },
}

#: Definitions for the three tile counters that are not aggregate counters. Kept
#: separate from :meth:`ApplicationQueryService.aggregate_definitions` so the
#: aggregate contract 9.1 published is unchanged; merged by
#: :meth:`ApplicationQueryService.dashboard_definitions`.
DASHBOARD_ONLY_DEFINITIONS: dict[str, str] = {
    "pending_documents_count": (
        "Applications with at least one document still awaiting verification. "
        "Counts applications, not documents."
    ),
    "upcoming_interviews_count": (
        "Applications with an interview scheduled at a future time. "
        "Counts applications, not interview slots."
    ),
    "payment_review_count": (
        "Applications whose payment is marked for review and is waiting on a "
        "staff decision."
    ),
    "activity_this_week_count": (
        "Created, updated, or submitted since Monday in the platform timezone."
    ),
    "activity_this_month_count": (
        "Created, updated, or submitted since the 1st in the platform timezone."
    ),
}

#: Sort keys an operator may ask for, mapped to the ordering the database
#: applies. An unknown key is ignored rather than interpolated — the roster is
#: never allowed to order by an arbitrary column name.
SORT_FIELDS: dict[str, tuple[str, ...]] = {
    "activity_at": ("activity_at", "created_at", "id"),
    "created_at": ("created_at", "id"),
    "submitted_at": ("submitted_at", "created_at", "id"),
    "full_name": ("full_name", "id"),
    "status": ("status", "activity_at", "id"),
    "payment_status": ("payment_status", "activity_at", "id"),
    "program": ("program", "activity_at", "id"),
    "institution": ("institution", "activity_at", "id"),
    "deadline": ("next_deadline_at", "activity_at", "id"),
}

#: Legacy client sort aliases → canonical sort keys. The old roster sent
#: ``sortBy=date``; accepting it here means one parser understands both spellings
#: instead of two implementations diverging.
SORT_ALIASES: dict[str, str] = {
    "date": "activity_at",
    "name": "full_name",
    "payment": "payment_status",
    "activity": "activity_at",
}

DEFAULT_SORT = "activity_at"
DEFAULT_SORT_DESCENDING = True

#: Facet ceiling. A facet is a *pick list*, so an unbounded one would be a
#: second roster. Over-limit facets carry ``truncated: true`` rather than
#: silently dropping options (R8.6 — never an invented complete answer).
FACET_LIMIT = 200

#: Hard ceiling on an export, independent of page size (R6.5). An export that
#: would exceed this is refused with ``EXPORT_TOO_LARGE`` rather than truncated.
EXPORT_ROW_LIMIT = 5000

#: Roster columns only a platform all-access actor may read.
#:
#: ``institution_id`` / ``institution_name`` are *not* here: a tenant operator
#: legitimately sees which of their own schools a row belongs to. What is
#: withheld is the platform's own cross-tenant context — how many other
#: institutions offer the same canonical program. A tenant operator inferring
#: another school's catalogue from their roster is exactly the cross-tenant
#: inference R3.2 forbids, so the column is not merely hidden: it is not
#: computed.
PLATFORM_ONLY_APPLICATION_FIELDS: tuple[str, ...] = ("peer_offering_count",)


class ApplicationScopeDenied(Exception):
    """A requested identifier is outside the actor's scope, or does not exist.

    Raised instead of narrowing to zero rows so the two cases collapse into one
    masked 404 (R3.2). Carries the resource type + id only so the caller can
    emit ``scope.denied``; the values are never echoed to the client.
    """

    def __init__(self, resource_type: str, resource_id: Any) -> None:
        super().__init__("Out of scope")
        self.resource_type = resource_type
        self.resource_id = resource_id


class ApplicationExportTooLarge(Exception):
    """An export would exceed :data:`EXPORT_ROW_LIMIT` rows."""

    def __init__(self, row_count: int) -> None:
        super().__init__("Export too large")
        self.row_count = row_count


@dataclass(frozen=True)
class ApplicationFilters:
    """The validated, server-side filter set for one applications query.

    Every field is applied in SQL. Identifier fields are already scope-resolved
    by the time this object exists (see :meth:`ApplicationQueryService.parse`),
    so nothing here can widen an actor's scope.
    """

    institution_id: Optional[str] = None
    program_offering_id: Optional[str] = None
    intake_id: Optional[str] = None
    assigned_reviewer_id: Optional[str] = None
    statuses: tuple[str, ...] = ()
    exclude_statuses: tuple[str, ...] = ()
    payment_statuses: tuple[str, ...] = ()
    program: Optional[str] = None
    intake: Optional[str] = None
    institution: Optional[str] = None
    search: Optional[str] = None
    reviewer_assignment: Optional[str] = None
    is_late_submission: Optional[bool] = None
    has_pending_amendments: Optional[bool] = None
    review_queue: Optional[bool] = None
    overdue_review: Optional[bool] = None
    has_pending_documents: Optional[bool] = None
    has_upcoming_interviews: Optional[bool] = None
    deadline_pressure: Optional[bool] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    sort: str = DEFAULT_SORT
    descending: bool = DEFAULT_SORT_DESCENDING
    #: Registered parameter names that were present but not understood. Echoed
    #: back so a broken deep link is *visible* instead of silently dropped —
    #: exactly the failure mode ADM-01 describes.
    unknown_parameters: tuple[str, ...] = field(default=())

    def as_payload(self) -> dict[str, Any]:
        """The applied filters, echoed back so a UI never guesses them."""
        return {
            "institution_id": self.institution_id,
            "program_offering_id": self.program_offering_id,
            "intake_id": self.intake_id,
            "assigned_reviewer_id": self.assigned_reviewer_id,
            "status": list(self.statuses),
            "exclude_status": list(self.exclude_statuses),
            "payment_status": list(self.payment_statuses),
            "program": self.program,
            "intake": self.intake,
            "institution": self.institution,
            "search": self.search,
            "reviewer_assignment": self.reviewer_assignment,
            "is_late_submission": self.is_late_submission,
            "has_pending_amendments": self.has_pending_amendments,
            "review_queue": self.review_queue,
            "overdue_review": self.overdue_review,
            "has_pending_documents": self.has_pending_documents,
            "has_upcoming_interviews": self.has_upcoming_interviews,
            "deadline_pressure": self.deadline_pressure,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "sort": self.sort,
            "order": "desc" if self.descending else "asc",
            "unknown_parameters": list(self.unknown_parameters),
        }


@dataclass(frozen=True)
class RedactionPolicy:
    """What an actor may see in a roster row or export (R6.5).

    Resolved from the actor's capability set, never from a role string. Scope
    decides *which* rows exist for this actor; this decides which **platform**
    columns travel with them.
    """

    unrestricted: bool = False
    platform_only_fields: tuple[str, ...] = PLATFORM_ONLY_APPLICATION_FIELDS

    @property
    def withheld_fields(self) -> list[str]:
        return [] if self.unrestricted else list(self.platform_only_fields)

    def apply(self, row: dict[str, Any]) -> dict[str, Any]:
        if self.unrestricted:
            return row
        withheld = set(self.withheld_fields)
        return {key: value for key, value in row.items() if key not in withheld}

    def as_payload(self) -> dict[str, Any]:
        return {"applied": not self.unrestricted, "withheld_fields": self.withheld_fields}


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

#: Every query parameter this contract understands. Registered here so a
#: dashboard deep link can be *checked* against the contract rather than hoped
#: about — ``unknown_parameters`` is populated from anything outside this set.
REGISTERED_PARAMETERS: frozenset[str] = frozenset(
    {
        "institution_id",
        "program_offering_id",
        "intake_id",
        "assigned_reviewer_id",
        "status",
        "exclude_status",
        "payment_status",
        "program",
        "intake",
        "institution",
        "search",
        "reviewer_assignment",
        "is_late_submission",
        "has_pending_amendments",
        "review_queue",
        "overdue_review",
        "has_pending_documents",
        "has_upcoming_interviews",
        "deadline_pressure",
        "start_date",
        "end_date",
        "sort",
        "order",
        # Pagination + response-shape controls.
        "page",
        "pageSize",
        "export",
        "saved_filter",
    }
)

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


def _tribool(value: Any) -> Optional[bool]:
    raw = str(value or "").strip().lower()
    if raw in _TRUE:
        return True
    if raw in _FALSE:
        return False
    return None


def _csv_tuple(value: Any, *, lower: bool = True) -> tuple[str, ...]:
    raw = str(value or "").strip()
    if not raw:
        return ()
    parts = (item.strip() for item in raw.split(","))
    return tuple(part.lower() if lower else part for part in parts if part)


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return parse_date(str(value).strip())


def _aware(value: date, boundary: time) -> datetime:
    stamp = datetime.combine(value, boundary)
    if timezone.is_naive(stamp):
        return timezone.make_aware(stamp, timezone.get_current_timezone())
    return stamp


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() if value else None


def _review_sla_days() -> int:
    """The configured review SLA, read from the platform's own Setting."""
    from apps.common.models import Setting

    try:
        setting = Setting.objects.filter(key="review_sla_days").first()
        if setting and setting.value is not None:
            return int(setting.value)
    except (TypeError, ValueError, Exception):  # noqa: B014 - Setting may be absent
        pass
    return DEFAULT_REVIEW_SLA_DAYS


class ApplicationQueryService:
    """The one scoped applications query authority (ADM-01, R8.1)."""

    # ------------------------------------------------------------------
    # Authority + scope (R3.5 — scope BEFORE lookup)
    # ------------------------------------------------------------------

    def redaction_policy(self, user) -> RedactionPolicy:
        """Resolve the actor's redaction policy from capabilities, not roles."""
        try:
            capabilities = AdminCapabilityService().get_capabilities(user)
        except CapabilityResolutionError:
            # Fail closed: an unresolved actor is maximally redacted (R1.6).
            return RedactionPolicy(unrestricted=False)
        return RedactionPolicy(
            unrestricted=bool(capabilities.is_super_admin or capabilities.all_access)
        )

    def visible_institution_ids(self, user) -> Optional[set[str]]:
        """The actor's visible institution ids, or ``None`` for all-access.

        Computed through ``AdminCapabilityService.visible_institution_queryset``
        so this surface shares the platform's single scope computation.
        """
        service = AdminCapabilityService()
        try:
            capabilities = service.get_capabilities(user)
            if capabilities.is_super_admin or capabilities.all_access:
                return None
            visible = service.visible_institution_queryset(user)
        except CapabilityResolutionError:
            return set()
        return {str(pk) for pk in visible.values_list("pk", flat=True)}

    def scoped_applications(self, user) -> QuerySet:
        """Every application the actor may read, scoped in SQL.

        Composes the platform's application scope
        (``AccessScopeService.filter_applications`` — which honours institution,
        offering, and application grants) with the Reviewer assignment scope
        (``apply_reviewer_assignment_scope``, R8.2/AUTH-01). Neither is a role
        comparison, and neither runs in the browser.
        """
        from apps.applications.models import Application
        from apps.common.tenant_authorization import apply_reviewer_assignment_scope

        base = Application.objects.all()
        try:
            scoped = AccessScopeService().filter_applications(base, user)
        except CapabilityResolutionError:
            return base.none()
        return apply_reviewer_assignment_scope(scoped, user)

    # -- identifier filters, resolved before they reach a query --------

    def resolve_institution_filter(self, user, institution_id: Any) -> Optional[str]:
        """Validate a requested ``institution_id`` against the actor's scope.

        Scope before lookup: the id is checked against
        ``visible_institution_queryset`` **before** it reaches a filter, so an
        out-of-scope or unknown institution raises
        :class:`ApplicationScopeDenied` (a masked 404) rather than returning an
        empty — and therefore distinguishable — page.
        """
        requested = str(institution_id or "").strip()
        if not requested:
            return None
        try:
            visible = AdminCapabilityService().visible_institution_queryset(user)
            exists = visible.filter(pk=requested).exists()
        except Exception:
            # A resolution failure and a malformed id are both indistinguishable
            # from an out-of-scope id (fail closed, disclose nothing).
            raise ApplicationScopeDenied("institution", requested)
        if not exists:
            raise ApplicationScopeDenied("institution", requested)
        return requested

    def resolve_offering_filter(self, user, offering_id: Any) -> Optional[str]:
        """Validate a requested offering id against the actor's institutions."""
        requested = str(offering_id or "").strip()
        if not requested:
            return None
        from apps.catalog.models import Program

        try:
            visible_ids = self.visible_institution_ids(user)
            queryset = Program.objects.all()
            if visible_ids is not None:
                queryset = queryset.filter(institution_id__in=visible_ids)
            exists = queryset.filter(pk=requested).exists()
        except Exception:
            raise ApplicationScopeDenied("program_offering", requested)
        if not exists:
            raise ApplicationScopeDenied("program_offering", requested)
        return requested

    def resolve_intake_filter(self, user, intake_id: Any) -> Optional[str]:
        """Validate a requested intake id against the actor's own applications.

        Intakes are platform-managed and shared, so "in scope" here means *an
        intake the actor's own scope actually reaches*. Resolving it against the
        actor's application set rather than the global intake table means a
        tenant operator cannot use this endpoint to confirm the existence of an
        intake no school of theirs participates in.
        """
        requested = str(intake_id or "").strip()
        if not requested:
            return None
        try:
            exists = (
                self.scoped_applications(user)
                .filter(intake_ref_id=requested)
                .exists()
            )
            if not exists:
                # An all-access actor may legitimately filter an intake with no
                # applications yet; a scoped actor may not probe one.
                from apps.catalog.models import Intake

                if self.visible_institution_ids(user) is None:
                    exists = Intake.objects.filter(pk=requested).exists()
        except Exception:
            raise ApplicationScopeDenied("intake", requested)
        if not exists:
            raise ApplicationScopeDenied("intake", requested)
        return requested

    def resolve_reviewer_filter(self, user, reviewer_id: Any) -> Optional[str]:
        """Validate a requested reviewer id against the actor's own applications.

        Same contract: a reviewer who has never been assigned work the actor can
        see is indistinguishable from a reviewer who does not exist, so the
        roster cannot be used to enumerate another tenant's staff.
        """
        requested = str(reviewer_id or "").strip()
        if not requested:
            return None
        try:
            exists = (
                self.scoped_applications(user)
                .filter(assigned_reviewer_id=requested)
                .exists()
            )
        except Exception:
            raise ApplicationScopeDenied("reviewer", requested)
        if not exists:
            raise ApplicationScopeDenied("reviewer", requested)
        return requested

    # ------------------------------------------------------------------
    # Parsing
    # ------------------------------------------------------------------

    def parse(self, user, query_params) -> ApplicationFilters:
        """Validate raw query params into an :class:`ApplicationFilters`.

        Every filter is server-side. Identifier filters are scope-resolved here
        (before any data query), so an out-of-scope id fails as a masked
        not-found instead of quietly narrowing to zero rows.

        Anything outside :data:`REGISTERED_PARAMETERS` is collected into
        ``unknown_parameters`` and echoed back. That is the ADM-01 fix on the
        contract side: a deep link carrying a parameter this contract does not
        implement is *reported*, not silently ignored, so the dashboard tile and
        the roster it opens can never quietly disagree.
        """
        sort_raw = (query_params.get("sort") or "").strip()
        descending = DEFAULT_SORT_DESCENDING
        if sort_raw.startswith("-"):
            descending = True
            sort_raw = sort_raw[1:]
        order_raw = (query_params.get("order") or "").strip().lower()
        if order_raw in {"asc", "ascending"}:
            descending = False
        elif order_raw in {"desc", "descending"}:
            descending = True
        sort_key = SORT_ALIASES.get(sort_raw.lower(), sort_raw.lower())
        if sort_key not in SORT_FIELDS:
            sort_key = DEFAULT_SORT

        search = (query_params.get("search") or "").strip() or None

        unknown = tuple(
            sorted(
                name
                for name in query_params.keys()
                if name not in REGISTERED_PARAMETERS
            )
        )

        return ApplicationFilters(
            institution_id=self.resolve_institution_filter(
                user, query_params.get("institution_id")
            ),
            program_offering_id=self.resolve_offering_filter(
                user, query_params.get("program_offering_id")
            ),
            intake_id=self.resolve_intake_filter(user, query_params.get("intake_id")),
            assigned_reviewer_id=self.resolve_reviewer_filter(
                user, query_params.get("assigned_reviewer_id")
            ),
            statuses=_csv_tuple(query_params.get("status")),
            exclude_statuses=_csv_tuple(query_params.get("exclude_status")),
            payment_statuses=_csv_tuple(query_params.get("payment_status")),
            program=(query_params.get("program") or "").strip() or None,
            intake=(query_params.get("intake") or "").strip() or None,
            institution=(query_params.get("institution") or "").strip() or None,
            search=search[:120] if search else None,
            reviewer_assignment=(
                (query_params.get("reviewer_assignment") or "").strip().lower() or None
            ),
            is_late_submission=_tribool(query_params.get("is_late_submission")),
            has_pending_amendments=_tribool(query_params.get("has_pending_amendments")),
            review_queue=_tribool(query_params.get("review_queue")),
            overdue_review=_tribool(query_params.get("overdue_review")),
            has_pending_documents=_tribool(query_params.get("has_pending_documents")),
            has_upcoming_interviews=_tribool(
                query_params.get("has_upcoming_interviews")
            ),
            deadline_pressure=_tribool(query_params.get("deadline_pressure")),
            start_date=_parse_date(query_params.get("start_date")),
            end_date=_parse_date(query_params.get("end_date")),
            sort=sort_key,
            descending=descending,
            unknown_parameters=unknown,
        )

    # ------------------------------------------------------------------
    # Annotation + filtering (all in SQL)
    # ------------------------------------------------------------------

    @staticmethod
    def annotate(queryset: QuerySet) -> QuerySet:
        """Attach the derived columns the contract filters, sorts, and counts on.

        ``activity_at`` is the operational recency timestamp the roster has
        always ordered by (the same ``Coalesce`` ``annotate_activity_at`` uses).
        ``next_deadline_at`` is the soonest *actionable* deadline for the row —
        the earliest open condition deadline or the enrollment-confirmation
        deadline — which is what makes "deadlines" a server-side concept instead
        of a dashboard tile with no matching filter.
        """
        from apps.applications.models import ApplicationCondition

        earliest_open_condition = (
            ApplicationCondition.objects.filter(application_id=OuterRef("pk"))
            .exclude(status__in=("met", "waived"))
            .order_by("deadline")
            .values("deadline")[:1]
        )
        return queryset.annotate(
            activity_at=Coalesce("submitted_at", "updated_at", "created_at"),
            institution_label=Coalesce(
                NullIf("institution_ref__name", Value("")),
                NullIf("institution", Value("")),
                Value("Unassigned"),
                output_field=TextField(),
            ),
            program_label=Coalesce(
                NullIf("program_offering__name", Value("")),
                NullIf("canonical_program__name", Value("")),
                NullIf("program", Value("")),
                Value("Unassigned"),
                output_field=TextField(),
            ),
            intake_label=Coalesce(
                NullIf("intake_ref__name", Value("")),
                NullIf("intake", Value("")),
                Value("Unassigned"),
                output_field=TextField(),
            ),
            condition_deadline=earliest_open_condition,
            next_deadline_at=Coalesce(
                "enrollment_confirmation_deadline",
                "condition_deadline",
            ),
        )

    @classmethod
    def _pending_documents_exists(cls) -> Exists:
        """"This application has a document nobody has verified yet."

        Returned as the bare ``Exists`` so the registered filter and the
        dashboard's counter can be built from the *same* expression rather than
        two subqueries that happen to agree (task 9.2).
        """
        from apps.documents.models import ApplicationDocument

        unverified = ApplicationDocument.objects.filter(
            application_id=OuterRef("pk"),
        ).filter(
            Q(verification_status__isnull=True)
            | Q(verification_status__in=[state for state in UNVERIFIED_DOCUMENT_STATES if state is not None])
        )
        return Exists(unverified)

    @classmethod
    def _pending_documents_q(cls) -> Q:
        return Q(cls._pending_documents_exists())

    @classmethod
    def _upcoming_interviews_exists(cls) -> Exists:
        """"This application has an interview scheduled ahead of now." """
        from apps.applications.models import ApplicationInterview

        upcoming = ApplicationInterview.objects.filter(
            application_id=OuterRef("pk"),
            scheduled_at__gte=timezone.now(),
            status__in=("scheduled", "pending"),
        )
        return Exists(upcoming)

    @classmethod
    def _upcoming_interviews_q(cls) -> Q:
        return Q(cls._upcoming_interviews_exists())

    @classmethod
    def _pending_amendments_q(cls) -> Q:
        from apps.applications.models import ApplicationAmendment

        pending = ApplicationAmendment.objects.filter(
            application_id=OuterRef("pk"), status="pending"
        )
        return Q(Exists(pending))

    @classmethod
    def _overdue_review_q(cls) -> Q:
        cutoff = timezone.now() - timedelta(days=_review_sla_days())
        return Q(status__in=REVIEW_QUEUE_STATUSES, submitted_at__lt=cutoff)

    @classmethod
    def _deadline_pressure_q(cls) -> Q:
        """Rows with an actionable deadline inside the pressure window.

        This is the query the dashboard's "Deadlines in 48h" tile always implied
        and never had. It selects *rows*, in SQL, so the tile's count and the
        roster the tile opens describe the same set by construction.
        """
        now = timezone.now()
        horizon = now + timedelta(hours=DEADLINE_PRESSURE_HOURS)
        return Q(next_deadline_at__gte=now, next_deadline_at__lte=horizon)

    def filtered(self, user, filters: ApplicationFilters) -> QuerySet:
        """The actor's applications narrowed by every applied filter, in SQL."""
        queryset = self.annotate(self.scoped_applications(user))

        if filters.institution_id:
            queryset = queryset.filter(institution_ref_id=filters.institution_id)
        if filters.program_offering_id:
            queryset = queryset.filter(program_offering_id=filters.program_offering_id)
        if filters.intake_id:
            queryset = queryset.filter(intake_ref_id=filters.intake_id)
        if filters.assigned_reviewer_id:
            queryset = queryset.filter(
                assigned_reviewer_id=filters.assigned_reviewer_id
            )
        if filters.statuses:
            queryset = queryset.filter(status__in=filters.statuses)
        if filters.exclude_statuses:
            queryset = queryset.exclude(status__in=filters.exclude_statuses)
        if filters.payment_statuses:
            queryset = queryset.filter(payment_status__in=filters.payment_statuses)
        if filters.program:
            queryset = queryset.filter(program_label__icontains=filters.program)
        if filters.intake:
            queryset = queryset.filter(intake_label__icontains=filters.intake)
        if filters.institution:
            queryset = queryset.filter(institution_label__icontains=filters.institution)
        if filters.search:
            queryset = queryset.filter(
                Q(full_name__icontains=filters.search)
                | Q(email__icontains=filters.search)
                | Q(application_number__icontains=filters.search)
                | Q(public_tracking_code__icontains=filters.search)
            )
        if filters.reviewer_assignment == "assigned":
            queryset = queryset.filter(assigned_reviewer_id__isnull=False)
        elif filters.reviewer_assignment == "unassigned":
            queryset = queryset.filter(assigned_reviewer_id__isnull=True)
        if filters.is_late_submission is not None:
            queryset = queryset.filter(is_late_submission=filters.is_late_submission)
        if filters.has_pending_amendments is not None:
            predicate = self._pending_amendments_q()
            queryset = (
                queryset.filter(predicate)
                if filters.has_pending_amendments
                else queryset.exclude(predicate)
            )
        if filters.review_queue is not None:
            predicate = Q(status__in=REVIEW_QUEUE_STATUSES)
            queryset = (
                queryset.filter(predicate)
                if filters.review_queue
                else queryset.exclude(predicate)
            )
        if filters.overdue_review is not None:
            predicate = self._overdue_review_q()
            queryset = (
                queryset.filter(predicate)
                if filters.overdue_review
                else queryset.exclude(predicate)
            )
        if filters.has_pending_documents is not None:
            predicate = self._pending_documents_q()
            queryset = (
                queryset.filter(predicate)
                if filters.has_pending_documents
                else queryset.exclude(predicate)
            )
        if filters.has_upcoming_interviews is not None:
            predicate = self._upcoming_interviews_q()
            queryset = (
                queryset.filter(predicate)
                if filters.has_upcoming_interviews
                else queryset.exclude(predicate)
            )
        if filters.deadline_pressure is not None:
            predicate = self._deadline_pressure_q()
            queryset = (
                queryset.filter(predicate)
                if filters.deadline_pressure
                else queryset.exclude(predicate)
            )
        if filters.start_date:
            queryset = queryset.filter(
                created_at__gte=_aware(filters.start_date, time.min)
            )
        if filters.end_date:
            queryset = queryset.filter(
                created_at__lte=_aware(filters.end_date, time.max)
            )
        return self.ordered(queryset, filters)

    @staticmethod
    def ordered(queryset: QuerySet, filters: ApplicationFilters) -> QuerySet:
        """Apply the requested sort from the allow-list, in SQL."""
        fields = SORT_FIELDS.get(filters.sort) or SORT_FIELDS[DEFAULT_SORT]
        prefix = "-" if filters.descending else ""
        # Deterministic tie-break on ``id`` so page 2 of an equal-key run cannot
        # repeat or skip a row.
        return queryset.order_by(*(f"{prefix}{name}" for name in fields))

    # ------------------------------------------------------------------
    # Aggregates over the WHOLE filtered set (ADM-01's core, R8.1)
    # ------------------------------------------------------------------

    @classmethod
    def _aggregate_expressions(cls) -> dict[str, Any]:
        resolved_payments = _resolved_payment_statuses()
        overdue = cls._overdue_review_q()
        pressure = cls._deadline_pressure_q()
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        return {
            "total": Count("id"),
            "draft_count": Count("id", filter=Q(status="draft")),
            "submitted_count": Count("id", filter=Q(status="submitted")),
            "under_review_count": Count("id", filter=Q(status="under_review")),
            "decision_queue_count": Count(
                "id", filter=Q(status__in=REVIEW_QUEUE_STATUSES)
            ),
            "waitlisted_count": Count("id", filter=Q(status="waitlisted")),
            "approved_count": Count("id", filter=Q(status="approved")),
            "conditionally_approved_count": Count(
                "id", filter=Q(status="conditionally_approved")
            ),
            "enrolled_count": Count("id", filter=Q(status="enrolled")),
            "accepted_count": Count("id", filter=Q(status__in=ACCEPTED_STATUSES)),
            "rejected_count": Count("id", filter=Q(status="rejected")),
            "withdrawn_count": Count("id", filter=Q(status="withdrawn")),
            "payment_resolved_count": Count(
                "id", filter=Q(payment_status__in=resolved_payments)
            ),
            "payment_pending_count": Count(
                "id", filter=Q(payment_status__in=("pending", "pending_review"))
            ),
            "payment_rejected_count": Count(
                "id", filter=Q(payment_status__in=("rejected", "failed"))
            ),
            "payment_unpaid_count": Count(
                "id",
                filter=Q(payment_status__isnull=True)
                | Q(payment_status__in=("", "not_paid", "unpaid")),
            ),
            "late_submission_count": Count("id", filter=Q(is_late_submission=True)),
            "unassigned_count": Count(
                "id", filter=Q(assigned_reviewer_id__isnull=True)
            ),
            "overdue_review_count": Count("id", filter=overdue),
            "deadline_pressure_count": Count("id", filter=pressure),
            "today_activity_count": Count(
                "id", filter=Q(activity_at__gte=today_start)
            ),
            "first_created_at": Min("created_at"),
            "last_activity_at": Max("activity_at"),
            # Deliberately *not* aliased ``next_deadline_at``: an aggregate alias
            # that shadows an annotation alias makes Django emit the annotation's
            # name as a bare column in the outer aggregation query, which
            # Postgres rejects ("column next_deadline_at does not exist") as soon
            # as the annotation is subquery-backed. The published key is still
            # ``next_deadline_at`` — :meth:`aggregates` renames it once, here,
            # rather than leaking the internal alias into the contract.
            "soonest_deadline_at": Min("next_deadline_at", filter=pressure),
        }

    def aggregates(self, queryset: QuerySet) -> dict[str, Any]:
        """Whole-filtered-set totals — never derived from the current page.

        This is the half of ADM-01 the browser used to do: fourteen counters
        computed by filtering the loaded rows and presented as portfolio facts.
        These come from the same filtered queryset the page is drawn from, in one
        conditional-count aggregate, so turning a page cannot change them.

        Every counter carries its definition in ``definitions`` (R8.6:
        "definition-labeled") and the window each time-bounded number used, so a
        number on screen can be explained without reading this file.
        """
        totals = queryset.order_by().aggregate(**self._aggregate_expressions())
        payload: dict[str, Any] = {
            key: (value if not isinstance(value, (datetime, date)) else _iso(value))
            for key, value in totals.items()
        }
        # The soonest actionable deadline inside the pressure window, published
        # under the name the contract uses (see ``_aggregate_expressions``).
        payload["next_deadline_at"] = payload.pop("soonest_deadline_at", None)
        payload["review_sla_days"] = _review_sla_days()
        payload["deadline_pressure_hours"] = DEADLINE_PRESSURE_HOURS
        payload["row_limit"] = EXPORT_ROW_LIMIT
        payload["definitions"] = self.aggregate_definitions()
        return payload

    @staticmethod
    def aggregate_definitions() -> dict[str, str]:
        """What each aggregate counts, in the operator's words (R8.6).

        The dashboard's failure was not only wrong numbers: it was numbers whose
        meaning nobody could state. Shipping the definition with the number means
        "decision queue" cannot quietly change meaning between two surfaces.
        """
        return {
            "total": "Applications matching the current filters, in your scope.",
            "decision_queue_count": (
                "Submitted or under review — waiting on a staff decision."
            ),
            "accepted_count": (
                "Approved, conditionally approved, or enrolled — has an offer or a place."
            ),
            "rejected_count": "Declined by a staff decision.",
            "payment_resolved_count": (
                "Application fee settled, force-approved, or explicitly deferred."
            ),
            "payment_pending_count": "A payment attempt is awaiting confirmation.",
            "payment_unpaid_count": "No payment attempt recorded yet.",
            "overdue_review_count": (
                "Submitted longer ago than the configured review SLA and still undecided."
            ),
            "deadline_pressure_count": (
                "An open condition or enrollment confirmation falls due inside the "
                "deadline window."
            ),
            "today_activity_count": (
                "Created, updated, or submitted since midnight in the platform timezone."
            ),
            "unassigned_count": "No reviewer assigned.",
            "late_submission_count": "Submitted inside the intake's grace period.",
        }

    # ------------------------------------------------------------------
    # Dashboard tiles: the number IS the count of the roster it opens (9.2)
    # ------------------------------------------------------------------

    #: Boolean annotations the dashboard aggregate filters on, each built from
    #: the *same* ``Exists`` expression as the registered row filter of the same
    #: name. A correlated ``Exists`` cannot be used directly inside an
    #: ``.aggregate()`` filter — Postgres loses the outer table reference
    #: ("missing FROM-clause entry for table applications", the same class of
    #: problem 9.1 recorded for a shadowed aggregate alias) — so it is annotated
    #: once and the aggregate filters on the alias.
    DASHBOARD_FLAG_ANNOTATIONS: tuple[tuple[str, str], ...] = (
        ("dash_pending_documents", "_pending_documents_exists"),
        ("dash_upcoming_interviews", "_upcoming_interviews_exists"),
    )

    @classmethod
    def annotate_dashboard_flags(cls, queryset: QuerySet) -> QuerySet:
        """Attach the boolean flags :meth:`_dashboard_expressions` counts on."""
        return queryset.annotate(
            **{
                alias: getattr(cls, factory)()
                for alias, factory in cls.DASHBOARD_FLAG_ANNOTATIONS
            }
        )

    @classmethod
    def _dashboard_expressions(cls) -> dict[str, Any]:
        """The roster's own counter expressions, plus the five only tiles need.

        This is *the* reuse the dashboard rests on: the first entry is literally
        :meth:`_aggregate_expressions`, so ``decision_queue_count`` on a tile and
        ``decision_queue_count`` on the roster are the same expression over the
        same predicate — not two implementations that happen to agree today.

        The five additions are the tiles whose predicate is an ``EXISTS``
        subquery (pending documents, upcoming interviews) or the payment
        vocabulary, plus the week and month activity windows. The two ``EXISTS``
        ones filter on the annotations :meth:`annotate_dashboard_flags` attaches,
        which are built from the same expressions the registered
        ``has_pending_documents`` / ``has_upcoming_interviews`` filters use.
        """
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())
        month_start = today_start.replace(day=1)
        return {
            **cls._aggregate_expressions(),
            "pending_documents_count": Count(
                "id", filter=Q(dash_pending_documents=True)
            ),
            "upcoming_interviews_count": Count(
                "id", filter=Q(dash_upcoming_interviews=True)
            ),
            "payment_review_count": Count(
                "id", filter=Q(payment_status__in=PAYMENT_REVIEW_STATUSES)
            ),
            "activity_this_week_count": Count("id", filter=Q(activity_at__gte=week_start)),
            "activity_this_month_count": Count(
                "id", filter=Q(activity_at__gte=month_start)
            ),
        }

    def dashboard_counters(self, user, queryset: QuerySet) -> dict[str, Any]:
        """Every dashboard counter, in one aggregate over the scoped set (R17.5).

        One query. A tile's number is by construction the ``totalCount`` of the
        roster its link opens, because the counter and the filter are the same
        predicate — see :meth:`_dashboard_expressions`.

        ``user`` is accepted to make the scope requirement explicit at the call
        site; the scoping has already happened in ``queryset``.
        """
        del user  # scope already applied by the caller's ``scoped_applications``
        totals = (
            self.annotate_dashboard_flags(queryset)
            .order_by()
            .aggregate(**self._dashboard_expressions())
        )
        payload: dict[str, Any] = {
            key: (value if not isinstance(value, (datetime, date)) else _iso(value))
            for key, value in totals.items()
        }
        payload["next_deadline_at"] = payload.pop("soonest_deadline_at", None)
        payload["review_sla_days"] = _review_sla_days()
        payload["deadline_pressure_hours"] = DEADLINE_PRESSURE_HOURS
        payload["definitions"] = self.dashboard_definitions()
        return payload

    @staticmethod
    def status_breakdown(queryset: QuerySet) -> dict[str, int]:
        """``status → count`` over the whole scoped set, as a SQL ``GROUP BY``.

        ``status`` is a free-form column with no fixed choice set, so grouping is
        the only faithful way to report what is actually there: a fixed list of
        conditional counts would silently drop an unexpected status and inject
        zero-count keys for statuses no row holds.
        """
        return dict(
            queryset.order_by()
            .values_list("status")
            .annotate(count=Count("id"))
            .values_list("status", "count")
        )

    @classmethod
    def dashboard_definitions(cls) -> dict[str, str]:
        """Every dashboard tile counter's definition, from one place (R8.6).

        Tiles that reuse an aggregate counter reuse its **sentence** too, so
        "decision queue" cannot mean one thing on the dashboard and another on
        the roster. The three dashboard-only counters add their own sentences.
        """
        return {**cls.aggregate_definitions(), **DASHBOARD_ONLY_DEFINITIONS}

    # ------------------------------------------------------------------
    # Facets over the WHOLE filtered set (ADM-01, R8.1)
    # ------------------------------------------------------------------

    #: Facet name → (grouping value expression, label expression).
    FACET_SPECS: dict[str, tuple[str, Optional[str]]] = {
        "status": ("status", None),
        "payment_status": ("payment_status", None),
        "institution": ("institution_ref_id", "institution_label"),
        "program_offering": ("program_offering_id", "program_label"),
        "intake": ("intake_ref_id", "intake_label"),
    }

    def facets(self, queryset: QuerySet, *, names: Optional[Iterable[str]] = None) -> dict[str, Any]:
        """Filter options with counts, computed over the whole filtered set.

        The browser used to build its pick lists from the loaded rows, so an
        option only existed if it happened to be on the current page. Each facet
        here is a SQL ``GROUP BY`` over the same scoped, filtered set the page is
        drawn from, so the options are complete for the query — and each carries
        its own count, which the old harvested ``Set`` could not.

        The facets are computed **before** their own dimension is narrowed by the
        caller, which is why the view passes the scoped-but-unfaceted queryset:
        a status facet computed after ``status=approved`` would only ever offer
        ``approved``.
        """
        wanted = tuple(names) if names is not None else tuple(self.FACET_SPECS)
        result: dict[str, Any] = {}
        for name in wanted:
            spec = self.FACET_SPECS.get(name)
            if spec is None:
                continue
            value_field, label_field = spec
            values = [value_field] if label_field is None else [value_field, label_field]
            rows = list(
                queryset.order_by()
                .values(*values)
                .annotate(count=Count("id"))
                .order_by("-count", values[-1])[: FACET_LIMIT + 1]
            )
            truncated = len(rows) > FACET_LIMIT
            options = []
            for row in rows[:FACET_LIMIT]:
                raw_value = row.get(value_field)
                label_raw = row.get(label_field) if label_field else raw_value
                options.append(
                    {
                        "value": (
                            str(raw_value) if raw_value not in (None, "") else None
                        ),
                        "label": str(label_raw) if label_raw not in (None, "") else "Unassigned",
                        "count": row.get("count") or 0,
                    }
                )
            result[name] = {"options": options, "truncated": truncated}
        return result

    # ------------------------------------------------------------------
    # Rows
    # ------------------------------------------------------------------

    #: Roster columns, in order. Shared by the JSON rows, the CSV writer, and
    #: their tests so the file and the contract cannot drift.
    ROW_COLUMNS: tuple[str, ...] = (
        "id",
        "application_number",
        "public_tracking_code",
        "full_name",
        "email",
        "phone",
        "status",
        "payment_status",
        "institution_id",
        "institution_name",
        "program_offering_id",
        "program_name",
        "intake_id",
        "intake_name",
        "assigned_reviewer_id",
        "is_late_submission",
        "waitlist_position",
        "next_deadline_at",
        "submitted_at",
        "created_at",
        "updated_at",
        "activity_at",
        "peer_offering_count",
    )

    def rows_for(
        self,
        queryset: QuerySet,
        *,
        policy: RedactionPolicy,
        offset: int = 0,
        limit: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """Serialise one window of the roster.

        The canonical ids are the routing/scoping authority; the labels come from
        the canonical rows with the legacy display snapshot as the fallback and
        an explicit ``Unassigned`` bucket, so a renamed school's historical rows
        stay readable instead of being silently mis-attributed.
        """
        window = list(
            queryset.select_related(
                "institution_ref", "canonical_program", "program_offering", "intake_ref"
            )[offset : offset + limit]
            if limit is not None
            else queryset.select_related(
                "institution_ref", "canonical_program", "program_offering", "intake_ref"
            )[:EXPORT_ROW_LIMIT]
        )
        peer_counts = self._peer_offering_counts(window) if policy.unrestricted else {}
        document_counts = self._document_counts(window)
        rows: list[dict[str, Any]] = []
        for app in window:
            canonical_id = str(getattr(app, "canonical_program_id", "") or "")
            row = {
                "id": str(app.id),
                # The concurrency token, not a report column (task 9.4, R8.4).
                # A bulk decision is issued from the roster, so the roster has to
                # publish the version each selected row was read at — otherwise
                # ``expected_versions`` could only be filled by guessing, and the
                # stale-write guard would exist on the endpoint but never be
                # exercised from the surface that needs it most. Deliberately
                # absent from ``ROW_COLUMNS``: an export is a document about
                # applicants, and a row's optimistic-lock counter is not a fact
                # about an applicant.
                "version": int(getattr(app, "version", 1) or 1),
                "application_number": app.application_number,
                "public_tracking_code": app.public_tracking_code,
                "full_name": app.full_name,
                "email": app.email,
                "phone": app.phone,
                "status": app.status,
                "payment_status": app.payment_status or "not_paid",
                "institution_id": str(app.institution_ref_id) if app.institution_ref_id else None,
                "institution_name": getattr(app, "institution_label", None) or "Unassigned",
                "program_offering_id": (
                    str(app.program_offering_id) if app.program_offering_id else None
                ),
                "program_name": getattr(app, "program_label", None) or "Unassigned",
                "intake_id": str(app.intake_ref_id) if app.intake_ref_id else None,
                "intake_name": getattr(app, "intake_label", None) or "Unassigned",
                "assigned_reviewer_id": (
                    str(app.assigned_reviewer_id_id) if app.assigned_reviewer_id_id else None
                ),
                "is_late_submission": bool(app.is_late_submission),
                "waitlist_position": app.waitlist_position,
                "next_deadline_at": _iso(getattr(app, "next_deadline_at", None)),
                "submitted_at": _iso(app.submitted_at),
                "created_at": _iso(app.created_at),
                "updated_at": _iso(app.updated_at),
                "activity_at": _iso(getattr(app, "activity_at", None)),
                "peer_offering_count": peer_counts.get(canonical_id),
                # Plain-text document state for the queue row (platform-
                # simplification task 30.4, R17.5): current versions and how many
                # of them are verified, the review workspace's own definition
                # (``ReviewWorkspaceService._evidence``). Not in ``ROW_COLUMNS``,
                # so the export is unchanged.
                "current_document_count": document_counts.get(str(app.id), (0, 0))[0],
                "verified_document_count": document_counts.get(str(app.id), (0, 0))[1],
            }
            rows.append(policy.apply(row))
        return rows

    @staticmethod
    def _document_counts(applications) -> dict[str, tuple[int, int]]:
        """``(current, verified)`` document versions per application in this window.

        One grouped query for the window, with the review workspace's definition:
        ``is_current=True`` versions, and of those the ones whose
        ``verification_status`` is ``verified``. The window is already scoped, so
        this never counts another tenant's evidence.
        """
        from apps.documents.models import ApplicationDocument

        ids = [app.id for app in applications]
        if not ids:
            return {}
        rows = (
            ApplicationDocument.objects.filter(application_id__in=ids, is_current=True)
            .values("application_id")
            .annotate(
                current=Count("id"),
                verified=Count("id", filter=Q(verification_status="verified")),
            )
        )
        return {
            str(row["application_id"]): (int(row["current"]), int(row["verified"]))
            for row in rows
        }

    @staticmethod
    def _peer_offering_counts(applications) -> dict[str, int]:
        """Active offerings per canonical program, for the rows in this window."""
        from apps.catalog.models import Program

        canonical_ids = {
            str(getattr(app, "canonical_program_id", "") or "") for app in applications
        }
        canonical_ids.discard("")
        if not canonical_ids:
            return {}
        rows = (
            Program.objects.filter(
                canonical_program_id__in=canonical_ids, is_active=True
            )
            .values("canonical_program_id")
            .annotate(peer_count=Count("institution_id", distinct=True))
        )
        return {str(row["canonical_program_id"]): row["peer_count"] for row in rows}

    def export_columns(self, policy: RedactionPolicy) -> tuple[str, ...]:
        withheld = set(policy.withheld_fields)
        return tuple(column for column in self.ROW_COLUMNS if column not in withheld)

    def export_rows(
        self, queryset: QuerySet, *, policy: RedactionPolicy
    ) -> list[dict[str, Any]]:
        """Every row in the filtered set, independent of the requested page.

        An export that only contained the page the operator happened to be
        looking at would be a different document each time it was pressed. The
        result is bounded by :data:`EXPORT_ROW_LIMIT` and refuses rather than
        truncates.
        """
        total = queryset.order_by().count()
        if total > EXPORT_ROW_LIMIT:
            raise ApplicationExportTooLarge(total)
        return self.rows_for(queryset, policy=policy, offset=0, limit=EXPORT_ROW_LIMIT)


def csv_bytes(columns: Iterable[str], rows: Iterable[dict[str, Any]]) -> str:
    """Render ``rows`` as CSV text with ``columns`` as the header."""
    import csv
    import io

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    column_list = list(columns)
    writer.writerow(column_list)
    for row in rows:
        writer.writerow(
            ["" if row.get(column) is None else row.get(column) for column in column_list]
        )
    return buffer.getvalue()


__all__ = [
    "ACCEPTED_STATUSES",
    "DEADLINE_PRESSURE_HOURS",
    "DEFAULT_REVIEW_SLA_DAYS",
    "EXPORT_ROW_LIMIT",
    "FACET_LIMIT",
    "PLATFORM_ONLY_APPLICATION_FIELDS",
    "REGISTERED_PARAMETERS",
    "REVIEW_QUEUE_STATUSES",
    "SORT_ALIASES",
    "SORT_FIELDS",
    "ApplicationExportTooLarge",
    "ApplicationFilters",
    "ApplicationQueryService",
    "ApplicationScopeDenied",
    "RedactionPolicy",
    "csv_bytes",
]
