"""Tests for drf-spectacular OpenAPI authentication extensions.

Verifies that `OptionalJWTCookieAuthentication` has a dedicated extension
that registers distinct scheme names so SessionView's schema gets proper
security metadata without triggering the drf-spectacular "components with
identical names" warning.
"""
from __future__ import annotations


def _target_path(target):
    if isinstance(target, str):
        return target
    return f"{target.__module__}.{target.__name__}"


def test_primary_jwt_cookie_auth_scheme_registered():
    from apps.common.openapi import JWTCookieAuthenticationScheme

    assert (
        _target_path(JWTCookieAuthenticationScheme.target_class)
        == "apps.accounts.authentication.JWTCookieAuthentication"
    )
    assert JWTCookieAuthenticationScheme.name == ["jwtBearerAuth", "jwtCookieAuth"]


def test_optional_jwt_auth_extension_registered():
    """A dedicated extension exists for OptionalJWTCookieAuthentication so
    drf-spectacular does not emit a 'could not resolve authenticator' warning
    on SessionView and other optional-auth endpoints."""
    from apps.common.openapi import OptionalJWTCookieAuthenticationScheme

    assert (
        _target_path(OptionalJWTCookieAuthenticationScheme.target_class)
        == "apps.accounts.authentication.OptionalJWTCookieAuthentication"
    )


def test_optional_extension_uses_distinct_scheme_names():
    """Optional scheme names differ from the primary to avoid drf-spectacular's
    'components with identical names and different identities' collision warning."""
    from apps.common.openapi import (
        JWTCookieAuthenticationScheme,
        OptionalJWTCookieAuthenticationScheme,
    )

    primary_names = set(JWTCookieAuthenticationScheme.name)
    optional_names = set(OptionalJWTCookieAuthenticationScheme.name)
    assert primary_names & optional_names == set(), (
        "Optional and primary JWT scheme names must not overlap — else "
        "drf-spectacular emits identical-components warnings."
    )
    assert OptionalJWTCookieAuthenticationScheme.name == [
        "optionalJwtBearerAuth",
        "optionalJwtCookieAuth",
    ]


def test_optional_scheme_security_requirement_shape():
    from apps.common.openapi import OptionalJWTCookieAuthenticationScheme

    req = OptionalJWTCookieAuthenticationScheme(target=None).get_security_requirement(None)
    assert req == [{"optionalJwtBearerAuth": []}, {"optionalJwtCookieAuth": []}]


def test_optional_scheme_security_definition_shape():
    from apps.common.openapi import OptionalJWTCookieAuthenticationScheme

    defs = OptionalJWTCookieAuthenticationScheme(target=None).get_security_definition(None)
    assert isinstance(defs, list)
    assert len(defs) == 2
    assert defs[0]["type"] == "http" and defs[0]["scheme"] == "bearer"
    assert defs[1]["type"] == "apiKey" and defs[1]["in"] == "cookie"
    # Description clearly conveys the optional semantics
    assert "Optional" in defs[0]["description"]
    assert "Optional" in defs[1]["description"]


def test_primary_scheme_security_definition_shape():
    from apps.common.openapi import JWTCookieAuthenticationScheme

    defs = JWTCookieAuthenticationScheme(target=None).get_security_definition(None)
    assert isinstance(defs, list)
    assert len(defs) == 2
    assert defs[0]["scheme"] == "bearer"
    assert defs[1]["name"] == "access_token"
