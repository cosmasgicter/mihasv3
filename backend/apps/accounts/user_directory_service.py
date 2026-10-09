"""The one scoped user-directory query + import authority (task 9.3).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.3 — "Rebuild user
directory CRUD, import, bulk, and export".
Requirements: **R6.1**-**R6.5**. Findings: **ADM-03**, **ADM-04**, **AUTH-04**.
Design: §5.3 ("People And Access"), §14.1 (one envelope, one pagination schema).

What this module exists to end
------------------------------
ADM-03: the directory fetched the **first server page** and then searched,
filtered, sorted, paginated, and exported in the browser, so the headline count
described the whole table while every other number described the twenty rows
that happened to arrive; and an update carrying ``email`` or ``phone`` was
accepted with a 200 and **silently dropped**, because the serializer never
declared those fields.

ADM-04: the batch import accepted a role the actor could not assign only
*sometimes*, created profiles with **no tenant membership**, had no preview, and
reported one opaque failure rather than the row that was wrong.

AUTH-04: authority came from a role string and an invented permission
vocabulary rather than the platform's own hierarchy and capabilities.

It deliberately reuses task 9.1's contract rather than inventing a second one:
scope-before-lookup with a masked 404 on an out-of-scope identifier, registered
query parameters echoed back when unknown, SQL filters/sort/aggregates/facets
over the **whole filtered set** with each facet dimension left open,
capability-driven redaction, and a page-independent export bounded by
:data:`EXPORT_ROW_LIMIT` that refuses with ``EXPORT_TOO_LARGE`` rather than
truncating. 9.1 §10 and 9.2 §13 both name the user directory as carrying the same
page-derived habits and leave it here.

The three-way field/role contract (R6.2)
----------------------------------------
:data:`SUPPORTED_ROLES` is derived from ``ROLE_HIERARCHY`` — the platform's own
hierarchy — so the form, the serializer, and the role ceiling cannot disagree by
construction. :data:`CREATE_FIELDS` / :data:`UPDATE_FIELDS` are the one supported
mutation vocabulary, and an unsupported field is **rejected**
(``UNSUPPORTED_FIELD``) rather than dropped: a 200 that discards half the payload
is the defect, not the fix.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any, Iterable, Optional

from django.db.models import (
    Case,
    Count,
    Exists,
    OuterRef,
    Q,
    QuerySet,
    TextField,
    Value,
    When,
)
from django.db.models.functions import Coalesce, Concat, NullIf, Trim
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.accounts.permissions import ROLE_HIERARCHY
from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# The role contract (R6.2, AUTH-04)
# ---------------------------------------------------------------------------

#: The supported platform roles, **derived** from the platform's own hierarchy
#: rather than restated. ADM-03/AUTH-04 are three lists that disagreed — a form
#: enum, a serializer ``ChoiceField``, and a hierarchy — so this module reads the
#: hierarchy and everything else reads this. Ordered least → most authority so
#: the generated OpenAPI enum and the rendered select are deterministic.
SUPPORTED_ROLES: tuple[str, ...] = tuple(
    role for role, _level in sorted(ROLE_HIERARCHY.items(), key=lambda item: item[1])
)

#: Roles whose authority is *tenant staff* authority. A staff account without a
#: membership has no tenant scope at all (steering: the bare ``admin`` role
#: grants zero authority), which is the half of ADM-04 that produced accounts
#: nobody could act as.
STAFF_ROLES: frozenset[str] = frozenset({"admin", "reviewer"})


def role_level(role: Optional[str]) -> int:
    """The actor's level in the platform hierarchy (0 for anything unknown)."""
    return ROLE_HIERARCHY.get(role or "", 0)


# ---------------------------------------------------------------------------
# The field contract (R6.2)
# ---------------------------------------------------------------------------

#: Fields a create command accepts. Anything else is rejected.
CREATE_FIELDS: frozenset[str] = frozenset(
    {
        "email",
        "password",
        "first_name",
        "last_name",
        "phone",
        "nationality",
        "role",
        "institution_id",
    }
)

