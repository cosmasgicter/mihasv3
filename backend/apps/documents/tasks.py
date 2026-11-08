"""Document Celery tasks - OCR text extraction and payment polling.

Implements task 17.3 (OCR) and task 7.1 (Lenco payment polling).
Requirements: 6.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
"""

import logging
import tempfile
from datetime import timedelta

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Bounded payment-poll configuration (R6.1, R6.2, R6.5)
# ---------------------------------------------------------------------------
#
# These hard-cap the external work a single ``poll_pending_payments_task`` run
# may perform so one slow/flaky Lenco provider cannot block the single Celery
# worker. Each value is an upper bound; settings overrides are clamped to the
# requirement-mandated ceiling so a misconfiguration can only make the task
# *more* conservative, never less.
_POLL_MAX_PAYMENTS_PER_RUN = 10   # R6.1: verify at most 10 payments per run
_POLL_LENCO_TIMEOUT_SECONDS = 10  # R6.2: per external call timeout <= 10s
_POLL_LENCO_MAX_RETRIES = 2       # R6.2: at most 2 retries per external call

# Forward-only ``verify()`` error codes meaning the external call could not be
# completed (timeout/retry exhaustion or provider unreachable). These trigger a
# "skip without status transition" per R6.3 — a still-``pending`` provider
# response (``PAYMENT_PENDING``) or an integrity-gate block is NOT a transport
# failure and is counted as a processed payment.
_PROVIDER_UNAVAILABLE_CODES = frozenset({"PROVIDER_UNAVAILABLE"})


def _clamp(value, low, high, default):
    """Coerce ``value`` to an int within ``[low, high]``, else ``default``."""
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def _acquire_task_lock(task_name: str, timeout: int = 600) -> bool:
    return cache.add(f"celery_lock:{task_name}", "1", timeout=timeout)


def _release_task_lock(task_name: str):
    cache.delete(f"celery_lock:{task_name}")


