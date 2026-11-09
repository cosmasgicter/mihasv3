"""seed_school_admins permission rule (SJR task 5.1, design R7-a, clauses 2.36, 3.24).

Additive by default (DEC-11); ``--replace`` and ``--read-only`` remove; every
change is audited with ids and permission names only; the run rolls back when an
audit row is missing. Emails, codes and the password are fictional.
"""
from __future__ import annotations

import io

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.accounts.models import Profile
from apps.catalog.management.commands._seed_memberships import seed_membership_permissions
from apps.catalog.models import AccessGrant, UserInstitutionMembership
from apps.common.models import AuditLog
from apps.catalog.tenant_audit_service import TenantAuditService
from tests.tenant_fixtures import build_institution, build_membership, build_profile

pytestmark = pytest.mark.django_db(transaction=True)

PASSWORD = "Sjr-seed-unit-0nly!"
ACTION = "tenant.membership.permissions_seeded"


@pytest.fixture(autouse=True)
def _leave_no_seed_events():
    """audit_logs is unmanaged and not flushed between tests; other tests count these events."""
    yield
    AuditLog.objects.filter(action=ACTION).delete()


def _run(institution, email, *extra, stdout=None):
    call_command(
        "seed_school_admins",
        "--admin",
        f"{institution.code}={email}",
        "--password",
        PASSWORD,
        *extra,
        stdout=stdout or io.StringIO(),
    )


def _membership(email, institution):
    return UserInstitutionMembership.objects.get(
        user=Profile.objects.get(email__iexact=email), institution=institution
    )


def _events(membership=None):
    qs = AuditLog.objects.filter(action=ACTION)
    return qs.filter(entity_id=membership.id) if membership else qs


# --- pure rule ---------------------------------------------------------------


def test_pure_rule_modes():
    assert seed_membership_permissions(["export", "legacy_x"], ["review"], "add") == [
        "export",
        "legacy_x",
        "review",
    ]
    assert seed_membership_permissions(["export"], ["review"], "replace") == ["review"]
    assert seed_membership_permissions(["export"], ["review"], "read_only") == []
    assert seed_membership_permissions(None, ["review"], "add") == ["review"]


@settings(max_examples=60, deadline=None)
@given(
    existing=st.lists(st.text(max_size=8), max_size=6),
    requested=st.lists(st.text(max_size=8), max_size=6),
)
def test_pure_rule_properties(existing, requested):
    added = seed_membership_permissions(existing, requested, "add")
    assert set(added) >= set(existing) | set(requested)
    assert seed_membership_permissions(added, requested, "add") == added
    assert seed_membership_permissions(existing, requested, "replace") == sorted(set(requested))
    assert seed_membership_permissions(existing, requested, "read_only") == []


# --- modes -------------------------------------------------------------------


def test_default_creates_membership_with_review_and_one_event():
    institution = build_institution()
    email = "default@example-school.test"
    _run(institution, email)
    membership = _membership(email, institution)
    assert membership.permissions == ["review"]
    events = _events(membership)
    assert events.count() == 1
    changes = events.first().changes
    assert changes["permissions_before"] is None
    assert changes["permissions_after"] == ["review"]
    assert changes["created"] is True
    assert changes["source"] == "seed_school_admins"
    assert email not in str(changes)


def test_add_mode_keeps_operator_permissions():
    institution = build_institution()
    admin = build_profile(role="admin")
    build_membership(user=admin, institution=institution, role="admin", permissions=["export", "manage"])

    _run(institution, admin.email)

    membership = _membership(admin.email, institution)
    assert membership.permissions == ["export", "manage", "review"]
    changes = _events(membership).first().changes
    assert changes["permissions_before"] == ["export", "manage"]


def test_unchanged_rerun_writes_no_membership_and_no_event(monkeypatch):
    institution = build_institution()
    email = "idem@example-school.test"
    _run(institution, email)
    before = _events().count()

    saved = []
    original = UserInstitutionMembership.save
    monkeypatch.setattr(
        UserInstitutionMembership,
        "save",
        lambda self, *a, **k: saved.append(self.pk) or original(self, *a, **k),
    )
    out = io.StringIO()
    _run(institution, email, stdout=out)

    assert saved == []
    assert _events().count() == before
    assert "membership unchanged" in out.getvalue()


