"""Regression coverage for application payload contract alignment."""

from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from apps.applications.serializers import ApplicationListSerializer


class ApplicationListSerializerContractTests(SimpleTestCase):
    def test_list_serializer_includes_admin_dashboard_grade_fields(self):
        application = SimpleNamespace(
            id="app-1",
            application_number="APP-001",
            public_tracking_code="TRK-001",
            full_name="Test Applicant",
            email="student@example.com",
            phone="+260977000000",
            program="Nursing",
            intake="January 2026",
            institution="MIHAS",
            status="submitted",
            payment_status="successful",
            payment_verified_at=None,
            payment_reference=None,
            last_payment_reference=None,
            submitted_at=datetime.now() - timedelta(days=3),
            created_at=datetime.now() - timedelta(days=5),
            updated_at=datetime.now() - timedelta(days=1),
            admin_feedback="",
            review_started_at=None,
            decision_date=None,
            application_fee=150,
            date_of_birth=date(2000, 1, 1),
            payment_verified_by=None,
        )
        grades = [
            SimpleNamespace(subject=SimpleNamespace(name="Mathematics"), subject_id="s1", grade=2),
            SimpleNamespace(subject=SimpleNamespace(name="English"), subject_id="s2", grade=1),
            SimpleNamespace(subject=SimpleNamespace(name="Biology"), subject_id="s3", grade=4),
        ]

        with patch("apps.applications.serializers.get_application_grades", return_value=grades):
            data = ApplicationListSerializer(application).data

        self.assertEqual(data["grades_summary"], "Mathematics: Grade 2\nEnglish: Grade 1\nBiology: Grade 4")
        self.assertEqual(data["total_subjects"], 3)
        self.assertEqual(data["points"], 7)
        self.assertGreaterEqual(data["age"], 16)
        self.assertEqual(data["days_since_submission"], 3)

    def test_application_fee_prefers_canonical_payment_over_stale_column(self):
        """Regression: 'K1 / K150' bug.

        Application.application_fee is a stale snapshot (150) that does not
        track ProgramFee changes. The serializer must surface the canonical
        payment amount (what the student actually paid / was charged) so the
        admin UI shows the real fee, not the historical default.
        """
        application = SimpleNamespace(
            id="app-2",
            application_number="APP-002",
            public_tracking_code="TRK-002",
            full_name="Abraham Lungu",
            email="a@example.com",
            phone="+260977000000",
            program="Certificate In Psychosocial Counselling",
            intake="July 2026",
            institution="MIHAS",
            status="approved",
            payment_status="successful",
            payment_verified_at=None,
            payment_reference=None,
            last_payment_reference=None,
            submitted_at=datetime.now() - timedelta(days=1),
            created_at=datetime.now() - timedelta(days=2),
            updated_at=datetime.now() - timedelta(days=1),
            admin_feedback="",
            review_started_at=None,
            decision_date=None,
            application_fee=150,  # stale column
            date_of_birth=date(2000, 1, 1),
            payment_verified_by=None,
            # Annotated by _with_payment_summary on list querysets:
            payment_summary_amount=1,
            payment_summary_paid_amount=1,
        )

        with patch("apps.applications.serializers.get_application_grades", return_value=[]):
            data = ApplicationListSerializer(application).data

        self.assertEqual(data["application_fee"], 1)
        self.assertEqual(data["paid_amount"], 1)

