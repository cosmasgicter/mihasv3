"""Canonical-id reads of an application's own catalog rows (remediation L1).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/``
Requirements: **R7.6, R10.6, R4.4, R14.3**
Findings:     **DATA-01, STU-01** (both P0), via **GATE-13.2-01** /
              **GATE-13.5-02** — remediation item **L1** of
              ``docs/v2-evidence/13.6/README.md`` §8.1.

Why this module exists
----------------------
Five admissions reads resolved a canonical catalog row from an application's
**display snapshot string** instead of from the canonical id the application
already carries::

    Intake.objects.filter(name=app.intake, is_active=True).first()   # WRONG

``docs/canonical-truth-map.md`` is explicit that ``applications.institution /
program / intake`` are *display snapshots only* and that the canonical IDs
(``institution_id``, ``program_id``, ``program_offering_id``, ``intake_id``) are
the sole authority for routing, scoping and tagging. A name-keyed lookup has no
ordering, so when two tenants share an intake **name** the row Postgres happens
to yield first wins — and a staff read publishes *that* tenant's capacity on
*this* tenant's application. Task 13.5 preflight gate 21 measured **3 intake
names shared across the 2 active institutions** on the restored
production-lineage snapshot, so the collision is present in production data.

The two rules this module encodes, once
--------------------------------------
1. **Resolve through the canonical id, never the display string.** The
   application row is the authority; these helpers only ever key on
   ``intake_ref_id`` / ``program_offering_id``.
2. **Fail closed.** When the canonical id is absent (a legacy pre-5.2 row), the
   answer is ``None`` / ``{}`` — *not* a name lookup. Silence is correct;
   another tenant's number is not. This is why
   :func:`intake_capacity_fields` returns an empty mapping rather than a
   partially-populated one.

Scope-before-lookup
-------------------
These helpers are deliberately **not** an authorization seam and must not be
used as one. Every caller resolves the application itself through the module's
existing tenant authority seam *first* —
:func:`apps.common.tenant_authorization.resolve_scoped_application` or
``AccessScopeService().filter_applications`` — so by the time a helper here
runs, the application is already proven in-scope for the actor
(``.kiro/steering/enterprise-tenancy.md``, "Scope before lookup"). The lookup is
then keyed on *that* scoped row's own canonical id, which is why it cannot reach
another tenant: there is no name to collide on.
"""

from __future__ import annotations

import uuid as _uuid
from typing import Any, Optional

__all__ = [
    "canonical_intake_id",
    "canonical_offering_id",
    "resolve_intake",
    "resolve_offering",
    "intake_capacity_fields",
]


def _coerce_uuid(value: Any) -> Optional[str]:
    """Return the canonical string form of *value* iff it is a real UUID.

    Mirrors ``apps.applications.services._coerce_uuid`` and
    ``apps.applications.capacity_service._coerce_uuid``: ``None`` for empty /
    non-UUID / non-string inputs (including ``MagicMock`` attributes in unit
    tests), so a legacy row with null canonical IDs fails closed here instead of
    reaching a name lookup.
    """
    try:
        return str(_uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def canonical_intake_id(application: Any) -> Optional[str]:
    """The application's own canonical intake id, or ``None`` for a legacy row."""
    return _coerce_uuid(getattr(application, "intake_ref_id", None))


def canonical_offering_id(application: Any) -> Optional[str]:
    """The application's own canonical offering id, or ``None`` for a legacy row."""
    return _coerce_uuid(getattr(application, "program_offering_id", None))


def resolve_intake(application: Any, *, require_active: bool = False):
    """Return the ``Intake`` this application is bound to, keyed on its canonical id.

    Returns ``None`` when the application carries no canonical intake id, so a
    caller cannot accidentally fall back to a display-name lookup.

    ``require_active`` preserves each call site's original ``is_active=True``
    predicate. On a canonical-id lookup the flag is no longer a disambiguator
    (there is exactly one row) but a lifecycle filter, and dropping it would be
    a behaviour change beyond this remediation: a deactivated intake keeps
    yielding ``None`` exactly as it did before.
    """
    intake_id = canonical_intake_id(application)
    if intake_id is None:
        return None
    from apps.catalog.models import Intake

    queryset = Intake.objects.filter(id=intake_id)
    if require_active:
        queryset = queryset.filter(is_active=True)
    return queryset.first()


def resolve_offering(application: Any, *, require_active: bool = False):
    """Return the ``Program`` (Institution_Program_Offering) this application is bound to.

    Keyed on ``program_offering_id`` — the tenant-scoped offering, not the
    global ``CanonicalProgram`` and not the ``program`` display snapshot.
    Returns ``None`` when the canonical offering id is absent.
    """
    offering_id = canonical_offering_id(application)
    if offering_id is None:
        return None
    from apps.catalog.models import Program

    queryset = Program.objects.filter(id=offering_id)
    if require_active:
        queryset = queryset.filter(is_active=True)
    return queryset.first()


def intake_capacity_fields(application: Any) -> dict[str, Any]:
    """The capacity/enrollment pair a staff read may publish for *application*.

    Returns ``{"intake_capacity": ..., "intake_enrollment": ...}`` resolved from
    the application's **own** canonical intake, or an **empty mapping** when
    there is no canonical intake id or the intake row is absent/inactive.

    The empty mapping is the fail-closed contract: an application with no
    canonical intake id publishes *no* capacity rather than a same-name other
    tenant's capacity (DATA-01 / STU-01). Callers merge the result, so the keys
    are simply absent from the payload — never present-but-wrong.
    """
    intake = resolve_intake(application, require_active=True)
    if intake is None:
        return {}
    return {
        "intake_capacity": intake.max_capacity,
        "intake_enrollment": intake.current_enrollment,
    }
