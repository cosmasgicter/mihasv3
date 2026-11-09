"""Two clients behind the real edge must not share a rate-limit bucket.

SJR task 4.3 (design R9-c, clause 2.12). Stdlib only: the harness ``adapters``
image is ``python:3.12-slim`` with no packages. Run from two containers on the
harness network, so each has its own address as Caddy sees it:

    exhaust   send (limit + 1) requests to each scope and expect 429 on the last
    fresh     send one request to each scope and expect anything but 429

Requests go to ``http://caddy/`` with ``Host: localhost`` (the host the web
healthcheck uses). Bodies are invalid on purpose: no account is created or
touched, and the limiter counts the request either way. Nothing here prints a
credential or a response body.
"""
from __future__ import annotations

import json
import sys
import uuid
import urllib.error
import urllib.request

EDGE = "http://caddy"
# (scope name, path, body factory, requests allowed per window; see RateLimitMiddleware.SCOPE_LIMITS)
# The login body uses a different address every time: the login view keeps its own
# per-account attempt counter, and this check is about the per-client edge budget.
SCOPES = (
    (
        "auth-login",
        "/api/v1/auth/login/",
        lambda: {"email": f"edge-check-{uuid.uuid4().hex}@example.invalid", "password": "not-a-password"},
        10,
    ),
    ("auth-register", "/api/v1/auth/register/", lambda: {"email": "not-an-email"}, 5),
)


def post(path: str, body: dict) -> int:
    request = urllib.request.Request(
        EDGE + path,
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Host": "localhost", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def main(mode: str) -> int:
    failures = []
    for name, path, make_body, limit in SCOPES:
        if mode == "exhaust":
            statuses = [post(path, make_body()) for _ in range(limit + 1)]
            if statuses[-1] != 429:
                failures.append(f"{name}: request {limit + 1} returned {statuses[-1]}, expected 429")
            elif 429 in statuses[:-1]:
                failures.append(f"{name}: limited before request {limit + 1}")
            else:
                print(f"edge-check exhaust {name}: 429 on request {limit + 1}")
        elif mode == "fresh":
            status = post(path, make_body())
            if status == 429:
                failures.append(f"{name}: a fresh client address was limited (429)")
            else:
                print(f"edge-check fresh {name}: first request {status}, not limited")
        else:
            print(f"unknown mode {mode!r}", file=sys.stderr)
            return 2
    for failure in failures:
        print(f"EDGE CHECK FAILED - {failure}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
