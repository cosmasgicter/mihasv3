"""The durable official-document generation job (task 10.4).

Admissions V2 task 10.4 — R13.11, R17.1, R17.4; finding **STU-18**.

WHAT WAS WRONG
--------------
``official_document_views._enqueue_generation`` swallowed every dispatch failure
and the POST path answered ``202 queued`` regardless::

    except Exception:
        # No reachable broker (brokerless env) or transient dispatch failure.
        logger.info("… returning derived queued status")
        return None

So with the broker down the platform told the student *"queued"* while **nothing
anywhere had recorded that any work was wanted**. Nobody was going to render it,
no sweep could find it, and the client polled a status that could never change.
The GET path had the same defect from the other direction: a permitted document
that had never been requested at all also read ``queued``.

Design §17 states the rule this module exists to enforce:

    "Queued" means a committed durable record exists.

and design §11.3 states the consequence:

    A 202 response is returned only after a durable generation job is committed.
    Broker outage after commit is recovered by the dispatcher; failure before
    commit returns 503.

THE JOB
-------
The durable record is a row in ``outbox_events`` — the table design §3 names as
the platform's committed-job mechanism ("external … document work is requested
by a committed database outbox/job, not an uncommitted best-effort broker
call"), and whose columns already are a job's: ``status``, ``retry_count``,
``error_message``, ``processed_at`` and a unique ``idempotency_key``. No new
table, column or index ships with this task (§3 of the evidence README).

Identity is ``(application, document_type)``, carried in the ``idempotency_key``:

    official_document:{application_id}:{document_type}

One live job per document type, which makes every command fall out of it:

* **request** an ungenerated document → insert ``pending``;
* **request** again while ``pending``/``dispatched`` → the same job, unchanged
  (the double-tap and the browser retry converge);
* **request** again after ``failed`` → the same row returns to ``pending`` with
  its attempt count preserved — so *retry is the same command*, not a second one;
* **request** again after ``succeeded`` when the fingerprint moved → back to
  ``pending`` (the render task itself decides reuse vs regenerate).

The state vocabulary is deliberately small, and every value fits the stored
``varchar(20)``:

    pending     committed, not yet handed to a worker  → the ONLY "queued"
    dispatched  handed to the broker                   → also "queued"
    succeeded   the renderer finished (or reused)      → read the document
    failed      terminal; ``error_message`` holds the stable code

``published`` — the status :mod:`apps.common.outbox` writes for its
already-delivered notification/email events — is intentionally not part of this
machine: those rows record something that *has happened*, and this one records
work that is *wanted*.

WHAT THIS MODULE DOES NOT DO
---------------------------
It does not render, does not touch storage, and does not decide eligibility. The
render pipeline is task 7.3's (staged object write, immutable version,
compensation) driven by ``tasks/pdf_generation.py``; eligibility is
``official_document_views``'. This module owns exactly one question: *is there a
committed record that this work is wanted, and what happened to it?*
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from django.db import DatabaseError, transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Outbox coordinates
# ---------------------------------------------------------------------------

#: ``outbox_events.channel`` for document work. Distinct from ``notification`` /
#: ``email`` so a sweep never touches a delivered communication row.
JOB_CHANNEL = "document"

#: ``outbox_events.event_type``. One type: the row's *state* carries the rest.
JOB_EVENT_TYPE = "official_document.generation"

#: ``idempotency_key`` prefix. Chosen so the pending backlog is reachable
#: through the index Postgres already has on that column
#: (``outbox_events_idempotency_key_116e2feb_like``, ``text_pattern_ops``) —
#: which is why :func:`pending_jobs` filters on the prefix before the status
#: rather than scanning every notification and email event ever written.
JOB_KEY_PREFIX = "official_document:"

JOB_AGGREGATE_TYPE = "application"
JOB_TARGET_TABLE = "application_documents"


# ---------------------------------------------------------------------------
# Job states (values in the existing ``varchar(20)`` status column)
# ---------------------------------------------------------------------------

JOB_PENDING = "pending"
JOB_DISPATCHED = "dispatched"
JOB_SUCCEEDED = "succeeded"
JOB_FAILED = "failed"

JOB_STATES: tuple[str, ...] = (JOB_PENDING, JOB_DISPATCHED, JOB_SUCCEEDED, JOB_FAILED)

#: The states that mean real, committed, unfinished work — and therefore the
#: only states the platform may publish as ``queued`` (design §17).
JOB_OPEN_STATES: frozenset[str] = frozenset({JOB_PENDING, JOB_DISPATCHED})

#: Terminal states. A ``failed`` job is terminal *until re-requested*.
JOB_TERMINAL_STATES: frozenset[str] = frozenset({JOB_SUCCEEDED, JOB_FAILED})


# ---------------------------------------------------------------------------
# Stable failure codes owned here
# ---------------------------------------------------------------------------

#: Returned to the caller when the durable record could **not** be committed.
#: R13.11's explicit alternative to a dishonest 202.
GENERATION_UNAVAILABLE = "GENERATION_UNAVAILABLE"

#: The renderer exhausted its retries.
RENDER_FAILED = "RENDER_FAILED"

#: The renderer declined before rendering: the application vanished, its status
#: no longer permits this document type, or a receipt has no settled payment.
#: These are *terminal* for the job — nothing about them resolves by waiting —
#: and recording them is what stops a permanently-abandoned ``pending`` row.
APPLICATION_NOT_FOUND = "APPLICATION_NOT_FOUND"
STATUS_NOT_ELIGIBLE = "STATUS_NOT_ELIGIBLE"
PAYMENT_NOT_FOUND = "PAYMENT_NOT_FOUND"

#: Tenant document configuration is incomplete. Mirrors the codes
#: ``official_document_views._SETUP_REQUIRED_FAILURE_CODES`` already recognises;
#: named here so the job and the read agree on one set.
SETUP_REQUIRED_CODES: frozenset[str] = frozenset(
    {
        "DOCUMENT_PROFILE_NOT_CONFIGURED",
        "DOCUMENT_TEMPLATE_NOT_CONFIGURED",
        "DOCUMENT_ASSET_NOT_CONFIGURED",
        "TENANT_DOCUMENT_PROFILE_NOT_CONFIGURED",
        "TENANT_DOCUMENT_TEMPLATE_NOT_CONFIGURED",
        "TENANT_ASSET_NOT_CONFIGURED",
    }
)

#: A failure the requester can usefully retry themselves. A setup failure is
#: **not** one of them: retrying it changes nothing until a staff member
#: configures the tenant's document profile, which is why part 3 of this task
#: alerts that staff member instead of inviting the student to press again.
STUDENT_RETRYABLE_CODES: frozenset[str] = frozenset(
    {RENDER_FAILED, PAYMENT_NOT_FOUND, APPLICATION_NOT_FOUND}
)

#: How many render attempts a job records before the renderer gives up. Mirrors
#: ``@shared_task(max_retries=3)`` + the initial attempt in
#: ``tasks/pdf_generation.py``; read from there rather than re-declared as a
#: policy this module owns.
MAX_RENDER_ATTEMPTS = 4

#: Bound on one sweep run, in the shape task 4.4 established for the domain
#: verification backlog.
JOB_SWEEP_LIMIT = 50

#: A ``dispatched`` job whose worker never reported back is re-dispatched after
#: this long. Covers a worker killed mid-render, which leaves no terminal state.
JOB_REDISPATCH_AFTER_SECONDS = 900


class GenerationUnavailable(Exception):
    """The durable generation record could not be committed (R13.11).

    Raised instead of returning a job, so a caller cannot accidentally answer
    ``202 queued`` for work the platform did not record. The view translates it
    to ``503 GENERATION_UNAVAILABLE``.
    """

    code = GENERATION_UNAVAILABLE
    message = (
        "Document generation cannot be accepted right now. Nothing was queued — "
        "please try again shortly."
    )


# ---------------------------------------------------------------------------
# The published job value
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OfficialDocumentJob:
    """One committed generation job, as the read surfaces publish it."""

    id: Optional[str]
    application_id: Optional[str]
    document_type: str
    state: str
    attempts: int
    error_code: Optional[str] = None
    requested_at: Optional[str] = None
    settled_at: Optional[str] = None
    task_id: Optional[str] = None

    @property
    def is_open(self) -> bool:
        """True while committed work is outstanding — i.e. genuinely queued."""
        return self.state in JOB_OPEN_STATES

    @property
    def is_failed(self) -> bool:
        return self.state == JOB_FAILED

    @property
    def setup_required(self) -> bool:
        return bool(self.error_code and self.error_code in SETUP_REQUIRED_CODES)

    def can_retry(self, *, is_staff: bool) -> bool:
        """Whether *this* requester retrying would plausibly change the outcome.

        A student may retry a render failure; a tenant **setup** failure is not
        theirs to retry, and offering it would be the loop STU-18 describes with
        a different button on it. Staff may retry either, because they (or a
        platform operator they escalate to) can fix the configuration first.
        """
        if not self.is_failed:
            return False
        if is_staff:
            return True
        return bool(self.error_code and self.error_code in STUDENT_RETRYABLE_CODES)

    def to_payload(self, *, is_staff: bool = False) -> dict[str, Any]:
        """The job's contribution to the official-document envelope.

        Ids and states only: no applicant field, no template text, no storage
        key, no exception message (R17.2).
        """
        return {
            "state": self.state,
            "attempts": self.attempts,
            "requested_at": self.requested_at,
            "settled_at": self.settled_at,
            "error_code": self.error_code,
            "terminal": self.state in JOB_TERMINAL_STATES,
            "can_retry": self.can_retry(is_staff=is_staff),
        }


#: What the read publishes when **no** job row exists. Not ``queued``: nothing
#: was ever recorded, so nobody is working on it and polling would never end.
JOB_STATE_NONE = "none"

NO_JOB_PAYLOAD: dict[str, Any] = {
    "state": JOB_STATE_NONE,
    "attempts": 0,
    "requested_at": None,
    "settled_at": None,
    "error_code": None,
    "terminal": False,
    "can_retry": False,
}


# ---------------------------------------------------------------------------
# Keys and row mapping
# ---------------------------------------------------------------------------


def job_key(application_id: Any, document_type: str) -> str:
    """The unique durable identity of one document type's generation work."""
    return f"{JOB_KEY_PREFIX}{application_id}:{document_type}"


