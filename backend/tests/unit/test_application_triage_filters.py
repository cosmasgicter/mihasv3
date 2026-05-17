"""Coverage for admin triage filters exposed by the applications UI."""


def test_application_filter_exposes_triage_filters():
    from apps.applications.filters import ApplicationFilter

    assert "reviewer_assignment" in ApplicationFilter.declared_filters
    assert "is_late_submission" in ApplicationFilter.declared_filters
    assert "has_pending_amendments" in ApplicationFilter.declared_filters
    assert "review_queue" in ApplicationFilter.declared_filters
    assert "overdue_review" in ApplicationFilter.declared_filters
    assert "has_pending_documents" in ApplicationFilter.declared_filters
    assert "has_upcoming_interviews" in ApplicationFilter.declared_filters
