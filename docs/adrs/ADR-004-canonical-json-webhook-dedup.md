# ADR-004: Canonical JSON Plus `WebhookEventIdentity` For Webhook Deduplication

Status: Accepted
Date: 2026-05-09
Related spec: .kiro/specs/payment-hardening/
Requirements satisfied: R8.1, R8.3, R8.4

## Context

Lenco retries webhooks aggressively on any non-2xx response and does not always supply a stable provider event id. The previous implementation deduplicated events by concatenating a small number of payload fields into a string and hashing the result. Two problems followed: the string was order-sensitive to dict iteration, so the same payload could produce different fingerprints across Python versions or after minor Lenco payload changes, and the concat included only the fields the implementer happened to think of, so a Lenco change that added a new key left the dedup silently weaker.

We need a deterministic fingerprint that is stable across Python minor versions, across Lenco payload shape changes, and across non-ASCII characters that can appear in customer names, while still being cheap to compute inside the webhook hot path.

## Decision

`WebhookProcessor.canonical_json(payload)` serialises any payload with:

```python
json.dumps(
    payload,
    sort_keys=True,
    separators=(",", ":"),
    default=str,
    ensure_ascii=False,
).encode("utf-8")
```

The payload hash is `sha256(canonical_json(payload)).hexdigest()`. `sort_keys=True` eliminates dict-iteration nondeterminism. `separators=(',', ':')` removes whitespace sensitivity. `default=str` renders `Decimal`, `datetime`, and `UUID` deterministically. `ensure_ascii=False` preserves the byte shape of non-ASCII characters so a later re-encoding does not drift.

The dedup primitive is the `WebhookEventIdentity` tuple `(provider_event_id, event_type, reference, payload_hash)`. When `provider_event_id` is present, dedup is keyed on it. When it is absent, dedup falls back to `(event_type, reference, payload_hash)`. Property 20 in the PBT harness asserts the round-trip invariant `canonical_json(parse(canonical_json(d))) == canonical_json(d)`.

The identity tuple is stored as `payload._webhook_identity` in the `webhook_event_logs.payload` jsonb column and is indexed by the partial unique index `uq_webhook_processed_reference_event` on `(reference, event_type) WHERE processed = true` and the functional index `idx_webhook_provider_event_id` on `(payload -> '_webhook_identity' ->> 'provider_event_id')`.

## Consequences

Positive: webhook dedup is resilient to Lenco adding, removing, or re-ordering optional fields that the old ad-hoc string concat would have included or missed. The fingerprint is deterministic across Python versions because `sort_keys` and `default=str` pin down both the key order and the value serialisation of non-JSON-native types. The property test catches future regressions mechanically.

Negative: canonical JSON is slightly slower than the old string concat on large payloads. Measurements inside `WebhookProcessor.compute_identity` show the cost is well under a millisecond for realistic Lenco payloads, which is acceptable inside the 200 ms webhook budget.

Operational: logs and audit records never contain the full payload. They include a short `payload_hash[:12]` prefix via the `WebhookEventIdentity.print()` pretty-printer, which is enough to correlate an event across the webhook log, audit log, and Lenco dashboard without leaking customer data.
