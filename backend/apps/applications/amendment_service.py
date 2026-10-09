"""Application amendment service.

Handles student-initiated amendments to submitted applications
and admin review of those amendments.

Requirements: 14.1–14.8

admissions-v2 task 9.5 (R3, R13.10, finding **AUTH-06**) corrected two things
here:

* **who is notified.** The request path fanned an applicant's name and
  application number out to every ``admin`` / ``super_admin`` row in the
  platform. Recipients now resolve through
  :class:`~apps.catalog.tenant_recipients.TenantStaffRecipientService` — the
  staff who hold ``tenant.application.review`` **for that application's own
  institution** — and the fan-out is written through the durable communication
  outbox with per-recipient idempotency keys.
* **the review transition.** ``review_amendment`` read the row, compared its
  status, and saved — with no lock. Two concurrent approvals could both pass the
  ``status != "pending"`` check and both apply the field change. The transition is
  now declared by :class:`AmendmentStateMachine` and applied under a row lock on
  the amendment *and* its application, inside one transaction with the field
  write and the history row.

admissions-v2 task 10.2 (R13.9-R13.10, finding **STU-17**) closed the two things
9.5 §12 recorded as belonging here:

* **same-field pending uniqueness.** ``MAX_PENDING_AMENDMENTS`` (3,
  application-wide) is unchanged, but three pending requests to change the *same*
  field are not three requests — they are three answers to one question, and
  whichever a reviewer approved last silently overwrote the earlier decision. A
  second pending request for a field the student already has one open for is now
  refused with ``AMENDMENT_ALREADY_PENDING`` (409) naming the request in flight.
* **the owner-scoped read.** :func:`amendment_history_payload` is what
  ``GET /applications/{id}/amendments/`` and ``.../{aid}/`` publish, so a student
  can see whether their request is still waiting, approved or declined.

**No migration ships with either.** The uniqueness rule is enforced under the
``select_for_update`` lock on the application row that ``request_amendment``
already takes, and that lock is taken by *every* writer of a ``pending`` row —
this function is the only one; the review command transitions existing rows and
never creates one. So two concurrent same-field requests serialise and the second
sees the first. A partial unique index
(``(application_id, field_name) WHERE status = 'pending'``) would express the
invariant in the database, and it is the right addition **if** a second creator
ever appears; it was declined here because its creation depends on the absence of
pre-existing duplicates in a database this lane cannot inspect, and a boot-time
migration failure is a worse outcome than a guarantee that is already sufficient.
The reasoning is recorded in ``docs/v2-evidence/10.2/README.md`` §3 rather than
left implicit.
"""

import logging

from django.db import transaction
from django.utils import timezone

from apps.applications.models import Application, ApplicationAmendment, ApplicationStatusHistory

logger = logging.getLogger(__name__)

# Statuses from which amendments are allowed (Req 14.3)
AMENDABLE_STATUSES = {"submitted", "under_review", "waitlisted"}

# Fields that can be amended (Req 14.4)
AMENDABLE_FIELDS = {
    "phone", "email", "address_line_1", "address_line_2",
    "residence_town", "next_of_kin_name", "next_of_kin_phone",
}

# Maximum pending amendments per application (Req 14.9)
MAX_PENDING_AMENDMENTS = 3

#: The tenant capability an amendment recipient must hold for the application's
#: own institution (task 9.5, R13.10). It is the capability the amendment
#: **review** command itself requires (``COMMAND_CAPABILITIES["review_amendment"]``
#: in ``review_workspace_service``), so the platform notifies exactly the people
#: who can act — not a wider audience, and not a narrower one.
AMENDMENT_RECIPIENT_CAPABILITY = "tenant.application.review"

#: Outbox event type for the recipient fan-out of an amendment request (design
#: §17: "queued" means a committed durable record exists).
AMENDMENT_REQUESTED_EVENT = "application.amendment_requested"

#: What each amendment status means, published with the row (task 10.2, R13.9).
#: A student who can see a request must be able to tell "still waiting" from
#: "declined" without the browser inventing the copy — the same rule 9.1/9.4
#: applied to labels and 10.1 applied to delivery states.
AMENDMENT_STATUS_DEFINITIONS: dict[str, str] = {
    "pending": (
        "Waiting for the admissions team. Your application still shows the old "
        "value until this is approved."
    ),
    "approved": "Approved and applied to your application.",
    "rejected": "Declined by the admissions team. Your application is unchanged.",
}


