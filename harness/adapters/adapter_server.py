#!/usr/bin/env python3
"""Deterministic local adapters for the Admissions V2 E2E harness.

One tiny stdlib-only HTTP service that stands in for three external systems so
the harness never touches the real Lenco gateway or real DNS, and so the
Playwright gates can assert that background work drained:

  Payment (Lenco-compatible)
    POST /collections/mobile-money      -> accept a collection, deterministically
    GET  /collections/status/{ref}      -> deterministic provider status
    POST /__/payment-rule               -> steer a reference's outcome (E2E)

  Domain verification (deterministic DNS)
    GET  /dns/records?hostname=<h>      -> published records for a host
    POST /dns/publish {hostname,records}-> publish records (make verify pass)
    POST /dns/reset                     -> clear all published records

  Operational observer (the "undrained required jobs" gate reads this)
    GET  /__/queue-depth                -> Celery broker depth (via raw Redis) +
                                           count of unsettled payment collections
    GET  /__/events                     -> every payment/domain request seen
    POST /__/reset                      -> clear observer + payment + dns state
    GET  /__/health                     -> liveness for the compose healthcheck

Everything is deterministic and in-memory. There are no real credentials and no
outbound network calls except an optional raw-socket LLEN to the local Redis.
"""

from __future__ import annotations

import hashlib
import json
import os
import socket
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("ADAPTER_PORT", "9099"))
REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
# Celery broker queues to inspect for the drain gate (comma-separated).
CELERY_QUEUES = [q.strip() for q in os.environ.get("CELERY_QUEUES", "celery").split(",") if q.strip()]

_LOCK = threading.Lock()

# reference -> {"final","pending_polls","polls","amount","currency","phone","status"}
_PAYMENTS: dict[str, dict] = {}
# hostname -> [record strings]
_DNS: dict[str, list[str]] = {}
# chronological log of every request the adapter handled (for /__/events)
_EVENTS: list[dict] = []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _record_event(kind: str, detail: dict) -> None:
    _EVENTS.append({"at": _now(), "kind": kind, **detail})
    # keep the log bounded
    if len(_EVENTS) > 2000:
        del _EVENTS[: len(_EVENTS) - 2000]


def _provider_reference(reference: str) -> str:
    """The provider's own identifier for a collection, derived from ours.

    Real Lenco answers with two identifiers: the ``reference`` the platform sent
    and a ``lencoReference`` it minted itself. The platform stores the second one
    as ``payments.lenco_reference`` and its integrity gate refuses to settle a
    payment without it (``payment_state_machine`` check 3), so the adapter has to
    produce one to be a faithful stand-in.

    Derived rather than random so it is deterministic: the same platform
    reference always maps to the same provider reference, which keeps a replayed
    status poll byte-identical.
    """
    digest = hashlib.sha256((reference or "").encode("utf-8")).hexdigest()[:12].upper()
    return f"LNC-{digest}"


