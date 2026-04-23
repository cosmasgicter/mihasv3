"""Batch user import view.

POST /api/v1/admin/users/batch-import/
Accepts JSON array of user objects, validates all first, creates in a single transaction.
"""

import logging
import secrets

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile
from apps.accounts.permissions import IsAdmin
from apps.accounts.services import hash_password

logger = logging.getLogger(__name__)

VALID_ROLES = {"student", "admin", "reviewer", "super_admin"}
MAX_BATCH_SIZE = 100


class BatchUserItemSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=255)
    last_name = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=20, required=False, default="")
    role = serializers.ChoiceField(choices=list(VALID_ROLES))
    password = serializers.CharField(min_length=6, required=False, default="")


class BatchUserImportView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

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
            if data["email"].lower() in existing_emails:
                errors.append({"index": i, "email": data["email"], "errors": {"email": ["Already exists"]}})
                continue
            validated.append(data)

        if errors and not validated:
            return Response(
                {"success": True, "data": {"created": 0, "skipped": len(errors), "errors": errors}},
                status=status.HTTP_200_OK,
            )

        # Phase 2: create in single transaction
        created = 0
        with transaction.atomic():
            for data in validated:
                password = data["password"] or secrets.token_urlsafe(10)
                Profile.objects.create(
                    email=data["email"],
                    password_hash=hash_password(password),
                    first_name=data["first_name"],
                    last_name=data["last_name"],
                    phone=data.get("phone", ""),
                    role=data["role"],
                    is_active=True,
                )
                created += 1

        return Response(
            {"success": True, "data": {"created": created, "skipped": len(errors), "errors": errors}},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
