"""Catalog Celery tasks - intake lifecycle and tenant domain verification.

Implements task 1.4 (intake manager) and task 7.3 (domain verification).
Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.4, 7.4, 7.5
"""

import hashlib
import logging
from datetime import date, timedelta

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction

logger = logging.getLogger(__name__)

_ALERT_THROTTLE_TTL = 900  # 15 minutes

#: DNS verification lookup timeout (R7.4 / R7.5) — a lookup that exceeds this is
#: treated identically to a mismatch (the domain stays ``pending_dns``).
DNS_LOOKUP_TIMEOUT_SECONDS = 10


def _truncate_pg_safe(value: str, limit: int = 1000) -> str:
    """Return a bounded string safe for PostgreSQL text fields."""
    clean = value.replace("\x00", "\uFFFD")
    return clean.encode("utf-8", "replace").decode("utf-8")[:limit]


def _log_error_and_alert(error_msg: str) -> None:
    """Log error to GlitchTip and dispatch a throttled alert email.

    ErrorLog model is deprecated - errors go to GlitchTip via sentry_sdk.
    """
    import sentry_sdk
    from apps.common.outbox import queue_email

    sentry_sdk.capture_message(error_msg, level="error")

    # Throttled alert - one per unique message per 15 minutes.
    msg_hash = hashlib.sha256(error_msg.encode("utf-8")).hexdigest()[:16]
    cache_key = f"error_alert:{msg_hash}"

    should_alert = True
    try:
        should_alert = cache.add(cache_key, 1, _ALERT_THROTTLE_TTL)
    except Exception:
        logger.warning("Redis unavailable for alert throttle, dispatching anyway")

    if should_alert:
        alert_email = settings.ERROR_ALERT_EMAIL
        queue_email(
            recipient_email=alert_email,
            subject=f"[ALERT] intake_manager_task failed: {error_msg[:100]}",
            body=(
                f"<p>The <code>intake_manager_task</code> encountered an error:</p>"
                f"<pre>{error_msg[:2000]}</pre>"
            ),
        )


@shared_task(bind=True, max_retries=2, default_retry_delay=300, soft_time_limit=120, time_limit=150)
def intake_manager_task(self):
    """Ensure at least 2 open intakes exist. Idempotent.

    Queries active intakes, delegates date computation to the pure
    ``ensure_minimum_open_intakes`` function, then creates any missing
    Intake rows. Duplicates (same name + year) are skipped with a warning.

    On failure the task retries up to 2 times (5-minute delay), then logs
    to ErrorLog and dispatches a throttled alert email.
    """
    if not cache.add("celery_lock:intake_manager_task", "1", timeout=300):
        logger.info("intake_manager_task: skipped (already running)")
        return
    try:
        from apps.catalog.intake_date_computer import ensure_minimum_open_intakes
        from apps.catalog.models import Intake

        logger.info("intake_manager_task: starting")

        today = date.today()
        existing = list(Intake.objects.filter(is_active=True))
        to_create = ensure_minimum_open_intakes(today, existing)

        created_count = 0
        for computed in to_create:
            # Guard against duplicates at the DB level.
            if Intake.objects.filter(name=computed.name, year=computed.year).exists():
                logger.warning(
                    "Intake '%s' (%s) already exists — skipping",
                    computed.name,
                    computed.year,
                )
                continue

            try:
                Intake.objects.create(
                    name=computed.name,
                    year=computed.year,
                    start_date=computed.start_date,
                    application_start_date=computed.application_start_date,
                    application_deadline=computed.application_deadline,
                    is_active=True,
                    current_enrollment=0,
                )
                created_count += 1
                logger.info("Created intake '%s' (%s)", computed.name, computed.year)
            except IntegrityError:
                logger.warning(
                    "Duplicate intake '%s' (%s) — IntegrityError, skipping",
                    computed.name,
                    computed.year,
                )

        logger.info(
            "intake_manager_task complete: %d created, %d existing",
            created_count,
            len(existing),
        )

    except Exception as exc:
        error_msg = f"intake_manager_task failed: {exc.__class__.__name__}: {exc}"
        logger.exception(error_msg)

        # Retry if attempts remain; otherwise log + alert.
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)

        try:
            _log_error_and_alert(error_msg)
        except Exception:
            logger.exception("Failed to log error or dispatch alert")
    finally:
        cache.delete("celery_lock:intake_manager_task")