class AmendmentError(Exception):
    """Raised when an amendment operation fails validation.

    ``status_code`` and ``details`` were added by task 10.2 so the one refusal
    that is a **conflict with an existing request** — a second pending amendment
    for the same field — can say so with 409 and name the request already in
    flight, instead of being flattened into the same 400 as a malformed body.
    Both default to the pre-10.2 behaviour, so every existing caller and every
    existing test sees exactly what it did before.
    """

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int | None = None,
        details: dict | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class AmendmentStateMachine:
    """The amendment review transitions, declared once (task 9.5, R13.10).

    ``pending`` is the only state a review command may act from, and both review
    outcomes are terminal. Stating that as a table rather than as an inline
    ``status != "pending"`` comparison is what lets the lock below be checked
    against something: the row is re-read under the lock and the transition is
    asserted against *that* value, so a decision made from a stale read is
    refused instead of silently overwriting the first one.
    """

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

    #: ``from status`` → the statuses a review command may move it to.
    ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
        PENDING: frozenset({APPROVED, REJECTED}),
        APPROVED: frozenset(),
        REJECTED: frozenset(),
    }

    #: Statuses with no outbound transition.
    TERMINAL_STATUSES: frozenset[str] = frozenset({APPROVED, REJECTED})

    #: The outcomes a review command may request.
    REVIEW_OUTCOMES: frozenset[str] = frozenset({APPROVED, REJECTED})

    @classmethod
    def can_transition(cls, from_status: str, to_status: str) -> bool:
        return to_status in cls.ALLOWED_TRANSITIONS.get(
            (from_status or "").strip().lower(), frozenset()
        )

    @classmethod
    def assert_transition(cls, from_status: str, to_status: str) -> None:
        """Raise :class:`AmendmentError` when the transition is not allowed."""
        current = (from_status or "").strip().lower()
        target = (to_status or "").strip().lower()
        if target not in cls.REVIEW_OUTCOMES:
            raise AmendmentError(
                "AMENDMENT_TRANSITION_REJECTED",
                "status must be 'approved' or 'rejected'.",
            )
        if cls.can_transition(current, target):
            return
        if current in cls.TERMINAL_STATUSES:
            # Preserved code: callers (and the admin UI) already branch on it.
            raise AmendmentError(
                "AMENDMENT_ALREADY_REVIEWED",
                f"Amendment has already been {current}.",
            )
        raise AmendmentError(
            "AMENDMENT_TRANSITION_REJECTED",
            f"An amendment cannot move from {current or 'unknown'} to {target}.",
        )


