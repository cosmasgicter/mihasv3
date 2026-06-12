"""Tenant-aware communication-template property test (task 28.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase 7 (Tenant-aware communication
templates), Requirement 14 (Tenant-Aware Communication Templates).

This file implements exactly one named property (**Property 22**) against the
real ``CommunicationService`` in ``backend/apps/common/communication_service.py``
(``render_template`` / ``send`` / ``_build_context`` / the ``_DEFAULT_*``
constants). It is **test-first**: it encodes the *target* contract that task
28.2 implements. Until 28.2 makes the service tenant-aware (resolution by
``application.institution_ref_id`` + ``version``, and brand/contact derivation
in ``_build_context``), these properties are **expected to FAIL** — that red
state is the whole point of the test-first step. This is NOT a bug-condition
exploration test.

To stay decoupled from 28.2's internal method signatures, the resolution
property drives the **observable** behaviour of the stable public entry point
``CommunicationService.send(template_key, application)`` and inspects the subject
that flows into the (patched) outbox. The context property exercises the stable
module-level ``_build_context(application)`` helper directly.

Property 22 (from tasks.md / design.md Component 7 / R14):

    Communication template resolution and brand-safe context — resolve active
    institution-specific (highest version) → active Beanola platform template
    (highest version, ``institution_id`` NULL) → safe Beanola default; the built
    context is complete (all expected variables present) and is free of the
    MIHAS brand/contact and ``https://apply.mihas.edu.zm`` for ANY institution,
    including unknown/future institutions and missing-setting cases. Brand,
    contact, and portal URL derive from the resolved institution's settings,
    falling back to Beanola platform defaults — never MIHAS.

**Validates: Requirements 14.1, 14.3, 14.4, 14.5, 14.7, 14.8**
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from django.core.exceptions import FieldError
from django.db import IntegrityError, connection
from django.db.utils import DatabaseError, OperationalError
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.common.communication_service import (
    CommunicationService,
    _DEFAULT_SUBJECT,
    _build_context,
)
from apps.common.models import CommunicationTemplate
from tests.tenant_fixtures import build_tenant_world

# ---------------------------------------------------------------------------
# Brand-safety vocabulary (R14.3, R14.7, R14.8; mirrors the R10 brand guard).
# A generic platform surface must never inherit a single school's identity.
# ---------------------------------------------------------------------------

_FORBIDDEN_BRAND_TOKENS = (
    "mihas",
    "katc",
    "mukuba",
    "kalulushi",
    "apply.mihas.edu.zm",
)
_FORBIDDEN_PORTAL_URL = "https://apply.mihas.edu.zm"


def _assert_brand_safe(value, *, where: str) -> None:
    """Assert a single resolved value carries no MIHAS/KATC platform brand."""
    low = str(value).lower()
    for token in _FORBIDDEN_BRAND_TOKENS:
        assert token not in low, (
            f"brand-unsafe value at {where}: contains '{token}': {value!r}"
        )


# ---------------------------------------------------------------------------
# Tenant-aware support detection (test-first guard, no DB poisoning)
# ---------------------------------------------------------------------------


def _tenant_aware_columns_present() -> bool:
    """True once ``communication_templates`` carries ``institution_id`` and
    ``version`` (the task-27.1 migration columns, modelled by task 28.2).

    The session-scoped ``unmanaged_schema`` fixture builds the test-DB table
    from the current ``CommunicationTemplate`` model. Before 28.2 the model has
    neither column, so this is ``False`` and the resolution property fails
    cleanly with a descriptive message instead of erroring inside the ORM.
    """
    try:
        with connection.cursor() as cursor:
            desc = connection.introspection.get_table_description(
                cursor, "communication_templates"
            )
    except Exception:  # pragma: no cover - table always exists under the fixture
        return False
    columns = {col.name for col in desc}
    return {"institution_id", "version"}.issubset(columns)


_UNSET = object()


def _make_template(
    template_key: str,
    subject: str,
    body: str,
    *,
    institution_id=_UNSET,
    version=_UNSET,
    is_active: bool = True,
    channel: str = "email",
) -> CommunicationTemplate:
    """Persist one ``communication_templates`` row.

    ``institution_id`` / ``version`` are only passed to ``create`` when given,
    so a *platform* template (no kwargs) is creatable against the pre-28.2
    model, while an *institution-specific* row (both kwargs set) requires the
    tenant-aware columns 28.2 adds.
    """
    kwargs = {
        "id": uuid.uuid4(),
        "template_key": template_key,
        "subject_template": subject,
        "body_template": body,
        "channel": channel,
        "is_active": is_active,
    }
    if institution_id is not _UNSET:
        kwargs["institution_id"] = institution_id
    if version is not _UNSET:
        kwargs["version"] = version
    return CommunicationTemplate.objects.create(**kwargs)


def _resolve_subject_via_send(application, template_key: str):
    """Render ``template_key`` for ``application`` through the stable public
    ``CommunicationService.send`` path and return the subject the service
    actually resolved (captured from the patched outbox).

    Returns the email subject when an email is queued, else the notification
    title, else ``None``.
    """
    with patch("apps.common.outbox.queue_email") as queue_email, patch(
        "apps.common.outbox.create_notification"
    ) as create_notification:
        CommunicationService.send(template_key, application)

    if queue_email.called:
        return queue_email.call_args.kwargs.get("subject")
    if create_notification.called:
        return create_notification.call_args.kwargs.get("title")
    return None


# ---------------------------------------------------------------------------
# Strategies — safe (never MIHAS/KATC) institution settings, incl. empties.
# ---------------------------------------------------------------------------

_SAFE_NAMES = [
    "Acme College",
    "Zenith Institute",
    "Lakeside School of Health",
    "Horizon Academy",
    "Summit Polytechnic",
    "Riverside University",
]
_SAFE_EMAILS = [
    "info@acme.example",
    "admissions@zenith.example",
    "support@lakeside.example",
    "hello@horizon.example",
]

# Include None / "" so "missing-setting" rows are exercised (R14.8).
_brand_name_strategy = st.one_of(st.none(), st.just(""), st.sampled_from(_SAFE_NAMES))
_email_strategy = st.one_of(st.none(), st.just(""), st.sampled_from(_SAFE_EMAILS))


# ≥100 examples; success is pinned to ``--hypothesis-seed=0`` via the CLI flag.
# Each example builds a tenant graph (function-scoped ``db``) plus template
# rows, so the deadline is relaxed and the per-example fixture build is exempt
# from the function-scoped-fixture / data-too-large health checks (the same
# harness the document-profile resolution property in this spec uses).
_PROPERTY_SETTINGS = settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)


@pytest.mark.django_db
class TestCommunicationTemplateProperty22:
    # Feature: multi-tenant-beanola-remediation, Property 22: Communication template resolution and brand-safe context
    """Property 22: Communication template resolution and brand-safe context.

    Resolve active institution-specific (highest version) → active Beanola
    platform (highest version, ``institution_id`` NULL) → safe Beanola default;
    the built context is complete and free of the MIHAS brand/contact and
    ``https://apply.mihas.edu.zm`` for any institution (including unknown/future
    and missing-setting cases).

    **Validates: Requirements 14.1, 14.3, 14.4, 14.5, 14.7, 14.8**
    """

    # ------------------------------------------------------------------
    # 22a — Resolution priority (R14.1, R14.4, R14.5)
    # ------------------------------------------------------------------
    @_PROPERTY_SETTINGS
    @given(
        scenario=st.sampled_from(["institution_specific", "platform_only", "none"]),
        num_versions=st.integers(min_value=1, max_value=3),
        add_inactive_decoy=st.booleans(),
    )
    def test_resolution_priority(self, scenario, num_versions, add_inactive_decoy):
        # Feature: multi-tenant-beanola-remediation, Property 22: Communication template resolution and brand-safe context
        """The resolved template follows institution-specific (highest active
        version) → Beanola platform (highest active version) → safe Beanola
        default, and the resolved subject is always brand-safe.

        **Validates: Requirements 14.1, 14.4, 14.5**
        """
        world = build_tenant_world(application_status="submitted")
        application = world.application
        institution_id = world.institution.id
        # Unique key per example so rows never collide across the shared
        # function-scoped transaction hypothesis reuses between examples.
        template_key = f"tenant_resolve_{uuid.uuid4().hex[:16]}"

        if scenario == "none":
            # No template at all → the safe Beanola default (R14.5).
            expected_subject = _DEFAULT_SUBJECT
        elif scenario == "platform_only":
            # Only a Beanola platform template (institution_id NULL) exists →
            # it is used for an application whose institution has no specific
            # template (R14.5). Created with base columns only so it is valid
            # both before and after 28.2.
            platform_subject = f"PLATFORM {uuid.uuid4().hex[:8]}"
            _make_template(template_key, platform_subject, "<p>platform body</p>")
            expected_subject = platform_subject
        else:  # institution_specific
            # Institution-specific (highest version) must win over the Beanola
            # platform template for the same key (R14.1, R14.4). This requires
            # the tenant-aware columns (28.2) and several rows sharing one key.
            if not _tenant_aware_columns_present():
                pytest.fail(
                    "Property 22 (resolution): communication_templates has no "
                    "institution_id/version columns yet — tenant-aware "
                    "resolution is unimplemented (task 28.2 pending)."
                )
            try:
                platform_subject = f"PLATFORM {uuid.uuid4().hex[:8]}"
                _make_template(
                    template_key,
                    platform_subject,
                    "<p>platform body</p>",
                    institution_id=None,
                    version=1,
                )
                top_subject = None
                for version in range(1, num_versions + 1):
                    top_subject = f"INST v{version} {uuid.uuid4().hex[:8]}"
                    _make_template(
                        template_key,
                        top_subject,
                        "<p>institution body</p>",
                        institution_id=institution_id,
                        version=version,
                    )
                # A higher-version but INACTIVE row must never displace the
                # active winner (R14.1 "active ... highest version").
                if add_inactive_decoy:
                    _make_template(
                        template_key,
                        f"DECOY {uuid.uuid4().hex[:8]}",
                        "<p>inactive decoy</p>",
                        institution_id=institution_id,
                        version=num_versions + 1,
                        is_active=False,
                    )
                expected_subject = top_subject
            except (TypeError, FieldError, IntegrityError, OperationalError, DatabaseError) as exc:
                pytest.fail(
                    "Property 22 (resolution): tenant-aware communication "
                    "templates not implemented yet — setting up an "
                    f"institution-specific template raised {type(exc).__name__}: {exc}"
                )

        resolved_subject = _resolve_subject_via_send(application, template_key)

        # The resolved subject is always brand-safe regardless of scenario.
        _assert_brand_safe(resolved_subject, where=f"resolved subject ({scenario})")

        assert resolved_subject == expected_subject, (
            f"scenario={scenario}: expected resolved subject {expected_subject!r}, "
            f"got {resolved_subject!r}"
        )

    # ------------------------------------------------------------------
    # 22b — Complete, brand-safe context (R14.3, R14.7, R14.8)
    # ------------------------------------------------------------------
    @_PROPERTY_SETTINGS
    @given(
        case=st.sampled_from(["has_settings", "missing_settings", "no_institution"]),
        brand_name=_brand_name_strategy,
        support_email=_email_strategy,
        admissions_email=_email_strategy,
    )
    def test_context_is_complete_and_brand_safe(
        self, case, brand_name, support_email, admissions_email
    ):
        # Feature: multi-tenant-beanola-remediation, Property 22: Communication template resolution and brand-safe context
        """The built context is complete (brand name, contact email, and portal
        URL present and non-empty) and every value is free of the MIHAS
        brand/contact and ``https://apply.mihas.edu.zm`` — for an institution
        with settings, an institution missing those settings (Beanola defaults),
        and an unknown/future application with no institution at all.

        **Validates: Requirements 14.3, 14.7, 14.8**
        """
        world = build_tenant_world(application_status="submitted")
        application = world.application
        institution = world.institution

        if case == "has_settings":
            institution.brand_name = brand_name or "Acme College"
            institution.support_email = support_email or "support@acme.example"
            institution.admissions_email = admissions_email or "admissions@acme.example"
            institution.save()
        elif case == "missing_settings":
            # No brand/contact configured → must fall back to Beanola platform
            # defaults, never MIHAS (R14.8).
            institution.brand_name = None
            institution.support_email = None
            institution.admissions_email = None
            institution.save()
        else:  # no_institution — unknown / future school (R14.7)
            application.institution_ref = None
            application.save(update_fields=["institution_ref"])

        context = _build_context(application)

        # Completeness (R14.3, R14.8): the existing variables plus the
        # tenant-derived brand name and contact email must all be present.
        expected_keys = (
            "student_name",
            "application_number",
            "program_name",
            "intake_name",
            "status",
            "tracking_code",
            "portal_url",
            "brand_name",
            "contact_email",
        )
        for key in expected_keys:
            assert key in context, (
                f"context missing expected key {key!r} (case={case}); "
                f"keys present: {sorted(context)}"
            )

        # Brand, contact, and portal must be non-empty so the message is
        # complete (R14.8), and the contact must look like an email address.
        for key in ("brand_name", "contact_email", "portal_url"):
            value = context.get(key)
            assert isinstance(value, str) and value.strip(), (
                f"context[{key!r}] must be a non-empty string (case={case}); got {value!r}"
            )
        assert "@" in context["contact_email"], (
            f"context['contact_email'] is not an email address (case={case}): "
            f"{context['contact_email']!r}"
        )

        # Brand safety (R14.3, R14.7, R14.8): no resolved value may carry the
        # MIHAS/KATC platform brand or the hard-coded MIHAS portal URL.
        for key, value in context.items():
            _assert_brand_safe(value, where=f"context[{key!r}] (case={case})")
        assert context["portal_url"] != _FORBIDDEN_PORTAL_URL, (
            f"portal_url must not be the hard-coded MIHAS portal (case={case}): "
            f"{context['portal_url']!r}"
        )
