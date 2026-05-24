"""Management command to assert production-readiness invariants at deploy time."""

import sys

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Assert that all production-readiness invariants hold."

    def add_arguments(self, parser):
        parser.add_argument(
            "--strict",
            action="store_true",
            help="Exit 1 on any failure instead of printing warnings.",
        )

    def handle(self, *args, **options):
        strict = options["strict"]
        failures = []

        # --- Hardening flags ---
        hardening_flags = [
            "PAYMENT_HARDENING_FORWARD_ONLY",
            "PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT",
            "PAYMENT_HARDENING_RATE_LIMITS",
            "PAYMENT_HARDENING_FORCE_APPROVED",
            "AI_HARDENING_CIRCUIT_BREAKER",
            "AI_HARDENING_RATE_LIMITS",
            "AI_HARDENING_CACHE",
            "AI_HARDENING_REDACTION",
        ]
        for flag in hardening_flags:
            if not getattr(settings, flag, False):
                failures.append(f"{flag} is not True")

        # --- Secrets and infrastructure ---
        secret_key = getattr(settings, "SECRET_KEY", "")
        if secret_key == "insecure-dev-key-change-me" or not secret_key:
            failures.append("SECRET_KEY is insecure or empty")

        import os

        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            failures.append("DATABASE_URL is not set")
        elif "localhost" in db_url:
            failures.append("DATABASE_URL points to localhost")

        if not os.environ.get("REDIS_URL"):
            failures.append("REDIS_URL is not set")

        jwt_key = getattr(settings, "SIMPLE_JWT", {}).get("SIGNING_KEY", "")
        if not jwt_key or jwt_key in ("test", ""):
            failures.append("JWT_SIGNING_KEY is not set or is a test value")

        # --- Host / CORS safety ---
        allowed_hosts = getattr(settings, "ALLOWED_HOSTS", [])
        if "localhost" in allowed_hosts:
            failures.append("ALLOWED_HOSTS includes localhost")

        cors_origins = getattr(settings, "CORS_ALLOWED_ORIGINS", [])
        for origin in cors_origins:
            if origin.startswith("http://"):
                failures.append(f"CORS_ALLOWED_ORIGINS contains insecure origin: {origin}")
                break
        if getattr(settings, "CORS_ALLOW_CREDENTIALS", False):
            broad_regex_markers = ("([A-Za-z0-9-]+\\.)*", "[A-Za-z0-9-]+\\.", ".*", ".+")
            for pattern in getattr(settings, "CORS_ALLOWED_ORIGIN_REGEXES", []):
                if any(marker in pattern for marker in broad_regex_markers):
                    failures.append(
                        "CORS_ALLOWED_ORIGIN_REGEXES contains broad wildcard pattern "
                        f"while credentialed CORS is enabled: {pattern}"
                    )
                    break

        # --- Required keys ---
        if not getattr(settings, "LENCO_API_SECRET_KEY", ""):
            failures.append("LENCO_API_SECRET_KEY is not set")
        if not getattr(settings, "LENCO_PUBLIC_KEY", ""):
            failures.append("LENCO_PUBLIC_KEY is not set")
        if not getattr(settings, "AUDIT_LOG_ENCRYPTION_KEY", ""):
            failures.append("AUDIT_LOG_ENCRYPTION_KEY is not set")
        if not getattr(settings, "GLITCHTIP_DSN", ""):
            failures.append("GLITCHTIP_DSN is not set")

        # --- Report ---
        if failures:
            for msg in failures:
                self.stderr.write(self.style.WARNING(f"FAIL: {msg}") if not strict else self.style.ERROR(f"FAIL: {msg}"))
            if strict:
                sys.exit(1)
        else:
            self.stdout.write(self.style.SUCCESS("All production-readiness checks passed."))