# ---------------------------------------------------------------------------
# Tenant domain verification (task 7.3, R7.4 / R7.5)
# ---------------------------------------------------------------------------


def _normalize_dns_value(value: str) -> str:
    """Normalize a DNS value for comparison.

    Lower-cases, strips surrounding whitespace, strips wrapping quotes (TXT
    records are quoted), and removes a single trailing dot (FQDN form) so that
    ``verify.beanola.com`` and ``verify.beanola.com.`` compare equal.
    """
    text = (value or "").strip().strip('"').strip()
    text = text.lower()
    if text.endswith("."):
        text = text[:-1]
    return text


def _lookup_dns_records(hostname: str, timeout: float = DNS_LOOKUP_TIMEOUT_SECONDS) -> set[str]:
    """Return the set of DNS record values published for *hostname*.

    This is the single seam the verification task resolves through, so it can be
    mocked wholesale by the property/unit tests (task 7.8) without touching the
    network. It prefers ``dnspython`` when installed (giving real TXT + CNAME
    support and a per-lookup ``timeout``); otherwise it falls back to the
    standard-library resolver (CNAME/A targets only).

    The returned values are raw record texts (TXT contents, CNAME targets, A
    addresses, canonical name, aliases). Normalization/matching is the caller's
    responsibility. Any resolution failure or timeout propagates as an exception
    — the task treats that exactly like a mismatch (R7.5).

    Local harness override: when ``settings.HARNESS_DOMAIN_ADAPTER_URL`` is set
    (only the isolated V2 E2E harness sets it — see
    ``config.settings.harness``), records are resolved from that deterministic
    domain adapter over HTTP instead of the real network, so domain-verification
    journeys are reproducible offline. Production never sets it, so the real
    resolver below is always used there.
    """
    from django.conf import settings as _django_settings

    _adapter_url = (getattr(_django_settings, "HARNESS_DOMAIN_ADAPTER_URL", "") or "").strip()
    if _adapter_url:
        import json as _json
        import urllib.parse as _urlparse
        import urllib.request as _urlrequest

        query = _urlparse.urlencode({"hostname": hostname})
        request_url = f"{_adapter_url.rstrip('/')}/records?{query}"
        with _urlrequest.urlopen(request_url, timeout=timeout) as response:  # noqa: S310 (local adapter)
            payload = _json.loads(response.read().decode("utf-8") or "{}")
        return {str(record) for record in (payload.get("records") or [])}

    values: set[str] = set()

    try:
        import dns.resolver  # type: ignore

        resolver = dns.resolver.Resolver()
        resolver.lifetime = timeout
        resolver.timeout = timeout
        for rdtype in ("TXT", "CNAME"):
            try:
                answers = resolver.resolve(hostname, rdtype)
            except Exception:
                # A missing record type is normal (e.g. no CNAME); keep going.
                continue
            for rdata in answers:
                text = rdata.to_text()
                if text:
                    values.add(text)
        return values
    except ImportError:
        # dnspython not installed — fall back to the stdlib resolver below.
        pass

    import socket

    previous_timeout = socket.getdefaulttimeout()
    try:
        socket.setdefaulttimeout(timeout)
        canonical, aliases, ip_addresses = socket.gethostbyname_ex(hostname)
        for candidate in (canonical, *aliases, *ip_addresses):
            if candidate:
                values.add(candidate)
    finally:
        socket.setdefaulttimeout(previous_timeout)

    return values


def _dns_target_matches(dns_target: str, records: set[str]) -> bool:
    """Whether the expected *dns_target* is satisfied by the resolved *records*.

    A match is either an exact (normalized) equality with any record value or
    the target appearing inside a record value — the latter covers a
    verification token published inside a longer TXT string.
    """
    expected = _normalize_dns_value(dns_target)
    if not expected:
        return False
    for record in records:
        normalized = _normalize_dns_value(record)
        if not normalized:
            continue
        if expected == normalized or expected in normalized:
            return True
    return False