def _decide_payment_outcome(amount: str, phone: str) -> dict:
    """Deterministic outcome from the request itself (no randomness).

    Levers (so Phase-8 payment journeys can drive the matrix without config):
      * phone containing '0000000'         -> immediate provider failure
      * amount ending in '.13'             -> immediate provider failure
      * phone containing '9999'            -> two 'pending' polls then success
      * phone containing '5555'            -> the collection POST answers 5xx, so
                                             the platform never learns whether the
                                             customer was prompted (see below)
      * otherwise                          -> immediate success
    A reference can always be overridden via POST /__/payment-rule.
    """
    phone = phone or ""
    amount = str(amount or "")
    if "0000000" in phone or amount.endswith(".13"):
        return {"final": "failed", "pending_polls": 0}
    if "5555" in phone:
        # Added for admissions-v2 task 8.3. A 5xx on the collection POST is the
        # only way a real provider produces the `provider_processing` phase: the
        # backend classifies it as `unknown` (payment_helpers.
        # _classify_mobile_money_response), the Payment row stays pending, and
        # `derive_payment_phase` answers "we are waiting on the provider, the
        # student can do nothing". The collection is still tracked here so the
        # drain gate sees it settle.
        return {"final": "successful", "pending_polls": 3, "initiate_http": 503}
    if "9999" in phone:
        return {"final": "successful", "pending_polls": 2}
    return {"final": "successful", "pending_polls": 0}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # -- helpers ---------------------------------------------------------
    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            return {}

    def log_message(self, fmt, *args):  # quieter logs
        return

    # -- routing ---------------------------------------------------------
    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path in ("/__/health", "/health"):
            return self._send(200, {"ok": True, "service": "harness-adapters", "at": _now()})

        if path == "/dns/records":
            hostname = (parse_qs(parsed.query).get("hostname") or [""])[0].strip().lower()
            with _LOCK:
                records = list(_DNS.get(hostname, []))
                _record_event("dns.lookup", {"hostname": hostname, "records": records})
            return self._send(200, {"hostname": hostname, "records": records})

        if path.startswith("/collections/status/"):
            reference = path.rsplit("/", 1)[-1]
            return self._collection_status(reference)

        if path == "/__/queue-depth":
            return self._queue_depth()

        if path == "/__/events":
            with _LOCK:
                return self._send(200, {"count": len(_EVENTS), "events": list(_EVENTS)})

        return self._send(404, {"error": "not_found", "path": path})

    def do_POST(self):  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        body = self._read_json()

        if path == "/collections/mobile-money":
            return self._mobile_money(body)

        if path == "/dns/publish":
            hostname = str(body.get("hostname", "")).strip().lower()
            records = [str(r) for r in (body.get("records") or [])]
            if not hostname:
                return self._send(400, {"error": "hostname required"})
            with _LOCK:
                _DNS[hostname] = records
                _record_event("dns.publish", {"hostname": hostname, "records": records})
            return self._send(200, {"published": True, "hostname": hostname, "records": records})

        if path == "/dns/reset":
            with _LOCK:
                _DNS.clear()
            return self._send(200, {"reset": "dns"})

        if path == "/__/payment-rule":
            reference = str(body.get("reference", "")).strip()
            if not reference:
                return self._send(400, {"error": "reference required"})
            with _LOCK:
                rule = _PAYMENTS.setdefault(reference, {"polls": 0})
                if "final" in body:
                    rule["final"] = str(body["final"])
                if "pending_polls" in body:
                    rule["pending_polls"] = int(body["pending_polls"])
            return self._send(200, {"reference": reference, "rule": _PAYMENTS[reference]})

        if path == "/__/reset":
            with _LOCK:
                _PAYMENTS.clear()
                _DNS.clear()
                _EVENTS.clear()
            return self._send(200, {"reset": "all"})

        return self._send(404, {"error": "not_found", "path": path})

    # -- payment ---------------------------------------------------------
    def _mobile_money(self, body: dict):
        reference = str(body.get("reference") or "").strip()
        amount = str(body.get("amount") or "")
        phone = str(body.get("phone") or "")
        operator = str(body.get("operator") or "")
        if not reference:
            return self._send(400, {"status": "error", "message": "reference is required", "data": {}})

        with _LOCK:
            existing = _PAYMENTS.get(reference, {})
            decided = _decide_payment_outcome(amount, phone)
            rule = {
                "final": existing.get("final", decided["final"]),
                "pending_polls": existing.get("pending_polls", decided["pending_polls"]),
                "polls": 0,
                "amount": amount,
                "currency": body.get("currency", "ZMW"),
                "phone": phone,
                "operator": operator,
                "settled": False,
            }
            _PAYMENTS[reference] = rule
            _record_event(
                "payment.initiate",
                {"reference": reference, "amount": amount, "operator": operator, "final": rule["final"]},
            )
            # Initial provider status: pending when polls are required, else the
            # collection is accepted and will read successful on first poll.
            initial = "pay-offline" if rule["pending_polls"] > 0 else "pending"
            # A provider that accepted the work but could not answer the POST.
            # The collection is still live (status polling resolves it), which is
            # exactly what makes `unknown` different from `rejected`.
            initiate_http = int(decided.get("initiate_http") or 200)

        if initiate_http >= 500:
            _record_event("payment.initiate.provider_error", {"reference": reference, "http": initiate_http})
            return self._send(
                initiate_http,
                {
                    "status": "error",
                    "message": "Provider service temporarily unavailable",
                    "data": {"reference": reference, "type": "mobile-money"},
                },
            )

        return self._send(
            200,
            {
                "status": "success",
                "message": "Collection request accepted",
                "data": {
                    "id": reference,
                    "reference": reference,
                    # Same provider-owned identifier the status payload returns,
                    # stable for a given platform reference so a retry that mints
                    # a fresh platform reference also gets a fresh provider one.
                    "lencoReference": _provider_reference(reference),
                    "status": initial,
                    "type": "mobile-money",
                    "amount": amount,
                    "operator": operator,
                },
            },
        )

    def _collection_status(self, reference: str):
        with _LOCK:
            rule = _PAYMENTS.get(reference)
            if rule is None:
                # Unknown reference: behave like a provider that has not seen it.
                _record_event("payment.status.unknown", {"reference": reference})
                return self._send(200, {"status": "success", "data": {"status": "pending", "reference": reference}})

            rule["polls"] = rule.get("polls", 0) + 1
            if rule["polls"] <= rule.get("pending_polls", 0):
                provider_status = "pay-offline"
            else:
                provider_status = rule.get("final", "successful")
                rule["settled"] = provider_status in ("successful", "failed")
            _record_event(
                "payment.status",
                {"reference": reference, "poll": rule["polls"], "status": provider_status},
            )
            amount = rule.get("amount", "")
            currency = rule.get("currency", "ZMW")

        return self._send(
            200,
            {
                "status": "success",
                "data": {
                    "status": provider_status,
                    "reference": reference,
                    # The provider's OWN identifier for the collection, which is
                    # not the platform's reference. `payment_state_machine`
                    # check 3 requires it before any transition to `successful`
                    # and files a `missing_provider_reference` risk flag without
                    # it, and `_core._transition` stores it as
                    # `payments.lenco_reference` — the join key reconciliation
                    # uses later. Real Lenco returns it on the collection status
                    # payload; an adapter that omitted it would make every
                    # settlement look like an integrity failure, so this field is
                    # contract fidelity, not decoration.
                    "lencoReference": _provider_reference(reference),
                    "amount": amount,
                    "currency": currency,
                    "settledAmount": amount if provider_status == "successful" else "0",
                },
            },
        )

    # -- operational observer -------------------------------------------
    def _queue_depth(self):
        broker = _redis_total_llen(CELERY_QUEUES)
        with _LOCK:
            unsettled = [
                ref
                for ref, r in _PAYMENTS.items()
                if r.get("pending_polls", 0) > 0 and not r.get("settled", False)
            ]
        return self._send(
            200,
            {
                "broker_queue_depth": broker,          # -1 when Redis unreachable
                "celery_queues": CELERY_QUEUES,
                "unsettled_payment_collections": len(unsettled),
                "unsettled_references": unsettled,
            },
        )


def _redis_total_llen(queues: list[str]) -> int:
    """Sum LLEN across the given Redis lists using the raw RESP protocol.

    Returns -1 if Redis is unreachable so the caller can distinguish "cannot
    tell" from "empty". Stdlib sockets only — the adapter has no dependencies.
    """
    try:
        with socket.create_connection((REDIS_HOST, REDIS_PORT), timeout=3) as sock:
            total = 0
            for queue in queues:
                cmd = (
                    f"*2\r\n$4\r\nLLEN\r\n${len(queue)}\r\n{queue}\r\n"
                ).encode("utf-8")
                sock.sendall(cmd)
                line = _read_line(sock)
                if line.startswith(":"):
                    total += int(line[1:])
            return total
    except (OSError, ValueError):
        return -1


def _read_line(sock: socket.socket) -> str:
    buf = bytearray()
    while not buf.endswith(b"\r\n"):
        chunk = sock.recv(1)
        if not chunk:
            break
        buf.extend(chunk)
    return buf.decode("utf-8", "replace").strip()


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[harness-adapters] listening on :{PORT} (redis={REDIS_HOST}:{REDIS_PORT}, queues={CELERY_QUEUES})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
