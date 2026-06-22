"""Property-based test — neutral branding fallback never leaks a legacy school.

Feature: enterprise-tenant-authority, Property 19

Spec: ``.kiro/specs/enterprise-tenant-authority`` (task 9.3). Pins the neutral
branding fallback property from the design's Correctness Properties:

    Property 19 — Neutral branding fallback never leaks a legacy school
    For all tenants with a missing branding asset, document generation falls
    back to the neutral Beanola asset and never to a MIHAS or KATC asset.

This exercises the real document-generation branding fallback in
``apps.applications.tasks.pdf_generation``:

  * ``_beanola_brand()``  — sources ``InstitutionContextService.BEANOLA_BRAND``,
    the single canonical neutral brand.
  * ``_tenant_context(application)`` — resolves the tenant brand for a render,
    falling back ``name``/``primary_color`` to the neutral Beanola brand when
    the tenant has no configured branding.
  * ``_safe_hex(value)`` — falls back a blank/invalid colour to the neutral
    Beanola brand colour, never a hardcoded legacy-school colour.

These three functions read only attributes already present on the passed-in
objects (no DB / storage / network access), so the property drives them with
lightweight stub applications whose institution carries an arbitrary mix of
missing / blank / present branding fields. No production code is changed and
none of the functions under test are mocked.

The property asserts two things across the whole input space:

  1. **Faithful fallback.** When a brand field is absent or blank, the resolved
     context uses exactly the neutral Beanola brand value (mirroring the code's
     ``_plain_text(...) or beanola[...]`` semantics) — never some other default.
  2. **No legacy leak.** Generated inputs never contain the legacy school
     identifiers ``MIHAS`` / ``KATC``, so any occurrence of either string in the
     resolved context would prove a hardcoded legacy fallback. The property
     asserts neither string ever appears.

**Validates: Requirements 9.3**
"""

from __future__ import annotations

import uuid

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.applications.tasks.pdf_generation import (
    _beanola_brand,
    _safe_hex,
    _tenant_context,
)
from apps.catalog.services import InstitutionContextService

# Legacy school identifiers that must never surface as a branding fallback.
_LEGACY_TOKENS = ("MIHAS", "KATC")

# The canonical neutral brand the fallback must use.
_BEANOLA = InstitutionContextService.BEANOLA_BRAND


def _contains_legacy(value) -> bool:
    """True when ``value`` (stringified) contains a legacy school identifier."""
    text = str(value).upper()
    return any(token in text for token in _LEGACY_TOKENS)


def _plain(value) -> str:
    """Mirror of ``pdf_generation._plain_text``: strings pass through, else ''."""
    return value if isinstance(value, str) else ""


# --- Input strategies -------------------------------------------------------
#
# ``safe_text`` is free-form text that is guaranteed NOT to contain a legacy
# token, so any legacy token in the output can only have come from a hardcoded
# default. ``blankish`` models the missing/blank branding cases the code treats
# as falsy (None / empty string). ``noisy`` adds non-string values so the
# ``_plain_text`` coercion (non-str -> '') is exercised too.

_safe_text = st.text(
    alphabet=st.characters(blacklist_categories=("Cs", "Cc")),
    min_size=1,
    max_size=24,
).filter(lambda s: not _contains_legacy(s))

_blankish = st.one_of(st.none(), st.just(""), st.just("   "))

_brand_field = st.one_of(_blankish, _safe_text, st.integers(), st.just(b"bytes"))


class _StubInstitution:
    """Minimal stand-in for ``Application.institution_ref`` with brand fields."""

    def __init__(self, **fields):
        for key, value in fields.items():
            setattr(self, key, value)


class _StubApplication:
    """Minimal stand-in for ``Application`` exposing the brand-relevant attrs."""

    def __init__(self, *, institution_ref, institution_ref_id, institution):
        self.institution_ref = institution_ref
        self.institution_ref_id = institution_ref_id
        self.institution = institution  # legacy display snapshot string


@st.composite
def stub_applications(draw):
    """An application whose institution has an arbitrary mix of brand fields.

    Roughly half the time the institution is omitted entirely (``None``) to
    cover the no-institution branch; otherwise its brand fields are each drawn
    independently from the missing / blank / present / non-string space.
    """
    has_institution = draw(st.booleans())
    legacy_snapshot = draw(st.one_of(_blankish, _safe_text))

    if not has_institution:
        institution = None
        institution_ref_id = draw(st.one_of(st.none(), st.just(""), st.uuids().map(str)))
    else:
        institution = _StubInstitution(
            id=draw(st.one_of(st.none(), st.uuids())),
            brand_name=draw(_brand_field),
            name=draw(_brand_field),
            primary_color=draw(_brand_field),
            admissions_email=draw(st.one_of(_blankish, _safe_text)),
            email=draw(st.one_of(_blankish, _safe_text)),
            phone=draw(st.one_of(_blankish, _safe_text)),
            website=draw(st.one_of(_blankish, _safe_text)),
        )
        institution_ref_id = draw(st.one_of(st.none(), st.just(""), st.uuids().map(str)))

    return _StubApplication(
        institution_ref=institution,
        institution_ref_id=institution_ref_id,
        institution=legacy_snapshot,
    )