@shared_task(bind=True, max_retries=0, soft_time_limit=80, time_limit=90)
def poll_pending_payments_task(self):
    """Every 10 minutes: verify pending payments 5min–24hr old via Lenco, bounded.

    Bounded for worker safety (R6.1, R6.2, R6.5):
    - verifies at most ``_POLL_MAX_PAYMENTS_PER_RUN`` (10) payments per run
    - each external Lenco verification call uses a <=10s timeout and <=2 retries
    - on timeout/retry exhaustion the payment is skipped with NO status
      transition (forward-only rules preserved), the failure is recorded
      (metric + log), and the run continues with the remaining payments
    - ``soft_time_limit``/``time_limit`` (80s/90s) guarantee the run completes
      within 90s wall-clock so the single worker is never blocked longer.

    Expiry of payments pending > 24h is handled separately (and is batched by
    the expiry-task work, R6.4).

    Requirements: 6.1, 6.2, 6.3, 6.5
    """
    if not _acquire_task_lock("poll_pending_payments_task"):
        logger.info("poll_pending_payments_task: skipped (already running)")
        return
    try:
        from django.conf import settings

        from apps.documents.models import Payment
        from apps.documents import payment_metrics
        from apps.documents.payment_service import PaymentService

        service = PaymentService()

        # Bounded poll configuration (R6.1, R6.2). Overrides are clamped so a
        # misconfiguration can never exceed the requirement ceilings.
        poll_batch = _clamp(
            getattr(settings, "PAYMENT_POLL_BATCH_SIZE", _POLL_MAX_PAYMENTS_PER_RUN),
            1, _POLL_MAX_PAYMENTS_PER_RUN, _POLL_MAX_PAYMENTS_PER_RUN,
        )
        poll_timeout = _clamp(
            getattr(settings, "PAYMENT_POLL_LENCO_TIMEOUT", _POLL_LENCO_TIMEOUT_SECONDS),
            1, _POLL_LENCO_TIMEOUT_SECONDS, _POLL_LENCO_TIMEOUT_SECONDS,
        )
        poll_retries = _clamp(
            getattr(settings, "PAYMENT_POLL_LENCO_MAX_RETRIES", _POLL_LENCO_MAX_RETRIES),
            0, _POLL_LENCO_MAX_RETRIES, _POLL_LENCO_MAX_RETRIES,
        )

        def _record_poll_outcome(payment_id, *, failed, reason=None):
            """Record one payment's poll outcome (metric + log).

            On a transport failure the payment is skipped with NO status
            transition (R6.3); the caller has already left the payment
            untouched, so this only records the skip.
            """
            if failed:
                logger.warning(
                    "poll_pending_payments_task: skipping payment %s without status "
                    "transition (%s)",
                    payment_id, reason or "verification call failed",
                )
                payment_metrics.increment(
                    "payment.reconcile.processed", tags={"outcome": "failure"},
                )
            else:
                payment_metrics.increment(
                    "payment.reconcile.processed", tags={"outcome": "success"},
                )

        now = timezone.now()
        five_minutes_ago = now - timedelta(
            seconds=int(getattr(settings, "PAYMENT_RECONCILE_MIN_AGE_SECONDS", 300))
        )
        twenty_four_hours_ago = now - timedelta(hours=24)

        # --- Expiry then bounded verification, both through PaymentService ---
        # The reconciliation sweep uses exactly the same state machine and
        # integrity gates as student/admin verification (task 8.2): there is no
        # separate worker mutator, so a replayed sweep converges instead of
        # re-deciding.
        try:
            expired_count = service.expire_stale(older_than_hours=24, batch_cap=50)
            if expired_count:
                logger.info(
                    "poll_pending_payments_task: expired %d payments via PaymentService.expire_stale",
                    expired_count,
                )
        except Exception:
            logger.exception("poll_pending_payments_task: expire_stale failed")

        pending_payments = list(
            Payment.objects.filter(
                status='pending',
                created_at__lt=five_minutes_ago,
                created_at__gt=twenty_four_hours_ago,
            )[:poll_batch]
        )
        count = len(pending_payments)
        logger.info(
            "poll_pending_payments_task: %d payments to verify (batch<=%d)",
            count, poll_batch,
        )
        if count == 0:
            return

        try:
            for payment in pending_payments:
                try:
                    # Celery worker has no authenticated actor. Use the
                    # hardened verifier with actor_id=None so reconciliation
                    # follows the same state machine and integrity gates as
                    # student/admin verification. Bound the external call so
                    # one flaky provider cannot block the run (R6.2).
                    result = service.verify(
                        payment.id,
                        actor_id=None,
                        lenco_timeout=poll_timeout,
                        lenco_max_retries=poll_retries,
                    )
                    # A provider-unavailable result means the call exhausted
                    # its timeout/retries — skip without transition (R6.3).
                    _record_poll_outcome(
                        payment.id,
                        failed=result.error in _PROVIDER_UNAVAILABLE_CODES,
                        reason=result.error,
                    )
                except SoftTimeLimitExceeded:
                    raise
                except Exception:
                    logger.exception(
                        "Failed to verify payment %s during reconcile", payment.id
                    )
                    _record_poll_outcome(payment.id, failed=True, reason="exception")
        except SoftTimeLimitExceeded:
            logger.warning(
                "poll_pending_payments_task: soft time limit reached, "
                "ending run early; remaining payments retry next run",
            )
    finally:
        _release_task_lock("poll_pending_payments_task")

