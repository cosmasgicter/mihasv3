"""The admin dashboard's metric contract (task 9.2).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.2 — "Make
dashboard metrics truthful".
Requirements: **R8.6** (dashboard metrics are authoritative, scope-aware,
definition-labelled, and explicit about loading, stale, error, and unknown
states; missing data never becomes a healthy zero), **R17.3** (metrics cover the
platform's real failure surfaces), **R17.4** (optional sources degrade honestly
rather than to guessed values), **R17.5** (bounded reads), **R17.6** (a failure
is never relabelled as success by inventing a healthy default).
Findings: **ADM-02** — "Missing dashboard metrics are synthesized as healthy
zeros, scoped polling can lose institution scope, and enabled accounts are
labeled online users." **MAINT-02** — decorative metrics and misleading labels.
Design: §13.2 ("Dashboard: scoped operational exceptions and truthful
aggregates"), §17 (observability: a queue's state is a fact, not a guess).

What was wrong
--------------
Three separate ways of turning *no answer* into *good news*:

1. **Counters with no source.** ``overdue_reviews``,
   ``conditions_expiring_soon`` and ``enrollments_expiring_soon`` were rendered
   by the dashboard but computed nowhere. The backend never sent the keys; the
   frontend normalizer read the absent keys as ``0``. An operator saw "0 reviews
   past SLA" and read it as "nothing is late".
2. **A failed read counted as an empty one.** The needs-attention block was
   wrapped in ``except Exception: pending_payments = 0; pending_documents = 0;
   upcoming_interviews = 0``. A database error, a missing table, a timeout — all
   three rendered as three reassuring zeros. Same on the frontend: every error
   path returned ``createEmptyDashboardResponse()``, a fully zeroed shape with
   ``systemHealth: 'good'``.
3. **A health grade nobody computed.** ``systemHealth`` had four values
   (``excellent``/``good``/``warning``/``critical``); the backend never sent it,
   so it was always the default ``'good'`` — the dashboard asserted the platform
   was healthy without measuring anything.

What runs now
-------------
One registry. Every metric declares, in one place:

* **what it counts** — a sentence, reused from
  :meth:`ApplicationQueryService.dashboard_definitions` where the metric is an
  application counter, so a number cannot mean one thing here and another on the
  roster;
* **its scope** — ``institution`` (bounded by the actor's memberships/grants, or
  by the super-admin's selected school) or ``platform``;
* **its source** — the one read that produces it.

A metric is a *state*, not a number: ``ok`` carries an integer, ``unknown``
carries ``None`` and the reason its source failed. There is no third option and
no default value, which is what makes "missing data never becomes a healthy
zero" structural rather than a convention.

``health`` is now derived from the read itself — ``operational`` when every
source answered, ``degraded`` when some did, ``unknown`` when none did — so it
reports something the platform actually measured.

Freshness is a timestamp plus the age at which the payload should be treated as
stale. Per the repo polling convention there is **no** SSE or WebSocket here: the
frontend polls and compares ``generated_at`` against ``stale_after_seconds``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional

from django.db.models import Count, Q
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Metric states
# ---------------------------------------------------------------------------

#: The metric answered.
STATE_OK = "ok"
#: The metric's source did not answer. The value is ``None`` — never ``0``.
STATE_UNKNOWN = "unknown"

#: A source answered.
SOURCE_OK = "ok"
#: A source raised. Every metric it owns becomes ``unknown``.
SOURCE_FAILED = "failed"

#: Derived read health. Deliberately three values describing *this read*, not
#: four adjectives describing the platform's mood.
HEALTH_OPERATIONAL = "operational"
HEALTH_DEGRADED = "degraded"
HEALTH_UNKNOWN = "unknown"

HEALTH_DEFINITIONS: dict[str, str] = {
    HEALTH_OPERATIONAL: "Every metric source answered this request.",
    HEALTH_DEGRADED: "At least one metric source failed; those metrics are unknown.",
    HEALTH_UNKNOWN: "No metric source answered; no number on this page is current.",
}

#: How long a dashboard payload stays current. Read by the frontend to decide
#: when to label the numbers stale — the same order of magnitude as the polling
#: interval, so a paused tab is visibly stale rather than silently wrong.
STALE_AFTER_SECONDS = 120

#: Bound on the activity feed (R17.5).
ACTIVITY_LIMIT = 10

#: Scope kinds. ``institution`` means the number is bounded by the actor's
#: school access (or the super-admin's selected school); ``platform`` means it
#: describes the whole platform and is only offered to an all-access actor.
SCOPE_INSTITUTION = "institution"
SCOPE_PLATFORM = "platform"


# ---------------------------------------------------------------------------
# The registry
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DashboardMetric:
    """One number an operator reads, and everything needed to trust it.

    ``definition`` is the sentence stating what the metric counts. ``source`` is
    the read that produces it, so one failing read marks exactly its own metrics
    unknown instead of zeroing the page. ``roster_query`` is the registered
    applications query the metric's tile links to — present only where the metric
    *is* the count of a roster, which is what stops a tile's number and its link
    from describing different sets.
    """

    key: str
    definition: str
    source: str
    scope: str = SCOPE_INSTITUTION
    roster_query: Optional[str] = None

    def as_payload(self, value: Optional[int], *, state: str, reason: Optional[str] = None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "key": self.key,
            "value": value,
            "state": state,
            "definition": self.definition,
            "scope": self.scope,
            "source": self.source,
        }
        if self.roster_query:
            payload["roster_query"] = self.roster_query
        if reason:
            payload["reason"] = reason
        return payload


#: Source names. Each is one try/except boundary in :meth:`DashboardMetricsService.build`.
SOURCE_APPLICATIONS = "applications"
SOURCE_ACCOUNTS = "accounts"
SOURCE_ACTIVITY = "activity"


#: ``metric key → the aggregate / dashboard counter it reads``.
#:
#: This is the whole application half of the registry, written once. Both the
#: metric list and the read that fills it are derived from this mapping, so a
#: metric's definition and its number are provably the same counter — there is no
#: second place to update and therefore no way for the label to describe one
#: population while the value describes another.
APPLICATION_METRIC_COUNTERS: dict[str, str] = {
    "total_applications": "total",
    "decision_queue": "decision_queue_count",
    "accepted_path": "accepted_count",
    "rejected": "rejected_count",
    "overdue_reviews": "overdue_review_count",
    "deadline_pressure": "deadline_pressure_count",
    "pending_documents": "pending_documents_count",
    "payment_review": "payment_review_count",
    "upcoming_interviews": "upcoming_interviews_count",
    "today_activity": "today_activity_count",
    "applications_this_week": "activity_this_week_count",
    "applications_this_month": "activity_this_month_count",
    "payment_resolved": "payment_resolved_count",
    "payment_unpaid": "payment_unpaid_count",
}


def _application_metrics() -> tuple[DashboardMetric, ...]:
    """Application metrics, with 9.1's own sentences (never restated here)."""
    from apps.applications.query_service import (
        DASHBOARD_TILES,
        ApplicationQueryService,
    )

    definitions = ApplicationQueryService.dashboard_definitions()
    tile_query_by_counter = {
        spec["counter"]: spec["roster_query"] for spec in DASHBOARD_TILES.values()
    }

    metrics = []
    for key, counter in APPLICATION_METRIC_COUNTERS.items():
        definition = definitions.get(counter)
        if not definition:
            # Every dashboard number must carry a definition (R8.6). A counter
            # with no sentence is a metric nobody can explain, so refuse it here
            # rather than shipping an unlabelled number.
            raise RuntimeError(
                f"dashboard metric {key!r} reads counter {counter!r}, which has no definition"
            )
        metrics.append(
            DashboardMetric(
                key=key,
                definition=definition,
                source=SOURCE_APPLICATIONS,
                scope=SCOPE_INSTITUTION,
                roster_query=tile_query_by_counter.get(counter),
            )
        )
    return tuple(metrics)


