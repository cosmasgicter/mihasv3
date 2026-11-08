"""R1 exploration: one seed step yields an applyable offering with a fee.

Spec: student-journey-repair task 1.1, clause 1.4 (design R1-d).

``harness_seed_tenants`` seeds only ``programs.application_fee``; the canonical
fee authority is ``program_fees`` (``FeeResolver``), so a fresh local database
has offerings that no student can pay for. The command must also refuse
production settings, not only a managed ``DATABASE_URL``.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.catalog.models import Institution, Program
from apps.documents.fee_resolver import FeeResolver

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _remove_seeded_rows():
    """Isolation (task 3.3): the seed tables are unmanaged, so a transactional test
    does not flush them, and rows left by the seed test would make the refusal
    test's "nothing was written" assertion order-dependent. Delete what the seed
    command creates, before and after each case. Assertions are unchanged.
    """

    def _clean():
        from apps.accounts.models import Profile
        from apps.catalog.models import (
            CanonicalProgram,
            Intake,
            InstitutionDomain,
            Program,
            ProgramIntake,
            UserInstitutionMembership,
        )
        from apps.documents.models import ProgramFee

        offerings = Program.objects.filter(code__in=["MIHAS-DRN", "KATC-DRN"])
        ProgramFee.objects.filter(program__in=offerings).delete()
        ProgramIntake.objects.filter(program__in=offerings).delete()
        offerings.delete()
        Intake.objects.filter(name__in=["MIHAS January 2027", "KATC January 2027"]).delete()
        UserInstitutionMembership.objects.filter(institution__code__in=["MIHAS", "KATC"]).delete()
        InstitutionDomain.objects.filter(hostname__in=["mihas.localhost", "katc.localhost"]).delete()
        Profile.objects.filter(email__in=["admin@mihas.localhost", "admin@katc.localhost"]).delete()
        Institution.objects.filter(code__in=["MIHAS", "KATC"]).delete()
        CanonicalProgram.objects.filter(code="CANON-DRN").delete()

    _clean()
    yield
    _clean()

# A fictional local credential for the seeded example admins; never a real secret.
LOCAL_SEED_PASSWORD = "Sjr-local-seed-0nly!"


@pytest.mark.xfail(strict=True, reason="SJR R1: fixed in task 3.3")
def test_seeded_offerings_resolve_a_local_fee():
    call_command("harness_seed_tenants", "--tenant-admin-password", LOCAL_SEED_PASSWORD)

    offerings = list(Program.objects.filter(code__in=["MIHAS-DRN", "KATC-DRN"]))
    assert len(offerings) == 2
    resolver = FeeResolver()
    for offering in offerings:
        # Raises FeeConfigurationError (FEE_NOT_CONFIGURED) at HEAD.
        fee = resolver.resolve_for_offering(offering, "Zambian", "Zambia")
        assert fee.residency_category == "local"
        assert fee.amount > 0
        assert fee.currency == "ZMW"


@pytest.mark.xfail(strict=True, reason="SJR R1: fixed in task 3.3")
@pytest.mark.parametrize(
    "env",
    [
        {"DJANGO_SETTINGS_MODULE": "config.settings.prod"},
        {"ENVIRONMENT": "production"},
    ],
)
def test_seed_command_refuses_production_settings(env):
    with patch.dict("os.environ", env):
        with pytest.raises(CommandError):
            call_command(
                "harness_seed_tenants", "--tenant-admin-password", LOCAL_SEED_PASSWORD
            )
    # Refusal happens before any write.
    assert not Institution.objects.filter(code__in=["MIHAS", "KATC"]).exists()