def _iso(value) -> Optional[str]:
    return value.isoformat() if value is not None else None


def _job_from_row(row) -> OfficialDocumentJob:
    payload = row.payload if isinstance(row.payload, dict) else {}
    return OfficialDocumentJob(
        id=str(row.id),
        application_id=str(row.aggregate_id) if row.aggregate_id else None,
        document_type=str(payload.get("document_type") or ""),
        state=row.status,
        attempts=int(row.retry_count or 0),
        error_code=row.error_message or None,
        requested_at=payload.get("requested_at") or _iso(row.created_at),
        settled_at=_iso(row.processed_at),
        task_id=payload.get("task_id"),
    )


def _outbox():
    from apps.common.models import OutboxEvent

    return OutboxEvent


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def read_job(application_id: Any, document_type: str) -> Optional[OfficialDocumentJob]:
    """The committed job for one document type, or ``None``.

    Never raises: a read that cannot resolve reports *no job*, which the caller
    renders as "nothing queued" rather than as a phantom queue.
    """
    try:
        row = _outbox().objects.filter(
            idempotency_key=job_key(application_id, document_type)
        ).first()
    except Exception:  # pragma: no cover - a read must not break a status call
        logger.warning(
            "Could not read official-document job for application=%s type=%s",
            application_id,
            document_type,
            exc_info=True,
        )
        return None
    return _job_from_row(row) if row is not None else None