#: Metrics that do not come from the applications read.
#:
#: ``staff_accounts_enabled`` is the MAINT-02 relabel. It was published as
#: ``users.active`` and rendered as "N active users online" / "Active Users" —
#: but it counts ``profiles.is_active``, which is *permission to sign in*, not
#: presence. Nothing in the payload has ever measured who is online. The metric
#: keeps its number and states what the number is.
_ACCOUNT_METRICS: tuple[DashboardMetric, ...] = (
    DashboardMetric(
        key="staff_accounts_total",
        definition=(
            "Accounts linked to a school in your scope, plus your own. Not a "
            "count of applicants."
        ),
        source=SOURCE_ACCOUNTS,
        scope=SCOPE_INSTITUTION,
    ),
    DashboardMetric(
        key="staff_accounts_enabled",
        definition=(
            "Accounts in your scope that are enabled to sign in. This is not a "
            "count of users currently online — the platform does not measure "
            "presence."
        ),
        source=SOURCE_ACCOUNTS,
        scope=SCOPE_INSTITUTION,
    ),
)


def dashboard_metric_registry() -> tuple[DashboardMetric, ...]:
    """Every dashboard metric, in render order."""
    return _application_metrics() + _ACCOUNT_METRICS


def metric_keys() -> tuple[str, ...]:
    return tuple(metric.key for metric in dashboard_metric_registry())