#: Fields an update command accepts. ``email`` and ``phone`` are here because the
#: edit form has always sent them and the serializer has always ignored them —
#: that silent discard is ADM-03's second half.
UPDATE_FIELDS: frozenset[str] = frozenset(
    {
        "email",
        "first_name",
        "last_name",
        "phone",
        "role",
        "is_active",
        "password",
    }
)

#: Import row fields. ``full_name`` is accepted because the CSV template has
#: always used it; the service splits it, so the browser no longer has to.
IMPORT_ROW_FIELDS: frozenset[str] = frozenset(
    {
        "email",
        "first_name",
        "last_name",
        "full_name",
        "phone",
        "role",
        "password",
    }
)


# ---------------------------------------------------------------------------
# Query contract
# ---------------------------------------------------------------------------

#: Sort keys an operator may ask for → the ordering the database applies. An
#: unknown key falls back to :data:`DEFAULT_SORT`; it is never interpolated.
SORT_FIELDS: dict[str, tuple[str, ...]] = {
    "created_at": ("created_at", "id"),
    "display_name": ("display_name", "id"),
    "email": ("email", "id"),
    "role": ("role_rank", "display_name", "id"),
    "is_active": ("is_active", "display_name", "id"),
    "updated_at": ("updated_at", "created_at", "id"),
}

#: Legacy client sort aliases → canonical keys. The pre-9.3 table sent
#: ``name`` / ``created``, so one parser understands both spellings instead of
#: two implementations drifting.
SORT_ALIASES: dict[str, str] = {
    "name": "display_name",
    "full_name": "display_name",
    "created": "created_at",
    "status": "is_active",
    "active": "is_active",
}

DEFAULT_SORT = "created_at"
DEFAULT_SORT_DESCENDING = True

#: Facet ceiling. A facet is a *pick list*; an unbounded one would be a second
#: directory. Over-limit facets carry ``truncated: true`` rather than silently
#: dropping options.
FACET_LIMIT = 200

#: Hard ceiling on an export, independent of page size (R6.5). Over-limit is
#: refused with ``EXPORT_TOO_LARGE``, never truncated. Same value as 9.1's
#: roster ceiling — one platform export budget, not one per surface.
EXPORT_ROW_LIMIT = 5000

#: Maximum rows in one import request (R6.4). Preserves the pre-9.3 batch limit.
IMPORT_MAX_ROWS = 100

#: Directory columns only a platform all-access actor may read.
#:
#: A tenant operator legitimately sees the accounts in their own schools. What is
#: withheld is the platform's own cross-tenant context: how many *other* schools
#: an account also belongs to, and which. A tenant admin inferring another
#: school's staff list from their own directory is exactly the cross-tenant
#: inference the isolation invariants forbid, so these are not merely hidden —
#: ``institution_names`` is not computed for a scoped actor at all.
PLATFORM_ONLY_USER_FIELDS: tuple[str, ...] = (
    "institution_count",
    "institution_names",
)

#: Every query parameter this contract understands. Registered here so a deep
#: link can be *checked* rather than hoped about — anything outside the set is
#: echoed in ``filters.unknown_parameters`` instead of silently ignored.
REGISTERED_PARAMETERS: frozenset[str] = frozenset(
    {
        "institution_id",
        "role",
        "search",
        "is_active",
        "include_inactive",
        "has_membership",
        "start_date",
        "end_date",
        "sort",
        "order",
        # Pagination + response-shape controls.
        "page",
        "pageSize",
        "export",
    }
)

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


class UserScopeDenied(Exception):
    """A requested identifier is outside the actor's scope, or does not exist.

    Raised instead of narrowing to zero rows so the two cases collapse into one
    masked 404. Carries the resource type + id for the ``scope.denied`` audit
    row only; neither value is ever echoed to the client.
    """

    def __init__(self, resource_type: str, resource_id: Any) -> None:
        super().__init__("Out of scope")
        self.resource_type = resource_type
        self.resource_id = resource_id


