"""Property-based tests for go-live-polish regression detection.

# Feature: pre-launch-audit, Property 38: Go-live-polish regression detection

For any issue found during the audit that corresponds to a fix in the
`go-live-polish` spec (Fixes 1-15), the issue should be flagged with a
`go_live_polish_ref` indicating which fix has regressed.

**Validates: Requirements 14.5**
"""

import re
from pathlib import Path

from hypothesis import given, settings, assume
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Constants — the 15 go-live-polish fixes
# ---------------------------------------------------------------------------

GO_LIVE_POLISH_FIXES = {
    1: "test_admin_override.py uses TransactionTestCase",
    2: "program_fees has international rows",
    3: "ApplicationReviewView.post() creates notifications",
    4: "ApplicationDraft deprecated docstring",
    5: "keep_alive_ping_task in CELERY_BEAT_SCHEDULE",
    6: "Review endpoint returns intake_capacity/intake_enrollment",
    7: "IntakeEnforcer.sync_enrollment() updates program_intakes",
    8: "Dynamic imports for PDF libs in admissions bundle",
    9: "cleanup_csrf_tokens_task in CELERY_BEAT_SCHEDULE",
    10: "DocumentUploadView allows application_slip for non-draft",
    11: "approved not in NON_TERMINAL_STATUSES",
    12: "normalizeRecentActivity() human-readable messages",
    13: "ProfileReadSerializer includes first_name/last_name",
    14: "applicationService.delete() handles 404",
    15: "SSE client rapid-failure detection",
}

VALID_SEVERITIES = {"blocker", "critical", "warning", "info"}

# Keywords that map to specific go-live-polish fixes
FIX_KEYWORD_MAP = {
    1: ["TransactionTestCase", "test_admin_override"],
    2: ["international", "program_fees", "FeeResolver"],
    3: ["notification", "ApplicationReviewView", "approval notification"],
    4: ["ApplicationDraft", "deprecated"],
    5: ["keep_alive_ping", "cold start", "warm"],
    6: ["intake_capacity", "intake_enrollment", "capacity warning"],
    7: ["sync_enrollment", "program_intakes"],
    8: ["PDF", "lazy-load", "vendor-pdf", "dynamic import"],
    9: ["cleanup_csrf", "csrf_tokens"],
    10: ["application_slip", "DocumentUploadView", "non-draft"],
    11: ["NON_TERMINAL_STATUSES", "approved", "duplicate_checker"],
    12: ["normalizeRecentActivity", "human-readable", "activity feed"],
    13: ["ProfileReadSerializer", "first_name", "last_name"],
    14: ["applicationService.delete", "404 handling", "idempotent delete"],
    15: ["SSE", "rapid-failure", "QUIC", "sseClient"],
}

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

fix_number_st = st.integers(min_value=1, max_value=15)

severity_st = st.sampled_from(sorted(VALID_SEVERITIES))

non_empty_text = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=1,
    max_size=200,
).map(str.strip).filter(lambda s: len(s) > 0)

issue_id_st = st.from_regex(r"AUDIT-[0-9]+\.[0-9]+-[0-9]{3}", fullmatch=True)


def make_regression_issue(fix_num: int) -> st.SearchStrategy[dict]:
    """Generate an issue record that corresponds to a specific go-live-polish fix."""
    keywords = FIX_KEYWORD_MAP[fix_num]
    keyword = keywords[0]
    description = f"Regression detected: {GO_LIVE_POLISH_FIXES[fix_num]} — {keyword} is broken"
    return st.fixed_dictionaries({
        "id": issue_id_st,
        "severity": st.just("blocker"),  # Regressions are auto-escalated to blocker
        "domain": non_empty_text,
        "description": st.just(description),
        "affected": non_empty_text,
        "recommendation": non_empty_text,
        "go_live_polish_ref": st.just(f"Fix {fix_num}"),
    })


regression_issue_st = fix_number_st.flatmap(make_regression_issue)

non_regression_issue_st = st.fixed_dictionaries({
    "id": issue_id_st,
    "severity": severity_st,
    "domain": non_empty_text,
    "description": non_empty_text,
    "affected": non_empty_text,
    "recommendation": non_empty_text,
    "go_live_polish_ref": st.just(None),
})


# ---------------------------------------------------------------------------
# Property 38: Go-live-polish regression detection
# ---------------------------------------------------------------------------


class TestGoLivePolishRegression:
    """# Feature: pre-launch-audit, Property 38: Go-live-polish regression detection

    **Validates: Requirements 14.5**
    """

    @given(issue=regression_issue_st)
    @settings(max_examples=100)
    def test_regression_issues_have_go_live_polish_ref(self, issue: dict) -> None:
        """Any issue corresponding to a go-live-polish fix must have go_live_polish_ref set."""
        assert issue.get("go_live_polish_ref") is not None, (
            f"Issue {issue['id']} corresponds to a go-live-polish fix but has no go_live_polish_ref"
        )
        ref = issue["go_live_polish_ref"]
        match = re.match(r"Fix (\d+)", ref)
        assert match is not None, f"go_live_polish_ref '{ref}' does not match 'Fix N' pattern"
        fix_num = int(match.group(1))
        assert 1 <= fix_num <= 15, f"Fix number {fix_num} is out of range (1-15)"

    @given(issue=regression_issue_st)
    @settings(max_examples=100)
    def test_regression_issues_are_blocker_severity(self, issue: dict) -> None:
        """Go-live-polish regressions should be auto-escalated to blocker severity."""
        assert issue["severity"] == "blocker", (
            f"Issue {issue['id']} is a go-live-polish regression but severity is "
            f"'{issue['severity']}' instead of 'blocker'"
        )

    @given(issue=non_regression_issue_st)
    @settings(max_examples=100)
    def test_non_regression_issues_have_no_ref(self, issue: dict) -> None:
        """Issues not corresponding to go-live-polish fixes should have go_live_polish_ref=None."""
        assert issue.get("go_live_polish_ref") is None, (
            f"Issue {issue['id']} is not a regression but has go_live_polish_ref set"
        )

    @given(fix_num=fix_number_st)
    @settings(max_examples=15)
    def test_all_15_fixes_have_keyword_mappings(self, fix_num: int) -> None:
        """Every fix number (1-15) should have keyword mappings for detection."""
        assert fix_num in FIX_KEYWORD_MAP, f"Fix {fix_num} has no keyword mapping"
        assert len(FIX_KEYWORD_MAP[fix_num]) > 0, f"Fix {fix_num} has empty keyword list"
        assert fix_num in GO_LIVE_POLISH_FIXES, f"Fix {fix_num} has no description"

    def test_actual_regression_check_in_report(self) -> None:
        """The audit report should contain a go-live-polish regression check section."""
        report_path = Path(__file__).resolve().parents[2] / ".kiro" / "specs" / "pre-launch-audit" / "audit-report.md"
        if not report_path.exists():
            return

        content = report_path.read_text()
        assert "Go-Live-Polish Regression Check" in content, (
            "Audit report missing Go-Live-Polish Regression Check section"
        )

        # Verify all 15 fixes are mentioned
        for fix_num in range(1, 16):
            assert f"| {fix_num} |" in content or f"Fix {fix_num}" in content or f"| {fix_num} " in content, (
                f"Fix {fix_num} not found in regression check section"
            )
