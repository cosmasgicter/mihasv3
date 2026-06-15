"""Definition-of-Done exit gate evaluator (spec ``beanola-production-readiness``, R15).

This is a **pure** aggregation helper — no Django ORM, no I/O, no settings reads.
It models the platform's production-ready exit gate as an **all-or-nothing**
aggregation over the seven Component 1–14 exit conditions (R15.1–R15.7):

1. ``canonical_map_and_allowlist`` — the Canonical_Truth_Map accurately maps every
   domain concept to its single source of truth **and** the Brand_Allowlist
   contains only reviewed, justified single-file exceptions (R15.1).
2. ``brand_scans_clean`` — repository scans prove no non-allowlisted legacy
   branding remains in active runtime source/config (R15.2).
3. ``migrations_applied_with_evidence`` — every tenant migration is applied to
   **staging and production** with validation evidence captured (R15.3).
4. ``endpoints_scoped_and_contract_matches`` — every endpoint that returns tenant
   data is scope-reviewed and covered by a scoped-access test **and** every
   frontend service response shape matches the backend serializers + OpenAPI
   schema (R15.4).
5. ``ui_routes_and_smoke_checks`` — every UI_Route has a mobile-first QA pass at
   every Mobile_Breakpoint **and** every critical workflow has a Smoke_Check or a
   documented manual smoke script (R15.5).
6. ``verification_gate_and_prod_smoke`` — the Verification_Gate (build, lint,
   type-check, backend tests, frontend tests) **and** the production Smoke_Check
   set pass (R15.6).
7. ``ops_and_env_verified`` — monitoring, backups, error reporting, alert email,
   CORS, cookies, and deploy env vars are verified (R15.7).

The gate is ``True`` **iff every** condition is ``True``. If **any** condition is
unmet the platform is **not** production-ready (R15.8).

This module is the *evaluator only*. It deliberately does not decide whether each
condition is met (that is the human/operator + CI evidence judgement captured by
the audits) and it does not flip ``.config.kiro`` to ``"status": "completed"`` —
that operator-gated marker is owned by the production rollout step (task 31.2).

**Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
"""

from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Dict, Tuple

__all__ = [
    "DefinitionOfDoneConditions",
    "DEFINITION_OF_DONE_REQUIREMENTS",
    "evaluate_definition_of_done",
    "unmet_conditions",
]


# Maps each condition field to the acceptance-criterion id it encodes (R15.1–R15.7).
# Ordering mirrors the Component 1–14 exit-condition order in design Component 15.
DEFINITION_OF_DONE_REQUIREMENTS: Dict[str, str] = {
    "canonical_map_and_allowlist": "15.1",
    "brand_scans_clean": "15.2",
    "migrations_applied_with_evidence": "15.3",
    "endpoints_scoped_and_contract_matches": "15.4",
    "ui_routes_and_smoke_checks": "15.5",
    "verification_gate_and_prod_smoke": "15.6",
    "ops_and_env_verified": "15.7",
}


@dataclass(frozen=True)
class DefinitionOfDoneConditions:
    """The seven Definition_of_Done exit conditions as booleans (R15.1–R15.7).

    Every field defaults to ``False`` so an unspecified condition can never be
    silently treated as satisfied — production-ready must be earned explicitly.
    """

    # R15.1 — Canonical_Truth_Map accurate + Brand_Allowlist reviewed.
    canonical_map_and_allowlist: bool = False
    # R15.2 — Repository brand scans clean (no non-allowlisted legacy branding).
    brand_scans_clean: bool = False
    # R15.3 — Tenant migrations applied to staging AND production with evidence.
    migrations_applied_with_evidence: bool = False
    # R15.4 — Every tenant-data endpoint scope-reviewed + scoped-tested AND every
    #          frontend service shape matches the serializers/OpenAPI.
    endpoints_scoped_and_contract_matches: bool = False
    # R15.5 — Every UI_Route passed at every Mobile_Breakpoint + a Smoke_Check per
    #          critical workflow.
    ui_routes_and_smoke_checks: bool = False
    # R15.6 — Verification_Gate + production Smoke_Check set pass.
    verification_gate_and_prod_smoke: bool = False
    # R15.7 — Monitoring/backups/error-reporting/alert-email/CORS/cookies/env verified.
    ops_and_env_verified: bool = False


def evaluate_definition_of_done(conditions: DefinitionOfDoneConditions) -> bool:
    """Return the production-ready gate result for the given conditions.

    The gate is ``True`` **if and only if** every Component 1–14 exit condition
    (R15.1–R15.7) holds. If any single condition is unmet the gate is ``False``
    and the platform is not production-ready (R15.8).
    """
    return all(
        bool(getattr(conditions, field.name)) for field in fields(conditions)
    )


def unmet_conditions(conditions: DefinitionOfDoneConditions) -> Tuple[str, ...]:
    """Return the field names of the conditions that are not yet satisfied.

    Useful for diagnostics: when the gate is ``False`` this names exactly which
    Component 1–14 exit conditions are blocking production-ready. When the gate
    is ``True`` this is empty.
    """
    return tuple(
        field.name
        for field in fields(conditions)
        if not bool(getattr(conditions, field.name))
    )