@shared_task(bind=True, max_retries=3, default_retry_delay=60, soft_time_limit=120, time_limit=180)
def extract_document_text_task(self, document_id, force=False):
    """Run local OCR on an uploaded document and store the extracted text.

    Downloads the file from S3/R2, extracts text with local Tesseract, and saves
    that text on the ``ApplicationDocument`` record.

    admissions-v2 task 7.4 (R11.1, R11.9): there is no generative AI in this
    path - no vision model, no classifier, no outbound model call. Extraction is
    local, deterministic, and never becomes application data on its own.
    """
    from apps.documents.models import ApplicationDocument
    from apps.common.storage import resolve_document_object_key

    try:
        document = ApplicationDocument.objects.get(id=document_id)
    except ApplicationDocument.DoesNotExist:
        logger.error("Document %s not found", document_id)
        return

    if document.extracted_text and not force:
        logger.info("Document %s already has extracted text, skipping", document_id)
        return

    # admissions-v2 task 7.3 (R11.7): extraction state lives in
    # ``extraction_state``; it must never overwrite a human reviewer's decision.
    # Before this change a re-extract set ``verification_status = None`` and then
    # ``"ocr_processing"`` — silently erasing a reviewer's ``verified`` while
    # ``verified_by``/``verified_at`` still claimed a decision had been made,
    # because OCR progress and the human verdict shared one column.
    from apps.documents import document_evidence as evidence

    human_decided = evidence.lifecycle_of(document) in (evidence.VERIFIED, evidence.REJECTED)

    if force:
        document.extracted_text = None
        reset_fields = ["extracted_text", "extraction_state"]
        document.extraction_state = "pending"
        if not human_decided:
            document.verification_notes = None
            reset_fields.append("verification_notes")
        document.save(update_fields=reset_fields)

    file_key = resolve_document_object_key(document)
    if not file_key:
        logger.error("Document %s has no file URL", document_id)
        # Terminal state, so a pending extraction never sticks (SJR R3-c).
        evidence.record_extraction_state(document, "ocr_failed")
        return

    # Mark as processing so the frontend can distinguish "in progress" from "not started"
    evidence.record_extraction_state(document, "ocr_processing")

    try:
        from apps.common.storage import MediaStorage

        storage = MediaStorage()

        # Guard against oversized files (max 10MB for OCR)
        MAX_OCR_FILE_SIZE = 10 * 1024 * 1024
        try:
            file_obj = storage.open(file_key, "rb")
            file_bytes = file_obj.read(MAX_OCR_FILE_SIZE + 1)
            file_obj.close()
            if len(file_bytes) > MAX_OCR_FILE_SIZE:
                logger.warning("Document %s exceeds OCR size limit (%d bytes)", document_id, len(file_bytes))
                evidence.record_extraction_state(document, "ocr_skipped")
                return
        except Exception:
            logger.exception("Failed to download document %s from storage", document_id)
            raise

        suffix = "." + file_key.rsplit(".", 1)[-1] if "." in file_key else ".tmp"
        with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp.flush()

            extracted_text = None

            # admissions-v2 task 7.4 (R11.1, R11.9, STU-06): the vision-model
            # text extraction and the generative ``analyze_document`` grade /
            # identity classifier that used to run here are gone. Admissions
            # makes no generative AI call for document classification or grade
            # extraction - local Tesseract is the only extraction path, it never
            # leaves the host, and the deterministic candidate parser that maps
            # its text through the versioned alias catalogue lands with task 7.5
            # (R11.4). Manual entry is, and remains, the authoritative way a
            # grade becomes application data.
            #
            # Local OCR (deterministic, no outbound call)
            try:
                import pytesseract
                from PIL import Image

                if file_key.lower().endswith(".pdf"):
                    try:
                        from pdf2image import convert_from_path
                        images = convert_from_path(tmp.name)
                        text_parts = [pytesseract.image_to_string(img) for img in images]
                        extracted_text = "\n".join(text_parts)
                    except ImportError:
                        extracted_text = pytesseract.image_to_string(tmp.name)
                else:
                    image = Image.open(tmp.name)
                    extracted_text = pytesseract.image_to_string(image)
            except Exception:
                logger.warning("Local OCR failed for document %s", document_id)

        # A whitespace-only read is a *no text* read. Deciding the outcome from the
        # raw value instead of the normalised one reported "text found, no grades"
        # for a blank scan, which tells the student to fix their subjects when the
        # real problem is the photo.
        extracted_text = extracted_text.strip() if extracted_text else None
        if extracted_text:
            document.extracted_text = extracted_text

        # Task 7.4: no generated analysis is produced any more, so nothing is
        # written into ``verification_notes`` - that column stays a human
        # verification field (R11.7). Rows written before this change keep their
        # historical extraction blob and are surfaced read-only as labeled
        # provenance by ``apps.documents.extraction_provenance``; this task does
        # not rewrite or delete them.
        #
        # admissions-v2 task 7.5 (R11.4, R11.7): structured subject/grade
        # candidates come from the deterministic parser, which maps labels through
        # the task-7.1 versioned alias catalogue and attaches confidence +
        # provenance + the source line. They are stored as their own structured
        # record in the append-only evidence history - never in
        # ``verification_notes`` - and they are suggestions: nothing here writes
        # ``application_grades``. A candidate becomes application data only when
        # the student explicitly confirms it in the wizard.
        extraction = None
        if extracted_text and document.document_type == "result_slip":
            try:
                from apps.documents import grade_extraction

                extraction = grade_extraction.extract_candidates(document.extracted_text)
            except Exception:
                # Assistance is optional by design: a parser failure must not
                # fail the upload or lose the extracted text.
                logger.warning(
                    "Deterministic candidate parse failed for document %s", document_id, exc_info=True
                )
                extraction = None

        confirmable = len(extraction.confirmable_candidates) if extraction else 0
        if not extracted_text:
            outcome = "ocr_no_text"
        elif document.document_type == "result_slip" and confirmable == 0:
            outcome = "ocr_no_grades"
            logger.info("OCR found text but no confirmable grade candidates for document %s", document_id)
        else:
            outcome = "ocr_complete"
        # Persist the extracted payload first (its own columns), then record the
        # extraction outcome through the evidence authority so a reviewer's
        # decision stays intact.
        # Only the column this task actually produces is written. Task 7.4
        # removed the generated analysis, so ``verification_notes`` (a human
        # field) and the ECZ metadata columns are no longer touched here - and
        # narrowing ``update_fields`` means a concurrent reviewer note can no
        # longer be clobbered by a stale in-memory value.
        document.save(update_fields=["extracted_text", "updated_at"])
        evidence.record_extraction_state(
            document,
            outcome,
            details={"confirmable_candidates": confirmable} if extraction else None,
        )
        if extraction is not None:
            from apps.documents import grade_extraction

            grade_extraction.record_candidates(document, extraction)
        logger.info(
            "OCR completed for document %s (%d chars, %d confirmable candidates)",
            document_id,
            len(document.extracted_text or ""),
            confirmable,
        )

    except Exception as exc:
        logger.warning(
            "OCR failed for document %s (attempt %d/%d): %s",
            document_id,
            self.request.retries + 1,
            self.max_retries + 1,
            str(exc),
        )

        if self.request.retries >= self.max_retries:
            # Retries exhausted: the extraction is a terminal
            # ``processing_failed`` on the lifecycle (design §9.3) while the
            # evidence itself remains reviewable by a human.
            evidence.record_extraction_state(document, "ocr_failed")
            logger.error("OCR permanently failed for document %s", document_id)
            return

        # Exponential backoff: 60s, 120s, 240s
        backoff = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=backoff)


