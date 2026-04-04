# Bugfix Requirements Document

## Introduction

The admissions frontend at `https://apply.mihas.edu.zm` can reach the backend at `https://api.mihas.edu.zm` but encounters three blocking production errors that prevent normal operation: CORS rejections on cross-origin requests (including the `X-CSRF-Token` header), pagination sending `page=0` which Django rejects with 404, and an SSE reconnect loop caused by the same CORS misconfiguration. Together these bugs render the production admissions frontend non-functional for authenticated users.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the frontend at `https://apply.mihas.edu.zm` sends `GET /api/v1/auth/session/` to `https://api.mihas.edu.zm` THEN the system returns HTTP 403 because the backend CORS configuration in `base.py` does not include `x-csrf-token` in `CORS_ALLOW_HEADERS`, causing the browser to reject the preflight response for requests that include the `X-CSRF-Token` header

1.2 WHEN the frontend sends `PUT /api/v1/notifications/read-all/` with the `X-CSRF-Token` request header THEN the browser blocks the request with "Request header field x-csrf-token is not allowed by Access-Control-Allow-Headers in preflight response" because `CORS_ALLOW_HEADERS` in `base.py` lists only `default_headers`, `cache-control`, and `last-event-id` — it does not include `x-csrf-token`

1.3 WHEN the student dashboard polling hook (`useStudentDashboardPolling`) calls `applicationService.list({ page: 0, pageSize: 50, ... })` THEN the backend returns HTTP 404 because Django's `PageNumberPagination` is 1-based and does not recognize `page=0` as a valid page number

1.4 WHEN `data/applications.ts` fetches applications with `page: filters.page || 0` (defaulting to 0) THEN the backend returns HTTP 404 for the same 1-based pagination reason

1.5 WHEN the SSE client (`sseClient.ts`) opens an `EventSource` connection to the API with `withCredentials: true` THEN the connection fails repeatedly because the CORS preflight for the SSE endpoint also rejects the cross-origin request, causing `[SSEClient] Scheduling reconnect in 1000ms` to loop indefinitely with exponential backoff

### Expected Behavior (Correct)

2.1 WHEN the frontend at `https://apply.mihas.edu.zm` sends any request with the `X-CSRF-Token` header to `https://api.mihas.edu.zm` THEN the system SHALL include `x-csrf-token` in the `Access-Control-Allow-Headers` preflight response, allowing the browser to proceed with the actual request

2.2 WHEN the frontend sends `PUT /api/v1/notifications/read-all/` (or any state-changing request) with the `X-CSRF-Token` header THEN the system SHALL accept the preflight and process the request normally, returning the expected response

2.3 WHEN the student dashboard polling hook fetches applications THEN the system SHALL send `page=1` (not `page=0`) as the minimum page number, and the backend SHALL return a valid paginated response

2.4 WHEN `data/applications.ts` fetches applications with no explicit page filter THEN the system SHALL default to `page=1` instead of `page=0`

2.5 WHEN the SSE client opens an `EventSource` connection from `https://apply.mihas.edu.zm` to `https://api.mihas.edu.zm` THEN the system SHALL allow the cross-origin SSE connection through proper CORS headers, and the client SHALL connect successfully without entering a reconnect loop

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the frontend sends requests from development origins (localhost) THEN the system SHALL CONTINUE TO allow all CORS origins via `CORS_ALLOW_ALL_ORIGINS = True` in `dev.py`

3.2 WHEN the frontend sends requests with standard headers (`Content-Type`, `Authorization`, etc.) THEN the system SHALL CONTINUE TO accept those headers as before via `default_headers`

3.3 WHEN the frontend sends `page=1` or any valid positive page number THEN the system SHALL CONTINUE TO return the correct paginated results

3.4 WHEN the frontend sends requests with `credentials: 'include'` THEN the system SHALL CONTINUE TO send and receive HTTP-only auth cookies via `CORS_ALLOW_CREDENTIALS = True`

3.5 WHEN the SSE client intentionally disconnects (page hidden, user logout) THEN the system SHALL CONTINUE TO not attempt reconnection

3.6 WHEN the production CORS configuration restricts origins THEN the system SHALL CONTINUE TO reject requests from origins not in `CORS_ALLOWED_ORIGINS` or matching `CORS_ALLOWED_ORIGIN_REGEXES`

3.7 WHEN `buildQueryString` receives valid non-page parameters (status, search, sortBy, etc.) THEN the system SHALL CONTINUE TO construct the query string correctly with all parameters present

---

## Bug Condition Derivation

### Bug 1 & 5: CORS blocks `X-CSRF-Token` header and SSE connections

```pascal
FUNCTION isBugCondition_CORS(X)
  INPUT: X of type HTTPRequest
  OUTPUT: boolean

  // Returns true when the request is cross-origin and includes X-CSRF-Token
  // or is an SSE EventSource connection from apply.mihas.edu.zm
  RETURN X.origin = "https://apply.mihas.edu.zm"
     AND X.destination = "https://api.mihas.edu.zm"
     AND (X.headers CONTAINS "X-CSRF-Token" OR X.type = "EventSource")
END FUNCTION
```

```pascal
// Property: Fix Checking — CORS allows X-CSRF-Token and SSE
FOR ALL X WHERE isBugCondition_CORS(X) DO
  response ← handlePreflight'(X)
  ASSERT "x-csrf-token" IN response.headers["Access-Control-Allow-Headers"]
     AND response.status ≠ 403
END FOR
```

```pascal
// Property: Preservation Checking — Non-allowed origins still rejected
FOR ALL X WHERE NOT isBugCondition_CORS(X) AND X.origin NOT IN CORS_ALLOWED_ORIGINS DO
  ASSERT handlePreflight(X) = handlePreflight'(X)
END FOR
```

### Bug 2: Pagination sends `page=0`

```pascal
FUNCTION isBugCondition_Pagination(X)
  INPUT: X of type PaginationParams
  OUTPUT: boolean

  RETURN X.page = 0
END FUNCTION
```

```pascal
// Property: Fix Checking — page=0 becomes page=1
FOR ALL X WHERE isBugCondition_Pagination(X) DO
  queryString ← buildQueryString'(X)
  ASSERT queryString CONTAINS "page=1"
     AND NOT queryString CONTAINS "page=0"
END FOR
```

```pascal
// Property: Preservation Checking — valid pages unchanged
FOR ALL X WHERE NOT isBugCondition_Pagination(X) AND X.page >= 1 DO
  ASSERT buildQueryString(X) = buildQueryString'(X)
END FOR
```
