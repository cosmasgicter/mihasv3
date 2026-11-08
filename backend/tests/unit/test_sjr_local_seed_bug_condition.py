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