@shared_task(soft_time_limit=30, time_limit=45)
def verify_institution_domain_task(domain_id):
    """Verify a tenant domain's DNS record against its expected target (R7.4/R7.5).

    Performs a DNS lookup (10s timeout) for the domain's expected ``dns_target``:

    * **Match** → transition ``pending_dns → pending_review`` (guarded by the
      :class:`~apps.catalog.services.DomainStatusMachine`), set ``verified_at``
      and ``last_checked_at``, clear ``last_error``, and emit a tenant audit
      event (R7.4).
    * **Mismatch / timeout / lookup failure** → leave ``status`` at
      ``pending_dns``, record a descriptive ``last_error`` (capped at 1000
      chars), and update ``last_checked_at`` (R7.5).

    The task is fail-safe: it never propagates an exception. A domain that is
    not currently ``pending_dns`` (or no longer exists) is a no-op.
    """
    try:
        from django.utils import timezone

        from apps.catalog.models import InstitutionDomain
        from apps.catalog.services import DomainStatusMachine
        from apps.catalog.tenant_audit_service import TenantAuditService

        try:
            domain = InstitutionDomain.objects.select_related("institution").get(
                id=domain_id
            )
        except InstitutionDomain.DoesNotExist:
            logger.warning(
                "verify_institution_domain_task: domain %s not found", domain_id
            )
            return

        # Verification only drives the pending_dns -> pending_review edge; any
        # other status is left untouched (the state machine forbids the jump).
        if domain.status != InstitutionDomain.STATUS_PENDING_DNS:
            logger.info(
                "verify_institution_domain_task: domain %s is %s, not pending_dns; skipping",
                domain_id,
                domain.status,
            )
            return

        now = timezone.now()
        expected = (domain.dns_target or "").strip()
        matched = False
        error_message = None

        if not expected:
            error_message = "No dns_target configured for the domain; cannot verify."
        else:
            try:
                records = _lookup_dns_records(
                    domain.hostname, timeout=DNS_LOOKUP_TIMEOUT_SECONDS
                )
                matched = _dns_target_matches(expected, records)
                if not matched:
                    error_message = (
                        f"DNS verification did not match: expected target "
                        f"{expected!r} not found for hostname {domain.hostname!r}."
                    )
            except Exception as exc:
                # Timeout or any resolver failure is a verification failure (R7.5).
                matched = False
                error_message = (
                    f"DNS lookup failed for hostname {domain.hostname!r}: "
                    f"{exc.__class__.__name__}: {exc}"
                )

        if matched and DomainStatusMachine.can_transition(
            InstitutionDomain.STATUS_PENDING_DNS,
            InstitutionDomain.STATUS_PENDING_REVIEW,
        ):
            domain.status = InstitutionDomain.STATUS_PENDING_REVIEW
            domain.verified_at = now
            domain.last_checked_at = now
            domain.last_error = None
            domain.save(
                update_fields=[
                    "status",
                    "verified_at",
                    "last_checked_at",
                    "last_error",
                ]
            )
            logger.info(
                "verify_institution_domain_task: domain %s verified (pending_review)",
                domain_id,
            )
            TenantAuditService.record_config_change(
                resource="domain",
                verb="verified",
                entity_id=domain.id,
                institution_id=domain.institution_id,
                metadata={
                    "hostname": domain.hostname,
                    "status": domain.status,
                    "outcome": "verified",
                },
            )
        else:
            domain.last_checked_at = now
            domain.last_error = _truncate_pg_safe(error_message or "Domain verification failed.")
            domain.save(update_fields=["last_checked_at", "last_error"])
            logger.info(
                "verify_institution_domain_task: domain %s verification failed: %s",
                domain_id,
                domain.last_error,
            )
    except Exception:
        # Fail-safe: a verification job must never crash the worker or surface
        # an error to the caller (R7.5). Capture for observability and return.
        logger.exception(
            "verify_institution_domain_task: unexpected error for domain %s",
            domain_id,
        )
        return


# ---------------------------------------------------------------------------
# Durable verification dispatch + broker-down recovery sweep (task 4.4, R5.1)
# ---------------------------------------------------------------------------

#: A ``pending_dns`` domain whose last check is older than this many seconds is
#: re-dispatched by the sweeper (DNS may have propagated since — design §6.3's
#: ``pending_verification`` retry loop). Never-checked rows
#: (``last_checked_at IS NULL`` — the broker was down at create/retry time) are
#: always re-dispatched.
DOMAIN_VERIFICATION_RETRY_AFTER_SECONDS = 600