def _get_suffix(file_key):
    """Extract file extension from the S3 key."""
    if "." in file_key:
        return "." + file_key.rsplit(".", 1)[-1]
    return ".bin"


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def deferred_payment_reminder_task(self):
    """Daily 11:00 UTC: remind students with deferred payments older than 3 days.

    Bounded to at most 50 records per run (system-performance-hardening R6.4).
    The reminder itself is dispatched per-row through
    ``CommunicationService.send`` because it renders a per-application template
    (subject/body vary per recipient), which is not a single bulk insert.
    """
    if not _acquire_task_lock("deferred_payment_reminder_task"):
        logger.info("deferred_payment_reminder_task: skipped (already running)")
        return
    try:
        from apps.applications.models import Application
        from apps.common.communication_service import CommunicationService

        cutoff = timezone.now() - timedelta(days=3)
        apps = list(
            Application.objects.filter(
                payment_status='deferred',
                updated_at__lt=cutoff,
            )[:50]
        )

        sent = 0
        for app in apps:
            try:
                CommunicationService.send('deferred_payment_reminder', app)
                sent += 1
            except Exception:
                logger.exception("Failed to send deferred payment reminder for app %s", app.id)

        logger.info("deferred_payment_reminder_task: sent %d reminders", sent)
        return {"sent": sent}
    finally:
        _release_task_lock("deferred_payment_reminder_task")


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def document_verification_sla_task(self):
    """Daily 08:00 UTC: find documents pending verification beyond SLA threshold.

    Notifies admins for documents exceeding the SLA threshold (default 5 days).
    Escalates at 2x threshold by sending alert email to ERROR_ALERT_EMAIL.

    Implements task 11.1.
    Requirements: 7.1–7.5
    """
    if not _acquire_task_lock("document_verification_sla_task"):
        logger.info("document_verification_sla_task: skipped (already running)")
        return
    try:
        from django.conf import settings

        from apps.accounts.models import Profile
        from apps.common.models import Setting
        from apps.common.outbox import create_notification, queue_email
        from apps.documents.models import ApplicationDocument

        # Read configurable SLA threshold
        sla_days = 5
        try:
            setting = Setting.objects.filter(key="document_verification_sla_days").first()
            if setting and setting.value is not None:
                sla_days = int(setting.value)
        except Exception:
            logger.exception("Failed to read document_verification_sla_days setting")

        now = timezone.now()
        sla_cutoff = now - timedelta(days=sla_days)
        escalation_cutoff = now - timedelta(days=sla_days * 2)

        # Find documents pending beyond SLA threshold
        overdue_docs = list(
            ApplicationDocument.objects.filter(
                verification_status="pending",
                created_at__lt=sla_cutoff,
            ).select_related("application")[:100]
        )

        if not overdue_docs:
            logger.info("document_verification_sla_task: no overdue documents found")
            return {"notified": 0, "escalated": 0}

        # Split into standard overdue and escalation-level
        standard_docs = []
        escalation_docs = []
        for doc in overdue_docs:
            age_days = (now - doc.created_at).days if doc.created_at else 0
            if doc.created_at and doc.created_at < escalation_cutoff:
                escalation_docs.append((doc, age_days))
            else:
                standard_docs.append((doc, age_days))

        # Build document list for notification
        doc_list_html = "".join(
            f"<li>{doc.document_type} (App: {doc.application_id}) — {age} days pending</li>"
            for doc, age in overdue_docs_with_age(overdue_docs, now)
        )

        # Notify all admins
        admins = list(Profile.objects.filter(role__in=["admin", "super_admin"]))
        notified = 0
        for admin in admins:
            try:
                create_notification(
                    user_id=admin.id,
                    title="Documents Pending Verification Beyond SLA",
                    message=f"{len(overdue_docs)} document(s) have exceeded the {sla_days}-day verification SLA.",
                    type="warning",
                    priority="high",
                )
                notified += 1
            except Exception:
                logger.exception("Failed to notify admin %s about SLA breach", admin.id)

        # Send summary email to admins
        if overdue_docs:
            try:
                email_body = (
                    f"<p>The following {len(overdue_docs)} document(s) have been pending "
                    f"verification beyond the {sla_days}-day SLA threshold:</p>"
                    f"<ul>{doc_list_html}</ul>"
                )
                for admin in admins:
                    queue_email(
                        recipient_email=admin.email,
                        subject=f"ALERT: {len(overdue_docs)} Documents Pending Verification",
                        body=email_body,
                    )
            except Exception:
                logger.exception("Failed to send SLA breach email")

        # Escalation at 2x threshold
        escalated = 0
        if escalation_docs:
            try:
                escalation_list = "".join(
                    f"<li>{doc.document_type} (App: {doc.application_id}) — {age} days pending</li>"
                    for doc, age in escalation_docs
                )
                escalation_body = (
                    f"<p><strong>ESCALATION:</strong> The following {len(escalation_docs)} document(s) "
                    f"have been pending verification for more than {sla_days * 2} days:</p>"
                    f"<ul>{escalation_list}</ul>"
                )
                queue_email(
                    recipient_email=getattr(settings, "ERROR_ALERT_EMAIL", ""),
                    subject=f"ESCALATION: Documents pending verification for {sla_days * 2}+ days",
                    body=escalation_body,
                )
                escalated = len(escalation_docs)
            except Exception:
                logger.exception("Failed to send escalation email")

        logger.info(
            "document_verification_sla_task: %d overdue, %d admins notified, %d escalated",
            len(overdue_docs), notified, escalated,
        )
        return {"notified": notified, "escalated": escalated}
    finally:
        _release_task_lock("document_verification_sla_task")


