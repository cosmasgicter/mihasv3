"""Tests for the check_production_state management command."""

import pytest
from django.conf import settings
from django.core.management import call_command
from django.test import override_settings


# Good production-like settings baseline
SIMPLE_JWT_SETTINGS = {
    **settings.SIMPLE_JWT,
    "SIGNING_KEY": "real-jwt-signing-key",
}

PROD_SETTINGS = {
    "PAYMENT_HARDENING_FORWARD_ONLY": True,
    "PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT": True,
    "PAYMENT_HARDENING_RATE_LIMITS": True,
    "PAYMENT_HARDENING_FORCE_APPROVED": True,
    "AI_HARDENING_CIRCUIT_BREAKER": True,
    "AI_HARDENING_RATE_LIMITS": True,
    "AI_HARDENING_CACHE": True,
    "AI_HARDENING_REDACTION": True,
    "SECRET_KEY": "real-production-secret-key-abc123",
    "SIMPLE_JWT": SIMPLE_JWT_SETTINGS,
    "ALLOWED_HOSTS": ["api.mihas.edu.zm"],
    "CORS_ALLOWED_ORIGINS": ["***REMOVED***"],
    "LENCO_API_SECRET_KEY": "sk_live_xxx",
    "LENCO_PUBLIC_KEY": "pk_live_xxx",
    "AUDIT_LOG_ENCRYPTION_KEY": "enc-key-xxx",
    "GLITCHTIP_DSN": "https://xxx@app.glitchtip.com/22431",
}


@pytest.mark.django_db(databases=[])
class TestCheckProductionStateClean:
    """Command passes with valid production settings."""

    @override_settings(**PROD_SETTINGS)
    def test_passes_with_good_settings(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        call_command("check_production_state", "--strict")


@pytest.mark.django_db(databases=[])
class TestCheckProductionStateFailures:
    """Command exits 1 with --strict on bad settings."""

    @override_settings(**{**PROD_SETTINGS, "PAYMENT_HARDENING_FORWARD_ONLY": False})
    def test_fails_on_payment_flag_false(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**{**PROD_SETTINGS, "AI_HARDENING_REDACTION": False})
    def test_fails_on_ai_flag_false(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**{**PROD_SETTINGS, "SECRET_KEY": "insecure-dev-key-change-me"})
    def test_fails_on_insecure_secret_key(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**PROD_SETTINGS)
    def test_fails_on_localhost_database(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://localhost/mihas")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**PROD_SETTINGS)
    def test_fails_on_missing_redis(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.delenv("REDIS_URL", raising=False)
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**{**PROD_SETTINGS, "SIMPLE_JWT": {**SIMPLE_JWT_SETTINGS, "SIGNING_KEY": ""}})
    def test_fails_on_empty_simple_jwt_signing_key(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(
        **{
            **PROD_SETTINGS,
            "JWT_SIGNING_KEY": "legacy-key-should-not-be-read",
            "SIMPLE_JWT": {**SIMPLE_JWT_SETTINGS, "SIGNING_KEY": ""},
        }
    )
    def test_fails_on_empty_simple_jwt_key_even_with_legacy_setting(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**{**PROD_SETTINGS, "ALLOWED_HOSTS": ["localhost", "api.mihas.edu.zm"]})
    def test_fails_on_localhost_in_allowed_hosts(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**{**PROD_SETTINGS, "CORS_ALLOWED_ORIGINS": ["http://localhost:3000"]})
    def test_fails_on_http_cors_origin(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(
        **{
            **PROD_SETTINGS,
            "CORS_ALLOW_CREDENTIALS": True,
            "CORS_ALLOWED_ORIGIN_REGEXES": [r"^https://([A-Za-z0-9-]+\.)*mihas\.edu\.zm$"],
        }
    )
    def test_fails_on_broad_credentialed_cors_regex(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**{**PROD_SETTINGS, "LENCO_API_SECRET_KEY": ""})
    def test_fails_on_missing_lenco_key(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**{**PROD_SETTINGS, "GLITCHTIP_DSN": ""})
    def test_fails_on_missing_glitchtip_dsn(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://neon.tech/prod")
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        with pytest.raises(SystemExit):
            call_command("check_production_state", "--strict")

    @override_settings(**PROD_SETTINGS)
    def test_warns_without_strict(self, monkeypatch, capsys):
        """Without --strict, prints warnings but does not exit."""
        monkeypatch.delenv("DATABASE_URL", raising=False)
        monkeypatch.setenv("REDIS_URL", "redis://prod-redis:6379")
        # Should not raise
        call_command("check_production_state")
