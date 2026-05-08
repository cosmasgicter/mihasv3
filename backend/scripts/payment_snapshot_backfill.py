#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Backfill ``metadata.snapshot`` on legacy ``payments`` rows.

Spec:       ``.kiro/specs/payment-hardening``
Task:       4.1 — Write ``backend/scripts/payment_snapshot_backfill.py``
Phase:      Phase 1 (additive). See design.md §"Phased Rollout".
Requirements satisfied:
    - R6.2 — every Payment ends up with a ``metadata.snapshot`` holding
      ``expected_amount``, ``currency``, ``residency_category``, ``program_code``,
      ``intake_id``, ``waiver_applied``, ``original_amount``, and ``fee_source``.
    - R6.3 — the snapshot is **immutable**: rows that already carry a snapshot
      are never overwritten (re-checked inside the atomic block).
    - R22.7 — backward compatibility with existing Payment rows; no new
      columns or constraints are introduced, only additive metadata writes.

Rollback strategy
-----------------
This script is purely additive: it only writes ``metadata.snapshot`` when
the key is absent. If Phase 1 is rolled back, the populated snapshot keys
remain on the rows and are simply ignored by older code paths that read
``metadata`` without the new service-layer contract. **No rollback of the
backfill itself is required.** Leaving the script in place is the correct
response — re-running it post-rollback is a no-op because every touched
row already carries a snapshot.

FeeResolver dependency
----------------------
The design specifies a new method ``FeeResolver.resolve_for_payment_snapshot(
application) -> tuple[ResolvedFee, PaymentSnapshot]``. At the time this
script was written the method is **not yet present** on
``backend/apps/documents/fee_resolver.py``. The backfill gracefully
handles both cases:

    * If ``resolve_for_payment_snapshot`` exists, call it and serialize the
      returned ``PaymentSnapshot`` into the metadata dict.
    * Otherwise fall back to the existing
      ``FeeResolver.resolve_fee(program_code, nationality, country)`` and
      build the snapshot dict in-place using the Application and Payment
      fields (``original_amount`` defaults to the resolved ``amount``,
      ``waiver_applied`` is ``False`` for the backfill path, ``fee_source``
      is ``"backfill"``).

Usage
-----
    python backend/scripts/payment_snapshot_backfill.py              # apply
    python backend/scripts/payment_snapshot_backfill.py --dry-run    # preview

Exit codes
----------
    0 — success (including dry-run with no writes required)
    1 — unhandled error during iteration
    2 — Django/environment configuration error