# ---------------------------------------------------------------------------
# The service
# ---------------------------------------------------------------------------


class DashboardMetricsService:
    """Builds the dashboard payload: metrics, their states, and its freshness.

    Authority is not re-derived here. The caller has already passed
    ``HasTenantCapability`` (masked 404 with no tenant scope, non-revealing 403
    without the capability), and every application number is computed over
    ``ApplicationQueryService.scoped_applications`` — the same scope-before-lookup
    queryset the roster uses. No role string is compared in this module.
    """

    def __init__(self) -> None:
        self._registry = dashboard_metric_registry()

    # -- scope ------------------------------------------------------------

    def resolve_institution_filter(self, user, institution_id: Any) -> Optional[str]:
        """Resolve a requested school **before** it reaches a query.

        Delegates to the roster's own resolver, so an out-of-scope or unknown
        institution id raises ``ApplicationScopeDenied`` here exactly as it does
        on the roster, and the view answers with the same masked 404. A dashboard
        that answered 200-with-zeros would confirm the id resolves.
        """
        from apps.applications.query_service import ApplicationQueryService

        return ApplicationQueryService().resolve_institution_filter(user, institution_id)

    # -- the build --------------------------------------------------------

    def build(self, user, *, institution_id: Optional[str] = None) -> dict[str, Any]:
        """The whole dashboard payload, with per-source failure isolation.

        Each source is read inside its own boundary. A source that raises marks
        **its own** metrics ``unknown`` and leaves the others answered — which is
        why ``health`` can be ``degraded`` rather than the page having to choose
        between "everything is fine" and "everything is broken".
        """
        from apps.applications.query_service import ApplicationQueryService

        service = ApplicationQueryService()
        scope_filters = self._scope_filters(user)
        all_access = bool(scope_filters and scope_filters.all_access)
        no_school_access = bool(
            scope_filters and not all_access and scope_filters.has_no_scope
        )

        sources: dict[str, dict[str, Any]] = {}
        values: dict[str, int] = {}

        # --- applications -------------------------------------------------
        counters = self._read(
            sources,
            SOURCE_APPLICATIONS,
            lambda: self._application_counters(service, user, institution_id),
        )
        if counters is not None:
            values.update(counters["counters"])
            windows = counters["windows"]
        else:
            windows = {}

        # --- accounts -----------------------------------------------------
        accounts = self._read(
            sources,
            SOURCE_ACCOUNTS,
            lambda: self._account_counters(user, scope_filters, all_access),
        )
        if accounts is not None:
            values.update(accounts)

        # --- activity (a feed, not a metric) -------------------------------
        activity = self._read(
            sources,
            SOURCE_ACTIVITY,
            lambda: self._recent_activity(service, user, all_access, institution_id),
        )

        metrics = {}
        for metric in self._registry:
            source_state = sources.get(metric.source, {}).get("state")
            if source_state == SOURCE_OK and metric.key in values:
                metrics[metric.key] = metric.as_payload(
                    int(values[metric.key]), state=STATE_OK
                )
            else:
                metrics[metric.key] = metric.as_payload(
                    None,
                    state=STATE_UNKNOWN,
                    reason=sources.get(metric.source, {}).get("reason")
                    or "This metric's source did not answer.",
                )

        health = self._health(sources)
        now = timezone.now()
        return {
            "no_school_access": no_school_access,
            "scope": {
                "kind": SCOPE_PLATFORM if all_access else SCOPE_INSTITUTION,
                "institution_id": institution_id,
                "all_access": all_access,
                "institution_count": (
                    None if all_access else len(scope_filters.institution_ids)
                    if scope_filters
                    else None
                ),
            },
            "metrics": metrics,
            "sources": sources,
            "health": {
                "state": health,
                "definition": HEALTH_DEFINITIONS[health],
            },
            "freshness": {
                "generated_at": now.isoformat(),
                "stale_after_seconds": STALE_AFTER_SECONDS,
            },
            "windows": windows,
            "recent_activity": activity if activity is not None else [],
            "activity_state": sources.get(SOURCE_ACTIVITY, {}).get("state", SOURCE_FAILED),
        }

    # -- source boundary ---------------------------------------------------

    @staticmethod
    def _read(sources: dict[str, dict[str, Any]], name: str, read: Callable[[], Any]):
        """Run one source's read, recording whether it answered.

        The bare ``except Exception`` here is the *opposite* of the one it
        replaces: the old handler swallowed the failure and substituted zeros,
        this one records the failure and substitutes nothing. The exception is
        logged with a stack trace; only its class name reaches the response, so a
        database message can never leak into an admin's browser.
        """
        try:
            value = read()
        except Exception as exc:  # noqa: BLE001 - the state IS the result
            logger.warning(
                "Admin dashboard source %s failed; its metrics are unknown", name,
                exc_info=True,
            )
            sources[name] = {
                "state": SOURCE_FAILED,
                "reason": f"This metric's source did not answer ({type(exc).__name__}).",
            }
            return None
        sources[name] = {"state": SOURCE_OK, "reason": None}
        return value

    # -- the reads ---------------------------------------------------------

    @staticmethod
    def _scope_filters(user):
        from apps.catalog.services import AccessScopeService

        return AccessScopeService().filters_for_user(user)

    def _application_counters(self, service, user, institution_id: Optional[str]) -> dict[str, Any]:
        """Every application metric, from 9.1's own counters over 9.1's own scope."""
        queryset = service.annotate(service.scoped_applications(user))
        if institution_id:
            queryset = queryset.filter(institution_ref_id=institution_id)

        # One aggregate for every application counter — the roster's own
        # expressions plus the five only the tiles need (R17.5: bounded reads).
        counters = service.dashboard_counters(user, queryset)
        aggregates = counters

        wired: dict[str, int] = {}
        for key, counter in APPLICATION_METRIC_COUNTERS.items():
            if counters.get(counter) is not None:
                wired[key] = int(counters[counter])
        return {
            "counters": wired,
            "windows": {
                # The windows every time-bounded number used, published with the
                # number. A zero with its window is a *measured* zero; a zero on
                # its own is indistinguishable from a missing read.
                "review_sla_days": aggregates.get("review_sla_days"),
                "deadline_pressure_hours": aggregates.get("deadline_pressure_hours"),
                "next_deadline_at": aggregates.get("next_deadline_at"),
                "last_activity_at": aggregates.get("last_activity_at"),
                "by_status": service.status_breakdown(queryset),
            },
        }

    def _account_counters(self, user, scope_filters, all_access: bool) -> dict[str, int]:
        """Accounts in scope, and how many of them may sign in (MAINT-02).

        The scoping is the same shape the previous implementation used
        (membership-derived, plus the actor's own row) — what changed is the
        label, not the population: this is *enabled accounts*, never *online
        users*.
        """
        from apps.accounts.models import Profile
        from apps.catalog.models import UserInstitutionMembership

        queryset = Profile.objects.all()
        if not all_access:
            institution_ids = scope_filters.institution_ids if scope_filters else set()
            scoped_user_ids = UserInstitutionMembership.objects.filter(
                institution_id__in=institution_ids,
                is_active=True,
            ).values_list("user_id", flat=True)
            actor_id = getattr(user, "id", None) or getattr(user, "pk", None)
            queryset = queryset.filter(Q(id__in=scoped_user_ids) | Q(id=actor_id))
        totals = queryset.aggregate(
            total=Count("id"),
            enabled=Count("id", filter=Q(is_active=True)),
        )
        return {
            "staff_accounts_total": int(totals["total"] or 0),
            "staff_accounts_enabled": int(totals["enabled"] or 0),
        }

    def _recent_activity(self, service, user, all_access: bool, institution_id: Optional[str]):
        """The last few status changes and payment events, scoped and bounded."""
        from apps.applications.models import ApplicationStatusHistory
        from apps.catalog.services import AccessScopeService
        from apps.documents.models import Payment
        from apps.documents.payment_constants import RECEIPT_ELIGIBLE_STATUSES

        applications = service.scoped_applications(user)
        if institution_id:
            applications = applications.filter(institution_ref_id=institution_id)

        history = ApplicationStatusHistory.objects.select_related(
            "application", "changed_by"
        )
        payments = Payment.objects.filter(status__in=RECEIPT_ELIGIBLE_STATUSES)
        if not all_access or institution_id:
            scoped_ids = applications.values_list("id", flat=True)
            history = history.filter(application_id__in=scoped_ids)
            payments = payments.filter(application_id__in=scoped_ids)
        elif not all_access:
            payments = AccessScopeService().filter_payments(payments, user)

        entries = list(history.order_by("-created_at")[:ACTIVITY_LIMIT])
        recent_payments = list(
            payments.select_related("application").order_by("-updated_at")[:5]
        )
        return format_recent_activity(entries, recent_payments)

    # -- derived health ----------------------------------------------------

    @staticmethod
    def _health(sources: dict[str, dict[str, Any]]) -> str:
        states = [entry.get("state") for entry in sources.values()]
        if not states:
            return HEALTH_UNKNOWN
        if all(state == SOURCE_OK for state in states):
            return HEALTH_OPERATIONAL
        if all(state == SOURCE_FAILED for state in states):
            return HEALTH_UNKNOWN
        return HEALTH_DEGRADED