def read_jobs(
    application_id: Any, document_types: Iterable[str]
) -> dict[str, OfficialDocumentJob]:
    """Every committed job for one application, in **one** query.

    The list read serialises five document types; one query per type would make
    the page cost grow with the catalogue rather than with the data.
    """
    keys = {job_key(application_id, dt): dt for dt in document_types}
    if not keys:
        return {}
    try:
        rows = list(_outbox().objects.filter(idempotency_key__in=list(keys)))
    except Exception:  # pragma: no cover - see read_job
        logger.warning(
            "Could not read official-document jobs for application=%s",
            application_id,
            exc_info=True,
        )
        return {}
    resolved: dict[str, OfficialDocumentJob] = {}
    for row in rows:
        document_type = keys.get(row.idempotency_key or "")
        if document_type:
            resolved[document_type] = _job_from_row(row)
    return resolved


# ---------------------------------------------------------------------------
# The request command
# ---------------------------------------------------------------------------


def request_generation(
    application,
    document_type: str,
    *,
    actor_id: Any = None,
    dispatch: bool = True,
) -> OfficialDocumentJob:
    """Commit a durable generation job, then ask the broker to run it.

    Order matters and is the whole point (R13.11):

    1. the row commits, or this raises :class:`GenerationUnavailable`;
    2. **only after commit** does dispatch happen, on ``transaction.on_commit``;
    3. a dispatch failure leaves the row ``pending``, and
       :func:`sweep_pending_jobs` re-dispatches it.

    So a 202 built on this return value is always backed by a record, and a
    broker outage costs a delay rather than a lost request. Idempotent by
    ``(application, document_type)``: an open job is returned untouched, and a
    settled one is reopened with its attempt history intact.
    """
    application_id = getattr(application, "id", None)
    key = job_key(application_id, document_type)
    now = timezone.now()
    OutboxEvent = _outbox()

    try:
        with transaction.atomic():
            row = (
                OutboxEvent.objects.select_for_update()
                .filter(idempotency_key=key)
                .first()
            )
            if row is None:
                row = OutboxEvent(
                    event_type=JOB_EVENT_TYPE,
                    channel=JOB_CHANNEL,
                    aggregate_type=JOB_AGGREGATE_TYPE,
                    aggregate_id=application_id,
                    target_table=JOB_TARGET_TABLE,
                    idempotency_key=key,
                    retry_count=0,
                    created_at=now,
                )
                row.payload = {}
            elif row.status in JOB_OPEN_STATES:
                # Already committed and unfinished: the same job, untouched. A
                # double-tap must not reset an attempt count or re-dispatch.
                return _job_from_row(row)

            institution_id = getattr(application, "institution_ref_id", None)
            payload = dict(row.payload if isinstance(row.payload, dict) else {})
            payload.update(
                {
                    "document_type": document_type,
                    "institution_id": str(institution_id) if institution_id else None,
                    "requested_at": now.isoformat(),
                    "requested_by": str(actor_id) if actor_id else None,
                    "task_id": None,
                }
            )
            row.payload = payload
            row.status = JOB_PENDING
            row.error_message = None
            row.processed_at = None
            row.target_id = None
            row.save()

            job = _job_from_row(row)
            if dispatch:
                row_id = row.id
                transaction.on_commit(
                    lambda: _dispatch(row_id, application_id, document_type)
                )
    except GenerationUnavailable:
        raise
    except (DatabaseError, Exception) as exc:  # noqa: BLE001 - see below
        # Anything that stops the record committing is the 503 case. The failure
        # is logged with its type only (no applicant data), and the caller is
        # told nothing was queued — which is the honest answer, and the one
        # R13.11 requires instead of a 202.
        logger.warning(
            "Could not commit official-document job for application=%s type=%s (%s)",
            application_id,
            document_type,
            type(exc).__name__,
            exc_info=True,
        )
        raise GenerationUnavailable() from exc

    return job


