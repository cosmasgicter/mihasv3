"""Backward-compatible re-exports for URL routing.

This module was split into domain-scoped files during the
production-readiness-hardening spec (task 9). All view classes
and shared helpers are re-exported here so that existing URL
configurations and test imports continue to work unchanged.

Split files:
  - student_views.py   — student-facing CRUD, submission, withdrawal, etc.
  - admin_views.py     — admin review, bulk status, export, assignment, etc.
  - interview_views.py — interview list and CRUD
  - document_views.py  — document verification, acceptance letter, receipt
  - public_views.py    — unauthenticated application tracking
  - _view_helpers.py   — shared helpers, serializers, envelope types
"""

from apps.applications.student_views import *  # noqa: F401,F403
from apps.applications.admin_views import *  # noqa: F401,F403
from apps.applications.interview_views import *  # noqa: F401,F403
from apps.applications.document_views import *  # noqa: F401,F403
from apps.applications.public_views import *  # noqa: F401,F403
from apps.applications._view_helpers import *  # noqa: F401,F403

# Underscore-prefixed names are excluded from wildcard imports.
# Re-export them explicitly for backward compatibility.
from apps.applications._view_helpers import (  # noqa: F401
    _enqueue_document_task,
    _generate_application_number,
    _generate_tracking_code,
    _with_payment_summary,
)
from apps.common.audit_network import build_audit_network_fields  # noqa: F401
