"""Property 9 — transactional staff-creation rollback.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 6.3.

Feature: enterprise-tenant-authority, Property 9: Transactional staff creation rollback

*For all* tenant-staff invites, the user, profile, and
``UserInstitutionMembership`` are written inside one ``transaction.atomic()``
block (R6.5). **If** the membership write fails, **then** the user/profile
creation is rolled back (R6.6): after the request settles, **no** ``Profile``
row for the invited email survives and **no** orphaned
``UserInstitutionMembership`` row exists.

This drives the real ``AdminUserListView.post`` endpoint
(``POST /api/v1/admin/users/``) over DRF ``APIClient`` + ``force_authenticate``.
For every hypothesis example the membership write is forced to fail by patching
``UserInstitutionMembership.objects.create`` to raise an integrity/database
error (the two failure classes the view's ``except`` clause catches), and the
property asserts:

* the response is the non-revealing ``STAFF_CREATION_FAILED`` (HTTP 400), and
* the invited ``Profile`` email count is **unchanged** from before the request
  (the profile insert was rolled back, leaving no orphan), and
* **no** ``UserInstitutionMembership`` row was persisted for the invited user.

A Super_Admin actor is used so the authorization path (R6.1–R6.4/R6.8) is
satisfied unconditionally and the example space stays focused on the
transactional-rollback invariant under test.

Backend property test: ``pytest`` + ``hypothesis``, ≥100 examples, one property
(Property 9) per file. Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_staff_creation_rollback.py -q

**Validates: Requirements 6.5, 6.6**
"""

from __future__ import annotations

import uuid
from unittest import mock

import pytest
from django.core.cache import cache
from django.db import DatabaseError, IntegrityError
from hypothesis import given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.catalog.models import UserInstitutionMembership
from tests.tenant_fixtures import build_institution, build_profile

# ≥100 examples (spec minimum). Deadline relaxed for the DB + HTTP round-trips.
HYPOTHESIS_SETTINGS = settings(max_examples=100, deadline=None)

# The two failure classes the view's ``except (IntegrityError, DatabaseError)``
# rollback clause catches. A subclass of each is included so the property holds
# for the realistic DB-driver subclasses too (e.g. a unique-violation).
FAILURE_EXC = st.sampled_from(
    [
        IntegrityError,
        DatabaseError,
        type("UniqueViolation", (IntegrityError,), {}),
        type("OperationalError", (DatabaseError,), {}),
    ]
)


def _sfx() -> str:
    return uuid.uuid4().hex[:10]


def _super_admin_client() -> APIClient:
    """An ``APIClient`` authenticated as a fresh Super_Admin actor."""
    actor = build_profile(role="super_admin")
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(actor.id),
                "email": actor.email,
                "role": actor.role,
                "first_name": actor.first_name,
                "last_name": actor.last_name,
            }
        )
    )
    return client


@pytest.mark.tenant
@pytest.mark.django_db
class TestProperty9StaffCreationRollback:
    """Property 9: Transactional staff creation rollback.

    Feature: enterprise-tenant-authority, Property 9: Transactional staff creation rollback

    **Validates: Requirements 6.5, 6.6**
    """

    @HYPOTHESIS_SETTINGS
    @given(exc_class=FAILURE_EXC, email_sfx=st.text(
        alphabet="abcdefghijklmnopqrstuvwxyz0123456789", min_size=6, max_size=16
    ))
    def test_membership_failure_rolls_back_user_and_profile(
        self, exc_class, email_sfx
    ):
        """When the membership write fails, neither a Profile row nor an
        orphaned membership row survives, and the response is the non-revealing
        ``STAFF_CREATION_FAILED`` (R6.5, R6.6)."""
        cache.clear()
        institution = build_institution(suffix=_sfx())
        client = _super_admin_client()

        # A fresh, never-before-seen invite email so the pre-request count is a
        # clean zero and any surviving row would be unambiguous.
        email = f"invitee-{email_sfx}-{_sfx()}@example.com"
        before = Profile.objects.filter(email__iexact=email).count()
        assert before == 0

        payload = {
            "email": email,
            "password": "Sup3rSecret!",
            "first_name": "Invited",
            "last_name": "Staff",
            "role": "reviewer",
            "institution_id": str(institution.id),
        }

        # Force the membership write (the third leg of the atomic unit) to fail
        # with each integrity/database error class the rollback clause catches.
        with mock.patch.object(
            UserInstitutionMembership.objects,
            "create",
            side_effect=exc_class("forced membership failure"),
        ):
            resp = client.post("/api/v1/admin/users/", payload, format="json")

        # R6.6: the surrounding atomic block rolled the profile back.
        body = getattr(resp, "data", None) or resp.json()
        assert resp.status_code == 400, (resp.status_code, body)
        assert body.get("code") == "STAFF_CREATION_FAILED", body
        assert Profile.objects.filter(email__iexact=email).count() == before
        # No orphaned membership row for the (never-persisted) invited profile.
        assert not UserInstitutionMembership.objects.filter(
            institution_id=institution.id, role="reviewer"
        ).exists()