# ---------------------------------------------------------------------------
# Dispatch and the state transitions the renderer reports
# ---------------------------------------------------------------------------


def _renderer_for(document_type: str):
    """The Celery task that renders one document type, or ``None``."""
    from apps.applications.official_document_views import _DOCUMENT_TASK_NAMES

    task_name = _DOCUMENT_TASK_NAMES.get(document_type)
    if not task_name:
        return None
    from apps.applications import tasks as application_tasks

    return getattr(application_tasks, task_name, None)


def _dispatch(row_id, application_id, document_type: str) -> Optional[str]:
    """Hand a committed job to the broker. Best-effort, by design.

    A failure here is not an error the caller needs to see: the row is already
    committed, so the sweep will re-dispatch it. What must never happen is the
    reverse — dispatching work that was not recorded.
    """
    try:
        task = _renderer_for(document_type)
        if task is None:
            mark_failed(
                application_id,
                document_type,
                error_code=STATUS_NOT_ELIGIBLE,
                terminal=True,
            )
            return None
        result = task.delay(str(application_id))
        task_id = getattr(result, "id", None)
        mark_dispatched(row_id, task_id)
        return task_id
    except Exception:
        # Broker unreachable or transient dispatch failure. The job stays
        # ``pending``; ``sweep_pending_jobs`` is what makes that recoverable
        # rather than merely honest.
        logger.info(
            "Official-document job dispatch failed for application=%s type=%s; "
            "the committed job stays pending for the sweep",
            application_id,
            document_type,
            exc_info=True,
        )
        return None