def test_profile_update_still_runs_on_unchanged_membership():
    institution = build_institution()
    email = "profile@example-school.test"
    _run(institution, email)
    Profile.objects.filter(email__iexact=email).update(is_active=False, email_verified=False)

    _run(institution, email)

    profile = Profile.objects.get(email__iexact=email)
    assert profile.is_active is True and profile.email_verified is True
    assert profile.role == "admin"


def test_reactivation_is_audited():
    institution = build_institution()
    email = "react@example-school.test"
    _run(institution, email)
    membership = _membership(email, institution)
    UserInstitutionMembership.objects.filter(id=membership.id).update(is_active=False)

    _run(institution, email)

    membership.refresh_from_db()
    assert membership.is_active is True
    assert _events(membership).count() == 2
    assert _events(membership).order_by("-created_at").first().changes["reactivated"] is True


def test_replace_removes_and_says_so():
    institution = build_institution()
    admin = build_profile(role="admin")
    build_membership(user=admin, institution=institution, role="admin", permissions=["export", "manage"])

    _run(institution, admin.email, "--replace", "--permissions", "view,review")

    membership = _membership(admin.email, institution)
    assert membership.permissions == ["review", "view"]
    changes = _events(membership).first().changes
    assert changes["mode"] == "replace"
    assert changes["permissions_before"] == ["export", "manage"]
    assert changes["permissions_after"] == ["review", "view"]


def test_read_only_removes_everything():
    institution = build_institution()
    email = "ro@example-school.test"
    _run(institution, email)

    _run(institution, email, "--read-only")

    membership = _membership(email, institution)
    assert membership.permissions == []
    changes = _events(membership).order_by("-created_at").first().changes
    assert changes["mode"] == "read_only"
    assert changes["permissions_before"] == ["review"]
    assert changes["permissions_after"] == []


# --- option validation ---------------------------------------------------------


@pytest.mark.parametrize(
    "extra",
    [
        ("--read-only", "--permissions", "view"),
        ("--read-only", "--replace"),
        ("--permissions", ""),
        ("--permissions", "view,nonsense"),
    ],
)
def test_invalid_options_fail_before_any_write(extra):
    institution = build_institution()
    email = "invalid@example-school.test"
    before = _events().count()
    with pytest.raises(CommandError):
        _run(institution, email, *extra)
    assert not Profile.objects.filter(email__iexact=email).exists()
    assert _events().count() == before


def test_empty_permissions_message_points_at_read_only():
    institution = build_institution()
    with pytest.raises(CommandError, match="--read-only"):
        _run(institution, "x@example-school.test", "--permissions", "")


# --- dry run, grants, audit failure --------------------------------------------


def test_dry_run_writes_nothing():
    institution = build_institution()
    email = "dry@example-school.test"
    before = _events().count()
    out = io.StringIO()
    _run(institution, email, "--dry-run", stdout=out)
    assert not Profile.objects.filter(email__iexact=email).exists()
    assert not UserInstitutionMembership.objects.filter(institution=institution).exists()
    assert _events().count() == before
    assert "membership created" in out.getvalue()


def test_access_grants_are_never_touched():
    institution = build_institution()
    admin = build_profile(role="admin")
    build_membership(user=admin, institution=institution, role="admin", permissions=[])
    grant_count = AccessGrant.objects.count()
    _run(institution, admin.email, "--replace", "--permissions", "view")
    assert AccessGrant.objects.count() == grant_count


def test_missing_audit_row_rolls_the_run_back(monkeypatch):
    institution = build_institution()
    email = "rollback@example-school.test"
    monkeypatch.setattr(TenantAuditService, "record_event", staticmethod(lambda **kw: None))

    with pytest.raises(CommandError, match="Audit events were not recorded"):
        _run(institution, email)

    assert not Profile.objects.filter(email__iexact=email).exists()
    assert not UserInstitutionMembership.objects.filter(institution=institution).exists()