class AmendmentService:
    """Orchestrates application amendment requests and reviews."""

    @staticmethod
    def request_amendment(
        application_id: str,
        field_name: str,
        new_value: str,
        reason: str,
        user_id: str,
    ) -> ApplicationAmendment:
        """Request an amendment to a submitted application.

        Args:
            application_id: UUID of the application.
            field_name: The field to amend.
            new_value: The new value for the field.
            reason: Reason for the amendment.
            user_id: UUID of the student requesting.

        Returns:
            The created ApplicationAmendment instance.

        Raises:
            AmendmentError: If validation fails.
        """
        # Wrap the read-validate-create cycle in a transaction with a
        # row-level lock on the application. This prevents concurrent
        # amendment requests from each seeing pending_count < MAX and
        # both succeeding past the cap.
        with transaction.atomic():
            try:
                application = (
                    Application.objects.select_for_update().get(id=application_id)
                )
            except Application.DoesNotExist:
                raise AmendmentError(
                    "APPLICATION_NOT_FOUND",
                    "Application not found.",
                )

            # Validate status (Req 14.3)
            if application.status not in AMENDABLE_STATUSES:
                raise AmendmentError(
                    "INVALID_STATUS_FOR_AMENDMENT",
                    f"Amendments are only allowed from statuses: {', '.join(sorted(AMENDABLE_STATUSES))}.",
                )

            # Validate field is amendable (Req 14.4, 14.5)
            if field_name not in AMENDABLE_FIELDS:
                raise AmendmentError(
                    "FIELD_NOT_AMENDABLE",
                    f"Field '{field_name}' is not amendable. Amendable fields: {', '.join(sorted(AMENDABLE_FIELDS))}.",
                )

            # Read the pending set **once**, under the same lock, and answer both
            # questions from it (task 10.2): how many are outstanding, and whether
            # this field already has one.
            pending = list(
                ApplicationAmendment.objects.filter(
                    application_id=application_id,
                    status="pending",
                ).values("id", "field_name", "created_at")
            )

            # Same-field pending uniqueness (task 10.2, R13.10, finding STU-17).
            # Two pending requests for one field are not two requests: they are
            # two answers to the same question, and whichever a reviewer approved
            # second would silently overwrite the first. The check is race-free
            # without a database index because it runs under the ``select_for_update``
            # lock on the application row that every writer of this table takes
            # (see the module docstring's note on why no migration ships here).
            existing = next(
                (row for row in pending if row["field_name"] == field_name), None
            )
            if existing is not None:
                raise AmendmentError(
                    "AMENDMENT_ALREADY_PENDING",
                    f"You already have a pending request to change '{field_name}'. "
                    f"Wait for it to be reviewed, or ask the admissions team to "
                    f"reject it first.",
                    status_code=409,
                    details={
                        "field_name": field_name,
                        "pending_amendment_id": str(existing["id"]),
                    },
                )

            if len(pending) >= MAX_PENDING_AMENDMENTS:
                raise AmendmentError(
                    "MAX_PENDING_AMENDMENTS",
                    f"Maximum of {MAX_PENDING_AMENDMENTS} pending amendments allowed per application.",
                )

            # Get old value
            old_value = str(getattr(application, field_name, "") or "")

            # Create amendment in the same transaction
            amendment = ApplicationAmendment.objects.create(
                application_id=application_id,
                field_name=field_name,
                old_value=old_value,
                new_value=new_value,
                reason=reason,
                status="pending",
            )

        # Notify admins (Req 14.6) - outside the transaction so a notification
        # failure does not roll back the persisted amendment.
        _notify_admins_of_amendment(application, amendment)

        logger.info(
            "Amendment requested: app=%s field=%s by=%s",
            application_id, field_name, user_id,
        )

        return amendment

    @staticmethod
    def review_amendment(
        amendment_id: str,
        status: str,
        admin_id: str,
        application_id: str = "",
    ) -> ApplicationAmendment:
        """Review (approve/reject) an amendment.

        Args:
            amendment_id: UUID of the amendment.
            status: 'approved' or 'rejected'.
            admin_id: UUID of the admin reviewing.
            application_id: If provided, validates the amendment belongs to this application.

        Returns:
            The updated ApplicationAmendment instance.

        Raises:
            AmendmentError: If validation fails.

        Locking (task 9.5, AUTH-06): the amendment row and its application row are
        both locked, the amendment's status is re-read **under the lock**, and the
        transition is asserted against that value — so two reviewers deciding the
        same amendment produce one decision and one ``AMENDMENT_ALREADY_REVIEWED``,
        rather than two field writes. The status write, the field change and the
        history row commit together: an approved amendment that did not reach the
        application is not a state the platform can be left in.
        """
        with transaction.atomic():
            try:
                amendment = (
                    ApplicationAmendment.objects.select_for_update().get(id=amendment_id)
                )
            except ApplicationAmendment.DoesNotExist:
                raise AmendmentError("AMENDMENT_NOT_FOUND", "Amendment not found.")

            if application_id and str(amendment.application_id) != application_id:
                raise AmendmentError("AMENDMENT_NOT_FOUND", "Amendment not found for this application.")

            # Lock the application too: an approval writes one of its fields, and
            # the review workspace's version counter is bumped against it.
            try:
                application = (
                    Application.objects.select_for_update().get(id=amendment.application_id)
                )
            except Application.DoesNotExist:
                raise AmendmentError("APPLICATION_NOT_FOUND", "Application not found.")

            # The transition is checked against the row as it is *now*, inside the
            # lock — not against the copy the caller read before queueing.
            AmendmentStateMachine.assert_transition(amendment.status, status)

            amendment.status = status
            amendment.reviewed_by_id = admin_id
            amendment.reviewed_at = timezone.now()
            amendment.save(update_fields=["status", "reviewed_by", "reviewed_at"])

            # If approved, apply the field change (Req 14.8)
            if status == AmendmentStateMachine.APPROVED:
                setattr(application, amendment.field_name, amendment.new_value)
                application.save(update_fields=[amendment.field_name])

                # Record in history
                ApplicationStatusHistory.objects.create(
                    application=application,
                    status=application.status,
                    old_status=application.status,
                    new_status=application.status,
                    changed_by_id=admin_id,
                    notes=(
                        f"Amendment approved: {amendment.field_name} changed "
                        f"from '{amendment.old_value}' to '{amendment.new_value}'."
                    ),
                )

        logger.info(
            "Amendment reviewed: id=%s status=%s by=%s",
            amendment_id, status, admin_id,
        )

        # Notify student of amendment review result
        try:
            from apps.common.communication_service import CommunicationService
            application = Application.objects.get(id=amendment.application_id)
            CommunicationService.send('amendment_reviewed', application, {'amendment_status': status, 'field_name': amendment.field_name})
        except Exception:
            logger.exception("Failed to send amendment review notification for amendment=%s", amendment_id)

        return amendment