class UserExportTooLarge(Exception):
    """An export would exceed :data:`EXPORT_ROW_LIMIT` rows."""

    def __init__(self, row_count: int) -> None:
        super().__init__("Export too large")
        self.row_count = row_count


class UnsupportedUserField(Exception):
    """A mutation named a field this contract does not implement (R6.2).

    The point of raising rather than ignoring: the pre-9.3 update serializer
    declared five fields, the edit form sent seven, and the two extra ones were
    dropped inside a ``200 OK``. An operator who corrected a typo in an email
    address was told it worked.
    """

    def __init__(self, fields: Iterable[str]) -> None:
        self.fields = tuple(sorted(str(name) for name in fields))
        super().__init__("Unsupported fields: " + ", ".join(self.fields))


def _tribool(value: Any) -> Optional[bool]:
    raw = str(value or "").strip().lower()
    if raw in _TRUE:
        return True
    if raw in _FALSE:
        return False
    return None


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


def email_fingerprint(value: Any) -> str:
    """A stable, non-reversing fingerprint for an email address.

    Used wherever an import or export needs to *identify* a row in an audit
    trail or an idempotency check without persisting the address. An email is
    contact PII, and the audit trail is not the place for it.
    """
    return hashlib.sha256(str(value or "").strip().lower().encode("utf-8")).hexdigest()[:16]


def split_full_name(full_name: Any) -> tuple[str, str]:
    """Split a display name into ``(first_name, last_name)``.

    Server-side on purpose: the browser, the CSV importer, and the create form
    each had their own copy of this, and a name that split differently in two of
    them produced two different accounts for one person.
    """
    normalized = " ".join(str(full_name or "").split())
    if not normalized:
        return "", ""
    first, *rest = normalized.split(" ")
    return first, (" ".join(rest) or first)


@dataclass(frozen=True)
class UserDirectoryFilters:
    """The validated, server-side filter set for one directory query.

    Every field is applied in SQL. ``institution_id`` is already scope-resolved
    by the time this object exists (see :meth:`UserDirectoryQueryService.parse`),
    so nothing here can widen an actor's scope.
    """

    institution_id: Optional[str] = None
    roles: tuple[str, ...] = ()
    search: Optional[str] = None
    is_active: Optional[bool] = None
    has_membership: Optional[bool] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    sort: str = DEFAULT_SORT
    descending: bool = DEFAULT_SORT_DESCENDING
    #: Parameter names that were present but are not registered. Echoed back so
    #: a broken deep link is *visible* rather than silently dropped.
    unknown_parameters: tuple[str, ...] = field(default=())

    def as_payload(self) -> dict[str, Any]:
        """The applied filters, echoed back so a UI never guesses them."""
        return {
            "institution_id": self.institution_id,
            "role": list(self.roles),
            "search": self.search,
            "is_active": self.is_active,
            "has_membership": self.has_membership,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "sort": self.sort,
            "order": "desc" if self.descending else "asc",
            "unknown_parameters": list(self.unknown_parameters),
        }


@dataclass(frozen=True)
class UserRedactionPolicy:
    """What an actor may see in a directory row or export (R6.5).

    Resolved from the actor's capability set, never from a role string. Scope
    decides *which* rows exist for this actor; this decides which **platform**
    columns travel with them.
    """

    unrestricted: bool = False
    platform_only_fields: tuple[str, ...] = PLATFORM_ONLY_USER_FIELDS

    @property
    def withheld_fields(self) -> list[str]:
        return [] if self.unrestricted else list(self.platform_only_fields)

    def apply(self, row: dict[str, Any]) -> dict[str, Any]:
        if self.unrestricted:
            return row
        withheld = set(self.withheld_fields)
        return {key: value for key, value in row.items() if key not in withheld}

    def as_payload(self) -> dict[str, Any]:
        return {
            "applied": not self.unrestricted,
            "withheld_fields": self.withheld_fields,
        }