# ---------------------------------------------------------------------------
# Activity formatting (moved verbatim from AdminDashboardView so the view is thin)
# ---------------------------------------------------------------------------


def _timestamp(value) -> str:
    if not value:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _actor_name(actor) -> str:
    if not actor:
        return ""
    first_name = getattr(actor, "first_name", "") or ""
    last_name = getattr(actor, "last_name", "") or ""
    return f"{first_name} {last_name}".strip()


def format_recent_activity(status_entries, recent_payments) -> list[dict[str, Any]]:
    """Status changes and payment events as one reverse-chronological feed."""
    recent_activity: list[dict[str, Any]] = []

    for entry in status_entries:
        application = getattr(entry, "application", None)
        app_number = getattr(application, "application_number", "") or ""
        old_status = getattr(entry, "old_status", "") or ""
        new_status = getattr(entry, "new_status", "") or ""
        old_label = old_status or "new"
        new_label = new_status or "unknown"

        recent_activity.append({
            "id": str(getattr(entry, "id", "")),
            "type": "status_change",
            "application_number": app_number,
            "old_status": old_status,
            "new_status": new_status,
            "timestamp": _timestamp(getattr(entry, "created_at", None)),
            "actor_name": _actor_name(getattr(entry, "changed_by", None)),
            "message": f"{app_number}: {old_label} -> {new_label}",
        })

    for payment in recent_payments:
        application = getattr(payment, "application", None)
        app_number = getattr(application, "application_number", "") or ""
        payment_status = getattr(payment, "status", "") or ""

        recent_activity.append({
            "id": str(getattr(payment, "id", "")),
            "type": "payment",
            "application_number": app_number,
            "old_status": "",
            "new_status": payment_status,
            "timestamp": _timestamp(getattr(payment, "updated_at", None)),
            "actor_name": "",
            "message": f"{app_number}: Payment {payment_status}",
        })

    recent_activity.sort(key=lambda item: item["timestamp"], reverse=True)
    return recent_activity[:ACTIVITY_LIMIT]


__all__ = [
    "ACTIVITY_LIMIT",
    "APPLICATION_METRIC_COUNTERS",
    "DashboardMetric",
    "DashboardMetricsService",
    "HEALTH_DEFINITIONS",
    "HEALTH_DEGRADED",
    "HEALTH_OPERATIONAL",
    "HEALTH_UNKNOWN",
    "SCOPE_INSTITUTION",
    "SCOPE_PLATFORM",
    "SOURCE_ACCOUNTS",
    "SOURCE_ACTIVITY",
    "SOURCE_APPLICATIONS",
    "SOURCE_FAILED",
    "SOURCE_OK",
    "STALE_AFTER_SECONDS",
    "STATE_OK",
    "STATE_UNKNOWN",
    "dashboard_metric_registry",
    "format_recent_activity",
    "metric_keys",
]
