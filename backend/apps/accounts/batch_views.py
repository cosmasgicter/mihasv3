"""Batch user import view.

POST /api/v1/admin/users/batch-import/
Accepts JSON array of user objects, validates all first, creates in a single transaction.
"""

import logging
import secrets

from django.db import IntegrityError, transaction
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile
from apps.accounts.permissions import IsAdmin, ROLE_HIERARCHY
from apps.accounts.services import hash_password
from apps.common.audit_network import build_audit_network_fields
from apps.common.models import AuditLog

logger = logging.getLogger(__name__)

VALID_ROLES = {"student", "admin", "reviewer", "super_admin"}
MAX_BATCH_SIZE = 100


def _role_level(role: str | None) -> int:
    return ROLE_HIERARCHY.get(role or "", 0)


class BatchUserItemSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=255)
    last_name = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=20, required=False, default="")
    role = serializers.ChoiceField(choices=list(VALID_ROLES))
    password = serializers.CharField(min_length=6, required=False, default="")


class BatchUserImportRequestSerializer(serializers.ListSerializer):
    """POST /api/v1/admin/users/batch-import/ request body (JSON array of users).

    Maximum 100 items per batch. Each item must be a valid BatchUserItemSerializer.
    """

    child = BatchUserItemSerializer()

    def validate(self, data):
        if len(data) > MAX_BATCH_SIZE:
            raise serializers.ValidationError(
                f"Maximum {MAX_BATCH_SIZE} users per batch."
            )
        return data


class BatchUserImportResponseDataSerializer(serializers.Serializer):
    imported = serializers.ListField(child=serializers.CharField())
    errors = serializers.ListField(child=serializers.DictField())


class BatchUserImportResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = BatchUserImportResponseDataSerializer()


class BatchUserImportView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = BatchUserItemSerializer  # drf-spectacular will describe as an array

    @extend_schema(
        request=BatchUserItemSerializer(many=True),
        responses={
            200: OpenApiResponse(response=BatchUserImportResponseSerializer),
            400: OpenApiResponse(description="Validation error — bad format, batch too large, or role escalation"),
        },
        tags=["admin"],
        summary="Batch import users from CSV/JSON",
    )
    def post(self, request):
        users_data = request.data
        if not isinstance(users_data, list):
            return Response(
                {"success": False, "error": "Expected a JSON array of user objects.", "code": "INVALID_FORMAT"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(users_data) > MAX_BATCH_SIZE:
            return Response(
                {"success": False, "error": f"Maximum {MAX_BATCH_SIZE} users per batch.", "code": "BATCH_TOO_LARGE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Phase 1: validate all
        errors = []
        validated = []
        seen_emails = set()
        actor_role = getattr(request.user, "role", None)
        actor_level = _role_level(actor_role)
        existing_emails = set(
            Profile.objects.filter(
                email__in=[u.get("email", "").lower() for u in users_data if isinstance(u, dict)]
            ).values_list("email", flat=True)
        )

        for i, item in enumerate(users_data):
            ser = BatchUserItemSerializer(data=item)
            if not ser.is_valid():
                errors.append({"index": i, "email": item.get("email", ""), "errors": ser.errors})
                continue
            data = ser.validated_data
            normalized_email = data["email"].lower()
            if normalized_email in seen_emails:
                errors.append({"index": i, "email": data["email"], "errors": {"email": ["Duplicate in batch"]}})
                continue
            if normalized_email in existing_emails:
                errors.append({"index": i, "email": data["email"], "errors": {"email": ["Already exists"]}})
                continue
            if _role_level(data["role"]) > actor_level:
                errors.append(
                    {
                        "index": i,
                        "email": data["email"],
                        "errors": {"role": ["You cannot create a user with a higher role than your own"]},
                    }
                )
                continue
            data["email"] = normalized_email
            seen_emails.add(normalized_email)
            validated.append(data)

        if errors and not validated:
            return Response(
                {"success": True, "data": {"created": 0, "skipped": len(errors), "errors": errors}},
                status=status.HTTP_200_OK,
            )

        # Phase 2: create with per-row savepoints so duplicate races do not
        # discard the rest of the validated batch.
        created = 0
        created_emails = []
        for data in validated:
            password = data["password"] or secrets.token_urlsafe(10)
            try:
                with transaction.atomic():
                    Profile.objects.create(
                        email=data["email"],
                        password_hash=hash_password(password),
                        first_name=data["first_name"],
                        last_name=data["last_name"],
                        phone=data.get("phone", ""),
                        role=data["role"],
                        is_active=True,
                    )
            except IntegrityError:
                errors.append(
                    {
                        "index": None,
                        "email": data["email"],
                        "errors": {"email": ["Already exists"]},
                    }
                )
                continue
            created += 1
            created_emails.append(data["email"])

        if created or errors:
            actor_id = getattr(request.user, "pk", None)
            network_fields = build_audit_network_fields(request)
            AuditLog.objects.create(
                actor_id=actor_id,
                action="user_batch_import",
                entity_type="profiles",
                changes={
                    "created_count": created,
                    "skipped_count": len(errors),
                    "created_emails": created_emails,
                },
                ip_address=network_fields["ip_address"],
                user_agent=network_fields["user_agent"],
                ip_address_encrypted=network_fields["ip_address_encrypted"],
                user_agent_encrypted=network_fields["user_agent_encrypted"],
                retention_category="security",
            )

        return Response(
            {"success": True, "data": {"created": created, "skipped": len(errors), "errors": errors}},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