class UserDirectoryQueryService:
    """The one scoped user-directory query authority (ADM-03, R6.1)."""

    # ------------------------------------------------------------------
    # Authority + scope (scope BEFORE lookup)
    # ------------------------------------------------------------------

    def redaction_policy(self, user) -> UserRedactionPolicy:
        """Resolve the actor's redaction policy from capabilities, not roles."""
        try:
            capabilities = AdminCapabilityService().get_capabilities(user)
        except CapabilityResolutionError:
            # Fail closed: an unresolved actor is maximally redacted.
            return UserRedactionPolicy(unrestricted=False)
        return UserRedactionPolicy(
            unrestricted=bool(capabilities.is_super_admin or capabilities.all_access)
        )

    def visible_institution_ids(self, user) -> Optional[set[str]]:
        """The actor's visible institution ids, or ``None`` for all-access."""
        service = AdminCapabilityService()
        try:
            capabilities = service.get_capabilities(user)
            if capabilities.is_super_admin or capabilities.all_access:
                return None
            visible = service.visible_institution_queryset(user)
        except CapabilityResolutionError:
            return set()
        return {str(pk) for pk in visible.values_list("pk", flat=True)}

    def scoped_users(self, user) -> QuerySet:
        """Every account the actor may read, scoped in SQL.

        A platform all-access actor sees the whole directory. Everyone else sees
        the accounts holding an **active** membership in one of their in-scope
        institutions, plus their own row — the same membership-derived population
        the pre-9.3 view narrowed to, expressed as one queryset so it can be
        filtered, counted, faceted, and exported without ever materialising a
        Python id set.
        """
        from apps.accounts.models import Profile
        from apps.catalog.models import UserInstitutionMembership

        base = Profile.objects.all()
        visible_ids = self.visible_institution_ids(user)
        if visible_ids is None:
            return base
        if not visible_ids:
            # Fail closed. A no-scope actor is refused by the view (masked 404)
            # rather than answered with an empty page, but the queryset must
            # still be empty if it is ever reached.
            own_id = getattr(user, "id", None) or getattr(user, "pk", None)
            return base.filter(pk=own_id) if own_id else base.none()

        membership = UserInstitutionMembership.objects.filter(
            user_id=OuterRef("pk"),
            institution_id__in=visible_ids,
            is_active=True,
        )
        own_id = getattr(user, "id", None) or getattr(user, "pk", None)
        scoped = Q(pk__in=UserInstitutionMembership.objects.filter(
            institution_id__in=visible_ids, is_active=True
        ).values("user_id"))
        if own_id:
            scoped |= Q(pk=own_id)
        return base.annotate(_in_scope=Exists(membership)).filter(scoped)

    # -- identifier filters, resolved before they reach a query ---------

    def resolve_institution_filter(self, user, institution_id: Any) -> Optional[str]:
        """Validate a requested ``institution_id`` against the actor's scope.

        Scope before lookup: the id is checked against
        ``visible_institution_queryset`` **before** it reaches a filter, so an
        out-of-scope or unknown institution raises :class:`UserScopeDenied` (a
        masked 404) rather than returning an empty — and therefore
        distinguishable — page.
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
            raise UserScopeDenied("institution", requested)
        if not exists:
            raise UserScopeDenied("institution", requested)
        return requested

    def resolve_user(self, actor, user_id: Any):
        """Fetch one account **through** the actor's scope, or refuse.

        The pre-9.3 detail view did ``Profile.objects.get(pk=pk)`` and *then*
        compared the result against a scope set. That ordering is the thing the
        isolation invariants forbid: the row is already in memory, so any later
        divergence in the response — a different code, a different latency, a
        log line — can confirm the id resolves. Here the scope is part of the
        query.
        """
        requested = str(user_id or "").strip()
        if not requested:
            raise UserScopeDenied("user", requested)
        try:
            found = self.scoped_users(actor).filter(pk=requested).first()
        except Exception:
            raise UserScopeDenied("user", requested)
        if found is None:
            raise UserScopeDenied("user", requested)
        return found

    # ------------------------------------------------------------------
    # Parsing
    # ------------------------------------------------------------------

    def parse(self, user, query_params) -> UserDirectoryFilters:
        """Validate raw query params into a :class:`UserDirectoryFilters`.

        Every filter is server-side. The identifier filter is scope-resolved
        here (before any data query), so an out-of-scope id fails as a masked
        not-found instead of quietly narrowing to zero rows.
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

        # ``is_active`` is the registered spelling. ``include_inactive`` is the
        # pre-9.3 one and is honoured as a *widening* of the default, so an old
        # bookmark keeps working: absent both, the directory shows active
        # accounts only, exactly as it always has.
        is_active = _tribool(query_params.get("is_active"))
        if is_active is None:
            include_inactive = _tribool(query_params.get("include_inactive"))
            is_active = None if include_inactive else True

        roles = tuple(
            part
            for part in (
                item.strip().lower()
                for item in str(query_params.get("role") or "").split(",")
            )
            if part
        )

        unknown = tuple(
            sorted(
                name
                for name in query_params.keys()
                if name not in REGISTERED_PARAMETERS
            )
        )

        return UserDirectoryFilters(
            institution_id=self.resolve_institution_filter(
                user, query_params.get("institution_id")
            ),
            roles=roles,
            search=search[:120] if search else None,
            is_active=is_active,
            has_membership=_tribool(query_params.get("has_membership")),
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

        ``display_name`` is the stored ``full_name`` when present and the
        first/last pair otherwise, so sorting by name is one SQL ordering rather
        than a browser ``localeCompare`` over whichever rows arrived.
        ``role_rank`` is the platform hierarchy expressed in SQL, so "sort by
        role" orders by *authority* instead of alphabetically — ``admin`` before
        ``reviewer`` before ``student`` is a fact about the platform, not about
        the alphabet.
        """
        from apps.catalog.models import UserInstitutionMembership

        active_membership = UserInstitutionMembership.objects.filter(
            user_id=OuterRef("pk"), is_active=True
        )
        return queryset.annotate(
            display_name=Coalesce(
                NullIf(Trim("full_name"), Value("")),
                NullIf(
                    Trim(
                        Concat(
                            Coalesce("first_name", Value("")),
                            Value(" "),
                            Coalesce("last_name", Value("")),
                        )
                    ),
                    Value(""),
                ),
                "email",
                output_field=TextField(),
            ),
            role_rank=Case(
                *[
                    When(role=role, then=Value(-level))
                    for role, level in ROLE_HIERARCHY.items()
                ],
                default=Value(0),
            ),
            has_active_membership=Exists(active_membership),
        )

    def filtered(self, user, filters: UserDirectoryFilters) -> QuerySet:
        """The scoped directory with every filter applied, in SQL."""
        from apps.catalog.models import UserInstitutionMembership

        queryset = self.annotate(self.scoped_users(user))

        if filters.institution_id:
            queryset = queryset.filter(
                pk__in=UserInstitutionMembership.objects.filter(
                    institution_id=filters.institution_id, is_active=True
                ).values("user_id")
            )

        if filters.roles:
            queryset = queryset.filter(role__in=filters.roles)

        if filters.is_active is True:
            # ``is_active`` is nullable on ``profiles``; a NULL has always been
            # treated as enabled by the login path, so it is treated as enabled
            # here too rather than quietly disappearing from the directory.
            queryset = queryset.filter(Q(is_active=True) | Q(is_active__isnull=True))
        elif filters.is_active is False:
            queryset = queryset.filter(is_active=False)

        if filters.has_membership is True:
            queryset = queryset.filter(has_active_membership=True)
        elif filters.has_membership is False:
            queryset = queryset.filter(has_active_membership=False)

        if filters.search:
            term = filters.search
            queryset = queryset.filter(
                # ``display_name`` is the derived column the table renders, and
                # it has to be searchable or the search contradicts the screen:
                # an account stored as first="Ada", last="Lovelace" with no
                # ``full_name`` renders as "Ada Lovelace", and searching for that
                # string matched *neither* stored field. Found by running the
                # browser journey rather than by reading the query.
                Q(display_name__icontains=term)
                | Q(first_name__icontains=term)
                | Q(last_name__icontains=term)
                | Q(full_name__icontains=term)
                | Q(email__icontains=term)
                | Q(phone__icontains=term)
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
    def ordered(queryset: QuerySet, filters: UserDirectoryFilters) -> QuerySet:
        """Apply the requested sort, always with a total tie-break.

        The trailing ``id`` in every :data:`SORT_FIELDS` entry is what makes
        paging correct: without a total ordering, two rows with the same name can
        swap between page 1 and page 2 and an operator sees one of them twice and
        the other never.
        """
        fields = SORT_FIELDS.get(filters.sort, SORT_FIELDS[DEFAULT_SORT])
        prefix = "-" if filters.descending else ""
        ordering = [f"{prefix}{fields[0]}", *fields[1:]]
        return queryset.order_by(*ordering)

    # ------------------------------------------------------------------
    # Aggregates over the whole filtered set
    # ------------------------------------------------------------------

    @classmethod
    def _aggregate_expressions(cls) -> dict[str, Any]:
        role_counters = {
            f"{role}_count": Count("id", filter=Q(role=role))
            for role in SUPPORTED_ROLES
        }
        return {
            "total_count": Count("id"),
            "enabled_count": Count(
                "id", filter=Q(is_active=True) | Q(is_active__isnull=True)
            ),
            "disabled_count": Count("id", filter=Q(is_active=False)),
            "with_membership_count": Count("id", filter=Q(has_active_membership=True)),
            "without_membership_count": Count(
                "id", filter=Q(has_active_membership=False)
            ),
            "staff_without_membership_count": Count(
                "id",
                filter=Q(role__in=sorted(STAFF_ROLES), has_active_membership=False),
            ),
            **role_counters,
        }

    def aggregates(self, queryset: QuerySet) -> dict[str, Any]:
        """The directory's headline numbers, over the whole filtered set.

        The pre-9.3 page rendered ``users.length``, ``filteredUsers.length`` and
        a role breakdown built by ``UserStats`` from the array it had — which
        described one page and was labelled as if it described the directory.
        These are SQL counters over the same rows the page is drawn from, so
        they do not move when an operator turns the page.
        """
        values = queryset.order_by().aggregate(**self._aggregate_expressions())
        values["role_breakdown"] = {
            role: values.get(f"{role}_count") or 0 for role in SUPPORTED_ROLES
        }
        return values

    @staticmethod
    def aggregate_definitions() -> dict[str, str]:
        """One sentence per headline number (R6.1).

        A number an operator cannot explain is a number they cannot act on, and
        ``staff_without_membership_count`` is the clearest case: it is the ADM-04
        population — staff accounts that can sign in and then find nothing,
        because no membership gives them tenant scope.
        """
        definitions = {
            "total_count": "Accounts matching the current filters, in your scope.",
            "enabled_count": "Matching accounts that are permitted to sign in. This is not a count of users currently online — the platform does not measure presence.",
            "disabled_count": "Matching accounts that have been deactivated and cannot sign in.",
            "with_membership_count": "Matching accounts holding at least one active school membership.",
            "without_membership_count": "Matching accounts with no active school membership.",
            "staff_without_membership_count": "Matching staff accounts (administrator or reviewer) with no active school membership, and therefore no tenant access at all.",
        }
        for role in SUPPORTED_ROLES:
            definitions[f"{role}_count"] = (
                f"Matching accounts whose platform role is '{role}'."
            )
        return definitions

    # ------------------------------------------------------------------
    # Facets
    # ------------------------------------------------------------------

    #: Facet name → (value field, label field or ``None``).
    FACET_SPECS: dict[str, tuple[str, Optional[str]]] = {
        "role": ("role", None),
        "is_active": ("is_active", None),
    }

    def facets(
        self, queryset: QuerySet, *, names: Optional[Iterable[str]] = None
    ) -> dict[str, Any]:
        """Filter options with counts, computed over the whole filtered set.

        The browser used to build its role select from a hardcoded list and its
        counts from the loaded rows, so an option's count described the page and
        a role with no row on the page still looked empty. Each facet here is a
        SQL ``GROUP BY`` over the same scoped, filtered set the page is drawn
        from, and each option carries its own count.

        Computed **before** its own dimension is narrowed by the caller (see
        the view's ``FACET_OPEN_DIMENSIONS``): a role facet computed after
        ``role=admin`` could only ever offer ``admin``, which would leave an
        operator filtered into a corner with no way back.
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
                            None
                            if raw_value is None or raw_value == ""
                            else (
                                raw_value
                                if isinstance(raw_value, bool)
                                else str(raw_value)
                            )
                        ),
                        "label": _facet_label(name, raw_value, label_raw),
                        "count": row.get("count") or 0,
                    }
                )
            result[name] = {"options": options, "truncated": truncated}

        if names is None or "institution" in tuple(names):
            result["institution"] = self._institution_facet(queryset)
        return result

    def _institution_facet(self, queryset: QuerySet) -> dict[str, Any]:
        """School membership counts for the filtered accounts.

        Joined from ``user_institution_memberships`` rather than from a column on
        the account, because an account may belong to more than one school and
        the pre-9.3 page had no way to say so at all.
        """
        from apps.catalog.models import UserInstitutionMembership

        rows = list(
            UserInstitutionMembership.objects.filter(
                is_active=True, user_id__in=queryset.order_by().values("pk")
            )
            .values("institution_id", "institution__name")
            .annotate(count=Count("user_id", distinct=True))
            .order_by("-count", "institution__name")[: FACET_LIMIT + 1]
        )
        truncated = len(rows) > FACET_LIMIT
        options = [
            {
                "value": str(row["institution_id"]) if row["institution_id"] else None,
                "label": row.get("institution__name") or "Unassigned",
                "count": row.get("count") or 0,
            }
            for row in rows[:FACET_LIMIT]
        ]
        return {"options": options, "truncated": truncated}

    # ------------------------------------------------------------------
    # Rows
    # ------------------------------------------------------------------

    #: Directory columns, in order. Shared by the JSON rows, the CSV writer, and
    #: their tests so the file and the contract cannot drift.
    ROW_COLUMNS: tuple[str, ...] = (
        "id",
        "email",
        "first_name",
        "last_name",
        "full_name",
        "phone",
        "role",
        "is_active",
        "has_active_membership",
        "institution_count",
        "institution_names",
        "created_at",
        "updated_at",
    )

    def rows_for(
        self,
        queryset: QuerySet,
        *,
        policy: UserRedactionPolicy,
        offset: int = 0,
        limit: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """Serialise one window of the directory."""
        window = list(
            queryset[offset : offset + limit]
            if limit is not None
            else queryset[:EXPORT_ROW_LIMIT]
        )
        memberships = (
            self._membership_labels(window) if policy.unrestricted else {}
        )
        rows: list[dict[str, Any]] = []
        for profile in window:
            names = memberships.get(str(profile.pk), [])
            row = {
                "id": str(profile.pk),
                "email": profile.email,
                "first_name": profile.first_name or "",
                "last_name": profile.last_name or "",
                # The one display name, computed in SQL, so the table, the CSV
                # and the dialog title all read the same string.
                "full_name": getattr(profile, "display_name", None) or profile.email,
                "phone": profile.phone or "",
                "role": profile.role,
                # NULL has always meant "may sign in" on this column.
                "is_active": profile.is_active is not False,
                "has_active_membership": bool(
                    getattr(profile, "has_active_membership", False)
                ),
                "institution_count": len(names),
                "institution_names": ", ".join(names),
                "created_at": _iso(profile.created_at),
                "updated_at": _iso(profile.updated_at),
            }
            rows.append(policy.apply(row))
        return rows

    @staticmethod
    def _membership_labels(profiles) -> dict[str, list[str]]:
        """Active school names per account, for the rows in this window."""
        from apps.catalog.models import UserInstitutionMembership

        ids = [str(profile.pk) for profile in profiles]
        if not ids:
            return {}
        result: dict[str, list[str]] = {}
        rows = (
            UserInstitutionMembership.objects.filter(user_id__in=ids, is_active=True)
            .values_list("user_id", "institution__name")
            .order_by("institution__name")
        )
        for user_id, name in rows:
            result.setdefault(str(user_id), []).append(name or "Unassigned")
        return result

    def export_columns(self, policy: UserRedactionPolicy) -> tuple[str, ...]:
        withheld = set(policy.withheld_fields)
        return tuple(column for column in self.ROW_COLUMNS if column not in withheld)

    def export_rows(
        self, queryset: QuerySet, *, policy: UserRedactionPolicy
    ) -> list[dict[str, Any]]:
        """Every row in the filtered set, independent of the requested page.

        An export that only contained the page the operator happened to be
        looking at would be a different document each time it was pressed —
        which is exactly what the browser-side ``UserExport`` produced from its
        ``users`` prop. The result is bounded by :data:`EXPORT_ROW_LIMIT` and
        **refuses** rather than truncates, because a silently short export is
        indistinguishable from a complete one.
        """
        total = queryset.order_by().count()
        if total > EXPORT_ROW_LIMIT:
            raise UserExportTooLarge(total)
        return self.rows_for(queryset, policy=policy, offset=0, limit=EXPORT_ROW_LIMIT)

    # ------------------------------------------------------------------
    # Mutation field contract (R6.2)
    # ------------------------------------------------------------------

    @staticmethod
    def reject_unsupported(payload: Any, supported: frozenset[str]) -> None:
        """Raise :class:`UnsupportedUserField` for any field outside ``supported``.

        This is the whole of ADM-03's second half. The alternative — the
        pre-9.3 behaviour — is a ``200 OK`` that discarded the field, which is
        worse than a 400 because the operator has no way to find out.
        """
        if not isinstance(payload, dict):
            return
        unsupported = {str(key) for key in payload.keys()} - set(supported)
        if unsupported:
            raise UnsupportedUserField(unsupported)


def _facet_label(name: str, raw_value: Any, label_raw: Any) -> str:
    """Human label for a facet option."""
    if name == "is_active":
        if raw_value is False:
            return "Deactivated"
        return "Enabled"
    if raw_value in (None, ""):
        return "Unassigned"
    return str(label_raw)


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
            [
                "" if row.get(column) is None else row.get(column)
                for column in column_list
            ]
        )
    return buffer.getvalue()


__all__ = [
    "CREATE_FIELDS",
    "DEFAULT_SORT",
    "EXPORT_ROW_LIMIT",
    "FACET_LIMIT",
    "IMPORT_MAX_ROWS",
    "IMPORT_ROW_FIELDS",
    "PLATFORM_ONLY_USER_FIELDS",
    "REGISTERED_PARAMETERS",
    "SORT_ALIASES",
    "SORT_FIELDS",
    "STAFF_ROLES",
    "SUPPORTED_ROLES",
    "UPDATE_FIELDS",
    "UnsupportedUserField",
    "UserDirectoryFilters",
    "UserDirectoryQueryService",
    "UserExportTooLarge",
    "UserRedactionPolicy",
    "UserScopeDenied",
    "csv_bytes",
    "email_fingerprint",
    "role_level",
    "split_full_name",
]
