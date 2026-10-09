"""In-suite gate for the task-8.1 source scan.

The scan (``backend/scripts/scan_client_money_authority.py``) is the executable
evidence that the client holds no money authority and no provider routing:

* no fee arithmetic (the retired 1% ``TRANSACTION_FEE_RATE``),
* no hardcoded application-fee claim (the retired ``K150`` / ``USD 20``),
* no invented default amount on a payment surface,
* no second client fee surface beside the server quote,
* no server-side default fee and no display-name fee lookup.

Running it from the suite means a reintroduction fails CI, not just a manual
review. **Validates: Requirements R12.1, R12.2** — findings STU-08, DATA-05.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "scan_client_money_authority.py"


def _run_scan() -> tuple[int, dict]:
    process = subprocess.run(
        [sys.executable, str(SCRIPT), "--json"],
        capture_output=True,
        text=True,
        timeout=300,
    )
    return process.returncode, json.loads(process.stdout)


def test_client_holds_no_money_or_provider_authority():
    exit_code, report = _run_scan()

    banned = [
        f"{match['rule_id']} {match['path']}:{match['line_number']}: {match['line']}"
        for rule in report["rules"]
        for match in rule["matches"]
        if not match["allowed"]
    ]

    assert banned == [], "banned money/provider patterns reappeared:\n" + "\n".join(banned)
    assert report["violations"] == 0
    assert report["ok"] is True
    assert exit_code == 0


def test_every_scan_rule_is_still_registered():
    """The guard is only as good as its rule set — pin the rules that must exist."""
    _, report = _run_scan()
    rule_ids = {rule["rule_id"] for rule in report["rules"]}

    assert {
        "FE-FEE-ARITHMETIC",
        "FE-HARDCODED-FEE-CLAIM",
        "FE-INVENTED-DEFAULT-AMOUNT",
        "FE-PROVIDER-GUESS",
        "FE-CLIENT-FEE-RESOLVER",
        "BE-DEFAULT-FEE",
        "BE-NAME-FEE-LOOKUP",
    } <= rule_ids


def test_allowances_all_state_a_reason():
    """An allowance without a reason is a silent hole in the guard."""
    _, report = _run_scan()
    for rule in report["rules"]:
        for path, reason in rule["allowances"].items():
            assert reason and len(reason) > 20, (
                f"allowance {path} on {rule['rule_id']} needs a stated reason"
            )
