"""Server-side settlement and fee-administration queries (task 8.4).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 8.4
("Make fee administration and settlement server-scoped/capability-gated").
Requirements: R3 (one authorization model), R6.5 (export is a backend command
with explicit capability, audit, redaction, and size limits), R8.3-R8.4
(scoped query contract; every command records actor/reason), R12.5-R12.7
(tenant-scoped, auditable payment reads; server amounts only).
Findings: **ADM-06** (settlement rows were fetched broadly and filtered
client-side; fee/settlement authority was role-based), **AUTH-02** (payment,
fee, export, and settlement endpoints used raw roles instead of the capability
service).
Design: §10.2 — "Settlement queries filter institution in SQL and expose
backend aggregates, never a client-filtered global list."

Why this module exists
----------------------
Before 8.4 the settlement summary loaded **every** payment the actor could
reach, grouped them in a Python loop, and returned the whole grouping in one
unpaginated body; the tenant console then dropped the rows belonging to other
schools **in the browser** and added up the currency totals with
``Number(...) + Number(...)``. Three separate problems in one path:

1. the filter that mattered (institution) ran after the data had already been
   sent, so scope was a rendering decision rather than a query;
2. the totals were client arithmetic over one payload, which contradicts the
   rule that the server is the only money authority (R12.1);
3. there was no page, no aggregate, no reconciliation state, and no audit — so
   an operator could neither page through a real ledger nor prove who exported
   it.

Everything here is a SQL-side answer to those three. The service is the single
place that decides *which rows an actor may see*, *how they are grouped*, *what
the totals are*, and *what an export may contain*; the views are thin.

Authority, in one sentence: **scope is computed before any lookup**. A requested
``institution_id`` / ``program_offering_id`` is resolved through
``AdminCapabilityService.visible_institution_queryset`` **before** it is allowed
into a filter, so an out-of-scope identifier is indistinguishable from one that
does not exist (masked 404 + a ``scope.denied`` Audit_Event) and can never be
confirmed to exist by a count, a name, or an empty-but-different response.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Iterable, Optional

from django.db.models import Count, Max, Min, Q, QuerySet, Sum, TextField, Value
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Cast, Coalesce, NullIf
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Reconciliation vocabulary (R12.5)
# ---------------------------------------------------------------------------
#
# "Reconciliation state" is not a new stored column and not a new state machine:
# it is a *derived* read of the one payment state machine task 8.2 converged on,
# plus the age of an in-flight attempt. The platform already reconciles on a
# schedule — ``poll_pending_payments_task`` runs ``PaymentService.expire_stale
# (older_than_hours=24)`` every ten minutes — so "stale" here means exactly what
# the sweep means by it, read from the same cutoff rather than a second number.

#: Money has arrived, or the platform has accepted it as arrived. Includes the
#: legacy DB values so pre-hardening rows settle identically (ADR-001).
SETTLED_STATUSES: tuple[str, ...] = ("successful", "force_approved", "verified", "paid")
#: An attempt is in flight with the provider or the student.
PENDING_STATUSES: tuple[str, ...] = ("pending",)
#: The student was allowed to submit and pay later — owed, not collected.
DEFERRED_STATUSES: tuple[str, ...] = ("deferred",)
#: The attempt ended badly; nothing was collected.
FAILED_STATUSES: tuple[str, ...] = ("failed",)
#: The attempt timed out; the fee is still owed.
EXPIRED_STATUSES: tuple[str, ...] = ("expired",)

#: The reconciliation sweep's own cutoff (``PaymentService.expire_stale``
#: default, dispatched by ``poll_pending_payments_task``). A ``pending`` row
#: older than this should already have been expired by the sweep, so its
#: presence is an operational signal rather than a normal wait.
RECONCILIATION_STALE_HOURS = 24

#: Group-level reconciliation verdicts, most severe first. Derived, never stored.
RECONCILIATION_ATTENTION = "attention_required"
RECONCILIATION_IN_FLIGHT = "in_flight"
RECONCILIATION_UNCOLLECTED = "uncollected"
RECONCILIATION_SETTLED = "settled"
RECONCILIATION_EMPTY = "no_activity"

#: Filterable reconciliation buckets → the payment-row predicate each selects.
#: Filtering happens on payment rows in SQL (never on assembled groups in
#: Python), so a filtered page and its aggregates always describe the same set.
RECONCILIATION_FILTERS: dict[str, str] = {
    "settled": "settled",
    "in_flight": "in_flight",
    "stale": "stale",
    "failed": "failed",
    "expired": "expired",
    "deferred": "deferred",
}

#: Hard ceiling on an export, independent of page size (R6.5 "size limits").
#: An export that would exceed this is refused with ``EXPORT_TOO_LARGE`` rather
#: than silently truncated — a truncated financial export is worse than none.
EXPORT_ROW_LIMIT = 5000

#: Ceiling on the number of payment rows an aggregate/report query will scan.
#: Grouping happens in SQL, so this only bounds pathological ranges.
MAX_GROUPS = 10000


class SettlementScopeDenied(Exception):
    """A requested identifier is outside the actor's scope, or does not exist.

    Raised instead of returning an empty page so the two cases collapse into one
    masked 404 (R3.2). Carries the resource type + id purely so the caller can
    emit the ``scope.denied`` Audit_Event; the values are never echoed to the
    client.
    """

    def __init__(self, resource_type: str, resource_id: Any) -> None:
        super().__init__("Out of scope")
        self.resource_type = resource_type
        self.resource_id = resource_id


class SettlementExportTooLarge(Exception):
    """An export would exceed :data:`EXPORT_ROW_LIMIT` rows."""

    def __init__(self, row_count: int) -> None:
        super().__init__("Export too large")
        self.row_count = row_count


@dataclass(frozen=True)
class SettlementFilters:
    """The validated, server-side filter set for one settlement query."""

    institution_id: Optional[str] = None
    program_offering_id: Optional[str] = None
    currency: Optional[str] = None
    statuses: tuple[str, ...] = ()
    reconciliation: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    search: Optional[str] = None

    def as_payload(self) -> dict[str, Any]:
        """The applied filters, echoed back so a UI never guesses them."""
        return {
            "institution_id": self.institution_id,
            "program_offering_id": self.program_offering_id,
            "currency": self.currency,
            "status": list(self.statuses),
            "reconciliation": self.reconciliation,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "search": self.search,
        }


#: Settlement columns only a platform all-access actor may read (R6.5).
#:
#: These are deliberately *platform facts*, not tenant facts. ``collector`` is the
#: Beanola central-collection marker — how the platform, not the school, settles
#: money — and ``quarantined_count`` counts payment rows preserved by the task-3.5
#: orphan-remediation ledger, which is a platform data-repair state that would
#: only mislead a tenant operator reading their own report. A tenant's own money,
#: counts, and reconciliation state are never withheld: scope decides *which*
#: rows an actor sees, and redaction decides which *platform* columns travel with
#: them.
PLATFORM_ONLY_SETTLEMENT_FIELDS: tuple[str, ...] = ("collector", "quarantined_count")

#: Fee-administration columns only a platform all-access actor may read.
#:
#: ``peer_offering_count`` is how many *other* institutions offer the same
#: canonical program. A Platform_Admin legitimately compares tenants; a tenant
#: operator inferring another school's catalogue from their own fee page is
#: exactly the cross-tenant inference R3.2 forbids — so the column is computed
#: only for an all-access actor and withheld otherwise.
PLATFORM_ONLY_FEE_FIELDS: tuple[str, ...] = ("peer_offering_count",)


@dataclass(frozen=True)
class RedactionPolicy:
    """What an actor may see in a settlement / fee row or export (R6.5).

    Resolved from the actor's capability set, never from a role string. Scope
    decides *which* rows exist for this actor; this decides which **platform**
    columns travel with them.
    """

    #: Platform all-access (Super_Admin): nothing is withheld.
    unrestricted: bool = False
    #: The platform-only columns for the surface this policy is applied to.
    platform_only_fields: tuple[str, ...] = PLATFORM_ONLY_SETTLEMENT_FIELDS

    def for_fields(self, fields: tuple[str, ...]) -> "RedactionPolicy":
        """The same authority decision applied to a different surface's columns."""
        return RedactionPolicy(unrestricted=self.unrestricted, platform_only_fields=fields)

    @property
    def withheld_fields(self) -> list[str]:
        if self.unrestricted:
            return []
        return list(self.platform_only_fields)

    def apply(self, row: dict[str, Any]) -> dict[str, Any]:
        if self.unrestricted:
            return row
        withheld = set(self.withheld_fields)
        return {key: value for key, value in row.items() if key not in withheld}

    def as_payload(self) -> dict[str, Any]:
        return {"applied": not self.unrestricted, "withheld_fields": self.withheld_fields}


