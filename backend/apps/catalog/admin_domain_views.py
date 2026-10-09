"""Tenant domain lifecycle admin views.

``/api/v1/admin/institutions/<id>/domains/…`` — create, disable, activate, retry,
approve, reject and reactivate, all validated through the one
:class:`~apps.catalog.services.DomainStatusMachine`. Split out of
``admin_views.py`` by task 12.1; every view is the one that was there, lifted
verbatim.

The five lifecycle commands share one refusal vocabulary
(``DOMAIN_NOT_VERIFIED`` / ``DOMAIN_TRANSITION_REJECTED`` /
``HOSTNAME_CONFLICT``), which is why those response helpers stayed in
``_admin_view_helpers`` rather than moving here: the disable ``PATCH`` on the
detail view and the activate/reactivate integrity races use the same two codes.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog._admin_view_helpers import (
    _InstitutionChildDetailView,
    _InstitutionChildListCreateView,
    _domain_not_verified_response,
    _domain_transition_conflict_response,
    _forbidden_write_response,
    _hostname_conflict_response,
    _write_allowed,
)
from apps.catalog.admin_serializers import AdminInstitutionDomainSerializer
from apps.catalog.canonical_config_commands import (
    audit_config_change as _audit_config_change,
    config_change_verb as _verb_for_payload,
    create_institution_domain,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.models import InstitutionDomain
from apps.catalog.services import DomainStatusMachine, DomainTransitionError

class AdminTenantDomainListCreateView(_InstitutionChildListCreateView):
    model = InstitutionDomain
    serializer_class = AdminInstitutionDomainSerializer
    order_by = ("hostname",)
    audit_resource = "domain"

    @extend_schema(
        operation_id="admin_tenant_domains_create",
        tags=["admin"],
        request=AdminInstitutionDomainSerializer,
        responses={201: OpenApiResponse(description="Domain created in pending_dns with DNS record to publish.")},
    )
    def post(self, request, institution_id):
        """Create a tenant domain in the verification-pending lifecycle (R7.3).

        Super-admin only (domain config is super-admin gated, R7.14). The new
        domain is forced to ``status = pending_dns`` with a freshly generated
        ≥32-char ``verification_token`` and a ``dns_target``; the response
        carries the DNS record the tenant must publish. The domain only becomes
        routable after the verification job (Task 7.3) advances it to
        ``verified`` and a super-admin activates it (``verified → active``).
        """
        if not _write_allowed(request.user, self.get_write_capability()):
            return _forbidden_write_response()

        # Delegate to the single canonical domain-create command (shared with the
        # tenant change-request apply path, task 4.5). It forces ``pending_dns``
        # with a fresh token + dns_target, records the ``tenant.domain.created``
        # audit event, and commits a durable verification job before returning
        # (R5.1; design §6.3). A concurrent same-hostname insert surfaces as an
        # IntegrityError which maps to the stable hostname-conflict code (R7.10).
        try:
            instance, dns_record = create_institution_domain(
                institution_id,
                request.data,
                request=request,
                created_by_id=getattr(request.user, "id", None),
            )
        except IntegrityError:
            return _hostname_conflict_response()

        data = self.serializer_class(instance).data
        data["status"] = instance.status
        data["verification_token"] = instance.verification_token
        data["dns_target"] = instance.dns_target
        data["dns_record"] = dns_record
        return Response({"success": True, "data": data}, status=status.HTTP_201_CREATED)


class AdminTenantDomainDetailView(_InstitutionChildDetailView):
    model = InstitutionDomain
    serializer_class = AdminInstitutionDomainSerializer
    audit_resource = "domain"

    def patch(self, request, institution_id, item_id):
        if not _write_allowed(request.user, self.get_write_capability()):
            return _forbidden_write_response()
        try:
            domain = self.get_queryset(request, institution_id).get(id=item_id)
        except InstitutionDomain.DoesNotExist:
            return Response({"success": False, "error": "Tenant resource not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        payload = request.data.copy()
        payload["institution_id"] = str(institution_id)
        serializer = self.serializer_class(domain, data=payload, partial=True)
        serializer.is_valid(raise_exception=True)

        deactivate_requested = payload.get("is_active") in (False, "false", "False", 0, "0")
        if deactivate_requested and domain.status == InstitutionDomain.STATUS_ACTIVE:
            try:
                DomainStatusMachine.assert_transition(
                    domain.status,
                    InstitutionDomain.STATUS_DISABLED,
                )
            except DomainTransitionError:
                return Response(
                    {
                        "success": False,
                        "error": "Domain cannot be disabled from its current status.",
                        "code": "DOMAIN_TRANSITION_REJECTED",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            domain = serializer.save(status=InstitutionDomain.STATUS_DISABLED)
        else:
            domain = serializer.save()

        _audit_config_change(
            request,
            resource=self.audit_resource,
            verb=_verb_for_payload(request.data, created=False),
            entity_id=domain.id,
            institution_id=institution_id,
        )
        invalidate_catalog_scopes(institution_id, user=request.user)
        return Response({"success": True, "data": self.serializer_class(domain).data})


class AdminTenantDomainActivateView(APIView):
    """POST .../domains/<id>/activate/ — activate a verified domain (R7.6, R7.7, R7.14).

    Activation is restricted to ``platform.domain.manage`` actors (R7.14). A domain
    may be activated only from ``verified`` (R7.6); any other status is rejected
    with the stable ``DOMAIN_NOT_VERIFIED`` code and the status is left unchanged
    (R7.7). On success the status moves ``verified → active`` (validated through
    the :class:`DomainStatusMachine`) and ``approved_by`` records the activating
    platform actor. A duplicate active hostname (the partial unique index
    ``uq_institution_domains_active_hostname``) is mapped to ``HOSTNAME_CONFLICT``
    with HTTP 409 (R7.10).
    """

    permission_classes = [IsAdmin]
    serializer_class = AdminInstitutionDomainSerializer

    @extend_schema(
        operation_id="admin_tenant_domain_activate",
        tags=["admin"],
        request=None,
        responses={200: OpenApiResponse(response=AdminInstitutionDomainSerializer)},
    )
    def post(self, request, institution_id, item_id):
        if not _write_allowed(request.user, "platform.domain.manage"):
            return _forbidden_write_response()
        try:
            domain = InstitutionDomain.objects.get(id=item_id, institution_id=institution_id)
        except InstitutionDomain.DoesNotExist:
            return Response(
                {"success": False, "error": "Domain not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # R7.6/R7.7: only a ``verified`` domain may be activated. Anything else
        # (including ``disabled``, which the state machine would otherwise allow
        # to re-activate) is rejected here without mutating the domain.
        if domain.status != InstitutionDomain.STATUS_VERIFIED:
            return _domain_not_verified_response()

        # Defence-in-depth: the machine must agree ``verified → active`` is legal.
        try:
            DomainStatusMachine.assert_transition(
                domain.status, InstitutionDomain.STATUS_ACTIVE
            )
        except DomainTransitionError:
            return _domain_not_verified_response()

        domain.status = InstitutionDomain.STATUS_ACTIVE
        domain.approved_by_id = getattr(request.user, "id", None)
        try:
            with transaction.atomic():
                domain.save(update_fields=["status", "approved_by"])
        except IntegrityError:
            # Another tenant already holds this hostname as ``active`` (partial
            # unique index). The atomic block rolled the row back unchanged.
            return _hostname_conflict_response()

        _audit_config_change(
            request,
            resource="domain",
            verb="activated",
            entity_id=domain.id,
            institution_id=institution_id,
        )
        invalidate_catalog_scopes(institution_id, user=request.user)

        data = self.serializer_class(domain).data
        data["status"] = domain.status
        return Response({"success": True, "data": data})


def _get_domain_or_404(request, institution_id, item_id):
    """Fetch a scoped domain for a lifecycle command, or return a 404 Response.

    Returns ``(domain, None)`` on success or ``(None, response)`` on a miss.
    Scoping is by institution id (the URL already carries it); an out-of-scope
    institution is handled by the surrounding capability check
    (``platform.domain.manage`` is Super_Admin-only, R7.14).
    """
    try:
        return (
            InstitutionDomain.objects.get(id=item_id, institution_id=institution_id),
            None,
        )
    except InstitutionDomain.DoesNotExist:
        return None, Response(
            {"success": False, "error": "Domain not found", "code": "NOT_FOUND"},
            status=status.HTTP_404_NOT_FOUND,
        )


class AdminTenantDomainRetryView(APIView):
    """POST .../domains/<id>/retry/ — re-run verification for a domain (R5.1).

    Platform ``platform.domain.manage`` only (R7.14). Valid from ``pending_dns``
    (re-check now), ``failed`` (``failed → pending_dns``), or ``rejected``
    (``rejected → pending_dns``); any other status is rejected with
    ``DOMAIN_TRANSITION_REJECTED`` (409) and the domain is left unchanged. The
    command clears ``last_error`` and **commits a fresh verification job before
    returning accepted** (design §6.3 "Creating or retrying commits a
    domain-verification job before returning accepted"), then re-runs the one
    :class:`DomainStatusMachine`-guarded verification path.
    """

    permission_classes = [IsAdmin]
    serializer_class = AdminInstitutionDomainSerializer

    _RETRYABLE_FROM = frozenset(
        {
            InstitutionDomain.STATUS_PENDING_DNS,
            InstitutionDomain.STATUS_FAILED,
            InstitutionDomain.STATUS_REJECTED,
        }
    )

    @extend_schema(
        operation_id="admin_tenant_domain_retry",
        tags=["admin"],
        request=None,
        responses={202: OpenApiResponse(response=AdminInstitutionDomainSerializer)},
    )
    def post(self, request, institution_id, item_id):
        if not _write_allowed(request.user, "platform.domain.manage"):
            return _forbidden_write_response()
        domain, miss = _get_domain_or_404(request, institution_id, item_id)
        if miss is not None:
            return miss

        if domain.status not in self._RETRYABLE_FROM:
            return _domain_transition_conflict_response(
                "Domain verification can only be retried while it is pending, failed, or rejected."
            )

        # failed/rejected → pending_dns is machine-guarded; an already-pending
        # domain rides the same re-check path without a status change.
        if domain.status != InstitutionDomain.STATUS_PENDING_DNS:
            try:
                DomainStatusMachine.assert_transition(
                    domain.status, InstitutionDomain.STATUS_PENDING_DNS
                )
            except DomainTransitionError:
                return _domain_transition_conflict_response(
                    "Domain verification cannot be retried from its current status."
                )

        from apps.catalog.tasks import enqueue_domain_verification

        with transaction.atomic():
            domain.status = InstitutionDomain.STATUS_PENDING_DNS
            domain.last_error = None
            domain.save(update_fields=["status", "last_error"])
            # Commit-then-dispatch: the durable pending_dns row is the queued
            # job; dispatch fires after commit and is broker-outage safe.
            enqueue_domain_verification(domain.id)

        _audit_config_change(
            request,
            resource="domain",
            verb="retried",
            entity_id=domain.id,
            institution_id=institution_id,
        )
        invalidate_catalog_scopes(institution_id, user=request.user)

        data = self.serializer_class(domain).data
        data["status"] = domain.status
        return Response({"success": True, "data": data}, status=status.HTTP_202_ACCEPTED)


class AdminTenantDomainApproveView(APIView):
    """POST .../domains/<id>/approve/ — approve a DNS-verified domain (R5.1).

    Platform ``platform.domain.manage`` only (R7.14). ``pending_review →
    verified`` — the explicit platform decision after the verification job has
    proven DNS control (design §6.3). Any status other than ``pending_review``
    is rejected with ``DOMAIN_TRANSITION_REJECTED`` (409) and the domain is left
    unchanged. Approving does not make the domain routable; a separate
    ``activate`` (``verified → active``) does.
    """

    permission_classes = [IsAdmin]
    serializer_class = AdminInstitutionDomainSerializer

    @extend_schema(
        operation_id="admin_tenant_domain_approve",
        tags=["admin"],
        request=None,
        responses={200: OpenApiResponse(response=AdminInstitutionDomainSerializer)},
    )
    def post(self, request, institution_id, item_id):
        if not _write_allowed(request.user, "platform.domain.manage"):
            return _forbidden_write_response()
        domain, miss = _get_domain_or_404(request, institution_id, item_id)
        if miss is not None:
            return miss

        if domain.status != InstitutionDomain.STATUS_PENDING_REVIEW:
            return _domain_transition_conflict_response(
                "Only a domain that is pending review can be approved."
            )
        try:
            DomainStatusMachine.assert_transition(
                domain.status, InstitutionDomain.STATUS_VERIFIED
            )
        except DomainTransitionError:
            return _domain_transition_conflict_response(
                "This domain cannot be approved from its current status."
            )

        domain.status = InstitutionDomain.STATUS_VERIFIED
        domain.last_error = None
        domain.save(update_fields=["status", "last_error"])

        _audit_config_change(
            request,
            resource="domain",
            verb="approved",
            entity_id=domain.id,
            institution_id=institution_id,
        )
        invalidate_catalog_scopes(institution_id, user=request.user)

        data = self.serializer_class(domain).data
        data["status"] = domain.status
        return Response({"success": True, "data": data})


class AdminTenantDomainRejectView(APIView):
    """POST .../domains/<id>/reject/ — reject a domain pending review (R5.1).

    Platform ``platform.domain.manage`` only (R7.14). ``pending_review →
    rejected`` (design §6.3). An optional operator ``reason`` is stored,
    length-bounded, on ``last_error`` (the field the panel already surfaces to
    explain why a domain is not routing). Any status other than
    ``pending_review`` is rejected with ``DOMAIN_TRANSITION_REJECTED`` (409). A
    rejected domain never routes a tenant and can only re-enter the lifecycle
    through a ``retry`` (``rejected → pending_dns``).
    """

    permission_classes = [IsAdmin]
    serializer_class = AdminInstitutionDomainSerializer

    #: Match the ``last_error`` column cap so a reason is never truncated by the DB.
    _MAX_REASON_LENGTH = 1000

    @extend_schema(
        operation_id="admin_tenant_domain_reject",
        tags=["admin"],
        request=None,
        responses={200: OpenApiResponse(response=AdminInstitutionDomainSerializer)},
    )
    def post(self, request, institution_id, item_id):
        if not _write_allowed(request.user, "platform.domain.manage"):
            return _forbidden_write_response()
        domain, miss = _get_domain_or_404(request, institution_id, item_id)
        if miss is not None:
            return miss

        if domain.status != InstitutionDomain.STATUS_PENDING_REVIEW:
            return _domain_transition_conflict_response(
                "Only a domain that is pending review can be rejected."
            )
        try:
            DomainStatusMachine.assert_transition(
                domain.status, InstitutionDomain.STATUS_REJECTED
            )
        except DomainTransitionError:
            return _domain_transition_conflict_response(
                "This domain cannot be rejected from its current status."
            )

        raw_reason = request.data.get("reason") if isinstance(request.data, dict) else None
        reason = (str(raw_reason).strip()[: self._MAX_REASON_LENGTH]) if raw_reason else ""

        domain.status = InstitutionDomain.STATUS_REJECTED
        domain.last_error = reason or "Domain rejected by a platform administrator."
        domain.save(update_fields=["status", "last_error"])

        _audit_config_change(
            request,
            resource="domain",
            verb="rejected",
            entity_id=domain.id,
            institution_id=institution_id,
        )
        invalidate_catalog_scopes(institution_id, user=request.user)

        data = self.serializer_class(domain).data
        data["status"] = domain.status
        return Response({"success": True, "data": data})


class AdminTenantDomainReactivateView(APIView):
    """POST .../domains/<id>/reactivate/ — re-enable a disabled domain (R5.1).

    Platform ``platform.domain.manage`` only (R7.14). ``disabled → active`` — the
    reactivation edge in design §6.3's ``active → disabled → active`` loop. Sets
    ``is_active`` true so the fail-closed Domain_Resolver will route the tenant
    again. Any status other than ``disabled`` is rejected with
    ``DOMAIN_TRANSITION_REJECTED`` (409). A hostname that another tenant activated
    while this one was disabled collides on the partial unique index and returns
    ``HOSTNAME_CONFLICT`` (409) with the row left unchanged (R7.10).
    """

    permission_classes = [IsAdmin]
    serializer_class = AdminInstitutionDomainSerializer

    @extend_schema(
        operation_id="admin_tenant_domain_reactivate",
        tags=["admin"],
        request=None,
        responses={200: OpenApiResponse(response=AdminInstitutionDomainSerializer)},
    )
    def post(self, request, institution_id, item_id):
        if not _write_allowed(request.user, "platform.domain.manage"):
            return _forbidden_write_response()
        domain, miss = _get_domain_or_404(request, institution_id, item_id)
        if miss is not None:
            return miss

        if domain.status != InstitutionDomain.STATUS_DISABLED:
            return _domain_transition_conflict_response(
                "Only a disabled domain can be reactivated."
            )
        try:
            DomainStatusMachine.assert_transition(
                domain.status, InstitutionDomain.STATUS_ACTIVE
            )
        except DomainTransitionError:
            return _domain_transition_conflict_response(
                "This domain cannot be reactivated from its current status."
            )

        domain.status = InstitutionDomain.STATUS_ACTIVE
        domain.is_active = True
        domain.approved_by_id = getattr(request.user, "id", None)
        try:
            with transaction.atomic():
                domain.save(update_fields=["status", "is_active", "approved_by"])
        except IntegrityError:
            # Another tenant activated this hostname while it was disabled.
            return _hostname_conflict_response()

        _audit_config_change(
            request,
            resource="domain",
            verb="reactivated",
            entity_id=domain.id,
            institution_id=institution_id,
        )
        invalidate_catalog_scopes(institution_id, user=request.user)

        data = self.serializer_class(domain).data
        data["status"] = domain.status
        return Response({"success": True, "data": data})