def mark_dispatched(row_id, task_id) -> None:
    """Record that a **pending** job reached the broker.

    Conditional on ``pending`` on purpose: a fast worker can finish before this
    update lands, and an unconditional write would overwrite ``succeeded`` with
    ``dispatched`` and put a finished job back in the queued set.
    """
    try:
        OutboxEvent = _outbox()
        row = OutboxEvent.objects.filter(id=row_id, status=JOB_PENDING).first()
        if row is None:
            return
        payload = dict(row.payload if isinstance(row.payload, dict) else {})
        payload["task_id"] = str(task_id) if task_id else None
        OutboxEvent.objects.filter(id=row_id, status=JOB_PENDING).update(
            status=JOB_DISPATCHED, payload=payload
        )
    except Exception:  # pragma: no cover - bookkeeping must not break dispatch
        logger.info("Could not mark official-document job %s dispatched", row_id, exc_info=True)


def _settle(
    application_id,
    document_type: str,
    *,
    status: str,
    error_code: Optional[str],
    document_id: Any = None,
    attempts: Optional[int] = None,
) -> None:
    try:
        OutboxEvent = _outbox()
        row = OutboxEvent.objects.filter(
            idempotency_key=job_key(application_id, document_type)
        ).first()
        if row is None:
            # The renderer can be invoked directly (a legacy admin task, a
            # management command, the beat sweeps). No job means nothing to
            # settle — and inventing one here would create a record of work
            # nobody requested.
            return
        fields = {"status": status, "processed_at": timezone.now()}
        fields["error_message"] = error_code or None
        if attempts is not None:
            fields["retry_count"] = attempts
        if document_id is not None:
            fields["target_id"] = document_id
        OutboxEvent.objects.filter(id=row.id).update(**fields)
    except Exception:  # pragma: no cover - see mark_dispatched
        logger.info(
            "Could not settle official-document job for application=%s type=%s",
            application_id,
            document_type,
            exc_info=True,
        )


def mark_succeeded(application_id, document_type: str, *, document_id: Any = None) -> None:
    """The renderer produced (or reused) the current version."""
    _settle(
        application_id,
        document_type,
        status=JOB_SUCCEEDED,
        error_code=None,
        document_id=document_id,
    )


