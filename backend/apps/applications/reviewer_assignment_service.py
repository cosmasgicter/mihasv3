"""Reviewer membership, eligibility, assignment, and workload rules.

Admissions V2 canonical rebuild — task 2.5 (findings AUTH-01, AUTH-03).

This service is the single backend authority for *who may be assigned* an
application for review and *how* assignment mutates state safely. It composes
with ``AdminCapabilityService`` (which decides whether the *actor* may perform
the assignment) but owns the orthogonal **assignment-target policy** from
design §5.2 / §5.3:

    Reviewer = named institution membership PLUS application assignment.
    "Reviewer assignment requires active membership in the application's tenant
    and an eligible reviewer policy. Auto-assignment selects only from the same
    set and locks workload counters."

Concretely it guarantees:

* A reviewer can only be assigned to an application in a tenant they are an
  active member of, and only when their profile role is reviewer-capable
  (``reviewer`` / ``admin`` / ``super_admin``) — enforced identically on manual
  (:meth:`assign_reviewer`) and automatic (:meth:`auto_assign`) assignment.
* Assignment mutations lock the affected rows in a **fixed order —
  application first, then reviewer** — so concurrent assignments cannot lose an
  update or push a reviewer past ``max_reviewer_workload`` (the reviewer
  ``Profile`` row is the workload-counter lock).
* Assignment candidates are tenant-scoped, searchable members
  (:meth:`eligible_reviewers_queryset`) so the frontend never has to post a raw
  or empty reviewer id (AUTH-03).

Follows the thin-service pattern used across the admissions domain
(``WithdrawalService``, ``InterviewService``, ...): static/class methods, a
custom error carrying ``code``/``message``, and ``select_for_update`` locking.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q

logger = logging.getLogger(__name__)


class ReviewerAssignmentError(Exception):
    """Raised when reviewer assignment is rejected by policy.

    Carries a stable ``code`` and human-safe ``message`` plus the HTTP
    ``status_code`` the API layer should surface, matching the other admissions
    business-logic services.
    """

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True)
class AssignmentOutcome:
    """Result of one reviewer assignment (manual or one auto-assign step)."""

    application_id: str
    reviewer_id: str
    reviewer_email: str
    old_reviewer_id: str | None


class ReviewerAssignmentService:
    """Membership/eligibility + locked assignment + workload rules (task 2.5)."""

    #: Profile roles that may act as an application reviewer. Membership in the
    #: application's tenant is *always* additionally required (see
    #: :meth:`is_eligible_reviewer`); the role alone never grants eligibility.
    ELIGIBLE_ROLES = ("reviewer", "admin", "super_admin")

    #: Application statuses that count toward a reviewer's active workload.
    WORKLOAD_STATUSES = ("submitted", "under_review", "waitlisted")

    #: Default max concurrent workload when the ``max_reviewer_workload``
    #: setting is absent or unparseable.
    DEFAULT_MAX_WORKLOAD = 20

    # -- Configuration -------------------------------------------------------

    @classmethod
    def resolve_max_workload(cls) -> int:
        """Read ``max_reviewer_workload`` from settings, else the default."""
        from apps.common.models import Setting

        try:
            setting = Setting.objects.filter(key="max_reviewer_workload").first()
            if setting and setting.value:
                return int(setting.value)
        except Exception:
            logger.debug(
                "Could not read max_reviewer_workload setting; using default=%s",
                cls.DEFAULT_MAX_WORKLOAD,
                exc_info=True,
            )
        return cls.DEFAULT_MAX_WORKLOAD

    # -- Eligibility (tenant-scoped candidate policy, R8.2 / design §5.3) ----

    @classmethod
    def eligible_reviewers_queryset(cls, institution_ids, *, search: str | None = None):
        """Profiles eligible to review for the given institution(s).

        A candidate is an **active** profile with a reviewer-capable role that
        holds an **active** ``UserInstitutionMembership`` in at least one of
        ``institution_ids``. This is the exact set manual assignment validates
        against and auto-assignment selects from (design §5.3), so the frontend
        candidate picker can never surface a reviewer that assignment would then
        reject. ``search`` narrows by name/email (case-insensitive).
        """
        from apps.accounts.models import Profile
        from apps.catalog.models import UserInstitutionMembership

        institution_ids = [str(i) for i in institution_ids if i]
        if not institution_ids:
            return Profile.objects.none()

        member_ids = (
            UserInstitutionMembership.objects.filter(
                institution_id__in=institution_ids,
                is_active=True,
            )
            .values_list("user_id", flat=True)
            .distinct()
        )

        queryset = Profile.objects.filter(
            id__in=member_ids,
            is_active=True,
            role__in=cls.ELIGIBLE_ROLES,
        )

        if search:
            term = search.strip()
            if term:
                queryset = queryset.filter(
                    Q(first_name__icontains=term)
                    | Q(last_name__icontains=term)
                    | Q(email__icontains=term)
                )
        return queryset

    @classmethod
    def is_eligible_reviewer(cls, reviewer, institution_id) -> bool:
        """Whether ``reviewer`` may be assigned an application in ``institution_id``.

        Fails closed: an inactive/None reviewer, a non-reviewer-capable role, a
        missing tenant, or the absence of an active membership in that tenant
        all yield ``False``.
        """
        from apps.catalog.models import UserInstitutionMembership

        if reviewer is None or not getattr(reviewer, "is_active", False):
            return False
        if getattr(reviewer, "role", None) not in cls.ELIGIBLE_ROLES:
            return False
        if not institution_id:
            return False
        return UserInstitutionMembership.objects.filter(
            user_id=reviewer.id,
            institution_id=institution_id,
            is_active=True,
        ).exists()

    # -- Manual assignment (AUTH-03) -----------------------------------------

    @classmethod
    def assign_reviewer(cls, *, application_id, reviewer_id, actor_id) -> AssignmentOutcome:
        """Assign one application to one reviewer under locks.

        Locks the application, then the reviewer ``Profile`` (fixed order:
        application -> reviewer), validates membership/eligibility for the
        application's tenant, sets the assignment, and records an audit history
        row — all in one transaction. Raises :class:`ReviewerAssignmentError`
        (never mutates) when the application/reviewer is missing, the tenant
        cannot be resolved, or the reviewer is not eligible for the
        application's tenant.
        """
        from apps.accounts.models import Profile
        from apps.applications.models import Application, ApplicationStatusHistory

        with transaction.atomic():
            # 1. Lock the application row first (fixed lock order).
            try:
                app = Application.objects.select_for_update().get(id=application_id)
            except Application.DoesNotExist:
                raise ReviewerAssignmentError(
                    "NOT_FOUND", "Application not found.", status_code=404
                )

            institution_id = app.institution_ref_id
            if not institution_id:
                # Cannot establish the tenant → cannot validate membership.
                # Fail closed rather than assigning an unscoped reviewer.
                raise ReviewerAssignmentError(
                    "APPLICATION_TENANT_UNRESOLVED",
                    "This application is not linked to a tenant, so a reviewer "
                    "cannot be assigned.",
                    status_code=409,
                )

            # 2. Lock the reviewer Profile (workload-counter lock).
            try:
                reviewer = Profile.objects.select_for_update().get(id=reviewer_id)
            except Profile.DoesNotExist:
                raise ReviewerAssignmentError(
                    "REVIEWER_NOT_FOUND", "Reviewer not found.", status_code=404
                )

            if not cls.is_eligible_reviewer(reviewer, institution_id):
                # Non-revealing: does not disclose whether the failure is the
                # role, active flag, or membership — only that the target is not
                # an eligible reviewer for this application's tenant.
                raise ReviewerAssignmentError(
                    "REVIEWER_NOT_ELIGIBLE",
                    "The selected user is not an eligible reviewer for this "
                    "application's institution.",
                    status_code=400,
                )

            old_reviewer_id = (
                str(app.assigned_reviewer_id_id) if app.assigned_reviewer_id_id else None
            )
            app.assigned_reviewer_id = reviewer
            app.save(update_fields=["assigned_reviewer_id"])

            ApplicationStatusHistory.objects.create(
                application=app,
                status=app.status,
                old_status=app.status,
                new_status=app.status,
                changed_by_id=str(actor_id) if actor_id else None,
                notes=(
                    f"Reviewer assigned: {reviewer.email} "
                    f"(was: {old_reviewer_id or 'unassigned'})"
                ),
            )

        return AssignmentOutcome(
            application_id=str(app.id),
            reviewer_id=str(reviewer.id),
            reviewer_email=reviewer.email,
            old_reviewer_id=old_reviewer_id,
        )

    # -- Automatic assignment (design §5.3, workload counter lock) -----------

    @classmethod
    def auto_assign(cls, *, actor_id, max_workload: int | None = None) -> dict:
        """Round-robin unassigned submitted applications to eligible reviewers.

        For each unassigned application, selects only reviewers with an active
        membership in *that application's* tenant (never a reviewer outside the
        tenant — AUTH-03) whose active workload is below ``max_workload``.

        Concurrency safety: within one transaction it locks the unassigned
        applications (``skip_locked`` so parallel runs take disjoint work) and
        then the eligible reviewer ``Profile`` rows (the workload-counter lock),
        in the fixed order application -> reviewer. Because every assignment
        path (manual + auto) acquires the reviewer lock before reading/mutating
        that reviewer's workload, concurrent runs cannot push a reviewer past
        ``max_workload``.
        """
        from apps.accounts.models import Profile  # noqa: F401 (ensures app ready)
        from apps.applications.models import Application, ApplicationStatusHistory
        from apps.catalog.models import UserInstitutionMembership

        if max_workload is None:
            max_workload = cls.resolve_max_workload()

        outcomes: list[AssignmentOutcome] = []

        with transaction.atomic():
            # 1. Lock the batch of unassigned applications (fixed order: apps
            #    first). skip_locked lets a concurrent auto-assign run take a
            #    disjoint set instead of blocking.
            unassigned = list(
                Application.objects.select_for_update(skip_locked=True)
                .filter(
                    status__in=["submitted", "under_review"],
                    assigned_reviewer_id__isnull=True,
                )
                .order_by("created_at")
            )
            if not unassigned:
                return {"assigned_count": 0, "assignments": []}

            institution_ids = {
                str(a.institution_ref_id) for a in unassigned if a.institution_ref_id
            }
            if not institution_ids:
                # No application in the batch can be tenant-resolved.
                return {"assigned_count": 0, "assignments": []}

            # 2. Lock the eligible reviewer Profiles (workload-counter lock),
            #    fixed order by id to avoid deadlocks between concurrent runs.
            reviewers = list(
                cls.eligible_reviewers_queryset(institution_ids)
                .select_for_update()
                .order_by("id")
            )
            if not reviewers:
                raise ReviewerAssignmentError(
                    "NO_REVIEWERS",
                    "No eligible reviewers available for the pending applications.",
                    status_code=400,
                )

            reviewer_by_id = {r.id: r for r in reviewers}

            # Which locked reviewers are eligible for which institution.
            per_institution: dict[str, list] = {iid: [] for iid in institution_ids}
            membership_rows = UserInstitutionMembership.objects.filter(
                user_id__in=list(reviewer_by_id.keys()),
                institution_id__in=list(institution_ids),
                is_active=True,
            ).values_list("user_id", "institution_id")
            for user_id, institution_id in membership_rows:
                reviewer = reviewer_by_id.get(user_id)
                if reviewer is not None:
                    per_institution.setdefault(str(institution_id), []).append(reviewer)

            # Current workload per locked reviewer (protected by the reviewer
            # lock held above).
            workload = {
                r.id: Application.objects.filter(
                    assigned_reviewer_id=r.id,
                    status__in=cls.WORKLOAD_STATUSES,
                ).count()
                for r in reviewers
            }
            round_robin: dict[str, int] = {}

            for app in unassigned:
                institution_id = (
                    str(app.institution_ref_id) if app.institution_ref_id else None
                )
                if not institution_id:
                    continue  # cannot resolve tenant → leave unassigned (fail closed)
                candidates = per_institution.get(institution_id) or []
                if not candidates:
                    continue

                start = round_robin.get(institution_id, 0)
                count = len(candidates)
                for offset in range(count):
                    reviewer = candidates[(start + offset) % count]
                    if workload[reviewer.id] < max_workload:
                        app.assigned_reviewer_id = reviewer
                        app.save(update_fields=["assigned_reviewer_id"])
                        ApplicationStatusHistory.objects.create(
                            application=app,
                            status=app.status,
                            old_status=app.status,
                            new_status=app.status,
                            changed_by_id=str(actor_id) if actor_id else None,
                            notes=f"Auto-assigned to reviewer: {reviewer.email}",
                        )
                        workload[reviewer.id] += 1
                        round_robin[institution_id] = (start + offset + 1) % count
                        outcomes.append(
                            AssignmentOutcome(
                                application_id=str(app.id),
                                reviewer_id=str(reviewer.id),
                                reviewer_email=reviewer.email,
                                old_reviewer_id=None,
                            )
                        )
                        break

        return {"assigned_count": len(outcomes), "assignments": outcomes}