def overdue_docs_with_age(docs, now):
    """Yield (doc, age_days) tuples."""
    for doc in docs:
        age = (now - doc.created_at).days if doc.created_at else 0
        yield doc, age


# ---------------------------------------------------------------------------
# Document storage reconciliation sweeper (admissions-v2 task 7.3)
# ---------------------------------------------------------------------------
#
# Requirements: R11.8 (object-storage compensation), R17.1 (compensation +
#               stable operator-visible event), R17.4 (bounded retries and
#               durable reconciliation for an optional provider).
# Findings:     STU-19.
# Design:       §9.3 ("on failure, compensation deletes the staged object or a
#               sweeper reconciles it"), §17 (operational queues expose age and
#               terminal-failure counts for document processing).

#: A stage row is only reconciled once it is old enough that no in-flight request
#: could still be about to commit it. 15 minutes comfortably exceeds the request
#: timeout plus the client's single retry, so the sweeper can never delete an
#: object a live upload is seconds away from committing.
DOCUMENT_STAGE_RECONCILE_AFTER_SECONDS = 15 * 60

#: Bounded work per run (R17.4). A backlog drains over several runs instead of
#: one run holding the single worker for an unbounded number of provider calls.
DOCUMENT_STAGE_SWEEP_LIMIT = 50


