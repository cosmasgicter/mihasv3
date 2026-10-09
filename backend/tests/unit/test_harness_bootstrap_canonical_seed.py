"""Harness bootstrap canonical-program seed (task 4.3, R4.7).

The clean-database tenant A/B launch journey assigns offerings from the platform
canonical-program catalogue via the canonical `POST /catalog/programs/` write
path. ``harness_bootstrap`` seeds that catalogue (platform bootstrap data, like
subjects — R18.1) so the journey never relies on a seed-specific tenant id or a
pre-linked offering. These tests pin that the seed creates the catalogue and is
idempotent.

**Validates: Requirements 4.7**
"""

from __future__ import annotations

import pytest

from apps.catalog.models import CanonicalProgram
from apps.common.management.commands.harness_bootstrap import Command

pytestmark = pytest.mark.django_db


def test_seed_canonical_programs_creates_catalogue():
    count = Command()._seed_canonical_programs()
    assert count >= 2
    assert CanonicalProgram.objects.filter(code="CANON-DRN", is_active=True).exists()
    assert CanonicalProgram.objects.filter(code="CANON-CM", is_active=True).exists()


def test_seed_canonical_programs_is_idempotent():
    command = Command()
    command._seed_canonical_programs()
    before = CanonicalProgram.objects.count()
    command._seed_canonical_programs()
    assert CanonicalProgram.objects.count() == before
