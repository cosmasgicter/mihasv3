"""Tests for admin/template/batch serializers (T16 — API remediation Phase 3).

Batch-import section updated by admissions-v2 task 9.3 (R6.4, finding ADM-04).
``BatchUserItemSerializer`` / ``BatchUserImportRequestSerializer`` are gone: a DRF
``Serializer`` with its own ``ChoiceField`` role list was the third disagreeing
copy of the role vocabulary that ADM-03/AUTH-04 describe, and it could not do the
job R6.4 asks for — a row that is valid *in isolation* still has to be checked
against the actor's ceiling for the target school, against the other rows in the
batch, and against the accounts that already exist.

Row validation is now :meth:`UserImportService.plan`, the single validator shared
by the preview and the commit, and the vocabulary it reads is derived from the
platform's own ``ROLE_HIERARCHY``. The tests below assert that contract instead.
"""
from __future__ import annotations


def test_import_row_vocabulary_is_derived_not_restated():
    """The import's roles are the platform's roles, by construction (R6.2)."""
    from apps.accounts.permissions import ROLE_HIERARCHY
    from apps.accounts.user_directory_service import SUPPORTED_ROLES

    assert set(SUPPORTED_ROLES) == set(ROLE_HIERARCHY)
    # Ordered least → most authority, so a generated enum and a rendered select
    # are deterministic rather than set-iteration order.
    assert SUPPORTED_ROLES == ("student", "reviewer", "admin", "super_admin")


def test_import_row_field_contract_is_explicit():
    """A row may carry only the fields the import implements (R6.2)."""
    from apps.accounts.user_directory_service import IMPORT_ROW_FIELDS

    assert IMPORT_ROW_FIELDS == frozenset(
        {"email", "first_name", "last_name", "full_name", "phone", "role", "password"}
    )


def test_batch_import_shim_reexports_the_new_contract():
    """The retired module keeps working, pointed at the new vocabulary."""
    from apps.accounts.batch_views import (
        BatchUserImportView,
        MAX_BATCH_SIZE,
        VALID_ROLES,
    )
    from apps.accounts.user_directory_service import IMPORT_MAX_ROWS, SUPPORTED_ROLES
    from apps.accounts.user_directory_views import AdminUserBatchImportView

    assert BatchUserImportView is AdminUserBatchImportView
    assert MAX_BATCH_SIZE == IMPORT_MAX_ROWS
    assert set(VALID_ROLES) == set(SUPPORTED_ROLES)


def test_import_row_limit_is_published():
    """The ceiling is part of the contract, so a client can show it (R6.4)."""
    from apps.accounts.user_directory_service import IMPORT_MAX_ROWS

    assert IMPORT_MAX_ROWS == 100


def test_import_declares_its_atomicity_modes():
    """Atomicity is declared by the caller, not assumed by the server (R6.4)."""
    from apps.accounts.user_import_service import (
        DEFAULT_IMPORT_MODE,
        IMPORT_MODES,
        IMPORT_MODE_ALL_OR_NOTHING,
        IMPORT_MODE_PER_ROW,
    )

    assert IMPORT_MODES == (IMPORT_MODE_ALL_OR_NOTHING, IMPORT_MODE_PER_ROW)
    # The safe default: a partially-imported staff intake is harder to reconcile
    # than a rejected one.
    assert DEFAULT_IMPORT_MODE == IMPORT_MODE_ALL_OR_NOTHING


def test_import_row_errors_are_stable_codes():
    """A downloadable row failure carries a code, not only prose (R6.4)."""
    from apps.accounts.user_import_service import ROW_ERROR_CODES

    for code in (
        "MISSING_FIELD",
        "INVALID_EMAIL",
        "UNSUPPORTED_ROLE",
        "ROLE_ABOVE_ACTOR",
        "DUPLICATE_IN_BATCH",
        "EMAIL_EXISTS",
        "UNSUPPORTED_FIELD",
    ):
        assert code in ROW_ERROR_CODES


def test_communication_template_update_request_all_fields_optional():
    from apps.common.template_views import CommunicationTemplateUpdateRequestSerializer

    # Empty body is valid (all fields optional)
    s = CommunicationTemplateUpdateRequestSerializer(data={})
    assert s.is_valid(), s.errors

    # Partial update is valid
    s = CommunicationTemplateUpdateRequestSerializer(data={"is_active": False})
    assert s.is_valid(), s.errors


def test_communication_template_update_request_rejects_invalid_channel():
    from apps.common.template_views import CommunicationTemplateUpdateRequestSerializer

    s = CommunicationTemplateUpdateRequestSerializer(data={"channel": "fax"})
    assert not s.is_valid()
    assert "channel" in s.errors


def test_views_declare_serializer_class():
    from apps.common.template_views import (
        CommunicationTemplateListView,
        CommunicationTemplateSerializer,
        CommunicationTemplateUpdateRequestSerializer,
        CommunicationTemplateUpdateView,
    )

    assert CommunicationTemplateListView.serializer_class is CommunicationTemplateSerializer
    assert CommunicationTemplateUpdateView.serializer_class is CommunicationTemplateUpdateRequestSerializer


def test_import_views_declare_an_explicit_request_schema():
    """The import endpoints describe their body, without a second role list.

    A ``serializer_class`` attribute was how the retired
    ``BatchUserItemSerializer`` got into the generated schema, and it brought its
    own ``ChoiceField`` role enum with it. The import views declare their request
    through ``@extend_schema`` instead, and the *description* names the row limit
    and the modes from the one place they are defined.
    """
    from apps.accounts import user_directory_views as module
    from apps.accounts.user_directory_service import IMPORT_MAX_ROWS
    from apps.accounts.user_import_service import IMPORT_MODES

    for view in (module.AdminUserBatchImportView, module.AdminUserImportPreviewView):
        # drf-spectacular attaches a synthesized schema class to the handler.
        assert "schema" in getattr(view.post, "kwargs", {}), (
            f"{view.__name__} declares no OpenAPI schema"
        )

    description = module._IMPORT_REQUEST_DESCRIPTION
    assert "institution_id" in description
    assert str(IMPORT_MAX_ROWS) in description
    for mode in IMPORT_MODES:
        assert mode in description


def test_list_response_serializer_uses_many_true():
    """CommunicationTemplateListResponseSerializer wraps a list of templates."""
    from apps.common.template_views import (
        CommunicationTemplateListResponseSerializer,
        CommunicationTemplateSerializer,
    )

    fields = CommunicationTemplateListResponseSerializer().get_fields()
    assert "success" in fields
    assert "data" in fields
    # data field is a list of CommunicationTemplateSerializer
    data_field = fields["data"]
    assert isinstance(data_field, type(CommunicationTemplateSerializer(many=True)))