def _decimal_str(value: Any) -> str:
    """Render a SQL money aggregate as a fixed-scale decimal string.

    The server is the only money authority (R12.1): amounts leave the backend as
    already-quantised strings so the browser has nothing left to work out and
    cannot re-round a total into disagreeing with the ledger.
    """
    if value is None:
        return "0.00"
    return str(Decimal(str(value)).quantize(Decimal("0.01")))


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return parse_date(str(value).strip())


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() if value else None


class SettlementQueryService:
    """The one settlement/fee-administration query authority (ADM-06, AUTH-02)."""

    # ------------------------------------------------------------------
    # Scope (R3.5 — scope BEFORE lookup)
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
        so this endpoint shares the platform's single scope computation. Returns
        ``None`` (meaning "no institution restriction") only for an actor whose
        capability set is platform all-access.
        """
        service = AdminCapabilityService()
        try:
            capabilities = service.get_capabilities(user)
            if capabilities.is_super_admin or capabilities.all_access:
                return None
            visible = service.visible_institution_queryset(user)
        except CapabilityResolutionError:
            # Fail closed: deny rather than widen (R1.6).
            return set()
        return {str(pk) for pk in visible.values_list("pk", flat=True)}

    def scoped_payments(self, user) -> QuerySet:
        """Every payment the actor may read, scoped in SQL.

        Composes the platform's payment scope (``AccessScopeService
        .filter_payments`` — the same helper every other payment surface uses,
        which honours institution, offering, and application grants) with the
        institution set derived from ``visible_institution_queryset``. Neither is
        a role comparison, and neither runs in the browser.
        """
        from apps.catalog.services import AccessScopeService
        from apps.documents.models import Payment

        base = Payment.objects.select_related("application").all()
        try:
            return AccessScopeService().filter_payments(base, user)
        except CapabilityResolutionError:
            return base.none()

    def resolve_institution_filter(self, user, institution_id: Any) -> Optional[str]:
        """Validate a requested ``institution_id`` against the actor's scope.

        Scope before lookup: the id is checked against
        ``visible_institution_queryset`` **before** it reaches a filter, so an
        out-of-scope or unknown institution raises
        :class:`SettlementScopeDenied` (a masked 404) rather than returning an
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
            raise SettlementScopeDenied("institution", requested)
        if not exists:
            raise SettlementScopeDenied("institution", requested)
        return requested

    def resolve_offering_filter(self, user, offering_id: Any) -> Optional[str]:
        """Validate a requested offering id against the actor's institutions.

        Same contract as :meth:`resolve_institution_filter`: the offering is
        looked up **inside** the actor's visible institutions, so an offering
        belonging to another tenant is indistinguishable from a missing one.
        """
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
            raise SettlementScopeDenied("program_offering", requested)
        if not exists:
            raise SettlementScopeDenied("program_offering", requested)
        return requested

    # ------------------------------------------------------------------
    # Filters
    # ------------------------------------------------------------------

    def parse_filters(self, user, query_params) -> SettlementFilters:
        """Validate raw query params into a :class:`SettlementFilters`.

        Every filter is server-side. Identifier filters are scope-resolved here
        (before any data query), so an out-of-scope id fails as a masked
        not-found instead of quietly narrowing to zero rows.
        """
        statuses_raw = (query_params.get("status") or "").strip()
        if statuses_raw:
            statuses = tuple(
                item.strip().lower() for item in statuses_raw.split(",") if item.strip()
            )
        else:
            statuses = ()

        reconciliation = (query_params.get("reconciliation") or "").strip().lower() or None
        if reconciliation and reconciliation not in RECONCILIATION_FILTERS:
            reconciliation = None

        currency = (query_params.get("currency") or "").strip().upper() or None
        search = (query_params.get("search") or "").strip() or None

        return SettlementFilters(
            institution_id=self.resolve_institution_filter(
                user, query_params.get("institution_id")
            ),
            program_offering_id=self.resolve_offering_filter(
                user, query_params.get("program_offering_id")
            ),
            currency=currency,
            statuses=statuses,
            reconciliation=reconciliation,
            start_date=_parse_date(query_params.get("start_date")),
            end_date=_parse_date(query_params.get("end_date")),
            search=search[:120] if search else None,
        )

    def filtered_payments(self, user, filters: SettlementFilters) -> QuerySet:
        """The actor's payments narrowed by every applied filter, in SQL."""
        queryset = self._annotate_labels(self.scoped_payments(user))

        if filters.institution_id:
            queryset = queryset.filter(
                application__institution_ref_id=filters.institution_id
            )
        if filters.program_offering_id:
            queryset = queryset.filter(
                application__program_offering_id=filters.program_offering_id
            )
        if filters.currency:
            queryset = queryset.filter(currency__iexact=filters.currency)
        if filters.statuses:
            queryset = queryset.filter(status__in=filters.statuses)
        if filters.start_date:
            queryset = queryset.filter(created_at__date__gte=filters.start_date)
        if filters.end_date:
            queryset = queryset.filter(created_at__date__lte=filters.end_date)
        if filters.search:
            queryset = queryset.filter(
                Q(institution_label__icontains=filters.search)
                | Q(offering_label__icontains=filters.search)
            )
        if filters.reconciliation:
            queryset = queryset.filter(self._reconciliation_q(filters.reconciliation))
        return queryset

    # ------------------------------------------------------------------
    # Grouping + aggregates (design §10.2 — "backend aggregates")
    # ------------------------------------------------------------------

    @staticmethod
    def _annotate_labels(queryset: QuerySet) -> QuerySet:
        """Attach the settlement snapshot labels as SQL expressions.

        The label comes from the ``payments.metadata`` snapshot first, so a
        settlement row keeps the name the money was collected under even after a
        school or offering is renamed; the legacy display column is the fallback
        and ``Unassigned`` is the explicit bucket for a payment with neither
        (never a silent mis-attribution).
        """
        return queryset.annotate(
            institution_label=Coalesce(
                NullIf(
                    Cast(KeyTextTransform("institution_name", "metadata"), TextField()),
                    Value(""),
                ),
                NullIf(Cast("application__institution", TextField()), Value("")),
                Value("Unassigned"),
                output_field=TextField(),
            ),
            offering_label=Coalesce(
                NullIf(
                    Cast(KeyTextTransform("program_name", "metadata"), TextField()),
                    Value(""),
                ),
                NullIf(Cast("application__program", TextField()), Value("")),
                Value("Unassigned"),
                output_field=TextField(),
            ),
        )

    @staticmethod
    def _stale_cutoff() -> datetime:
        return timezone.now() - timedelta(hours=RECONCILIATION_STALE_HOURS)

    @classmethod
    def _reconciliation_q(cls, bucket: str) -> Q:
        """The payment-row predicate for one reconciliation bucket."""
        cutoff = cls._stale_cutoff()
        if bucket == "settled":
            return Q(status__in=SETTLED_STATUSES)
        if bucket == "in_flight":
            return Q(status__in=PENDING_STATUSES, created_at__gte=cutoff)
        if bucket == "stale":
            return Q(status__in=PENDING_STATUSES) & (
                Q(created_at__lt=cutoff) | Q(created_at__isnull=True)
            )
        if bucket == "failed":
            return Q(status__in=FAILED_STATUSES)
        if bucket == "expired":
            return Q(status__in=EXPIRED_STATUSES)
        if bucket == "deferred":
            return Q(status__in=DEFERRED_STATUSES)
        return Q()

    @classmethod
    def _count_annotations(cls) -> dict[str, Any]:
        """The reconciliation counters, computed by the database."""
        cutoff = cls._stale_cutoff()
        return {
            "payment_count": Count("id"),
            "settled_count": Count("id", filter=Q(status__in=SETTLED_STATUSES)),
            "pending_count": Count("id", filter=Q(status__in=PENDING_STATUSES)),
            "stale_pending_count": Count(
                "id",
                filter=Q(status__in=PENDING_STATUSES)
                & (Q(created_at__lt=cutoff) | Q(created_at__isnull=True)),
            ),
            "failed_count": Count("id", filter=Q(status__in=FAILED_STATUSES)),
            "expired_count": Count("id", filter=Q(status__in=EXPIRED_STATUSES)),
            "deferred_count": Count("id", filter=Q(status__in=DEFERRED_STATUSES)),
            # Platform data-remediation state (task 3.5 orphan ledger), redacted
            # for a tenant actor: a preserved legacy orphan is a platform repair
            # fact, not something a school can act on.
            "quarantined_count": Count("id", filter=Q(application_quarantined=True)),
            "gross_amount": Sum("amount"),
            "settled_amount": Sum("amount", filter=Q(status__in=SETTLED_STATUSES)),
        }

    @staticmethod
    def reconciliation_state(row: dict[str, Any]) -> str:
        """Derive the group verdict from the counters. Pure, and never stored.

        Ordered by what an operator must act on first: a stale in-flight attempt
        or an outright failure needs a human; a fresh in-flight attempt needs
        only patience; a deferred/expired fee is owed but nothing is wrong; and
        a group whose every attempt settled is reconciled.
        """
        if (row.get("stale_pending_count") or 0) or (row.get("failed_count") or 0):
            return RECONCILIATION_ATTENTION
        if row.get("pending_count") or 0:
            return RECONCILIATION_IN_FLIGHT
        if (row.get("deferred_count") or 0) or (row.get("expired_count") or 0):
            return RECONCILIATION_UNCOLLECTED
        if row.get("settled_count") or 0:
            return RECONCILIATION_SETTLED
        return RECONCILIATION_EMPTY

    def rows_for(
        self,
        queryset: QuerySet,
        *,
        policy: RedactionPolicy,
        offset: int = 0,
        limit: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """Serialise one window of the grouped result.

        The group key is the pair of canonical ids plus the currency — canonical
        ids are the sole authority for scoping and tagging — with the snapshot
        labels carried alongside so a renamed school's historical rows stay
        readable instead of being relabelled retroactively. Grouping, counting,
        and summing all happen in the database; this method only formats.
        """
        grouped = (
            queryset.values(
                "application__institution_ref_id",
                "application__program_offering_id",
                "currency",
                "institution_label",
                "offering_label",
            )
            .annotate(
                **self._count_annotations(),
                first_payment_at=Min("created_at"),
                last_payment_at=Max("created_at"),
            )
            .order_by("institution_label", "offering_label", "currency")
        )
        window = grouped[offset : offset + limit] if limit is not None else grouped[:MAX_GROUPS]

        rows: list[dict[str, Any]] = []
        for group in window:
            institution_id = group.get("application__institution_ref_id")
            offering_id = group.get("application__program_offering_id")
            row = {
                "institution_id": str(institution_id) if institution_id else None,
                "institution_name": group.get("institution_label") or "Unassigned",
                "program_offering_id": str(offering_id) if offering_id else None,
                "program_name": group.get("offering_label") or "Unassigned",
                "currency": group.get("currency") or "ZMW",
                "payment_count": group.get("payment_count") or 0,
                "gross_amount": _decimal_str(group.get("gross_amount")),
                "settled_count": group.get("settled_count") or 0,
                "settled_amount": _decimal_str(group.get("settled_amount")),
                "pending_count": group.get("pending_count") or 0,
                "stale_pending_count": group.get("stale_pending_count") or 0,
                "failed_count": group.get("failed_count") or 0,
                "expired_count": group.get("expired_count") or 0,
                "deferred_count": group.get("deferred_count") or 0,
                "quarantined_count": group.get("quarantined_count") or 0,
                "first_payment_at": _iso(group.get("first_payment_at")),
                "last_payment_at": _iso(group.get("last_payment_at")),
                "collector": "beanola",
            }
            row["reconciliation_state"] = self.reconciliation_state(row)
            rows.append(policy.apply(row))
        return rows

    def group_count(self, queryset: QuerySet) -> int:
        """How many groups the filtered set has, counted by the database."""
        return (
            queryset.values(
                "application__institution_ref_id",
                "application__program_offering_id",
                "currency",
                "institution_label",
                "offering_label",
            )
            .order_by()
            .distinct()
            .count()
        )

    def aggregates(self, queryset: QuerySet) -> dict[str, Any]:
        """Whole-filtered-set totals — never derived from the current page.

        This is the half of ADM-06 the browser used to do: the console summed
        one payload's rows and called the result the school's total. These
        numbers come from the same filtered queryset the page is drawn from, so
        paging cannot change them.
        """
        totals = queryset.aggregate(**self._count_annotations())
        per_currency = [
            {
                "currency": row.get("currency") or "ZMW",
                "payment_count": row.get("payment_count") or 0,
                "gross_amount": _decimal_str(row.get("gross_amount")),
                "settled_amount": _decimal_str(row.get("settled_amount")),
            }
            for row in queryset.values("currency")
            .annotate(**self._count_annotations())
            .order_by("currency")[:MAX_GROUPS]
        ]
        institution_count = (
            queryset.values("application__institution_ref_id").order_by().distinct().count()
        )
        offering_count = (
            queryset.values("application__program_offering_id").order_by().distinct().count()
        )
        payload = {
            "payment_count": totals.get("payment_count") or 0,
            "settled_count": totals.get("settled_count") or 0,
            "pending_count": totals.get("pending_count") or 0,
            "stale_pending_count": totals.get("stale_pending_count") or 0,
            "failed_count": totals.get("failed_count") or 0,
            "expired_count": totals.get("expired_count") or 0,
            "deferred_count": totals.get("deferred_count") or 0,
            "institution_count": institution_count,
            "offering_count": offering_count,
            "totals_by_currency": per_currency,
            "reconciliation_stale_hours": RECONCILIATION_STALE_HOURS,
            "row_limit": EXPORT_ROW_LIMIT,
        }
        payload["reconciliation_state"] = self.reconciliation_state(
            {
                "stale_pending_count": payload["stale_pending_count"],
                "failed_count": payload["failed_count"],
                "pending_count": payload["pending_count"],
                "deferred_count": payload["deferred_count"],
                "expired_count": payload["expired_count"],
                "settled_count": payload["settled_count"],
            }
        )
        return payload

    # ------------------------------------------------------------------
    # Export (R6.5)
    # ------------------------------------------------------------------

    #: Export columns, in order. Shared by the CSV writer and its tests so the
    #: file and the contract cannot drift.
    EXPORT_COLUMNS: tuple[str, ...] = (
        "institution_id",
        "institution_name",
        "program_offering_id",
        "program_name",
        "currency",
        "payment_count",
        "gross_amount",
        "settled_count",
        "settled_amount",
        "pending_count",
        "stale_pending_count",
        "failed_count",
        "expired_count",
        "deferred_count",
        "quarantined_count",
        "reconciliation_state",
        "first_payment_at",
        "last_payment_at",
    )

    def export_rows(
        self, queryset: QuerySet, *, policy: RedactionPolicy
    ) -> list[dict[str, Any]]:
        """Every row in the filtered set, independent of the requested page.

        An export that only contained the page the operator happened to be
        looking at would be a different document each time it was pressed; R6.5
        makes the export a backend command over the whole filtered set. The
        result is bounded by :data:`EXPORT_ROW_LIMIT` and refuses rather than
        truncates.
        """
        total = self.group_count(queryset)
        if total > EXPORT_ROW_LIMIT:
            raise SettlementExportTooLarge(total)
        return self.rows_for(queryset, policy=policy, offset=0, limit=EXPORT_ROW_LIMIT)

    def export_columns(self, policy: RedactionPolicy) -> tuple[str, ...]:
        withheld = set(policy.withheld_fields)
        return tuple(column for column in self.EXPORT_COLUMNS if column not in withheld)


def csv_bytes(columns: Iterable[str], rows: Iterable[dict[str, Any]]) -> str:
    """Render ``rows`` as CSV text with ``columns`` as the header."""
    import csv
    import io

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    column_list = list(columns)
    writer.writerow(column_list)
    for row in rows:
        writer.writerow(["" if row.get(column) is None else row.get(column) for column in column_list])
    return buffer.getvalue()


__all__ = [
    "EXPORT_ROW_LIMIT",
    "PLATFORM_ONLY_FEE_FIELDS",
    "PLATFORM_ONLY_SETTLEMENT_FIELDS",
    "RECONCILIATION_ATTENTION",
    "RECONCILIATION_EMPTY",
    "RECONCILIATION_FILTERS",
    "RECONCILIATION_IN_FLIGHT",
    "RECONCILIATION_SETTLED",
    "RECONCILIATION_STALE_HOURS",
    "RECONCILIATION_UNCOLLECTED",
    "RedactionPolicy",
    "SettlementExportTooLarge",
    "SettlementFilters",
    "SettlementQueryService",
    "SettlementScopeDenied",
    "SETTLED_STATUSES",
    "csv_bytes",
]
