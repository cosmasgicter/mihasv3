# Bugfix Requirements Document

## Introduction

A critical production issue is causing every authenticated session-dependent endpoint to return 500 errors on the MIHAS admissions platform. The root cause is a type mismatch in `_generate_csrf_token(user)` and `LogoutView.post` in `backend/apps/accounts/views.py`: these functions receive a `JWTUser` object (from `JWTCookieAuthentication`) but pass it directly to `CSRFToken.objects.create(user=user, ...)` and `CSRFToken.objects.filter(user=request.user).delete()`, where `CSRFToken.user` is a ForeignKey to `Profile`. Django rejects the assignment with `ValueError: Cannot assign "<JWTUser object>": "CSRFToken.user" must be a "Profile" instance.`

This breaks login session validation, logout, token refresh, and every downstream feature that depends on a valid session (notifications, application wizard, admin tools). Additionally, 9 other user-reported findings cover related UX and functional issues including cache reset URL pollution, application wizard 400 errors, stale auth state on role switch, raw audit log entries in the activity feed, and CSP violations on connectivity loss.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an authenticated user calls `GET /api/v1/auth/session/` THEN the system returns HTTP 500 because `SessionView.get` calls `_generate_csrf_token(request.user)` where `request.user` is a `JWTUser` instance, and `CSRFToken.objects.create(user=user, ...)` raises `ValueError` since `CSRFToken.user` is a ForeignKey to `Profile`

1.2 WHEN an authenticated user calls `POST /api/v1/auth/logout/` THEN the system returns HTTP 500 because `LogoutView.post` calls `CSRFToken.objects.filter(user=request.user).delete()` where `request.user` is a `JWTUser` instance, and Django's FK lookup rejects the non-`Profile` object

1.3 WHEN an authenticated user calls `POST /api/v1/auth/refresh/` and the refresh succeeds THEN the system returns HTTP 500 because `RefreshView.post` calls `_generate_csrf_token(user)` where `user` is a `Profile` instance looked up from the DB, but the same code path is shared and the function signature accepts any object — when called from `SessionView` it receives `JWTUser` instead

1.4 WHEN the frontend receives a 500 from `/api/v1/auth/session/` THEN the CSRF token is never set, causing subsequent state-changing requests to fail with 403 `CSRF_VALIDATION_FAILED`, which triggers the frontend's CSRF retry logic to call `/api/v1/auth/session/` again, creating a cascade of 500 errors

1.5 WHEN the `runOneTimeRuntimeCacheReset()` function in `apps/admissions/src/main.tsx` executes a cache reset THEN the system appends `?_cache_reset=post-qa-2026-04-02` to the URL via `window.location.replace()` but never removes the query parameter after the reset completes, leaving a confusing URL visible to visitors

1.6 WHEN a student submits `POST /api/v1/applications/` with application wizard data THEN the system returns HTTP 400 due to validation failures in `ApplicationCreateSerializer` — this is a separate issue from the CSRF/session bug and requires investigation of the serializer's required field expectations versus what the wizard sends

1.7 WHEN a user logs out and a different user (e.g., admin after student) logs in on the same browser THEN the frontend auth context does not fully clear the previous user's role and session state, causing the new user to be routed to the wrong dashboard based on stale role data

1.8 WHEN the admin dashboard's recent activity feed loads THEN the system displays raw audit log entries (e.g., "POST auth", "POST errors") instead of meaningful application event descriptions, because the feed queries `AuditLog` entries without filtering or mapping to user-friendly event labels

1.9 WHEN the browser loses network connectivity THEN the offline detection mechanism uses inline event handlers that violate the `Content-Security-Policy` directive `script-src 'self'`, causing CSP errors in the browser console

1.10 WHEN a user successfully re-logs in after a previous session expired THEN the notification system fails to load because the session endpoint returns 500 (same root cause as 1.1), preventing the notification polling/subscription from initializing

### Expected Behavior (Correct)

2.1 WHEN an authenticated user calls `GET /api/v1/auth/session/` THEN the system SHALL resolve the `JWTUser` to a `Profile` instance by looking up `Profile.objects.get(id=user.id)` before passing it to `CSRFToken.objects.create()`, and return the session data with a valid `X-CSRF-Token` header

