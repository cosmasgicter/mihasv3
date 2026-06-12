"""Institution-code resolution tests (R9.3, R9.4, R15.8).

Covers ``_resolve_institution_code`` and the explicitly-named legacy path
``_resolve_institution_code_legacy`` in ``apps.applications._view_helpers``:

  * The assigned institution's code resolves by code, exact name, and
    partial name, and a NULL ``is_active`` is treated as active (R9.3).
  * A genuinely missing/unresolvable institution falls back to the
    brand-neutral Beanola platform code ``BNL`` — never to the school brand
    ``MIHAS`` (R9.4).
  * The legacy resolver still returns ``MIHAS`` for the unresolved case, but
    only via the opt-in named function, not the default path.
  * The generated application number begins with the assigned institution's
    code (R15.8).
"""

from __future__ import annotations

import os
import uuid

import django
import pytest

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

django.setup()

from django.utils import timezone  # noqa: E402


def _make_institution(*, code: str, name: str, is_active=True):
    from apps.catalog.models import Institution

    now = timezone.now()
    sfx = uuid.uuid4().hex[:8]
    return Institution.objects.create(
        id=uuid.uuid4(),
        name=name,
        code=code,
        full_name=f"{name} (full)",
        slug=f"{code.lower()}-{sfx}",
        brand_name=name,
        is_active=is_active,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.django_db
class TestResolveInstitutionCode:
    """Default multi-tenant resolver: assigned code or platform BNL (R9.3, R9.4)."""

    def test_resolves_by_exact_code(self):
        from apps.applications._view_helpers import _resolve_institution_code

        _make_institution(code="KATC", name="Kalulushi Training Centre")
        assert _resolve_institution_code("KATC") == "KATC"

    def test_resolves_by_exact_name(self):
        from apps.applications._view_helpers import _resolve_institution_code

        _make_institution(code="KATC", name="Kalulushi Training Centre")
        assert _resolve_institution_code("Kalulushi Training Centre") == "KATC"

    def test_resolves_by_partial_name(self):
        from apps.applications._view_helpers import _resolve_institution_code

        _make_institution(code="KATC", name="Kalulushi Training Centre")
        assert _resolve_institution_code("Kalulushi") == "KATC"

    def test_null_is_active_still_resolves(self):
        """A tenant row created with NULL is_active must still resolve (R9.3)."""
        from apps.applications._view_helpers import _resolve_institution_code

        _make_institution(code="KATC", name="Kalulushi Training Centre", is_active=None)
        assert _resolve_institution_code("KATC") == "KATC"

    def test_missing_institution_falls_back_to_platform_code_not_mihas(self):
        """Unresolvable institution -> brand-neutral BNL, never MIHAS (R9.4)."""
        from apps.applications._view_helpers import (
            PLATFORM_INSTITUTION_CODE,
            _resolve_institution_code,
        )

        result = _resolve_institution_code("Some Unknown School That Does Not Exist")
        assert result == PLATFORM_INSTITUTION_CODE == "BNL"
        assert result != "MIHAS"

    def test_empty_name_falls_back_to_platform_code_not_mihas(self):
        from apps.applications._view_helpers import _resolve_institution_code

        assert _resolve_institution_code("") == "BNL"
        assert _resolve_institution_code("   ") == "BNL"

    def test_inactive_institution_does_not_resolve(self):
        """An explicitly inactive institution is not a valid assignment target."""
        from apps.applications._view_helpers import _resolve_institution_code

        _make_institution(code="OLD", name="Decommissioned College", is_active=False)
        # Falls through to the platform code rather than returning OLD.
        assert _resolve_institution_code("Decommissioned College") == "BNL"


@pytest.mark.django_db
class TestResolveInstitutionCodeLegacy:
    """The opt-in legacy path still returns MIHAS for the unresolved case."""

    def test_legacy_resolves_assigned_code(self):
        from apps.applications._view_helpers import _resolve_institution_code_legacy

        _make_institution(code="KATC", name="Kalulushi Training Centre")
        assert _resolve_institution_code_legacy("KATC") == "KATC"

    def test_legacy_unresolved_returns_mihas(self):
        from apps.applications._view_helpers import _resolve_institution_code_legacy

        assert _resolve_institution_code_legacy("Unknown School") == "MIHAS"
        assert _resolve_institution_code_legacy("") == "MIHAS"


@pytest.mark.django_db
class TestApplicationNumberUsesAssignedCode:
    """R15.8: the application number begins with the assigned institution code."""

    def test_application_number_starts_with_assigned_code(self):
        from apps.applications._view_helpers import _generate_application_number

        _make_institution(code="KATC", name="Kalulushi Training Centre")
        number = _generate_application_number("Kalulushi Training Centre")
        assert number.startswith("KATC"), number
        assert not number.startswith("MIHAS"), number

    def test_application_number_for_unknown_uses_platform_code(self):
        from apps.applications._view_helpers import _generate_application_number

        number = _generate_application_number("Totally Unknown Institution")
        assert number.startswith("BNL"), number
        assert not number.startswith("MIHAS"), number
