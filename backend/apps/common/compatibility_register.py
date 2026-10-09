"""The external-compatibility register — every V1 surface kept past cutover.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task **12.2**
Requirements: **R2.5** (API major metadata stays distinct from product version),
**R2.6** (a breaking public contract change is either exposed under ``/api/v2/``
or gets a **measured deprecation window** on ``/api/v1/`` first), **R14.5**
(permissive normalizers and legacy request aliases are deleted after cutover,
not retained indefinitely), **R14.7** (breaking removals expose deprecation /
usage telemetry until their **exit criteria** are met).
Findings: **API-02**, **API-04**, **REL-01**.

Why this file exists
--------------------
Task 12.2's own bullet ends with a hard constraint: *"Keep documented external
compatibility until its announced end date."* That sentence is unfalsifiable when
no end date was ever announced. Before this file, the platform had three
different answers to "when does this go away":

* the notification aliases had a real one — RFC 8594 ``Sunset``, defaulting to
  ``Thu, 08 Nov 2026`` and overridable by a setting
  (``apps/common/notification_views.py``);
* the legacy columns had a real one — ``SUNSET_DATE = "2026-08-15"`` with a
  runbook and a drop script (``apps/common/legacy_columns.py``);
* the **frozen legacy catalog write routes** and the **deprecated
  condition-verify route** had ``Deprecation: true`` and a successor ``Link`` and
  **no date at all**. Task 5.1 froze the catalog writes and wrote "Phase 12.2
  removes them"; task 10.6 deprecated ``/verify/`` and wrote that its removal
  "needs a window that starts with this task's measurement". Neither window had
  an end.

A compatibility surface whose end date nobody ever set is not compatibility, it
is the debt this task exists to stop. So each such surface is registered here
with an **owner**, an **announced end date**, and its **exit criteria** — which
is exactly the shape task 12.5 audits ("a registered Legacy_Exception with
owner/removal date"). The dates are *announced*, not applied: nothing in this
module removes anything. It is the register, and ``Sunset`` makes it observable
to a caller instead of only to us.

What is deliberately NOT here
-----------------------------
A surface with **zero** first-party callers and **no** published contract is not
a compatibility surface — it is dead code, and task 12.2 deleted it rather than
registering it. The permissive envelope/list normalizers are the whole example:
they were private frontend functions, no external consumer could observe them,
so they needed no window. See ``scripts/v1_surface_telemetry.py``.

Task 12.3 — the ``kind="column"`` entries
-----------------------------------------
Task 12.3 added the first three column entries. They are here for two different
reasons, and the distinction is the one this register exists to keep straight:

* ``applications.payment_verified_at`` / ``payment_verified_by`` are **published
  surface**. They are live Django model fields, they appear on two serializers as
  four response fields, they are in ``apps/admissions/src/generated/api.d.ts``,
  and a student-facing component renders one of them. R2.6 gives that a measured
  window, never a silent removal.
* ``applications.prelenco_payment_columns`` is the opposite case: **source-clean
  but data-blocked**. Nothing in the platform references those seven columns and
  the published contract does not depend on them, so by 12.2's rule they would be
  dead code to delete. They are registered anyway, because 16 applications still
  hold a payment amount, date or reference in them with no ``payments`` row
  behind it — the column is the only surviving record. A window here is not
  compatibility for a caller; it is a promise about **data** that has an owner and
  a date, so it cannot quietly become permanent.

That second case widens what this register is for, deliberately. Task 12.5 audits
it, and an entry whose blocker is data rather than callers still needs to be
audited by someone.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone


def _http_date(iso: str) -> str:
    """Render ``YYYY-MM-DD`` as an RFC 8594 / RFC 7231 IMF-fixdate for ``Sunset``."""
    d = date.fromisoformat(iso)
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc).strftime(
        "%a, %d %b %Y %H:%M:%S GMT"
    )


@dataclass(frozen=True)
class CompatibilitySurface:
    """One V1 surface kept past cutover, with an owner and an end date.

    ``end_date`` is the **announced** removal date in ISO form. It is published
    to callers as an RFC 8594 ``Sunset`` header by whichever view serves the
    surface, so a caller can discover it without reading this file.
    """

    id: str
    surface: str
    kind: str  # "route" | "alias" | "column"
    owner: str
    announced_on: str  # ISO date the window was announced
    end_date: str  # ISO date the window closes
    successor: str
    exit_criteria: str
    measured_zero_first_party: str  # which task measured it, and where

    @property
    def sunset_http_date(self) -> str:
        return _http_date(self.end_date)


#: The window length used for every surface registered by task 12.2.
#:
#: 180 days from the announcement, matching the notification aliases' own
#: 6-month window (``apps/common/notification_views.py``) rather than inventing a
#: third convention. Long enough that a school's integration has a release cycle
#: to move in; short enough to be a window rather than a permanent exemption.
COMPATIBILITY_WINDOW_DAYS = 180

#: The date task 12.2 announced these windows.
ANNOUNCED_ON = "2026-08-11"

#: 2026-08-11 + 180 days.
_END_DATE_12_2 = "2027-02-07"


COMPATIBILITY_SURFACES: dict[str, CompatibilitySurface] = {
    s.id: s
    for s in (
        CompatibilitySurface(
            id="catalog.legacy_institution_write",
            surface="POST/PATCH/DELETE /api/v1/catalog/institutions/[{id}/]",
            kind="route",
            owner="platform-admissions",
            announced_on=ANNOUNCED_ON,
            end_date=_END_DATE_12_2,
            successor="/api/v1/admin/institutions/[{id}/]",
            exit_criteria=(
                "catalog.legacy_write{resource=institution} reports zero hits from "
                "caller=first_party AND caller=external for one full window"
            ),
            measured_zero_first_party=(
                "task 5.1 (frontend cutover), re-measured by task 12.2 — "
                "scripts/v1_surface_telemetry.py surface "
                "route.catalog.legacy_institution_write: 0 production callers"
            ),
        ),
        CompatibilitySurface(
            id="catalog.legacy_intake_write",
            surface="POST/PATCH/DELETE /api/v1/catalog/intakes/[{id}/]",
            kind="route",
            owner="platform-admissions",
            announced_on=ANNOUNCED_ON,
            end_date=_END_DATE_12_2,
            successor="/api/v1/admin/intakes/[{id}/]",
            exit_criteria=(
                "catalog.legacy_write{resource=intake} reports zero hits from "
                "caller=first_party AND caller=external for one full window"
            ),
            measured_zero_first_party=(
                "task 5.1, re-measured by task 12.2 — "
                "route.catalog.legacy_intake_write: 0 production callers"
            ),
        ),
        CompatibilitySurface(
            id="catalog.legacy_program_write",
            surface="PATCH/DELETE /api/v1/catalog/programs/{id}/",
            kind="route",
            owner="platform-admissions",
            announced_on=ANNOUNCED_ON,
            end_date=_END_DATE_12_2,
            successor="/api/v1/admin/institutions/{institution_id}/programs/{id}/",
            exit_criteria=(
                "catalog.legacy_write{resource=program} reports zero hits from "
                "caller=first_party AND caller=external for one full window. "
                "NOTE: POST /api/v1/catalog/programs/ is NOT in this window — it "
                "is the CANONICAL offering-create path (R7.1) and stays."
            ),
            measured_zero_first_party=(
                "task 5.1, re-measured by task 12.2 — "
                "route.catalog.legacy_program_write: 0 production callers"
            ),
        ),
        # -- task 12.3: the legacy columns whose contraction is blocked -------
        #
        # These are the FIRST ``kind="column"`` entries. The dataclass has
        # anticipated them since task 12.2; task 12.3 measured which columns
        # actually needed one.
        #
        # Both carry a REVISED end date. Their previously announced date was
        # ``legacy_columns.SUNSET_DATE = "2026-08-15"``, and task 12.3 measured on
        # 2026-08-11 that it could not be met (docs/v2-evidence/12.3/README.md
        # §3). Revising an announced date is a commitment change and is recorded
        # as one: the original was announced in a runbook and a drop script, the
        # runbook's own Day-60 entry states that no human notification of it was
        # ever proven to have been sent, and no ``Sunset`` header ever carried it
        # to a caller. So it was an internal target, not a published promise —
        # which is why moving it is defensible and why it is being moved ONCE,
        # onto the same 2027-02-07 window every other V1 surface already uses,
        # rather than onto a third new date.
        CompatibilitySurface(
            id="applications.payment_verified_at",
            surface="applications.payment_verified_at (column; API field payment_verified_at)",
            kind="column",
            owner="platform-admissions",
            announced_on=ANNOUNCED_ON,
            end_date=_END_DATE_12_2,
            successor="payments.verified_at",
            exit_criteria=(
                "ALL of: (1) the field is removed from ApplicationSerializer and "
                "AdminApplicationDetailSerializer and from "
                "apps/admissions/src/generated/api.d.ts; (2) the model field is "
                "removed from Application so the ORM stops naming the column in "
                "every default SELECT; (3) the dev-bypass fallback write in "
                "apps/documents/payment_widget_views.py is removed; (4) "
                "ApplicationDetailsSection.tsx reads the verification time from the "
                "payments ledger; (5) the four database gates in "
                "docs/v2-evidence/12.3/invariants.sql read zero. Then promote "
                "backend/scripts/future/legacy_columns_contract_2026_08_15.sql."
            ),
            measured_zero_first_party=(
                "NOT zero, and that is why it is registered rather than dropped — "
                "task 12.3, scripts/v1_surface_telemetry.py --columns: 8 production "
                "references and 3 hits in the generated OpenAPI contract. It is a "
                "published response field with a live student-facing consumer, so "
                "R2.6 requires a measured window, not a removal."
            ),
        ),
        CompatibilitySurface(
            id="applications.payment_verified_by",
            surface="applications.payment_verified_by (column; API fields payment_verified_by / _name / _email)",
            kind="column",
            owner="platform-admissions",
            announced_on=ANNOUNCED_ON,
            end_date=_END_DATE_12_2,
            successor="payments.verified_by_id (and audit_logs for the actor trail)",
            exit_criteria=(
                "As applications.payment_verified_at, plus: the three derived API "
                "fields (payment_verified_by, payment_verified_by_name, "
                "payment_verified_by_email) are re-sourced from payments.verified_by, "
                "and the three select_related('payment_verified_by') call sites in "
                "admin_review_views.py and student_draft_views.py are repointed. "
                "Dropping the column while the ForeignKey is declared would break "
                "every Application query in the platform, not just this field."
            ),
            measured_zero_first_party=(
                "NOT zero — task 12.3: 14 production references and 2 hits in the "
                "generated OpenAPI contract."
            ),
        ),
        CompatibilitySurface(
            id="applications.prelenco_payment_columns",
            surface=(
                "applications.payment_method / payer_name / payer_phone / amount / "
                "paid_at / momo_ref / pop_url (7 ORM-unmapped columns)"
            ),
            kind="column",
            owner="platform-admissions",
            announced_on=ANNOUNCED_ON,
            end_date=_END_DATE_12_2,
            successor=(
                "payments.payment_method / metadata (redacted) / phone_hash + "
                "phone_last4 / amount / verified_at / transaction_reference / none"
            ),
            exit_criteria=(
                "The pre-Lenco cohort is represented in the canonical ledger. Task "
                "12.3 measured 18 applications still carrying legacy payment values, "
                "17 of them with NO payments row and 16 carrying a money fact "
                "(amount / paid_at / momo_ref) recorded nowhere else — so for those "
                "rows the column IS the record and DROP COLUMN is destruction, not "
                "contraction. Exit when Gate 1b of docs/v2-evidence/12.3/invariants.sql "
                "reports unbacked_money_rows = 0, by backfilling or quarantining that "
                "cohort into payments (the reverse-orphan direction task 3.5 named and "
                "deliberately left: docs/v2-evidence/3.5/README.md). Authoring 16 "
                "historical ledger rows is an owner's judgement about applicant "
                "financial records, not a mechanical migration."
            ),
            measured_zero_first_party=(
                "ZERO, on source — task 12.3, scripts/v1_surface_telemetry.py "
                "--columns: 0 production references on all seven, none ORM-mapped, and "
                "the identically named API fields (payment_method / paid_at / "
                "paid_amount) are SerializerMethodFields sourced from the payments "
                "ledger, so the published contract does not move when these go. Source "
                "is clean; the DATABASE gate is what blocks them."
            ),
        ),
        CompatibilitySurface(
            id="applications.condition_verify",
            surface="POST /api/v1/applications/{id}/conditions/{condition_id}/verify/",
            kind="route",
            owner="platform-admissions",
            announced_on=ANNOUNCED_ON,
            end_date=_END_DATE_12_2,
            successor="POST /api/v1/applications/{id}/conditions/{condition_id}/review/",
            exit_criteria=(
                "zero hits for one full window. The route already decides nothing "
                "of its own — task 10.6 made it normalise its two-outcome request "
                "and call the one condition_evidence_service.review_condition — so "
                "removal deletes a front door, not a behaviour."
            ),
            measured_zero_first_party=(
                "task 10.6 measured zero for the FIRST time (which is why it was "
                "deprecated, not deleted); task 12.2 is the second reading — "
                "route.applications.condition_verify: 0 production callers"
            ),
        ),
    )
}


def sunset_for(surface_id: str) -> str:
    """The RFC 8594 ``Sunset`` header value for a registered surface.

    Raises ``KeyError`` for an unregistered id — deliberately. A view that stamps
    a ``Sunset`` it did not register would put a date in front of a caller that
    nothing audits, which is worse than no date.
    """
    return COMPATIBILITY_SURFACES[surface_id].sunset_http_date


__all__ = [
    "ANNOUNCED_ON",
    "COMPATIBILITY_SURFACES",
    "COMPATIBILITY_WINDOW_DAYS",
    "CompatibilitySurface",
    "sunset_for",
]