def amendment_history_payload(
    amendment: ApplicationAmendment, *, detailed: bool = False
) -> dict:
    """One amendment request, as the owner-scoped read publishes it (task 10.2).

    STU-17's other half: the student can now see what they asked for, what it was
    before, why they asked, where the request stands and — once reviewed — when
    that happened. Two deliberate omissions:

    * the **reviewer's identity** is not published. A student needs to know the
      decision and when it was made; which member of staff made it is the
      school's internal record, and it is in the tenant audit feed
      (``amendment.review_decided``) for the people who may read it.
    * nothing here is derived in the browser: the status carries its own
      definition and ``is_terminal`` comes from the state machine, so a client
      cannot disagree with the server about whether a request is still open.
    """
    status_value = (getattr(amendment, "status", "") or "").strip().lower()
    payload = {
        "id": str(amendment.id),
        "application_id": str(getattr(amendment, "application_id", "") or ""),
        "field_name": amendment.field_name,
        "new_value": amendment.new_value,
        "status": status_value,
        "status_definition": AMENDMENT_STATUS_DEFINITIONS.get(status_value, ""),
        "is_terminal": status_value in AmendmentStateMachine.TERMINAL_STATUSES,
        "requested_at": _iso(getattr(amendment, "created_at", None)),
        "reviewed_at": _iso(getattr(amendment, "reviewed_at", None)),
    }
    if detailed:
        payload["old_value"] = getattr(amendment, "old_value", None)
        payload["reason"] = getattr(amendment, "reason", None)
    return payload


def _iso(value):
    """Total over what a timestamp can be handed as (10.1 §6's lesson).

    A model field, a serialized row and a jsonb string all reach this read, and
    assuming ``datetime`` is what made the student's own inbox answer 500.
    """
    if value in (None, ""):
        return None
    isoformat = getattr(value, "isoformat", None)
    return isoformat() if callable(isoformat) else str(value)