@shared_task(soft_time_limit=120, time_limit=180)
def reconcile_document_storage_task():
    """Reconcile staged document objects that never became committed evidence.

    Two classes of row are drained, oldest first:

    * ``staged`` and older than :data:`DOCUMENT_STAGE_RECONCILE_AFTER_SECONDS` —
      the process died between the object write and the metadata commit (or the
      write itself never returned). The object, if any, is deleted and the row is
      marked ``compensated``.
    * ``compensation_pending`` — in-request compensation ran but the provider
      delete failed. Retried here with a bounded attempt count; after
      :data:`~apps.documents.document_evidence.MAX_COMPENSATION_ATTEMPTS` the row
      becomes terminal ``orphaned``, which is an operator-visible queue entry
      rather than a retry loop that never ends.

    Self-healing first: if a stage row can be matched to a committed document
    (same object key), it is marked ``committed`` instead of deleted — the
    metadata commit *did* land and only the stage bookkeeping was lost, so
    deleting that object would destroy live evidence. That check is the reason
    this task is safe to run while uploads are in flight.

    Fail-safe: never propagates an exception, and every outcome is counted for
    the operator queue. Returns a summary dict.
    """
    from apps.common.metrics import emit_metric
    from apps.documents import document_evidence as evidence
    from apps.documents.models import ApplicationDocument, DocumentUploadStage

    if not cache.add("celery_lock:reconcile_document_storage", "1", timeout=300):
        logger.info("reconcile_document_storage_task: skipped (already running)")
        return {"skipped": True}

    summary = {"reconciled": 0, "recovered": 0, "pending": 0, "orphaned": 0}
    try:
        cutoff = timezone.now() - timedelta(seconds=DOCUMENT_STAGE_RECONCILE_AFTER_SECONDS)
        candidates = list(
            DocumentUploadStage.objects.filter(
                state__in=[evidence.STAGE_STAGED, evidence.STAGE_COMPENSATION_PENDING],
                created_at__lt=cutoff,
            ).order_by("created_at")[:DOCUMENT_STAGE_SWEEP_LIMIT]
        )

        for stage in candidates:
            try:
                committed = ApplicationDocument.objects.filter(
                    application_id=stage.application_id,
                    storage_key=stage.object_key,
                ).first()
                if committed is not None:
                    # The evidence exists: this is stale bookkeeping, not an
                    # orphan. Never delete the object of a committed version.
                    evidence.mark_stage(
                        stage,
                        evidence.STAGE_COMMITTED,
                        document=committed,
                        error="reconciled: committed document found for staged key",
                    )
                    summary["recovered"] += 1
                    continue

                if (stage.attempts or 0) >= evidence.MAX_COMPENSATION_ATTEMPTS:
                    evidence.mark_stage(
                        stage,
                        evidence.STAGE_ORPHANED,
                        error="compensation attempts exhausted; operator review required",
                    )
                    emit_metric(
                        evidence.EVENT_STAGE_ORPHANED,
                        stage_id=str(stage.id),
                        document_type=stage.document_type,
                        attempts=stage.attempts,
                    )
                    summary["orphaned"] += 1
                    continue

                resulting = evidence.compensate_stage(
                    stage, reason="reconciliation sweep: metadata never committed"
                )
                if resulting == evidence.STAGE_COMPENSATED:
                    emit_metric(
                        evidence.EVENT_STAGE_RECONCILED,
                        stage_id=str(stage.id),
                        document_type=stage.document_type,
                    )
                    summary["reconciled"] += 1
                else:
                    summary["pending"] += 1
            except Exception:
                # One bad row must not stop the sweep.
                logger.warning(
                    "reconcile_document_storage_task: stage %s could not be reconciled",
                    stage.id,
                    exc_info=True,
                )
                summary["pending"] += 1

        logger.info(
            "reconcile_document_storage_task: %d reconciled, %d recovered, "
            "%d still pending, %d orphaned",
            summary["reconciled"],
            summary["recovered"],
            summary["pending"],
            summary["orphaned"],
        )
    except Exception:
        logger.exception("reconcile_document_storage_task: unexpected error")
    finally:
        cache.delete("celery_lock:reconcile_document_storage")
    return summary