Operational notes
-----------------
    * Rows are streamed via ``QuerySet.iterator(chunk_size=200)`` on the
      primary-key queryset to keep the Neon session small.
    * Batches of 200 IDs are wrapped in ``transaction.atomic()`` to keep
      row-lock hold times low (Neon's autoscaled compute prefers short
      transactions).
    * The queryset filter is ``metadata IS NULL OR NOT metadata ? 'snapshot'``
      (implemented via Django's ``JSONField`` ``has_key`` lookup).
    * Ambiguous rows — no ``application_id``, missing program, or both
      ``nationality`` and ``country`` unset — emit a ``WARNING`` with the
      payment id and are skipped without mutation.
    * WARNINGs go through ``logging``; the planned-writes preview and the
      final summary are emitted via ``print()`` so they appear in stdout
      regardless of the Django logging config.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from decimal import Decimal
from itertools import islice
from pathlib import Path
from typing import Any, Iterable, Iterator


# ---------------------------------------------------------------------------
# Django bootstrap (standalone-script friendly)
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent  # backend/

if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

try:
    import django  # noqa: E402
except ImportError as exc:  # pragma: no cover - env safety net
    print(f"ERROR: Django is not available in this environment: {exc}", file=sys.stderr)
    sys.exit(2)

django.setup()

from django.db import transaction  # noqa: E402
from django.db.models import Q  # noqa: E402
from django.utils import timezone  # noqa: E402

from apps.applications.models import Application  # noqa: E402
from apps.catalog.models import Program  # noqa: E402
from apps.documents.fee_resolver import FeeResolver  # noqa: E402
from apps.documents.models import Payment  # noqa: E402


logger = logging.getLogger("payment_snapshot_backfill")

BATCH_SIZE = 200
CHUNK_SIZE = 200


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _batched(iterable: Iterable[Any], size: int) -> Iterator[list[Any]]:
    """Yield successive lists of up to *size* items from *iterable*."""
    it = iter(iterable)
    while True:
        chunk = list(islice(it, size))
        if not chunk:
            return
        yield chunk


def _is_ambiguous(application: Application) -> tuple[bool, str]:
    """Return ``(True, reason)`` if the application lacks resolvable fee inputs."""
    program_code = (application.program or "").strip()
    if not program_code:
        return True, "missing program"

    nationality = (application.nationality or "").strip()
    country = (application.country or "").strip()
    if not nationality and not country:
        return True, "both nationality and country unset"

    # Confirm the program code actually resolves to a live Program row. If the
    # legacy value is a stale free-text program name, treat the row as
    # ambiguous so we don't silently attach a wrong fee snapshot.
    try:
        Program.objects.get(code=program_code, is_active=True)
        return False, ""
    except Program.DoesNotExist:
        try:
            Program.objects.get(name=program_code, is_active=True)
            return False, ""
        except Program.DoesNotExist:
            pass

    try:
        Program.objects.get(id=program_code, is_active=True)
        return False, ""
    except (Program.DoesNotExist, ValueError):
        return True, f"program '{program_code}' does not match an active Program"


def _build_snapshot(
    application: Application,
    payment: Payment,
    resolver: FeeResolver,
) -> dict[str, Any]:
    """Return the snapshot dict for *payment*.

    Prefers the design-spec method ``FeeResolver.resolve_for_payment_snapshot``
    when present; otherwise composes the snapshot using the existing
    ``resolve_fee`` method plus Application + Payment fields.
    """
    method = getattr(resolver, "resolve_for_payment_snapshot", None)
    if callable(method):
        result = method(application)
        # Design contract: returns (ResolvedFee, PaymentSnapshot). Some
        # implementations may return only PaymentSnapshot — support both.
        snapshot_obj = result[1] if isinstance(result, tuple) else result
        return {
            "expected_amount": str(snapshot_obj.expected_amount),
            "currency": snapshot_obj.currency,
            "residency_category": snapshot_obj.residency_category,
            "program_code": snapshot_obj.program_code,
            "intake_id": snapshot_obj.intake_id,
            "waiver_applied": bool(snapshot_obj.waiver_applied),
            "original_amount": str(snapshot_obj.original_amount),
            "fee_source": snapshot_obj.fee_source,
        }

    # Fallback: build the snapshot directly from the existing interface.
    resolved = resolver.resolve_fee(
        program_code=application.program,
        nationality=application.nationality,
        country=application.country,
    )
    expected_amount = resolved.amount
    original_amount = (
        payment.amount if payment.amount is not None else expected_amount
    )
    currency = (resolved.currency or payment.currency or "ZMW").upper()
    intake_value = getattr(application, "intake", None)
    intake_id = str(intake_value) if intake_value else None

    return {
        "expected_amount": str(Decimal(expected_amount).quantize(Decimal("0.01"))),
        "currency": currency,
        "residency_category": resolved.residency_category,
        "program_code": application.program,
        "intake_id": intake_id,
        "waiver_applied": False,
        "original_amount": str(Decimal(original_amount).quantize(Decimal("0.01"))),
        "fee_source": "backfill",
    }


# ---------------------------------------------------------------------------
# Core backfill
# ---------------------------------------------------------------------------


def run_backfill(dry_run: bool) -> dict[str, int]:
    """Iterate eligible payments and populate ``metadata.snapshot``.

    Returns a counter dict: ``updated``, ``skipped_ambiguous``,
    ``already_had_snapshot``, ``errored``.
    """
    resolver = FeeResolver()
    counters = {
        "updated": 0,
        "skipped_ambiguous": 0,
        "already_had_snapshot": 0,
        "errored": 0,
    }

    # Eligible rows: metadata is NULL, OR metadata is present but lacks a
    # 'snapshot' key. The jsonb ``?`` operator (``has_key``) is the natural fit.
    eligible = (
        Payment.objects
        .filter(Q(metadata__isnull=True) | ~Q(metadata__has_key="snapshot"))
        .order_by("created_at", "id")
        .values_list("id", flat=True)
    )

    id_stream = eligible.iterator(chunk_size=CHUNK_SIZE)

    for batch_ids in _batched(id_stream, BATCH_SIZE):
        with transaction.atomic():
            for pid in batch_ids:
                try:
                    _process_one(pid, resolver, dry_run, counters)
                except Exception as exc:  # noqa: BLE001 - surface and continue
                    counters["errored"] += 1
                    logger.warning(
                        "Payment %s: unexpected error during backfill: %s", pid, exc
                    )

    return counters


def _process_one(
    payment_id: Any,
    resolver: FeeResolver,
    dry_run: bool,
    counters: dict[str, int],
) -> None:
    """Process a single payment row inside an open ``transaction.atomic()``."""
    try:
        payment = Payment.objects.select_for_update().get(pk=payment_id)
    except Payment.DoesNotExist:
        # Row vanished between the ID fetch and the locked read — ignore.
        return

    # R6.3 — re-check snapshot absence under the row lock.
    existing_metadata = payment.metadata or {}
    if isinstance(existing_metadata, dict) and existing_metadata.get("snapshot"):
        counters["already_had_snapshot"] += 1
        return

    if payment.application_id is None:
        logger.warning("Payment %s has no application_id; skipping", payment.id)
        counters["skipped_ambiguous"] += 1
        return

    try:
        application = Application.objects.get(pk=payment.application_id)
    except Application.DoesNotExist:
        logger.warning(
            "Payment %s: application %s does not exist; skipping",
            payment.id,
            payment.application_id,
        )
        counters["skipped_ambiguous"] += 1
        return

    ambiguous, reason = _is_ambiguous(application)
    if ambiguous:
        logger.warning(
            "Payment %s: ambiguous program/residency (%s); skipping",
            payment.id,
            reason,
        )
        counters["skipped_ambiguous"] += 1
        return

    try:
        snapshot = _build_snapshot(application, payment, resolver)
    except Program.DoesNotExist:
        logger.warning(
            "Payment %s: program '%s' could not be resolved; skipping",
            payment.id,
            application.program,
        )
        counters["skipped_ambiguous"] += 1
        return
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Payment %s: snapshot construction failed (%s); skipping",
            payment.id,
            exc,
        )
        counters["skipped_ambiguous"] += 1
        return

    if dry_run:
        print(
            f"[dry-run] would write snapshot for payment {payment.id}: {snapshot}"
        )
        counters["updated"] += 1
        return

    # Merge non-destructively: never overwrite sibling keys in metadata.
    new_metadata = dict(existing_metadata) if isinstance(existing_metadata, dict) else {}
    # R6.3 final guard: only write when the key is still absent.
    if new_metadata.get("snapshot"):
        counters["already_had_snapshot"] += 1
        return
    new_metadata["snapshot"] = snapshot

    payment.metadata = new_metadata
    payment.updated_at = timezone.now()
    payment.save(update_fields=["metadata", "updated_at"])
    counters["updated"] += 1


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _configure_logging() -> None:
    """Emit WARNINGs to stdout with a short, greppable prefix."""
    if logger.handlers:
        return
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.WARNING)
    logger.propagate = False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill metadata.snapshot on legacy payments rows. "
            "Safe to re-run; existing snapshots are preserved."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned writes without mutating any rows.",
    )
    args = parser.parse_args(argv)

    _configure_logging()

    try:
        counters = run_backfill(dry_run=args.dry_run)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: backfill failed: {exc}", file=sys.stderr)
        return 1

    print(
        "backfill complete: "
        f"updated={counters['updated']}, "
        f"skipped_ambiguous={counters['skipped_ambiguous']}, "
        f"already_had_snapshot={counters['already_had_snapshot']}, "
        f"errored={counters['errored']}, "
        f"dry_run={args.dry_run}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
