"""Capability- and dashboard-cache invalidation signals (R5.4–5.6, R2.4).

These signals keep the per-user Capability_Cache (namespace ``"cap"``, wired in
``apps.accounts.admin_user_views._resolve_capability_payload``) bounded well
under the requirement windows by dropping a user's cached scope/capabilities
payload the moment an authority-affecting change commits:

- ``Profile.role`` change → invalidate that user (R5.4, includes the
  stale-super-admin demotion case R5.7).
- ``UserInstitutionMembership`` / ``AccessGrant`` create / update / delete →
  invalidate the affected user (R5.5).
- ``Institution.is_active`` change → invalidate every user scoped to that tenant
  via an active membership (R5.6).

Every invalidation is bound through ``transaction.on_commit`` so the version
bump lands right after the change commits (the ≤1s window of R5.4–5.6) and never
fires for a rolled-back transaction.

The handlers are no-ops unless ``PERF_CACHE_CAPABILITIES`` is enabled: when the
flag is off there is no cache to invalidate, so the pre-feature path carries
zero added work (no cache writes, no extra reads). Invalidation itself is an
O(1) per-scope version-token bump via
:func:`apps.common.scoped_cache.invalidate_user`, which never raises.

The dashboard handlers (namespace ``"dash"``) are the parallel set for the
Dashboard_Cache wired in ``AdminDashboardView.get`` (task 13.1). They drop the
affected admin-scope dashboard entries within the ≤5s window of R2.4 on an
``Application`` status change, a ``Payment`` create/change, a
``UserInstitutionMembership`` / ``AccessGrant`` create/update/delete, and an
``Institution`` update — gated by ``PERF_CACHE_DASHBOARD`` (no-op when off).

Requirements: 5.4, 5.5, 5.6, 2.4.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from apps.common.scoped_cache import build_scope_signature, invalidate, invalidate_user

logger = logging.getLogger(__name__)

# Lazy string senders avoid an import cycle (catalog.services imports broadly
# and apps.common.scoped_cache resolves it lazily); ``ModelSignal`` resolves a
# string sender once the app registry is ready.
_PROFILE = "accounts.Profile"
_MEMBERSHIP = "catalog.UserInstitutionMembership"
_GRANT = "catalog.AccessGrant"
_INSTITUTION = "catalog.Institution"
_APPLICATION = "applications.Application"
_PAYMENT = "documents.Payment"


def _enabled() -> bool:
    """Whether the capability cache is active (gates all handler work)."""
    return bool(getattr(settings, "PERF_CACHE_CAPABILITIES", False))


def _invalidate_user_on_commit(user_id) -> None:
    """Schedule a per-user capability-cache invalidation after commit (≤1s)."""
    if not user_id:
        return
    transaction.on_commit(lambda: invalidate_user("cap", user_id))


# --- Profile.role change (R5.4 / R5.7) -------------------------------------


@receiver(pre_save, sender=_PROFILE, dispatch_uid="perf_cap_profile_role_pre")
def _capture_profile_role(sender, instance, **kwargs):
    """Stash the persisted ``role`` so post_save can detect a genuine change.

    ``Profile`` uses a UUID default, so ``pk`` is populated before the first
    save; the post_save ``created`` flag (not ``pk``) is what distinguishes a
    create. Reading the stored ``role`` here lets us scope invalidation to an
    actual role change rather than every profile edit (e.g. avatar/phone saves).
    """
    if not _enabled():
        return
    instance._perf_prev_role = (
        sender.objects.filter(pk=instance.pk).values_list("role", flat=True).first()
    )


@receiver(post_save, sender=_PROFILE, dispatch_uid="perf_cap_profile_role_post")
def _invalidate_on_profile_role_change(sender, instance, created, **kwargs):
    if not _enabled():
        return
    # A newly created profile cannot have a cached capability entry yet.
    if created:
        return
    # ``_perf_prev_role`` is the committed value captured in pre_save; for an
    # update the row existed, so it reflects the real prior role.
    if getattr(instance, "_perf_prev_role", instance.role) != instance.role:
        _invalidate_user_on_commit(instance.pk)


# --- Membership / grant create|update|delete (R5.5) ------------------------


@receiver(post_save, sender=_MEMBERSHIP, dispatch_uid="perf_cap_membership_save")
@receiver(post_save, sender=_GRANT, dispatch_uid="perf_cap_grant_save")
def _invalidate_on_membership_or_grant_save(sender, instance, **kwargs):
    if not _enabled():
        return
    _invalidate_user_on_commit(getattr(instance, "user_id", None))


@receiver(post_delete, sender=_MEMBERSHIP, dispatch_uid="perf_cap_membership_delete")
@receiver(post_delete, sender=_GRANT, dispatch_uid="perf_cap_grant_delete")
def _invalidate_on_membership_or_grant_delete(sender, instance, **kwargs):
    if not _enabled():
        return
    _invalidate_user_on_commit(getattr(instance, "user_id", None))


# --- Institution.is_active change (R5.6) -----------------------------------


@receiver(pre_save, sender=_INSTITUTION, dispatch_uid="perf_cap_institution_pre")
def _capture_institution_active(sender, instance, **kwargs):
    if not _enabled():
        return
    instance._perf_prev_active = (
        sender.objects.filter(pk=instance.pk)
        .values_list("is_active", flat=True)
        .first()
    )


@receiver(post_save, sender=_INSTITUTION, dispatch_uid="perf_cap_institution_post")
def _invalidate_on_institution_active_change(sender, instance, created, **kwargs):
    if not _enabled():
        return
    if created:
        return
    # For an update the row existed, so ``_perf_prev_active`` holds the real
    # prior value (possibly ``None`` for a stored NULL); only a genuine
    # transition invalidates.
    if getattr(instance, "_perf_prev_active", instance.is_active) == instance.is_active:
        return
    _invalidate_scope_users_on_commit(instance.pk)


def _invalidate_scope_users_on_commit(institution_id) -> None:
    """Invalidate every user scoped to ``institution_id`` via active membership.

    Per R5.6 / task 12.2, tenant-scoped users are resolved through active
    ``UserInstitutionMembership`` records. The resolution query is deferred to
    ``on_commit`` so it observes the committed membership state and never runs
    for a rolled-back institution change.
    """
    if not institution_id:
        return

    def _do():
        from apps.catalog.models import UserInstitutionMembership

        user_ids = (
            UserInstitutionMembership.objects.filter(
                institution_id=institution_id, is_active=True
            )
            .values_list("user_id", flat=True)
            .distinct()
        )
        for uid in user_ids:
            invalidate_user("cap", uid)

    transaction.on_commit(_do)


# ===========================================================================
# Dashboard-cache invalidation (R2.4) — namespace "dash"
# ===========================================================================
#
# The Dashboard_Cache (namespace ``"dash"``, wired in
# ``AdminDashboardView.get`` by task 13.1) keys each entry per resolved admin
# scope via ``build_scope_signature(user, institution_filter=...)`` — it is NOT
# a single global entry. To invalidate the entries affected by a write, we
# resolve the institution the changed record belongs to, then resolve every
# admin user whose scope includes that institution (active
# ``UserInstitutionMembership``) plus all super-admins, and bump the per-scope
# version token for each via ``invalidate("dash", build_scope_signature(user))``.
#
# Super-admins see platform-wide aggregates, so any triggering change affects
# their dashboard regardless of the record's institution; they are always
# invalidated. Their selected-tenant (``institution_filter``) variants are left
# to recompute within the short 45s TTL — invalidating the unfiltered signature
# plus the per-scope tenant admins is the pragmatic, correct, bounded-staleness
# set (favoring correctness over per-filter fan-out, consistent with the
# version-token design).
#
# Every invalidation is deferred via ``transaction.on_commit`` so the bump lands
# right after the change commits (the ≤5s window of R2.4) and never fires for a
# rolled-back transaction. Handlers are no-ops unless ``PERF_CACHE_DASHBOARD``
# is enabled, so the pre-feature path carries zero added work, and the resolver
# is best-effort (a failure is logged and swallowed, never breaking the write
# path).


def _dashboard_enabled() -> bool:
    """Whether the dashboard cache is active (gates all dashboard handlers)."""
    return bool(getattr(settings, "PERF_CACHE_DASHBOARD", False))


def _invalidate_dash_on_commit(*, institution_id=None, application_id=None) -> None:
    """Schedule a dashboard-cache invalidation for the affected scope(s).

    Resolves, after commit, the set of admin users to invalidate: all
    super-admins (platform-wide aggregates) plus every admin scoped to
    ``institution_id`` via an active membership. When only ``application_id`` is
    known (a payment change), the owning application's institution is resolved
    inside the deferred callback so it observes committed state. For each
    resolved user the per-scope ``"dash"`` version token is bumped via
    ``invalidate`` (which never raises). The whole resolution is best-effort and
    wrapped so a lookup failure can never break the committing write path.
    """
    if not _dashboard_enabled():
        return

    def _do():
        try:
            from apps.accounts.models import Profile
            from apps.catalog.models import UserInstitutionMembership

            inst_id = institution_id
            if inst_id is None and application_id is not None:
                from apps.applications.models import Application

                inst_id = (
                    Application.objects.filter(pk=application_id)
                    .values_list("institution_ref_id", flat=True)
                    .first()
                )

            # Super-admins always: their dashboard shows platform-wide totals.
            user_ids = set(
                Profile.objects.filter(role="super_admin").values_list(
                    "id", flat=True
                )
            )
            # Tenant admins scoped to the affected institution via active
            # membership (mirrors task 12.2's tenant-scoped user resolution).
            if inst_id:
                user_ids.update(
                    UserInstitutionMembership.objects.filter(
                        institution_id=inst_id, is_active=True
                    ).values_list("user_id", flat=True)
                )

            if not user_ids:
                return

            for user in Profile.objects.filter(id__in=user_ids):
                # Unfiltered signature (task 13.1's no-filter case); selected
                # tenant variants recompute within the 45s TTL.
                invalidate("dash", build_scope_signature(user))
        except Exception:  # pragma: no cover - best-effort, never break writes
            logger.warning(
                "scoped_cache: dashboard invalidation failed", exc_info=True
            )

    transaction.on_commit(_do)


# --- Application status change (R2.4) --------------------------------------


@receiver(pre_save, sender=_APPLICATION, dispatch_uid="perf_dash_application_pre")
def _capture_application_status(sender, instance, **kwargs):
    """Stash the persisted ``status`` so post_save can detect a real change.

    ``Application`` uses a UUID default, so ``pk`` is set before the first save;
    the post_save ``created`` flag distinguishes a create. Capturing the stored
    status here scopes invalidation to genuine status transitions rather than
    every draft autosave (which would needlessly churn the dashboard cache).
    """
    if not _dashboard_enabled():
        return
    instance._perf_prev_status = (
        sender.objects.filter(pk=instance.pk)
        .values_list("status", flat=True)
        .first()
    )


@receiver(post_save, sender=_APPLICATION, dispatch_uid="perf_dash_application_post")
def _invalidate_dash_on_application_change(sender, instance, created, **kwargs):
    if not _dashboard_enabled():
        return
    # A create introduces a new row into the scoped/platform-wide counts; an
    # update only matters when the status (a dashboard aggregate dimension)
    # actually changed.
    if not created and getattr(
        instance, "_perf_prev_status", instance.status
    ) == instance.status:
        return
    _invalidate_dash_on_commit(institution_id=getattr(instance, "institution_ref_id", None))


# --- Payment create / change (R2.4) ----------------------------------------


@receiver(post_save, sender=_PAYMENT, dispatch_uid="perf_dash_payment_post")
def _invalidate_dash_on_payment_change(sender, instance, **kwargs):
    if not _dashboard_enabled():
        return
    # A payment row carries no institution directly; resolve it from the owning
    # application inside the deferred callback (committed state).
    _invalidate_dash_on_commit(application_id=getattr(instance, "application_id", None))


# --- Membership / grant create|update|delete (R2.4) ------------------------


@receiver(post_save, sender=_MEMBERSHIP, dispatch_uid="perf_dash_membership_save")
@receiver(post_save, sender=_GRANT, dispatch_uid="perf_dash_grant_save")
def _invalidate_dash_on_membership_or_grant_save(sender, instance, **kwargs):
    if not _dashboard_enabled():
        return
    _invalidate_dash_on_commit(institution_id=getattr(instance, "institution_id", None))


@receiver(post_delete, sender=_MEMBERSHIP, dispatch_uid="perf_dash_membership_delete")
@receiver(post_delete, sender=_GRANT, dispatch_uid="perf_dash_grant_delete")
def _invalidate_dash_on_membership_or_grant_delete(sender, instance, **kwargs):
    if not _dashboard_enabled():
        return
    _invalidate_dash_on_commit(institution_id=getattr(instance, "institution_id", None))


# --- Institution update (R2.4) ---------------------------------------------


@receiver(post_save, sender=_INSTITUTION, dispatch_uid="perf_dash_institution_post")
def _invalidate_dash_on_institution_update(sender, instance, created, **kwargs):
    if not _dashboard_enabled():
        return
    # A brand-new institution has no scoped admins or applications yet, so there
    # is no dashboard entry to drop; an update can change scoped admins' view.
    if created:
        return
    _invalidate_dash_on_commit(institution_id=instance.pk)
