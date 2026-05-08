"""Tests for admin/template/batch serializers (T16 — API remediation Phase 3)."""
from __future__ import annotations

import pytest


def test_batch_user_item_serializer_happy_path():
    from apps.accounts.batch_views import BatchUserItemSerializer

    s = BatchUserItemSerializer(data={
        "email": "alice@example.com",
        "first_name": "Alice",
        "last_name": "Smith",
        "role": "student",
        "password": "abc123",
    })
    assert s.is_valid(), s.errors


def test_batch_user_item_rejects_invalid_role():
    from apps.accounts.batch_views import BatchUserItemSerializer

    s = BatchUserItemSerializer(data={
        "email": "x@y.z", "first_name": "X", "last_name": "Y", "role": "superdev"
    })
    assert not s.is_valid()
    assert "role" in s.errors


def test_batch_user_item_rejects_bad_email():
    from apps.accounts.batch_views import BatchUserItemSerializer

    s = BatchUserItemSerializer(data={
        "email": "notanemail", "first_name": "X", "last_name": "Y", "role": "student"
    })
    assert not s.is_valid()
    assert "email" in s.errors


def test_batch_user_item_rejects_short_password():
    from apps.accounts.batch_views import BatchUserItemSerializer

    s = BatchUserItemSerializer(data={
        "email": "x@y.z", "first_name": "X", "last_name": "Y",
        "role": "student", "password": "ab",
    })
    assert not s.is_valid()
    assert "password" in s.errors


def test_batch_user_import_request_enforces_max_size():
    from apps.accounts.batch_views import BatchUserImportRequestSerializer, MAX_BATCH_SIZE

    # Build MAX_BATCH_SIZE + 1 valid items
    oversized = [
        {
            "email": f"user{i}@example.com",
            "first_name": "U", "last_name": str(i),
            "role": "student",
        }
        for i in range(MAX_BATCH_SIZE + 1)
    ]
    s = BatchUserImportRequestSerializer(data=oversized)
    assert not s.is_valid()


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
    from apps.accounts.batch_views import BatchUserImportView, BatchUserItemSerializer
    from apps.common.template_views import (
        CommunicationTemplateListView,
        CommunicationTemplateSerializer,
        CommunicationTemplateUpdateRequestSerializer,
        CommunicationTemplateUpdateView,
    )

    assert BatchUserImportView.serializer_class is BatchUserItemSerializer
    assert CommunicationTemplateListView.serializer_class is CommunicationTemplateSerializer
    assert CommunicationTemplateUpdateView.serializer_class is CommunicationTemplateUpdateRequestSerializer


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
