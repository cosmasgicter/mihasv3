"""Staff invitation correctness-property tests (task 4.2).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.2
Requirements: R4.3, R4.4, R6.3. Findings: TEN-01, TEN-05.

Two requirement-derived invariants are pinned against the real
:class:`~apps.catalog.staff_invitation_service.StaffInvitationService` (no mocks,
no production code changed):

* **Property A — no reusable plaintext credential is ever persisted (R4.3).**
  For every invited (email, role), a newly created identity has NO usable
  password, and the invitation stores only the SHA-256 *hash* of the single-use
  token — never the raw token and never a plaintext password. This is the
  TEN-01 fix (the old flow displayed + persisted an operator-set password in
  browser storage) expressed as an invariant.

* **Property B — invite is atomic all-or-nothing (R4.4).** Re-inviting the same
  email into the same tenant never produces a second invitation or a second
  membership: exactly one of each exists, so a duplicate can never leave a
  partially-authoritative orphan.

Both run ≥100 Hypothesis examples with unique generated emails, so no example
collides with another.

Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_staff_invitation_properties.py -q

**Validates: Requirements 4.3, 4.4**
"""

from __future__ import annotations

import hashlib
import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.accounts.models import Profile
from apps.catalog.models import TenantStaffInvitation, UserInstitutionMembership
from apps.catalog.staff_invitation_service import InvitationError, StaffInvitationService
from tests.tenant_fixtures import build_institution

pytestmark = [pytest.mark.django_db, pytest.mark.tenant]

# Hypothesis reuses the one django_db transaction across examples, so suppress
# the function-scoped-fixture health check and keep every example's data unique.
_PBT = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

_ROLE = st.sampled_from(["admin", "reviewer"])
# A short random local-part; the full email is uniquified per example below.
_LOCAL = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789", min_size=1, max_size=12
)


class TestNoPlaintextCredentialPersisted:
    @_PBT
    @given(local=_LOCAL, role=_ROLE)
    def test_invite_never_persists_plaintext_credential(self, local, role):
        # R4.3: no reusable plaintext password/token is ever stored.
        institution = build_institution()
        email = f"{local}-{uuid.uuid4().hex}@example.com"
        invitation, raw_token = StaffInvitationService().invite(
            institution_id=institution.id, email=email, invited_role=role
        )
        # A brand-new identity has NO usable password until the invitee accepts.
        profile = Profile.objects.get(id=invitation.profile_id)
        assert not profile.password_hash
        # Only the SHA-256 hash of the token is stored — never the raw token.
        assert invitation.token_hash == hashlib.sha256(raw_token.encode()).hexdigest()
        assert invitation.token_hash != raw_token
        # The persisted record exposes no plaintext secret attribute.
        assert not hasattr(invitation, "password")


class TestInviteAtomicAllOrNothing:
    @_PBT
    @given(local=_LOCAL, role=_ROLE)
    def test_duplicate_invite_never_creates_a_second_record(self, local, role):
        # R4.4: re-inviting the same email into the same tenant is rejected and
        # never leaves a duplicate/partial invitation or membership.
        institution = build_institution()
        email = f"{local}-{uuid.uuid4().hex}@example.com"
        service = StaffInvitationService()
        invitation, _ = service.invite(
            institution_id=institution.id, email=email, invited_role=role
        )
        with pytest.raises(InvitationError):
            service.invite(institution_id=institution.id, email=email, invited_role=role)

        assert (
            TenantStaffInvitation.objects.filter(
                institution_id=institution.id, email=email
            ).count()
            == 1
        )
        assert (
            UserInstitutionMembership.objects.filter(
                user_id=invitation.profile_id, institution_id=institution.id
            ).count()
            == 1
        )