def mark_failed(
    application_id,
    document_type: str,
    *,
    error_code: str,
    terminal: bool = True,
    attempts: Optional[int] = None,
) -> None:
    """Record a render outcome that produced no document.

    ``terminal=False`` keeps the job ``pending`` — the renderer will retry it
    itself, so the work is still outstanding and ``queued`` is still true. Only
    a terminal outcome moves the job to ``failed``, which is what the read
    surfaces publish as a failure with a retry affordance.
    """
    _settle(
        application_id,
        document_type,
        status=JOB_FAILED if terminal else JOB_PENDING,
        error_code=error_code,
        attempts=attempts,
    )


# ---------------------------------------------------------------------------
# The dispatcher that makes a broker outage recoverable
# ---------------------------------------------------------------------------


def pending_jobs(limit: int = JOB_SWEEP_LIMIT) -> list:
    """Committed jobs that no worker has reported back on.

    Two shapes, mirroring task 4.4's domain-verification backlog:

    * ``pending`` — committed but never dispatched (the broker-down path);
    * ``dispatched`` older than :data:`JOB_REDISPATCH_AFTER_SECONDS` — handed to
      a worker that never answered (killed mid-render), which otherwise leaves a
      job that is neither finished nor recoverable.

    The prefix filter comes first so the scan is over document jobs, not over
    every notification and email event the outbox has ever recorded.
    """
    from datetime import timedelta

    from django.db.models import Q

    cutoff = timezone.now() - timedelta(seconds=JOB_REDISPATCH_AFTER_SECONDS)
    return list(
        _outbox()
        .objects.filter(idempotency_key__startswith=JOB_KEY_PREFIX)
        .filter(
            Q(status=JOB_PENDING)
            | Q(status=JOB_DISPATCHED, created_at__lt=cutoff)
        )
        .order_by("created_at")[:limit]
    )


def sweep_pending_jobs(limit: int = JOB_SWEEP_LIMIT) -> int:
    """Re-dispatch the committed backlog. Returns the number dispatched.

    This is the half that turns "we recorded the request" into "the request will
    actually be served". Without it, committing the row before answering 202
    would only make the platform honest about a request it still never ran.
    """
    dispatched = 0
    for row in pending_jobs(limit):
        payload = row.payload if isinstance(row.payload, dict) else {}
        document_type = payload.get("document_type")
        if not document_type or row.aggregate_id is None:
            continue
        if row.status == JOB_DISPATCHED:
            # Reopen before re-dispatching so ``mark_dispatched`` (which is
            # conditional on ``pending``) can record the new attempt.
            _outbox().objects.filter(id=row.id, status=JOB_DISPATCHED).update(
                status=JOB_PENDING, retry_count=(row.retry_count or 0) + 1
            )
        if _dispatch(row.id, row.aggregate_id, str(document_type)) is not None:
            dispatched += 1
    return dispatched


__all__ = [
    "GENERATION_UNAVAILABLE",
    "GenerationUnavailable",
    "JOB_CHANNEL",
    "JOB_DISPATCHED",
    "JOB_EVENT_TYPE",
    "JOB_FAILED",
    "JOB_KEY_PREFIX",
    "JOB_OPEN_STATES",
    "JOB_PENDING",
    "JOB_REDISPATCH_AFTER_SECONDS",
    "JOB_STATES",
    "JOB_STATE_NONE",
    "JOB_SUCCEEDED",
    "JOB_SWEEP_LIMIT",
    "JOB_TERMINAL_STATES",
    "MAX_RENDER_ATTEMPTS",
    "NO_JOB_PAYLOAD",
    "OfficialDocumentJob",
    "APPLICATION_NOT_FOUND",
    "PAYMENT_NOT_FOUND",
    "RENDER_FAILED",
    "SETUP_REQUIRED_CODES",
    "STATUS_NOT_ELIGIBLE",
    "STUDENT_RETRYABLE_CODES",
    "job_key",
    "mark_dispatched",
    "mark_failed",
    "mark_succeeded",
    "pending_jobs",
    "read_job",
    "read_jobs",
    "request_generation",
    "sweep_pending_jobs",
]
