# Bugfix Requirements Document

## Introduction

Users are being automatically logged out of the MIHAS platform prematurely. Two root causes have been identified:

1. The Koyeb backend deployment has been failing for 3+ days because the Dockerfile's `collectstatic` step does not provide `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` build-time placeholders, causing `prod.py` to raise `ImproperlyConfigured` during settings import. This blocks all code deployments, meaning configuration fixes (like the 30-minute JWT lifetime) never reach production.

2. The `_set_auth_cookies` function in `backend/apps/accounts/views.py` hardcodes the access token cookie `max_age` to `15 * 60` (900 seconds / 15 minutes) instead of reading from `settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]`. The browser deletes the cookie after 15 minutes, the next API request has no token, and the user receives a 401 → auto-logout. Even after Bug 1 is fixed and the 30-minute JWT lifetime deploys, the cookie would still expire at 15 minutes unless this hardcoded value is also corrected.

A third issue (stale Celery Beat schedule) is a consequence of Bug 1 and requires no code change — it resolves automatically once deployments succeed.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the Koyeb backend Docker image is built THEN the `collectstatic` step fails with `Unknown command: 'collectstatic'` because `prod.py` raises `ImproperlyConfigured` due to missing `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` build-time environment variables, preventing Django from loading any management commands.

1.2 WHEN a user logs in and the access token cookie is set THEN the cookie `max_age` is hardcoded to `15 * 60` (900 seconds) regardless of the `SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]` setting in `base.py`, causing the browser to delete the cookie before the JWT itself expires.

1.3 WHEN the access token cookie expires after 15 minutes THEN the browser removes it, the next API request carries no token, the backend returns 401 Unauthorized, and the frontend triggers an auto-logout.

1.4 WHEN the property test `test_set_auth_cookies_uses_correct_attributes` runs THEN it asserts `access_call["max_age"] == 15 * 60`, which validates the incorrect hardcoded value rather than the settings-derived lifetime.

### Expected Behavior (Correct)

2.1 WHEN the Koyeb backend Docker image is built THEN the `collectstatic` step SHALL succeed because `LENCO_API_SECRET_KEY` and `LENCO_PUBLIC_KEY` are provided as build-time placeholders alongside the other existing placeholder environment variables.

2.2 WHEN a user logs in and the access token cookie is set THEN the cookie `max_age` SHALL be derived from `settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()` (currently 1800 seconds / 30 minutes), ensuring the cookie lifetime matches the JWT lifetime.

2.3 WHEN the access token cookie is set with the settings-derived lifetime THEN the cookie SHALL remain valid in the browser for the full duration of the JWT's lifetime, preventing premature deletion and 401-triggered auto-logouts.

2.4 WHEN the property test `test_set_auth_cookies_uses_correct_attributes` runs THEN it SHALL assert that `access_call["max_age"]` equals `int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())`, validating that the cookie lifetime is derived from settings rather than hardcoded.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the Docker image is built THEN the system SHALL CONTINUE TO use `DJANGO_SETTINGS_MODULE=config.settings.prod` and all other existing build-time placeholder environment variables SHALL remain unchanged.

3.2 WHEN the Docker image is built THEN the `prod.py` Lenco validation check (`if not LENCO_API_SECRET_KEY or not LENCO_PUBLIC_KEY: raise ImproperlyConfigured(...)`) SHALL CONTINUE TO enforce that real Lenco credentials are present at runtime (the check itself must not be removed or weakened).

3.3 WHEN a user logs in THEN the refresh token cookie `max_age` SHALL CONTINUE TO be `7 * 24 * 60 * 60` (7 days), matching `SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]`.

3.4 WHEN auth cookies are set THEN the cookie attributes `domain`, `samesite`, `secure`, `httponly`, and `path` SHALL CONTINUE TO use their current settings-derived values.

3.5 WHEN the access token JWT is generated THEN its `exp` claim SHALL CONTINUE TO be computed from `settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]` as it already is in `tokens.py`.

3.6 WHEN the property tests for cookie attributes, JWT lifecycle, and shared signing key run THEN they SHALL CONTINUE TO pass without modification (except for the `max_age` assertion update in 2.4).