def _notify_admins_of_amendment(application: Application, amendment: ApplicationAmendment) -> None:
    """Notify the staff authorized to review this amendment (task 9.5, R13.10).

    Recipients are the staff holding :data:`AMENDMENT_RECIPIENT_CAPABILITY` for
    **this application's own institution**, resolved through
    :class:`~apps.catalog.tenant_recipients.TenantStaffRecipientService` (and
    therefore through ``AdminCapabilityService``). Three consequences worth
    stating, because each one is a defect this replaces:

    * another school's staff are not notified, so an applicant's name and
      application number no longer cross a tenant boundary (R3.2);
    * a view-only member of the right school is not notified about work they may
      not do, and the school's actual reviewer is notified whether or not they
      hold the ``admin`` role string;
    * a school with **no** authorized reviewer produces an outbox row with
      ``recipient_count: 0`` and a stated reason — an observable gap — rather than
      a fallback fan-out to a wider audience.

    The fan-out itself goes through the durable communication outbox
    (``create_notifications_bulk``: one ``Notification`` + one ``OutboxEvent`` per
    recipient, one insert each) with a per-recipient idempotency key, so a retried
    request converges on one notification per recipient instead of two.

    Never raises: a notification problem must not undo a persisted amendment.
    """
    try:
        from apps.catalog.tenant_recipients import TenantStaffRecipientService
        from apps.common.notification_preferences import (
            CATEGORY_STAFF_ACTION_REQUIRED,
            staff_delivery_metadata,
        )
        from apps.common.outbox import create_notifications_bulk

        institution_id = getattr(application, "institution_ref_id", None)
        resolved = TenantStaffRecipientService.recipients_for_institution(
            institution_id,
            AMENDMENT_RECIPIENT_CAPABILITY,
            # The applicant is never a recipient of their own request, even in the
            # (test/legacy) case where a staff profile owns the application.
            exclude_user_ids=[getattr(application, "user_id", None)],
        )

        if resolved.profiles:
            # Task 10.1 settles the channel question task 9.5 deferred here: a
            # staff work item is inbox-only (``AUDIENCE_CHANNELS``), and it now
            # carries the delivery record that says so. Without it the
            # communications history reported this message's email channel as
            # ``unknown`` — "predates delivery tracking" — which was never true.
            # No preference is read: the platform publishes no staff settings, and
            # 9.5's resolver returns user ids rather than addresses.
            delivery = staff_delivery_metadata(
                category=CATEGORY_STAFF_ACTION_REQUIRED,
                application_id=getattr(application, "id", None),
                institution_id=resolved.institution_id,
            )
            create_notifications_bulk(
                [
                    {
                        "user_id": profile.id,
                        "title": "Amendment Request",
                        "message": (
                            f"Student {application.full_name} has requested an amendment "
                            f"to field '{amendment.field_name}' on application "
                            f"{application.application_number}."
                        ),
                        "type": "info",
                        "priority": "normal",
                        "action_url": f"/admin/applications/{application.id}",
                        "idempotency_key": f"amendment:{amendment.id}:recipient:{profile.id}",
                        "metadata": dict(delivery),
                    }
                    for profile in resolved.profiles
                ]
            )
        else:
            logger.warning(
                "Amendment %s on application %s has no tenant-authorized recipient "
                "(institution=%s reason=%s)",
                amendment.id,
                application.id,
                resolved.institution_id,
                resolved.empty_reason,
            )

        _record_amendment_request_event(application, amendment, resolved)
    except Exception:
        logger.exception(
            "Failed to notify authorized reviewers of amendment for app=%s",
            application.id,
        )


def _record_amendment_request_event(application, amendment, resolved) -> None:
    """Record the request as a durable outbox row plus a tenant Audit_Event.

    The outbox row is the "notify relevant parties" record design §17 requires and
    the change-request workflow already writes: it exists whether or not anybody
    was reachable, so a school with no authorized reviewer leaves a queryable gap
    (``recipient_count: 0``, ``empty_reason``) instead of silence. The Audit_Event
    is the tenant-scoped half — same redactor, no applicant field, and it is what
    the scoped audit feed (§1) shows the school.
    """
    payload = {
        "amendment_id": str(amendment.id),
        "application_id": str(application.id),
        "field_name": amendment.field_name,
        "status": amendment.status,
        **resolved.as_payload(),
    }

    try:
        import uuid as _uuid

        from apps.common.models import OutboxEvent

        now = timezone.now()
        # ``get_or_create`` inside its own savepoint: the key is unique, so a
        # replay must converge on the one row rather than raise an IntegrityError
        # that would poison an enclosing transaction. Idempotence is the contract,
        # not the exception handler.
        with transaction.atomic():
            OutboxEvent.objects.get_or_create(
                idempotency_key=f"amendment:{amendment.id}:requested",
                defaults={
                    "id": _uuid.uuid4(),
                    "event_type": AMENDMENT_REQUESTED_EVENT,
                    "channel": "notification",
                    "aggregate_type": "application_amendment",
                    "aggregate_id": amendment.id,
                    "payload": payload,
                    "status": "published",
                    "target_table": "application_amendments",
                    "target_id": amendment.id,
                    "created_at": now,
                    "processed_at": now,
                },
            )
    except Exception:  # pragma: no cover - outbox must never block a write
        logger.warning(
            "Failed to record amendment-request outbox row for amendment=%s",
            amendment.id,
            exc_info=True,
        )

    try:
        from apps.catalog.tenant_audit_service import (
            ACTION_AMENDMENT_REQUESTED,
            TenantAuditService,
        )

        TenantAuditService.record_event(
            action=ACTION_AMENDMENT_REQUESTED,
            entity_type="application_amendment",
            entity_id=amendment.id,
            actor_id=getattr(application, "user_id", None),
            institution_id=resolved.institution_id,
            metadata={"object_type": "application_amendment", **payload},
        )
    except Exception:  # pragma: no cover - audit must never block a write
        logger.warning(
            "Failed to record amendment-request audit event for amendment=%s",
            amendment.id,
            exc_info=True,
        )