_PROPERTY_SETTINGS = settings(max_examples=200, deadline=None)


# Feature: enterprise-tenant-authority, Property 19: Neutral branding fallback never leaks a legacy school
class TestNeutralBrandingFallback:
    """Property 19 — neutral branding fallback never leaks a legacy school.

    For an application whose tenant has any mix of missing / blank / present
    (non-legacy) branding, ``_tenant_context`` falls back ``name`` and
    ``primary_color`` to the neutral Beanola brand exactly when the
    corresponding tenant field is absent or blank, and the resolved context
    never contains a MIHAS / KATC identifier.

    **Validates: Requirements 9.3**
    """

    @_PROPERTY_SETTINGS
    @given(application=stub_applications())
    def test_tenant_context_falls_back_to_neutral_brand(self, application):
        institution = application.institution_ref
        context = _tenant_context(application)

        # --- Faithful name fallback (R9.3) -------------------------------
        # Mirror the code's chain: brand_name -> name -> legacy snapshot ->
        # neutral Beanola name. Whichever is the first non-blank string wins;
        # when all are blank the neutral brand name is used.
        expected_name = (
            _plain(getattr(institution, "brand_name", None))
            or _plain(getattr(institution, "name", None))
            or _plain(getattr(application, "institution", None))
            or _BEANOLA["name"]
        )
        assert context["name"] == expected_name

        # --- Faithful colour fallback (R9.3) -----------------------------
        expected_color = (
            _plain(getattr(institution, "primary_color", None))
            or _BEANOLA["primary_color"]
        )
        assert context["primary_color"] == expected_color

        # --- No legacy leak, anywhere in the resolved context (R9.3) -----
        for key, value in context.items():
            assert not _contains_legacy(value), {
                "leaked_key": key,
                "leaked_value": value,
            }

    @_PROPERTY_SETTINGS
    @given(
        application=stub_applications().filter(
            lambda app: not (
                _plain(getattr(app.institution_ref, "brand_name", None))
                or _plain(getattr(app.institution_ref, "name", None))
                or _plain(getattr(app, "institution", None))
            )
        )
    )
    def test_all_blank_branding_yields_exactly_neutral_beanola(self, application):
        """When every brand-name source is blank, the resolved name and colour
        are exactly the neutral Beanola brand — proving there is no hidden
        legacy default behind the fallback (R9.3)."""
        context = _tenant_context(application)
        assert context["name"] == _BEANOLA["name"] == "Beanola Admissions"

        institution = application.institution_ref
        expected_color = (
            _plain(getattr(institution, "primary_color", None))
            or _BEANOLA["primary_color"]
        )
        assert context["primary_color"] == expected_color
        assert not _contains_legacy(context["name"])

    @_PROPERTY_SETTINGS
    @given(
        color=st.one_of(
            _blankish,
            st.text(max_size=12).filter(lambda s: not _contains_legacy(s)),
            st.sampled_from(["#0F766E", "#334155", "#abcdef", "#123456"]),
        )
    )
    def test_safe_hex_falls_back_to_neutral_colour(self, color):
        """``_safe_hex`` returns the parsed colour for a valid hex and the
        neutral Beanola brand colour for any blank / invalid input — never a
        hardcoded legacy-school colour, and never raising (R9.3)."""
        from reportlab.lib.colors import HexColor

        neutral = _beanola_brand().get("primary_color", "#0F766E")

        # Mirror the code's own resolution semantics for the expected value.
        try:
            expected = HexColor(color or neutral)
        except Exception:
            expected = HexColor(neutral)

        result = _safe_hex(color)  # must never raise
        assert result == expected
        # The neutral fallback colour itself carries no legacy identifier.
        assert not _contains_legacy(neutral)


class TestNeutralBrandConstant:
    """The neutral brand constant is the canonical Beanola brand (R9.3)."""

    def test_beanola_brand_is_neutral(self):
        brand = _beanola_brand()
        assert brand["name"] == "Beanola Admissions"
        assert brand["owner"] == "Beanola Technologies"
        assert brand is InstitutionContextService.BEANOLA_BRAND or brand == InstitutionContextService.BEANOLA_BRAND
        for value in brand.values():
            assert not _contains_legacy(value)

    def test_tenant_context_no_institution_uses_neutral_name(self):
        """An application with no institution and a blank legacy snapshot
        resolves to the neutral Beanola name (R9.3)."""
        application = _StubApplication(
            institution_ref=None,
            institution_ref_id="",
            institution="",
        )
        context = _tenant_context(application)
        assert context["name"] == "Beanola Admissions"
        assert context["primary_color"] == _BEANOLA["primary_color"]
        assert not _contains_legacy(context["name"])
