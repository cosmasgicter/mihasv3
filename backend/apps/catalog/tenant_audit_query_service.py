"""The one tenant audit read/export authority (task 9.5).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.5 — "Correct tenant
audit and amendment notification scope".
Requirements: **R3** (one authorization model; scope before lookup; out-of-scope
is an indistinguishable 404), **R6.6** (the tenant audit *list and export* use the
**selected institution** endpoint, require ``tenant.audit.read`` or the platform
equivalent, paginate, and never leak another tenant's events).
Findings: **ADM-05**.

Why this exists
---------------

The tenant console's audit panel took an ``institutionId`` prop, put it in its
React Query key, and then **did not send it**::

    queryKey: ['admin', 'tenants', 'audit', institutionId],
    queryFn: () => adminAuditService.list({ targetTable: 'institutions', pageSize: 15 }),

So the panel labelled "Configuration audit" for the *selected school* rendered a
platform-wide feed of every ``entity_type='institutions'`` row the caller could
read, and switching schools re-fetched the same list under a different cache key.

The generic endpoint it called (``GET /api/v1/admin/audit-logs/``) is not the
tenant feed either. It narrows a non-super-admin by **actor** — "events written by
someone who shares an institution with you" — which is a different question from
"events about my school", and it answers it wrongly in both directions: a
Platform_Admin's change *to your school* is invisible (they are not a member of
it), while your colleague's change to a school you are not in is visible.

The correct endpoint already existed (``GET /api/v1/admin/institutions/{id}/audit/``,
matching on the ``changes.institution_id`` every ``TenantAuditService`` write
records) but was gated on the ``IsAdmin`` role class plus an inline scope-id set —
no ``tenant.audit.read`` check at all, no filters, and no export. This module is
the authority that endpoint now delegates to.

What it guarantees
------------------

* **Scope before lookup.** The institution id is resolved through
  ``AdminCapabilityService.visible_institution_queryset`` *before* it reaches a
  filter, so an out-of-scope or unknown id raises
  :class:`TenantAuditScopeDenied` → a masked 404, never a distinguishable empty
  page.
* **The capability decides, per institution.** ``tenant.audit.read`` resolved for
  *that* school through ``AdminCapabilityService``. A Super_Admin holds the whole
  tenant catalogue, which is the "or platform equivalent" R6.6 allows.
* **Events are matched by institution, not by actor.** So a platform operator's
  change to a school appears in that school's feed, and a colleague's change to
  another school does not.
* **The numbers are the server's.** Facets and counts are computed over the whole
  filtered set, so the panel never derives a total from the page it happens to
  hold.
* **The export is a command.** Page-independent, bounded by ``EXPORT_ROW_LIMIT``,
  gated on the explicit ``tenant.application.export`` capability, and audited — so
  the export appears in the feed it exported.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

from django.db import connection
from django.db.models import Count, Q, QuerySet
from django.utils.dateparse import parse_date, parse_datetime

from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError

logger = logging.getLogger(__name__)

#: Shared export ceiling. Read from the 8.4 settlement authority rather than
#: restated, so the platform has one export size limit rather than one per
#: surface.
try:  # pragma: no cover - import guard only
    from apps.documents.settlement_service import EXPORT_ROW_LIMIT
except Exception:  # pragma: no cover - defensive
    EXPORT_ROW_LIMIT = 5000

#: The capability required to **read** a school's audit feed (R6.6).
READ_CAPABILITY = "tenant.audit.read"

#: The capability required to **extract** it in bulk (R6.5). Read access does not
#: imply bulk extraction — the same separation tasks 8.4, 9.1 and 9.3 established
#: for settlement, fee and roster exports. This is the platform's only tenant
#: export capability; no new capability was invented for this surface.
EXPORT_CAPABILITY = "tenant.application.export"

#: Longest accepted free-text search term.
MAX_SEARCH_LENGTH = 120


class TenantAuditScopeDenied(Exception):
    """An identifier the actor may not resolve → the caller returns a masked 404."""

    def __init__(self, resource_type: str, resource_id: Any):
        super().__init__(f"{resource_type} {resource_id} is not resolvable")
        self.resource_type = resource_type
        self.resource_id = str(resource_id) if resource_id is not None else None


# ---------------------------------------------------------------------------
# Category vocabulary
# ---------------------------------------------------------------------------
#
# The panel used to derive a category in the browser with a regex over the action
# string, which meant the label depended on the client build rather than on the
# platform's own action vocabulary. The mapping now lives next to the vocabulary
# it maps (``tenant_audit_service``'s action constants) and travels with the row.

#: ``category`` → the action prefixes that belong to it, longest-prefix wins.
CATEGORY_PREFIXES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("configuration", ("tenant.",)),
    (
        "authorization",
        ("auth.denied", "scope.denied", "user.", "membership.", "grant."),
    ),
    (
        "review",
        ("application.review", "amendment.", "condition.", "assignment."),
    ),
    ("document", ("document.", "official_document.")),
    ("payment", ("payment.", "settlement.", "fee.")),
    ("export", ("audit.exported", "application.exported", "settlement.exported", "fee.exported")),
    ("communication", ("notification.", "email.", "communication.", "interview.")),
)

#: The categories a caller may filter on.
CATEGORIES: tuple[str, ...] = (
    "configuration",
    "authorization",
    "review",
    "document",
    "payment",
    "export",
    "communication",
    "other",
)

#: One sentence per category, published with the rows (the 9.1/9.2/9.3 rule: a
#: definition travels with every number, so an operator does not have to guess
#: what a label counts).
CATEGORY_DEFINITIONS: dict[str, str] = {
    "configuration": "Changes to this school's configuration — profile, domains, assets, templates, offerings, memberships and grants.",
    "authorization": "Refused authorizations, masked out-of-scope reads, and changes to who has access.",
    "review": "Decisions about applications: review outcomes, reviewer assignment, amendments and offer conditions.",
    "document": "Applicant document verification decisions and official-document issuance.",
    "payment": "Payment verification decisions and money-surface activity for this school.",
    "export": "Bulk extractions of this school's data. Exporting is itself recorded here.",
    "communication": "Notifications, emails and interview scheduling sent on this school's behalf.",
    "other": "Recorded activity that does not belong to one of the categories above.",
}


def categorize(action: str) -> str:
    """The category for one action string (longest matching prefix wins)."""
    candidate = (action or "").strip().lower()
    if not candidate:
        return "other"
    best_category = "other"
    best_length = 0
    for category, prefixes in CATEGORY_PREFIXES:
        for prefix in prefixes:
            if candidate.startswith(prefix) and len(prefix) > best_length:
                best_category = category
                best_length = len(prefix)
    return best_category


def _category_filter(category: str) -> Q:
    """A queryset filter for one category, from the same prefix table."""
    if category == "other":
        known = Q()
        for _name, prefixes in CATEGORY_PREFIXES:
            for prefix in prefixes:
                known |= Q(action__startswith=prefix)
        return ~known
    for name, prefixes in CATEGORY_PREFIXES:
        if name != category:
            continue
        clause = Q()
        for prefix in prefixes:
            clause |= Q(action__startswith=prefix)
        return clause
    return Q()


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TenantAuditFilters:
    """The validated, server-side filter set for one tenant audit query."""

    action: Optional[str] = None
    category: Optional[str] = None
    actor_id: Optional[str] = None
    entity_type: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    search: Optional[str] = None

    def as_payload(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "category": self.category,
            "actor_id": self.actor_id,
            "entity_type": self.entity_type,
            "date_from": self.date_from,
            "date_to": self.date_to,
            "search": self.search,
        }


def _normalize_timestamp(value: Any) -> Optional[str]:
    """An ISO timestamp string, or ``None`` for anything unparseable.

    A bad bound is dropped rather than 400'd, matching the roster's own filter
    handling: a filter the server could not understand must not silently narrow
    the answer, and it must not fail a read either.
    """
    raw = str(value or "").strip()
    if not raw:
        return None
    parsed = parse_datetime(raw)
    if parsed is not None:
        return parsed.isoformat()
    day = parse_date(raw)
    return day.isoformat() if day else None


class TenantAuditQueryService:
    """Scoped tenant audit reads. One authority for the list, facets and export."""

    #: Export columns, in order. Shared by the CSV writer and its tests.
    EXPORT_COLUMNS: tuple[str, ...] = (
        "id",
        "created_at",
        "action",
        "category",
        "entity_type",
        "entity_id",
        "actor_id",
        "institution_id",
        "retention_category",
        "changes",
    )

    # ------------------------------------------------------------------
    # Authority (R3.2, R3.5, R6.6)
    # ------------------------------------------------------------------

    def resolve_institution_id(self, user, institution_id: Any) -> str:
        """Validate the selected institution against the actor's scope.

        Scope **before** lookup: the id is checked against
        ``visible_institution_queryset`` before it reaches any audit query, so an
        out-of-scope id, an unknown id and a malformed id are indistinguishable
        (:class:`TenantAuditScopeDenied` → a masked 404). An actor with no tenant
        scope resolves nothing, so the surface's existence is not confirmed to
        them either.
        """
        requested = str(institution_id or "").strip()
        if not requested:
            raise TenantAuditScopeDenied("institution", requested)
        try:
            visible = AdminCapabilityService().visible_institution_queryset(user)
            exists = visible.filter(pk=requested).exists()
        except Exception:
            # A resolution failure and a malformed id are both indistinguishable
            # from an out-of-scope id: fail closed, disclose nothing.
            raise TenantAuditScopeDenied("institution", requested)
        if not exists:
            raise TenantAuditScopeDenied("institution", requested)
        return requested

    def require_read(self, user, institution_id: str) -> None:
        """Enforce ``tenant.audit.read`` for this institution (R6.6).

        Delegated to ``AdminCapabilityService.require_institution_capability``, so
        a Super_Admin passes through platform authority ("or platform
        equivalent") and no role string is compared. Raises DRF's
        ``PermissionDenied`` — a non-revealing 403, because scope has already been
        established by :meth:`resolve_institution_id`.
        """
        from rest_framework.exceptions import PermissionDenied

        try:
            AdminCapabilityService().require_institution_capability(
                user, institution_id, READ_CAPABILITY
            )
        except CapabilityResolutionError:  # pragma: no cover - defensive
            raise PermissionDenied()

    def may_export(self, user) -> bool:
        """True when the actor holds :data:`EXPORT_CAPABILITY` anywhere in scope."""
        try:
            capabilities = AdminCapabilityService().get_capabilities(user)
        except CapabilityResolutionError:
            return False
        if capabilities.is_super_admin or capabilities.all_access:
            return True
        return any(
            EXPORT_CAPABILITY in held
            for held in (capabilities.institution_capabilities or {}).values()
        )

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def parse_filters(self, query_params) -> TenantAuditFilters:
        """Validate raw params. Every filter is server-side."""
        action = (query_params.get("action") or "").strip() or None
        category = (query_params.get("category") or "").strip().lower() or None
        if category and category not in CATEGORIES:
            category = None
        entity_type = (query_params.get("entity_type") or "").strip() or None
        actor_id = (query_params.get("actor_id") or "").strip() or None
        search = (query_params.get("search") or "").strip() or None
        return TenantAuditFilters(
            action=action[:50] if action else None,
            category=category,
            actor_id=actor_id,
            entity_type=entity_type[:50] if entity_type else None,
            date_from=_normalize_timestamp(query_params.get("date_from")),
            date_to=_normalize_timestamp(query_params.get("date_to")),
            search=search[:MAX_SEARCH_LENGTH] if search else None,
        )

    def scoped_events(self, institution_id: str) -> QuerySet:
        """Every audit event recorded **about** this institution.

        Matched on the ``institution_id`` ``TenantAuditService`` records inside the
        redacted ``changes`` payload — the fact that identifies whose school an
        event is about, regardless of which id ``entity_id`` carries and regardless
        of who the actor was.

        A bulk command may span several schools, in which case the event carries
        ``institution_ids`` as well; on PostgreSQL that list is matched too, so a
        school sees its own share of a multi-school command instead of only the
        one that happened to be recorded first. The containment operator is
        Postgres-only, so it is added by vendor rather than assumed.
        """
        from apps.common.models import AuditLog

        clause = Q(changes__institution_id=institution_id)
        if connection.vendor == "postgresql":
            clause |= Q(changes__institution_ids__contains=[institution_id])
        return AuditLog.objects.filter(clause).order_by("-created_at", "-id")

    def filtered_events(self, institution_id: str, filters: TenantAuditFilters) -> QuerySet:
        queryset = self.scoped_events(institution_id)
        if filters.action:
            queryset = queryset.filter(action=filters.action)
        if filters.category:
            queryset = queryset.filter(_category_filter(filters.category))
        if filters.entity_type:
            queryset = queryset.filter(entity_type=filters.entity_type)
        if filters.actor_id:
            try:
                queryset = queryset.filter(actor_id=filters.actor_id)
            except Exception:
                # A malformed actor filter narrows to nothing rather than 500ing.
                return queryset.none()
        if filters.date_from:
            queryset = queryset.filter(created_at__gte=filters.date_from)
        if filters.date_to:
            queryset = queryset.filter(created_at__lte=filters.date_to)
        if filters.search:
            queryset = queryset.filter(
                Q(action__icontains=filters.search)
                | Q(entity_type__icontains=filters.search)
            )
        return queryset

    def rows_for(
        self,
        queryset: QuerySet,
        *,
        offset: int = 0,
        limit: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """Serialise one window of audit events.

        ``changes`` is returned verbatim: it was already redacted at **write**
        time by ``TenantAuditService._redact`` (the shared payment redactor), so
        there is one place that decides what an audit payload may contain and this
        is not a second one. Network hashes are deliberately omitted — an operator
        reviewing configuration history has no use for them, and they are the only
        columns on the row that are derived from personal request context.
        """
        window = list(
            queryset[offset : offset + limit] if limit is not None else queryset[:EXPORT_ROW_LIMIT]
        )
        return [
            {
                "id": str(event.id),
                "created_at": event.created_at.isoformat() if event.created_at else None,
                "action": event.action,
                "category": categorize(event.action),
                "entity_type": event.entity_type,
                "entity_id": str(event.entity_id) if event.entity_id else None,
                "actor_id": str(event.actor_id) if event.actor_id else None,
                "institution_id": (event.changes or {}).get("institution_id")
                if isinstance(event.changes, dict)
                else None,
                "retention_category": event.retention_category,
                "changes": event.changes,
            }
            for event in window
        ]

    def facets(self, queryset: QuerySet) -> dict[str, Any]:
        """Counts over the **whole filtered set**, never over one page (R6.6).

        The panel used to build its own breakdown from the fifteen rows it had
        loaded, which meant the label "12 configuration changes" described the
        page rather than the school. These come from SQL.
        """
        totals = queryset.aggregate(
            event_count=Count("id"),
            actor_count=Count("actor_id", distinct=True),
        )
        by_action = [
            {"action": row["action"], "event_count": row["event_count"]}
            for row in queryset.values("action")
            .annotate(event_count=Count("id"))
            .order_by("-event_count", "action")[:25]
        ]
        by_category: dict[str, int] = {name: 0 for name in CATEGORIES}
        for row in by_action_all(queryset):
            by_category[categorize(row["action"])] += row["event_count"]
        return {
            "event_count": totals.get("event_count") or 0,
            "actor_count": totals.get("actor_count") or 0,
            "by_action": by_action,
            "by_category": [
                {"category": name, "event_count": count}
                for name, count in by_category.items()
                if count
            ],
            "row_limit": EXPORT_ROW_LIMIT,
        }

    def export_rows(self, queryset: QuerySet, *, limit: int = EXPORT_ROW_LIMIT) -> list[dict[str, Any]]:
        """The same rows as :meth:`rows_for`, with ``changes`` as JSON text.

        A CSV cell holding a Python ``dict`` repr is not machine-readable, and the
        redacted payload is the most useful column on this export — so it is
        serialised rather than stringified. Nothing else differs: the export is the
        list, not a second projection of it.
        """
        import json

        rows = self.rows_for(queryset, offset=0, limit=limit)
        for row in rows:
            changes = row.get("changes")
            row["changes"] = (
                json.dumps(changes, sort_keys=True, default=str) if changes else ""
            )
        return rows

    def export_columns(self) -> tuple[str, ...]:
        return self.EXPORT_COLUMNS


def by_action_all(queryset: QuerySet) -> list[dict[str, Any]]:
    """Every distinct action in the filtered set with its count (for categories).

    Separate from the top-25 ``by_action`` list because a category total must be
    computed over *all* actions, not over the twenty-five most frequent — a
    truncated input would make the category counts quietly disagree with
    ``event_count``.
    """
    return [
        {"action": row["action"], "event_count": row["event_count"]}
        for row in queryset.values("action").annotate(event_count=Count("id")).order_by("action")
    ]


__all__ = [
    "CATEGORIES",
    "CATEGORY_DEFINITIONS",
    "CATEGORY_PREFIXES",
    "EXPORT_CAPABILITY",
    "EXPORT_ROW_LIMIT",
    "MAX_SEARCH_LENGTH",
    "READ_CAPABILITY",
    "TenantAuditFilters",
    "TenantAuditQueryService",
    "TenantAuditScopeDenied",
    "categorize",
]
