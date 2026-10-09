"""M11 probe — task 2.2's conformance evaluation, with the FULL non-conformant list.

``tests/property/test_authority_matrix_generated.py`` evaluates every case of the
frozen task-2.1 case matrix but records only the first 40 non-conformant cases.
This probe reuses that module's own fixtures and its own ``_evaluate_case`` (no
re-implementation) and writes every non-conformant case to
``../42-authority-nonconformant-full.json`` so the population can be read whole.
"""
from __future__ import annotations

import json
from pathlib import Path

from tests.property.test_authority_matrix_generated import (  # noqa: F401  (fixtures)
    ENDPOINTS,
    TestAuthorityConformanceSummary,
    production_scope,
    world,
)

OUT = Path(__file__).resolve().parent.parent / "42-authority-nonconformant-full.json"


def test_dump_full_nonconformant_population(world):  # noqa: F811
    evaluator = TestAuthorityConformanceSummary()
    total = 0
    failures = []
    for ep in ENDPOINTS:
        for case in ep["cases"]:
            ok, _hard, detail = evaluator._evaluate_case(world, ep, case)
            total += 1
            if not ok:
                failures.append(detail)
    OUT.write_text(
        json.dumps({"total_cases": total, "nonconformant": len(failures), "cases": failures}, indent=1)
        + "\n",
        encoding="utf-8",
    )
    assert total == 1940