#: Bound the sweeper batch so one run cannot enqueue an unbounded fan-out
#: (mirrors ``poll_pending_payments_task``'s per-run cap).
DOMAIN_VERIFICATION_SWEEP_LIMIT = 50


def enqueue_domain_verification(domain_id) -> None:
    """Commit-then-dispatch the domain-verification job (R5.1; design §6.3/§17).

    The durable committed record is the ``InstitutionDomain`` row itself: a row
    in ``pending_dns`` *is* a queued verification job (design §17 — "Queued
    means a committed durable record exists"). This helper schedules the Celery
    dispatch to fire only **after** the surrounding transaction commits
    (``transaction.on_commit``), so:

    * the API returns *accepted* only once the domain row is durably committed
      (design §6.3 — "Creating or retrying commits a domain-verification job
      before returning accepted");
    * a broker outage at dispatch time never rolls back or 500s the committed
      write — the dispatch is best-effort and its failure is swallowed, and
      :func:`sweep_pending_domain_verifications_task` re-dispatches from the DB
      once the broker recovers (broker-down/retry durability).

    In a rolled-back test transaction the ``on_commit`` callback never fires, so
    this performs no network/DNS work in unit tests.
    """
    domain_ref = str(domain_id)

    def _dispatch():
        try:
            verify_institution_domain_task.delay(domain_ref)
        except Exception:  # pragma: no cover - broker outage path
            logger.warning(
                "verify_institution_domain_task dispatch failed for domain %s; "
                "the pending_dns row is durable and the sweeper will retry",
                domain_ref,
                exc_info=True,
            )

    transaction.on_commit(_dispatch)


@shared_task(soft_time_limit=60, time_limit=90)
def sweep_pending_domain_verifications_task():
    """Re-dispatch committed-but-undispatched domain verification jobs (R5.1/R17.3).

    Drains the durable ``pending_dns`` backlog:

    * ``last_checked_at IS NULL`` — a committed verification job whose dispatch
      never ran (e.g. the broker was down when the domain was created/retried).
      This is the broker-down recovery path.
    * ``last_checked_at`` older than
      :data:`DOMAIN_VERIFICATION_RETRY_AFTER_SECONDS` — a periodic re-check so
      DNS that propagates after the first failed lookup eventually verifies
      (design §6.3's ``pending_verification`` retry loop).

    Only ``pending_dns`` rows are touched; the state machine forbids the
    ``pending_dns -> pending_review`` jump for any other status, so no other
    lifecycle state is affected. Bounded to
    :data:`DOMAIN_VERIFICATION_SWEEP_LIMIT` rows per run and fail-safe (never
    propagates an exception). Returns the number of jobs dispatched.
    """
    if not cache.add(
        "celery_lock:sweep_pending_domain_verifications", "1", timeout=120
    ):
        logger.info(
            "sweep_pending_domain_verifications_task: skipped (already running)"
        )
        return 0
    dispatched = 0
    try:
        from django.db.models import Q
        from django.utils import timezone

        from apps.catalog.models import InstitutionDomain

        cutoff = timezone.now() - timedelta(
            seconds=DOMAIN_VERIFICATION_RETRY_AFTER_SECONDS
        )
        candidate_ids = list(
            InstitutionDomain.objects.filter(
                status=InstitutionDomain.STATUS_PENDING_DNS
            )
            .filter(Q(last_checked_at__isnull=True) | Q(last_checked_at__lt=cutoff))
            .order_by("last_checked_at")
            .values_list("id", flat=True)[:DOMAIN_VERIFICATION_SWEEP_LIMIT]
        )
        for domain_id in candidate_ids:
            try:
                verify_institution_domain_task.delay(str(domain_id))
                dispatched += 1
            except Exception:  # pragma: no cover - broker outage path
                logger.warning(
                    "sweep_pending_domain_verifications_task: dispatch failed for %s",
                    domain_id,
                    exc_info=True,
                )
        logger.info(
            "sweep_pending_domain_verifications_task: dispatched %d verification job(s)",
            dispatched,
        )
    except Exception:
        # Fail-safe: a sweep must never crash the worker (R5.2 fail-closed spirit).
        logger.exception(
            "sweep_pending_domain_verifications_task: unexpected error"
        )
    finally:
        cache.delete("celery_lock:sweep_pending_domain_verifications")
    return dispatched
