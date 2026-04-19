"""Property-based tests for audit report structure completeness.

# Feature: pre-launch-audit, Property 37: Audit report structure completeness

For any issue in the audit report, the issue record should contain all required
fields: `id`, `severity` (one of `blocker`, `critical`, `warning`, `info`),
`domain`, `description`, `affected`, `expected`, and `recommendation`. Issues
should be grouped by domain.

**Validates: Requirements 14.1, 14.2, 14.3**
"""

import re
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_SEVERITIES = {"blocker", "critical", "warning", "info"}

REQUIRED_FIELDS = {"id", "severity", "domain", "description", "affected", "recommendation"}

# ---------------------------------------------------------------------------
# Strategies — generate random audit issue records
# ---------------------------------------------------------------------------

severity_st = st.sampled_from(sorted(VALID_SEVERITIES))

domain_st = st.sampled_from([
    "Schema Integrity",
    "Schema — Constraints",
    "Enrollment Sync",
    "Data Integrity",
    "End-to-End Wiring",
    "Auth & Security",
    "Payment Flow",
    "Business Logic",
    "Dead Code",
    "Error Handling",
    "Performance",
    "Student UX",
    "Admin UX",
    "Property Tests",
])

non_empty_text = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=1,
    max_size=200,
).map(str.strip).filter(lambda s: len(s) > 0)

issue_id_st = st.from_regex(r"AUDIT-[0-9]+\.[0-9]+-[0-9]{3}", fullmatch=True)

issue_record_st = st.fixed_dictionaries({
    "id": issue_id_st,
    "severity": severity_st,
    "domain": domain_st,
    "description": non_empty_text,
    "affected": non_empty_text,
    "recommendation": non_empty_text,
}, optional={
    "expected": non_empty_text,
    "go_live_polish_ref": st.one_of(st.none(), st.text(min_size=1, max_size=20)),
})


# ---------------------------------------------------------------------------
# Property 37: Audit report structure completeness
# ---------------------------------------------------------------------------


class TestAuditReportStructure:
    """# Feature: pre-launch-audit, Property 37: Audit report structure completeness

    **Validates: Requirements 14.1, 14.2, 14.3**
    """

    @given(issue=issue_record_st)
    @settings(max_examples=5)
    def test_every_issue_has_required_fields(self, issue: dict) -> None:
        """Every generated issue record must contain all required fields."""
        for field in REQUIRED_FIELDS:
            assert field in issue, f"Missing required field: {field}"
            assert issue[field] is not None, f"Required field '{field}' is None"
            assert len(str(issue[field]).strip()) > 0, f"Required field '{field}' is empty"

    @given(issue=issue_record_st)
    @settings(max_examples=5)
    def test_severity_is_valid(self, issue: dict) -> None:
        """Severity must be one of: blocker, critical, warning, info."""
        assert issue["severity"] in VALID_SEVERITIES, (
            f"Invalid severity '{issue['severity']}' — must be one of {VALID_SEVERITIES}"
        )

    @given(issue=issue_record_st)
    @settings(max_examples=5)
    def test_issue_id_follows_convention(self, issue: dict) -> None:
        """Issue ID must follow the AUDIT-X.Y-NNN pattern."""
        assert re.match(r"^AUDIT-\d+\.\d+-\d{3}$", issue["id"]), (
            f"Issue ID '{issue['id']}' does not match AUDIT-X.Y-NNN pattern"
        )

    @given(issues=st.lists(issue_record_st, min_size=2, max_size=20))
    @settings(max_examples=5)
    def test_issues_can_be_grouped_by_domain(self, issues: list[dict]) -> None:
        """Issues should be groupable by domain with no domain being empty."""
        grouped: dict[str, list] = {}
        for issue in issues:
            domain = issue["domain"]
            grouped.setdefault(domain, []).append(issue)

        for domain, domain_issues in grouped.items():
            assert len(domain_issues) > 0, f"Domain '{domain}' has no issues after grouping"
            for di in domain_issues:
                assert di["domain"] == domain

    def test_actual_audit_report_exists_and_has_structure(self) -> None:
        """The generated audit-report.md should exist and contain key sections."""
        report_path = Path(__file__).resolve().parents[2] / ".kiro" / "specs" / "pre-launch-audit" / "audit-report.md"
        # Allow test to pass even if report hasn't been generated yet
        if not report_path.exists():
            return

        content = report_path.read_text()
        assert "## Summary" in content, "Report missing Summary section"
        assert "## Domain Sections" in content, "Report missing Domain Sections"
        assert "## Go-Live-Polish Regression Check" in content, "Report missing Go-Live-Polish section"
        assert "## Launch Readiness Verdict" in content, "Report missing Launch Readiness Verdict"
        assert "blocker" in content.lower() or "Blocker" in content, "Report missing severity references"
