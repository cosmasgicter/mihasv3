"""Executable source scan — the client owns no money and no provider routing.

Admissions-v2 task **8.1** (R12.1, R12.2, R12.6; findings **STU-08**, **DATA-05**).

Task 8.1 deletes three client-side authorities that were never the client's to
hold:

1. **fee arithmetic** — ``PaymentForm.tsx`` and ``PaymentStep.tsx`` multiplied the
   resolved fee by ``1 + 0.01`` and rendered the product as "Total charged";
2. **hardcoded / empty-state amounts** — a ``K150 / USD 20`` fallback shown when
   the app had no data, plus a program-level default on the server side;
3. **provider network guessing** — a client MSISDN-prefix classifier that mapped
   a number to Airtel/MTN and *defaulted anything else to Airtel*.

A grep is only evidence if it is repeatable, so this is a committed script with an
exit code rather than a pasted terminal buffer. It fails (exit 1) if any banned
pattern reappears in the scanned source, and prints a per-rule report either way.

Usage (from ``backend/``)::

    python3 scripts/scan_client_money_authority.py            # human report
    python3 scripts/scan_client_money_authority.py --json     # machine report

Scope: ``apps/admissions/src`` (the client) plus the backend fee/payment modules,
excluding build output, dependencies, and this script's own documentation of the
patterns it bans.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC = REPO_ROOT / "apps" / "admissions" / "src"
BACKEND_APPS = REPO_ROOT / "backend" / "apps"

FRONTEND_SUFFIXES = {".ts", ".tsx"}
BACKEND_SUFFIXES = {".py"}

#: The student payment surfaces 8.1 owns: where money is quoted, rendered, and
#: charged. Kept explicit so widening the guard is a visible decision.
PAYMENT_SURFACES = (
    FRONTEND_SRC / "components" / "student",
    FRONTEND_SRC / "hooks",
    FRONTEND_SRC / "lib",
    FRONTEND_SRC / "pages" / "student",
    FRONTEND_SRC / "services",
)

# Files whose *purpose* is to name the banned patterns (this scanner). Excluded so
# the evidence does not fail on its own prose.
SELF_REFERENTIAL = {
    "backend/scripts/scan_client_money_authority.py",
}

# Comment prefixes stripped before matching, per language. A rule must fire on
# executable code, not on a docstring that documents the pattern it removed —
# otherwise the only way to describe the fix is to fail the guard.
_TS_COMMENT = re.compile(r"(^\s*(//|\*|/\*).*$)|(//.*$)")
_PY_COMMENT = re.compile(r"(^\s*#.*$)|(#.*$)")


def _strip_comment(line: str, suffix: str) -> str:
    """Return *line* with its trailing/leading comment removed."""
    if suffix in FRONTEND_SUFFIXES:
        return _TS_COMMENT.sub("", line)
    return _PY_COMMENT.sub("", line)


@dataclass
class Rule:
    """One banned pattern, with the finding it closes."""

    rule_id: str
    what: str
    why: str
    pattern: str
    roots: tuple[Path, ...]
    suffixes: frozenset[str]
    #: Paths (repo-relative, prefix match) that are allowed to match — each needs a
    #: stated reason, so an allowance can never be added silently.
    allowances: dict[str, str] = field(default_factory=dict)


RULES: tuple[Rule, ...] = (
    Rule(
        rule_id="FE-FEE-ARITHMETIC",
        what="Client-side fee arithmetic on a money value",
        why=(
            "STU-08: the payment UI multiplied the fee by 1.01 and displayed the "
            "product. Amounts are server-authored (R12.1)."
        ),
        # A percentage rate constant, or a multiplication/division applied to an
        # amount-shaped identifier.
        pattern=(
            r"TRANSACTION_FEE_RATE"
            r"|FEE_RATE\s*="
            r"|\b(amount|fee|total|base_amount|provider_fee|total_amount)\s*[*/]\s*\(?\s*[\d.]"
            r"|\b1\s*\+\s*[A-Z_]*FEE"
        ),
        roots=(FRONTEND_SRC,),
        suffixes=frozenset(FRONTEND_SUFFIXES),
    ),
    Rule(
        rule_id="FE-HARDCODED-FEE-CLAIM",
        what="A hardcoded application-fee amount stated anywhere in the client",
        why=(
            "STU-08: the app asserted a K150 / USD 20 application fee — in the "
            "payment empty state and in landing copy — which is wrong for any "
            "offering priced differently and for every other tenant. The amount is "
            "quoted by the server (R12.1)."
        ),
        pattern=r"\bK150\b|\bK150\.00\b|USD\s?20\b|\bUSD20\b",
        roots=(FRONTEND_SRC,),
        suffixes=frozenset(FRONTEND_SUFFIXES),
        allowances={
            # Currency/PDF formatting fixtures use K150.00 as a *sample* value; they
            # assert formatting, and state no fee for any offering.
            "apps/admissions/src/lib/pdf/": (
                "PDF layout sample value, not a fee claim for an offering"
            ),
        },
    ),
    Rule(
        rule_id="FE-INVENTED-DEFAULT-AMOUNT",
        what="An invented default amount on a money field in a payment surface",
        why=(
            "R12.2: a missing amount is missing, not zero and not a constant. The "
            "payment UI shows the server's reason instead."
        ),
        pattern=(
            r"(application_fee|paid_amount|amount|total|fee)\s*(\?\?|\|\|)\s*['\"]?[0-9]"
        ),
        roots=PAYMENT_SURFACES,
        suffixes=frozenset(FRONTEND_SUFFIXES),
        allowances={
            # Admin list mapping of the legacy applications.application_fee column.
            # Owned by the admin applications-query task (9.1/9.3) and the legacy
            # column contraction (docs/runbooks/legacy-column-deprecation.md), not
            # by the student payment authority this task closes.
            "apps/admissions/src/hooks/admin/": (
                "admin legacy-column mapping — owned by task 9.1/9.3, outside the "
                "student payment authority"
            ),
        },
    ),
    Rule(
        rule_id="FE-PROVIDER-GUESS",
        what="Client-side mobile-money network inference",
        why=(
            "Design §10.2: provider phone/network routing is server-authored. The "
            "removed classifier also defaulted unknown prefixes to Airtel."
        ),
        pattern=(
            r"detectOperator"
            r"|MomoOperator"
            r"|'airtel'\s*:\s*'mtn'"
            r"|operator\s*[:=]\s*['\"](airtel|mtn)['\"]"
        ),
        roots=(FRONTEND_SRC,),
        suffixes=frozenset(FRONTEND_SUFFIXES),
        allowances={
            # Format-only validation and display copy are not routing decisions.
            "apps/admissions/src/lib/zambianMsisdn.ts": (
                "MSISDN format validation only — documents that it performs no "
                "operator inference"
            ),
        },
    ),
    Rule(
        rule_id="FE-CLIENT-FEE-RESOLVER",
        what="A second client money surface besides the server quote",
        why=(
            "R12.1: the payment UI reads one server-authored quote. The retired "
            "useFeeResolver hook was a non-binding parallel amount."
        ),
        pattern=r"useFeeResolver",
        roots=(FRONTEND_SRC,),
        suffixes=frozenset(FRONTEND_SUFFIXES),
    ),
    Rule(
        rule_id="BE-DEFAULT-FEE",
        what="Server-side default/fallback fee amount",
        why=(
            "DATA-05: fee lookup fell back to an invented program-level default. "
            "Resolution fails closed with FEE_NOT_CONFIGURED (R12.2)."
        ),
        pattern=(
            r"_DEFAULT_APPLICATION_FEE"
            r"|program_default"
            r"|DEFAULT_FEE\s*="
            r"|Decimal\(['\"]150(\.00)?['\"]\)\s*(#.*)?$"
        ),
        roots=(BACKEND_APPS,),
        suffixes=frozenset(BACKEND_SUFFIXES),
    ),
    Rule(
        rule_id="BE-NAME-FEE-LOOKUP",
        what="Fee/offering lookup by display name",
        why=(
            "DATA-05: a display-name lookup can resolve another tenant's "
            "same-named offering. Canonical id/code only (R7.7)."
        ),
        pattern=r"objects\.get\(name=|filter\(name=.*program",
        roots=(BACKEND_APPS / "documents",),
        suffixes=frozenset(BACKEND_SUFFIXES),
    ),
)


@dataclass
class Match:
    rule_id: str
    path: str
    line_number: int
    line: str
    allowed: bool
    allowance_reason: str | None


def _iter_files(root: Path, suffixes: frozenset[str]):
    if not root.exists():
        return
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in suffixes:
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()
        if rel in SELF_REFERENTIAL:
            continue
        if "/node_modules/" in rel or "/dist/" in rel or "/__pycache__/" in rel:
            continue
        yield path, rel


def _scan_rule(rule: Rule) -> list[Match]:
    regex = re.compile(rule.pattern, re.MULTILINE)
    matches: list[Match] = []
    for root in rule.roots:
        for path, rel in _iter_files(root, rule.suffixes):
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for number, raw_line in enumerate(text.splitlines(), start=1):
                line = _strip_comment(raw_line, path.suffix)
                if not line.strip() or not regex.search(line):
                    continue
                allowance = next(
                    (
                        reason
                        for prefix, reason in rule.allowances.items()
                        if rel.startswith(prefix)
                    ),
                    None,
                )
                matches.append(
                    Match(
                        rule_id=rule.rule_id,
                        path=rel,
                        line_number=number,
                        line=line.strip()[:200],
                        allowed=allowance is not None,
                        allowance_reason=allowance,
                    )
                )
    return matches


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit a JSON report")
    args = parser.parse_args()

    results: dict[str, list[Match]] = {}
    violations = 0
    for rule in RULES:
        found = _scan_rule(rule)
        results[rule.rule_id] = found
        violations += sum(1 for m in found if not m.allowed)

    if args.json:
        payload = {
            "scanned_roots": [
                p.relative_to(REPO_ROOT).as_posix()
                for rule in RULES
                for p in rule.roots
            ],
            "rules": [
                {
                    "rule_id": rule.rule_id,
                    "what": rule.what,
                    "why": rule.why,
                    "pattern": rule.pattern,
                    "allowances": rule.allowances,
                    "matches": [asdict(m) for m in results[rule.rule_id]],
                }
                for rule in RULES
            ],
            "violations": violations,
            "ok": violations == 0,
        }
        print(json.dumps(payload, indent=2))
        return 0 if violations == 0 else 1

    print("Task 8.1 source scan — client money/provider authority")
    print("=" * 70)
    for rule in RULES:
        found = results[rule.rule_id]
        banned = [m for m in found if not m.allowed]
        allowed = [m for m in found if m.allowed]
        status = "CLEAN" if not banned else f"{len(banned)} VIOLATION(S)"
        print(f"\n[{rule.rule_id}] {rule.what}: {status}")
        print(f"  why:     {rule.why}")
        print(f"  pattern: {rule.pattern}")
        roots = ", ".join(p.relative_to(REPO_ROOT).as_posix() for p in rule.roots)
        print(f"  scope:   {roots}")
        for match in banned:
            print(f"  VIOLATION {match.path}:{match.line_number}: {match.line}")
        for match in allowed:
            print(
                f"  allowed  {match.path}:{match.line_number}"
                f" — {match.allowance_reason}"
            )

    print("\n" + "=" * 70)
    if violations:
        print(f"FAIL — {violations} banned pattern(s) present.")
        return 1
    print("PASS — no client-side fee arithmetic, hardcoded amount, or provider guess.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
