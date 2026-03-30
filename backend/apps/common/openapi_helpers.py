"""Reusable OpenAPI schema helpers and lightweight documentation serializers."""

from rest_framework import serializers
from drf_spectacular.utils import inline_serializer


class ErrorResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=False)
    error = serializers.CharField()
    code = serializers.CharField()
    details = serializers.JSONField(required=False)


class MessageSerializer(serializers.Serializer):
    message = serializers.CharField()


class IdMessageSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    message = serializers.CharField()


class UpdatedCountSerializer(serializers.Serializer):
    message = serializers.CharField()
    updated = serializers.IntegerField()


class SessionDeviceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    device_info = serializers.JSONField()
    last_active = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField(allow_null=True)


class HealthStatusSerializer(serializers.Serializer):
    status = serializers.CharField()
    db = serializers.CharField(required=False)
    redis = serializers.CharField(required=False)


class NotificationEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    message = serializers.CharField()
    type = serializers.CharField()
    created_at = serializers.DateTimeField(allow_null=True)


class TaskQueuedSerializer(serializers.Serializer):
    task_id = serializers.CharField()
    document_id = serializers.UUIDField()
    status = serializers.CharField()


class PaymentReceiptSerializer(serializers.Serializer):
    payment_id = serializers.UUIDField()
    amount = serializers.CharField()
    currency = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField(allow_null=True)
    application_number = serializers.CharField(allow_null=True)
    program = serializers.CharField(allow_null=True)
    applicant_name = serializers.CharField(allow_null=True)


class StatusTransitionSerializer(serializers.Serializer):
    message = serializers.CharField()
    application_id = serializers.UUIDField()
    old_status = serializers.CharField()
    new_status = serializers.CharField()


def _resolve_schema_field(field_or_serializer):
    if isinstance(field_or_serializer, serializers.BaseSerializer):
        return field_or_serializer
    if isinstance(field_or_serializer, serializers.Field):
        return field_or_serializer
    if isinstance(field_or_serializer, type) and issubclass(field_or_serializer, serializers.BaseSerializer):
        return field_or_serializer()
    raise TypeError(f"Unsupported schema field: {field_or_serializer!r}")


def envelope_serializer(name: str, data_field) -> type[serializers.Serializer]:
    """Wrap a serializer or field in the API success envelope."""
    return inline_serializer(
        name=name,
        fields={
            "success": serializers.BooleanField(default=True),
            "data": _resolve_schema_field(data_field),
        },
    )


def paginated_serializer(name: str, item_serializer) -> type[serializers.Serializer]:
    """Build the page/pageSize/totalCount/results response shape."""
    if isinstance(item_serializer, type) and issubclass(item_serializer, serializers.BaseSerializer):
        results_field = item_serializer(many=True)
    else:
        serializer_instance = _resolve_schema_field(item_serializer)
        if isinstance(serializer_instance, serializers.ListSerializer):
            results_field = serializer_instance
        elif isinstance(serializer_instance, serializers.BaseSerializer):
            results_field = serializer_instance.__class__(many=True)
        else:
            raise TypeError("Paginated serializer requires a serializer class or instance.")

    return inline_serializer(
        name=name,
        fields={
            "page": serializers.IntegerField(),
            "pageSize": serializers.IntegerField(),
            "totalCount": serializers.IntegerField(),
            "results": results_field,
        },
    )
