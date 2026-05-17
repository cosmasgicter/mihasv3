"""Assert force_approved propagates correctly across all subsystems."""

import subprocess
import sys
from pathlib import Path

import pytest

from apps.documents.payment_service import PAYMENT_TO_APP_MAP


BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


class TestForceApprovedPropagation:
    """Verify force_approved is recognized in every subsystem that gates on payment status."""

    def test_payment_to_app_map_includes_force_approved(self):
        assert "force_approved" in PAYMENT_TO_APP_MAP
        assert PAYMENT_TO_APP_MAP["force_approved"] == "verified"

    def test_analytics_counts_force_approved(self):
        """apps.analytics.admissions_analytics must count force_approved separately."""
        analytics_path = BACKEND_ROOT / "apps" / "analytics" / "admissions_analytics.py"
        content = analytics_path.read_text()
        assert 'force_approved' in content, (
            "admissions_analytics.py does not reference force_approved"
        )
        assert 'filter=Q(status="force_approved")' in content, (
            "admissions_analytics.py does not count force_approved with Q filter"
        )

    def test_review_queue_payment_ready_includes_force_approved(self):
        """apps.applications.review_queue.PAYMENT_READY_STATUSES must include force_approved."""
        from apps.applications.review_queue import ReviewQueueScorer
        assert "force_approved" in ReviewQueueScorer.PAYMENT_READY_STATUSES

    def test_admin_views_resolved_payment_statuses_includes_force_approved(self):
        """admin_review_views._RESOLVED_PAYMENT_STATUSES must include force_approved.

        Stream 9 decomposition moved this from admin_views.py to admin_review_views.py.
        admin_views.py is now a thin re-export shim.
        """
        # Check the canonical location after Stream 9 decomposition.
        admin_review_views_path = (
            BACKEND_ROOT / "apps" / "applications" / "admin_review_views.py"
        )
        content = admin_review_views_path.read_text()
        assert '"force_approved"' in content, (
            "admin_review_views.py does not reference force_approved in "
            "_RESOLVED_PAYMENT_STATUSES"
        )
        # Verify it's in the tuple definition.
        idx = content.index("_RESOLVED_PAYMENT_STATUSES")
        block = content[idx:idx + 200]
        assert "force_approved" in block

    def test_frontend_normalizes_force_approved_to_verified(self):
        """Frontend paymentStatus.ts must map force_approved → verified."""
        frontend_path = (
            BACKEND_ROOT.parent / "apps" / "admissions" / "src" / "lib" / "paymentStatus.ts"
        )
        content = frontend_path.read_text()
        # The switch case must include force_approved in the verified branch
        assert "'force_approved'" in content or '"force_approved"' in content
        # Find the verified return after force_approved
        lines = content.splitlines()
        for i, line in enumerate(lines):
            if 'force_approved' in line:
                # Next non-empty line with 'return' should return 'verified'
                for j in range(i + 1, min(i + 5, len(lines))):
                    if 'return' in lines[j]:
                        assert 'verified' in lines[j], (
                            f"force_approved does not map to verified: {lines[j]}"
                        )
                        return
        pytest.fail("Could not find force_approved → verified mapping in paymentStatus.ts")