2.2 WHEN an authenticated user calls `POST /api/v1/auth/logout/` THEN the system SHALL filter CSRF tokens by `user_id=request.user.id` instead of `user=request.user`, successfully deleting the user's CSRF tokens and returning HTTP 200 with cleared auth cookies

2.3 WHEN an authenticated user calls `POST /api/v1/auth/refresh/` and the refresh succeeds THEN the system SHALL generate a new CSRF token using the `Profile` instance already looked up from the database (which `RefreshView` already does correctly), ensuring no `ValueError` is raised

2.4 WHEN the session endpoint returns a valid response with an `X-CSRF-Token` header THEN the frontend SHALL capture and store the CSRF token, and subsequent state-changing requests SHALL include the valid token, eliminating the 403→500 cascade

2.5 WHEN `runOneTimeRuntimeCacheReset()` completes the cache reset and triggers `window.location.replace()` THEN the system SHALL remove the `_cache_reset` query parameter from the URL after the reset is acknowledged, so visitors see a clean URL

2.6 WHEN a student submits `POST /api/v1/applications/` with valid wizard data THEN the system SHALL accept the payload and create the application, returning HTTP 201 — the serializer validation SHALL align with the fields the wizard actually sends

2.7 WHEN a user logs out THEN the frontend auth context SHALL fully clear all cached user data, role state, and session references so that a subsequent login by a different user routes correctly based on the new user's role

2.8 WHEN the admin dashboard's recent activity feed loads THEN the system SHALL display meaningful application event descriptions (e.g., "Application submitted", "Payment verified") instead of raw audit log method/path entries

2.9 WHEN the browser loses network connectivity THEN the offline detection mechanism SHALL use CSP-compliant event handling (e.g., `addEventListener`) instead of inline event handlers, avoiding CSP violations

2.10 WHEN a user successfully re-logs in after a previous session expired THEN the session endpoint SHALL return valid session data with a CSRF token, allowing the notification system to initialize and load correctly

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `LoginView.post` authenticates a user and calls `_generate_csrf_token(user)` with a `Profile` instance (as it does today, since it looks up the user from the database) THEN the system SHALL CONTINUE TO generate and store a valid CSRF token and return it in the `X-CSRF-Token` response header

3.2 WHEN `RefreshView.post` rotates tokens and calls `_generate_csrf_token(user)` with a `Profile` instance looked up from the database THEN the system SHALL CONTINUE TO generate a new CSRF token and return it in the `X-CSRF-Token` response header

3.3 WHEN the `CSRFEnforcementMiddleware` validates a state-changing request THEN the system SHALL CONTINUE TO look up the CSRF token hash scoped to `user_id` and reject requests with missing or invalid tokens with HTTP 403

3.4 WHEN an unauthenticated user accesses exempt endpoints (login, register, password-reset, error report) THEN the system SHALL CONTINUE TO skip CSRF validation and process the request normally

3.5 WHEN `DeviceSession.objects.create(user=user, ...)` is called in `LoginView.post` with a `Profile` instance THEN the system SHALL CONTINUE TO create device sessions correctly

3.6 WHEN the frontend's `ApiClient` receives a 401 response THEN the system SHALL CONTINUE TO attempt a single token refresh via `POST /api/v1/auth/refresh/` and retry the original request, following the existing intercept-refresh-retry pattern

3.7 WHEN the frontend's `ApiClient` receives a 403 with `CSRF_VALIDATION_FAILED` THEN the system SHALL CONTINUE TO re-fetch the CSRF token from the session endpoint and retry the original request once

3.8 WHEN the `runOneTimeRuntimeCacheReset()` function determines that the cache has already been reset (localStorage key matches the current version) THEN the system SHALL CONTINUE TO skip the reset and proceed with normal app initialization

3.9 WHEN a student accesses the application wizard and the session is valid THEN the system SHALL CONTINUE TO load the wizard steps, auto-save drafts, and allow document uploads without interruption

3.10 WHEN the Vite chunk auto-reload mechanism detects a stale chunk after deployment THEN the system SHALL CONTINUE TO perform a controlled page reload following the existing cooldown and rate-limiting logic
