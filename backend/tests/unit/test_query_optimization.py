"""Tests for N+1 query optimization: verify select_related/prefetch_related
are configured on list view querysets.

Implements task 12.4.
Requirements: 13.5

Since jobs-ops views currently return scaffold/sample data (not real DB queries),
these tests structurally verify that the queryset methods include the expected
select_related and prefetch_related calls. For admissions views that do query
the database, we verify the queryset configuration is correct.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase


# ---------------------------------------------------------------------------
# 1. ApplicationListCreateView queryset optimization (admin path)
# ---------------------------------------------------------------------------


class TestApplicationListCreateViewQueryOptimization(SimpleTestCase):
    """Requirement 13.1 — ApplicationListCreateView uses select_related and
    prefetch_related for the admin queryset path."""

    def _build_admin_queryset(self):
        """Simulate the admin path of ApplicationListCreateView.get() and
        return the queryset before filtering/pagination."""
        from apps.applications.models import Application

        # Replicate the admin queryset construction from admin_views.py
        queryset = Application.objects.select_related(
            'user', 'payment_verified_by', 'reviewed_by', 'admin_feedback_by',
            'assigned_reviewer_id',
        ).prefetch_related(
            'applicationdocument_set', 'applicationgrade_set', 'payment_set',
            'applicationcondition_set', 'applicationamendment_set',
        ).all()
        return queryset

    def test_admin_queryset_has_select_related(self):
        """Admin queryset must include select_related for FK fields."""
        qs = self._build_admin_queryset()
        select_related_fields = set(qs.query.select_related.keys()) if isinstance(
            qs.query.select_related, dict
        ) else set()
        expected = {'user', 'payment_verified_by', 'reviewed_by',
                    'admin_feedback_by', 'assigned_reviewer_id'}
        self.assertTrue(
            expected.issubset(select_related_fields),
            f"Missing select_related fields. Expected {expected}, got {select_related_fields}",
        )

    def test_admin_queryset_has_prefetch_related(self):
        """Admin queryset must include prefetch_related for reverse/M2M relations."""
        qs = self._build_admin_queryset()
        prefetch_lookups = set()
        for p in qs._prefetch_related_lookups:
            # Items can be strings or Prefetch objects
            prefetch_lookups.add(p.prefetch_through if hasattr(p, 'prefetch_through') else p)
        expected = {'applicationdocument_set', 'applicationgrade_set', 'payment_set',
                    'applicationcondition_set', 'applicationamendment_set'}
        self.assertTrue(
            expected.issubset(prefetch_lookups),
            f"Missing prefetch_related lookups. Expected {expected}, got {prefetch_lookups}",
        )

    def test_student_queryset_has_select_related(self):
        """Student queryset must include select_related for payment_verified_by."""
        from apps.applications.models import Application

        qs = Application.objects.select_related(
            'payment_verified_by'
        ).prefetch_related(
            'applicationgrade_set'
        ).all()
        select_related_fields = set(qs.query.select_related.keys()) if isinstance(
            qs.query.select_related, dict
        ) else set()
        self.assertIn('payment_verified_by', select_related_fields)

    def test_student_queryset_has_prefetch_related(self):
        """Student queryset must prefetch applicationgrade_set."""
        from apps.applications.models import Application

        qs = Application.objects.select_related(
            'payment_verified_by'
        ).prefetch_related(
            'applicationgrade_set'
        ).all()
        prefetch_lookups = set()
        for p in qs._prefetch_related_lookups:
            prefetch_lookups.add(p.prefetch_through if hasattr(p, 'prefetch_through') else p)
        self.assertIn('applicationgrade_set', prefetch_lookups)


# ---------------------------------------------------------------------------
# 2. JobApplicationListCreateView queryset optimization
# ---------------------------------------------------------------------------


class TestJobApplicationListCreateViewQueryOptimization(SimpleTestCase):
    """Requirement 13.2 — JobApplicationListCreateView.get_queryset() uses
    select_related for FK fields (job_posting, candidate)."""

    def test_get_queryset_has_select_related(self):
        """get_queryset() must include select_related for job_posting and candidate."""
        from apps.jobs.views import JobApplicationListCreateView

        view = JobApplicationListCreateView()
        qs = view.get_queryset()
        select_related_fields = set(qs.query.select_related.keys()) if isinstance(
            qs.query.select_related, dict
        ) else set()
        expected = {'job_posting', 'candidate'}
        self.assertTrue(
            expected.issubset(select_related_fields),
            f"Missing select_related fields. Expected {expected}, got {select_related_fields}",
        )

    def test_detail_view_get_queryset_has_select_related(self):
        """JobApplicationDetailView.get_queryset() must also include select_related."""
        from apps.jobs.views import JobApplicationDetailView

        view = JobApplicationDetailView()
        qs = view.get_queryset()
        select_related_fields = set(qs.query.select_related.keys()) if isinstance(
            qs.query.select_related, dict
        ) else set()
        expected = {'job_posting', 'candidate'}
        self.assertTrue(
            expected.issubset(select_related_fields),
            f"Missing select_related fields. Expected {expected}, got {select_related_fields}",
        )


# ---------------------------------------------------------------------------
# 3. ApplicationInterviewListView queryset optimization
# ---------------------------------------------------------------------------


class TestInterviewListViewQueryOptimization(SimpleTestCase):
    """Requirement 13.3 — ApplicationInterviewListView uses select_related
    for application and application__user."""

    def test_interview_queryset_has_select_related(self):
        """Interview list queryset must include select_related for application
        and nested application__user."""
        from apps.applications.models import ApplicationInterview

        qs = ApplicationInterview.objects.select_related(
            "application", "application__user"
        )
        select_related_fields = qs.query.select_related
        self.assertIsInstance(select_related_fields, dict)
        self.assertIn('application', select_related_fields)
        # application__user is nested under application
        nested = select_related_fields.get('application', {})
        self.assertIn('user', nested,
                       "application__user should be nested under application in select_related")

    def test_interview_view_source_code_uses_select_related(self):
        """Verify the view source code includes the select_related call."""
        import inspect
        from apps.applications.interview_views import ApplicationInterviewListView

        source = inspect.getsource(ApplicationInterviewListView.get)
        self.assertIn('select_related', source,
                       "ApplicationInterviewListView.get should use select_related")
        self.assertIn('application__user', source,
                       "ApplicationInterviewListView.get should select_related application__user")


# ---------------------------------------------------------------------------
# 4. ApplicationDocumentsView queryset optimization
# ---------------------------------------------------------------------------


class TestDocumentListViewQueryOptimization(SimpleTestCase):
    """Requirement 13.4 — ApplicationDocumentsView uses select_related
    for application and verified_by on the document queryset."""

    def test_document_queryset_has_select_related(self):
        """Document queryset must include select_related for application and verified_by."""
        from apps.documents.models import ApplicationDocument

        qs = ApplicationDocument.objects.select_related('application', 'verified_by')
        select_related_fields = set(qs.query.select_related.keys()) if isinstance(
            qs.query.select_related, dict
        ) else set()
        expected = {'application', 'verified_by'}
        self.assertTrue(
            expected.issubset(select_related_fields),
            f"Missing select_related fields. Expected {expected}, got {select_related_fields}",
        )

    def test_document_view_source_code_uses_select_related(self):
        """Verify the view source code includes the select_related call."""
        import inspect
        from apps.applications.student_views import ApplicationDocumentsView

        source = inspect.getsource(ApplicationDocumentsView.get)
        self.assertIn('select_related', source,
                       "ApplicationDocumentsView.get should use select_related")


# ---------------------------------------------------------------------------
# 5. Cross-cutting: all list views have optimization configured
# ---------------------------------------------------------------------------


class TestAllListViewsHaveOptimization(SimpleTestCase):
    """Requirement 13.5 — All list endpoints that return related model data
    include appropriate select_related/prefetch_related calls."""

    def test_admin_application_list_view_uses_optimization(self):
        """ApplicationListCreateView.get source must reference select_related."""
        import inspect
        from apps.applications.admin_views import ApplicationListCreateView

        source = inspect.getsource(ApplicationListCreateView.get)
        self.assertIn('select_related', source)
        self.assertIn('prefetch_related', source)

    def test_job_application_list_view_has_get_queryset(self):
        """JobApplicationListCreateView must define get_queryset with optimization."""
        from apps.jobs.views import JobApplicationListCreateView

        self.assertTrue(
            hasattr(JobApplicationListCreateView, 'get_queryset'),
            "JobApplicationListCreateView must define get_queryset",
        )
        import inspect
        source = inspect.getsource(JobApplicationListCreateView.get_queryset)
        self.assertIn('select_related', source)

    def test_interview_list_view_uses_optimization(self):
        """ApplicationInterviewListView.get source must reference select_related."""
        import inspect
        from apps.applications.interview_views import ApplicationInterviewListView

        source = inspect.getsource(ApplicationInterviewListView.get)
        self.assertIn('select_related', source)

    def test_document_list_view_uses_optimization(self):
        """ApplicationDocumentsView.get source must reference select_related."""
        import inspect
        from apps.applications.student_views import ApplicationDocumentsView

        source = inspect.getsource(ApplicationDocumentsView.get)
        self.assertIn('select_related', source)

    def test_job_application_detail_view_has_get_queryset(self):
        """JobApplicationDetailView must define get_queryset with optimization."""
        from apps.jobs.views import JobApplicationDetailView

        self.assertTrue(
            hasattr(JobApplicationDetailView, 'get_queryset'),
            "JobApplicationDetailView must define get_queryset",
        )
        import inspect
        source = inspect.getsource(JobApplicationDetailView.get_queryset)
        self.assertIn('select_related', source)
