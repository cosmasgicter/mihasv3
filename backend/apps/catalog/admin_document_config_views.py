"""Tenant document configuration admin views.

``/api/v1/admin/institutions/<id>/{templates,document-profiles,required-documents}/``
— the content-safety-validated document configuration surface, including the
clone endpoint that versions a profile by INSERT so documents already generated
from earlier versions keep their provenance (R8.5/R8.8). Split out of
``admin_views.py`` by task 12.1; every view is the one that was there, lifted
verbatim.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, is_super_admin
from apps.catalog._admin_view_helpers import (
    _InstitutionChildDetailView,
    _InstitutionChildListCreateView,
    _forbidden_write_response,
    _integrity_conflict_response,
    _scope_institution_ids,
    _write_allowed,
)
from apps.catalog.admin_serializers import (
    AdminDocumentProfileSerializer,
    AdminDocumentTemplateSerializer,
    AdminRequiredDocumentSerializer,
)
from apps.catalog.canonical_config_commands import audit_config_change as _audit_config_change
from apps.catalog.models import (
    InstitutionDocumentProfile,
    InstitutionDocumentTemplate,
    InstitutionRequiredDocument,
)
from apps.catalog.services import (
    InstitutionDocumentProfileService,
    TemplateValidationError,
    validate_profile_payload,
    validate_template_payload,
)

def _template_rejected_response(message: str):
    """Map a ``TemplateValidationError`` to the stable ``TEMPLATE_TOKEN_REJECTED``
    400 envelope (R5.7 / R6.4)."""
    return Response(
        {"success": False, "error": message, "code": "TEMPLATE_TOKEN_REJECTED"},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _guard_template_payload(request):
    """Validate a document-template create/update payload (R5.7 / R6.4).

    Returns a ``TEMPLATE_TOKEN_REJECTED`` 400 ``Response`` when the payload is
    unsafe (disallowed section/token, injected token, or an arbitrary uploaded
    DOCX/PDF merge document), or ``None`` when it is safe to proceed.

    ``sections`` / ``tokens`` are only validated when present so a partial
    update that omits them is unaffected.
    """
    data = request.data
    has_uploaded_file = bool(getattr(request, "FILES", None))
    sections = data.get("sections") if "sections" in data else None
    tokens = data.get("tokens") if "tokens" in data else None
    try:
        validate_template_payload(
            sections=sections,
            tokens=tokens,
            has_uploaded_file=has_uploaded_file,
            extra_keys=list(data.keys()),
        )
    except TemplateValidationError as exc:
        return _template_rejected_response(exc.message)
    return None


class AdminTenantTemplateListCreateView(_InstitutionChildListCreateView):
    """List/create tenant document templates (R9.4).

    R9.4 (template-read access vs production-edit restriction):
      * READ (``GET``) is scoped by ``_InstitutionChildListCreateView.get_queryset``
        through ``_scope_institution_ids(request.user)`` — a Tenant_Admin with
        template-read scope sees only their own institution's templates; a
        no-scope non-super-admin sees none (never another tenant's).
      * Production template EDITS (``POST``/``PATCH``) are restricted to granted
        actors via ``_write_allowed`` (Super_Admin), so a Tenant_Admin holding
        only read access can view but never mutate production templates.
    """

    model = InstitutionDocumentTemplate
    serializer_class = AdminDocumentTemplateSerializer
    audit_resource = "template"

    def post(self, request, institution_id):
        # Permission first (mirrors the parent's super-admin write gate), so a
        # non-super-admin gets FORBIDDEN rather than a payload-inspection 400.
        if not _write_allowed(request.user, self.get_write_capability()):
            return _forbidden_write_response()
        # Reject arbitrary merge documents / disallowed sections + tokens
        # before the generic create runs (R5.7 / R6.4).
        rejected = _guard_template_payload(request)
        if rejected is not None:
            return rejected
        return super().post(request, institution_id)


class AdminTenantTemplateDetailView(_InstitutionChildDetailView):
    """Retrieve/update a single tenant document template (R9.4).

    Read scoping and the production-edit restriction match
    :class:`AdminTenantTemplateListCreateView`: ``get_queryset`` confines reads
    to the actor's scoped institution(s), while ``PATCH`` is gated by
    ``_write_allowed`` (Super_Admin) so only granted actors edit production
    templates.
    """

    model = InstitutionDocumentTemplate
    serializer_class = AdminDocumentTemplateSerializer
    audit_resource = "template"

    def patch(self, request, institution_id, item_id):
        if not _write_allowed(request.user, self.get_write_capability()):
            return _forbidden_write_response()
        rejected = _guard_template_payload(request)
        if rejected is not None:
            return rejected
        return super().patch(request, institution_id, item_id)


def _guard_profile_payload(request):
    """Validate a tenant document-profile create/update payload (R8.6/8.7/8.10).

    Mirrors ``_guard_template_payload`` but uses ``validate_profile_payload`` so
    the richer profile shape (free-form sections + ``fee_chart`` /
    ``bank_accounts`` / ``requirements`` structural caps) is checked. Returns a
    ``TEMPLATE_TOKEN_REJECTED`` 400 ``Response`` on any violation (naming the
    offending section/token/row), or ``None`` when the payload is safe. Only
    provided fields are validated, so a partial update is unaffected.
    """
    data = request.data
    has_uploaded_file = bool(getattr(request, "FILES", None))
    try:
        validate_profile_payload(
            sections=data.get("sections") if "sections" in data else None,
            tokens=data.get("tokens") if "tokens" in data else None,
            fee_chart=data.get("fee_chart") if "fee_chart" in data else None,
            bank_accounts=data.get("bank_accounts") if "bank_accounts" in data else None,
            requirements=data.get("requirements") if "requirements" in data else None,
            has_uploaded_file=has_uploaded_file,
            extra_keys=list(data.keys()),
        )
    except TemplateValidationError as exc:
        return _template_rejected_response(exc.message)
    return None


class AdminTenantProfileListCreateView(_InstitutionChildListCreateView):
    """List/create rich tenant document profiles (R8.8).

    Profiles are the multi-section successors to templates: an optional
    applies-to scope (offering / canonical program / intake), a ``layout_key``,
    structured ``sections`` + ``fee_chart`` + ``bank_accounts`` +
    ``requirements`` + ``signatory``. Reads are scoped via ``AccessScopeService``
    (inherited from the base) so out-of-scope schools 404; writes are
    super-admin-gated and content-safety validated before any persistence.
    """

    model = InstitutionDocumentProfile
    serializer_class = AdminDocumentProfileSerializer
    audit_resource = "document_profile"

    def post(self, request, institution_id):
        # Permission first (mirrors the template path), so a non-super-admin
        # gets FORBIDDEN rather than a payload-inspection 400.
        if not _write_allowed(request.user, self.get_write_capability()):
            return _forbidden_write_response()
        rejected = _guard_profile_payload(request)
        if rejected is not None:
            return rejected
        return super().post(request, institution_id)


class AdminTenantProfileDetailView(_InstitutionChildDetailView):
    """Update (activate/deactivate, scope, layout) a tenant document profile.

    A PATCH that changes profile *content* is content-safety validated. To
    create a new version of a profile use the dedicated clone endpoint, which
    reuses ``InstitutionDocumentProfileService.create_new_version`` (INSERT,
    never in-place UPDATE) so prior versions — and any documents generated from
    them — stay untouched.
    """

    model = InstitutionDocumentProfile
    serializer_class = AdminDocumentProfileSerializer
    audit_resource = "document_profile"

    def patch(self, request, institution_id, item_id):
        if not _write_allowed(request.user, self.get_write_capability()):
            return _forbidden_write_response()
        rejected = _guard_profile_payload(request)
        if rejected is not None:
            return rejected
        return super().patch(request, institution_id, item_id)


class AdminTenantProfileCloneView(APIView):
    """POST a new version of an existing profile (R8.5 / R8.8).

    Reuses ``InstitutionDocumentProfileService.create_new_version`` — an INSERT
    with ``version = next_version_for_scope + 1`` in the source profile's exact
    scope; every prior row is left byte-for-byte untouched, preserving the
    provenance of documents already generated from earlier versions. Optional
    content overrides (``sections`` / ``fee_chart`` / ``bank_accounts`` /
    ``requirements`` / ``signatory`` / ``rules`` / ``layout_key`` /
    ``is_active``) are validated before any write via the shared
    ``validate_profile_payload`` machinery (raised as ``TEMPLATE_TOKEN_REJECTED``).
    """

    permission_classes = [IsAdmin]
    serializer_class = AdminDocumentProfileSerializer

    _OVERRIDE_FIELDS = (
        "layout_key",
        "sections",
        "fee_chart",
        "bank_accounts",
        "requirements",
        "signatory",
        "rules",
        "is_active",
    )

    def _get_queryset(self, request, institution_id):
        queryset = InstitutionDocumentProfile.objects.filter(institution_id=institution_id)
        institution_ids = _scope_institution_ids(request.user)
        if institution_ids and str(institution_id) not in institution_ids:
            return queryset.none()
        if not institution_ids and not is_super_admin(request.user):
            return queryset.none()
        return queryset

    def post(self, request, institution_id, item_id):
        if not _write_allowed(request.user, "platform.document.manage"):
            return _forbidden_write_response()
        try:
            profile = self._get_queryset(request, institution_id).get(id=item_id)
        except InstitutionDocumentProfile.DoesNotExist:
            return Response(
                {"success": False, "error": "Tenant resource not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        changes = {
            field: request.data[field]
            for field in self._OVERRIDE_FIELDS
            if field in request.data
        }
        try:
            with transaction.atomic():
                new_version = InstitutionDocumentProfileService().create_new_version(
                    profile,
                    created_by_id=getattr(request.user, "id", None),
                    **changes,
                )
        except TemplateValidationError as exc:
            return _template_rejected_response(exc.message)
        except IntegrityError:
            # Concurrent clone computed the same next version for this scope and
            # lost the race to uq_doc_profiles_scope_version (task 3.3, R15.5).
            return _integrity_conflict_response(
                "DUPLICATE_DOCUMENT_PROFILE_VERSION",
                "A newer version of this document profile already exists. Reload and retry.",
            )
        _audit_config_change(
            request,
            resource="document_profile",
            verb="created",
            entity_id=getattr(new_version, "id", None),
            institution_id=institution_id,
        )
        return Response(
            {"success": True, "data": AdminDocumentProfileSerializer(new_version).data},
            status=status.HTTP_201_CREATED,
        )


class AdminTenantRequiredDocumentListCreateView(_InstitutionChildListCreateView):
    model = InstitutionRequiredDocument
    serializer_class = AdminRequiredDocumentSerializer
    audit_resource = "required_document"


class AdminTenantRequiredDocumentDetailView(_InstitutionChildDetailView):
    model = InstitutionRequiredDocument
    serializer_class = AdminRequiredDocumentSerializer
    audit_resource = "required_document"
