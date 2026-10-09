"""Tenant branding-asset admin views.

``/api/v1/admin/institutions/<id>/assets/…`` — the multipart upload path (the
primary one, R13.3) and the manual storage-key registration path that validates
the **stored object's** bytes rather than the caller's metadata (R13.2). Split
out of ``admin_views.py`` by task 12.1; every view is the one that was there,
lifted verbatim.
"""

from __future__ import annotations

import hashlib
import os
import uuid

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog._admin_view_helpers import (
    _InstitutionChildDetailView,
    _InstitutionChildListCreateView,
    _forbidden_write_response,
    _write_allowed,
)
from apps.catalog.admin_serializers import AdminInstitutionAssetSerializer
from apps.catalog.canonical_config_commands import audit_config_change as _audit_config_change
from apps.catalog.models import Institution, InstitutionAsset
from apps.catalog.tenant_audit_service import TenantAuditService

# Maximum accepted institution-asset upload size (2 MiB). Logos/signatures/seals
# are small brand images; anything larger is treated as an invalid asset (R5.3).
_MAX_ASSET_BYTES = 2 * 1024 * 1024


def _asset_invalid_response(message: str):
    """Stable 400 for a failed manual-asset-registration validation (R13.2)."""
    return Response(
        {"success": False, "error": message, "code": "ASSET_INVALID"},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _validate_stored_asset_object(storage_key: str, declared_mime: str):
    """Open the stored object and validate it from storage, not from the caller.

    Reads the bytes already at ``storage_key`` (out-of-band uploaded), enforces
    the same 2 MiB cap and MIME + magic-byte checks as the multipart upload
    path, and returns ``(detected_mime, computed_sha256, public_url)`` computed
    over / derived from the actual stored bytes. The caller-supplied
    ``checksum_sha256``/``mime_type``/``public_url`` are never trusted (R13.2).

    Raises ``rest_framework.exceptions.ValidationError`` on a missing/unreadable
    object, an empty/oversized object, or a MIME/magic-byte mismatch.
    """
    from io import BytesIO

    from apps.common.storage import MediaStorage

    storage = MediaStorage()
    try:
        fh = storage.open(storage_key)
    except Exception as exc:  # object missing/unreadable
        raise ValidationError("Stored asset object could not be read.") from exc
    try:
        # Read one byte past the cap so an oversized object is detectable
        # without loading an unbounded blob into memory. Within the cap, this
        # holds the entire object, so the SHA-256 below is the full-file digest.
        data = fh.read(_MAX_ASSET_BYTES + 1)
    finally:
        try:
            fh.close()
        except Exception:  # pragma: no cover - close best-effort
            pass

    if not data:
        raise ValidationError("Stored asset object is empty.")
    if len(data) > _MAX_ASSET_BYTES:
        raise ValidationError("Stored asset object exceeds the 2MB limit.")

    from apps.documents.validators import validate_asset_magic_bytes

    detected_mime = validate_asset_magic_bytes(BytesIO(data), declared_mime)
    computed_checksum = hashlib.sha256(data).hexdigest()
    # Derive the public URL from storage rather than trusting a caller-supplied
    # one (which could point anywhere); mirrors the multipart upload path.
    try:
        public_url = storage.url(storage_key)
    except Exception:  # pragma: no cover - url derivation best-effort
        public_url = None
    return detected_mime, computed_checksum, public_url


class AdminTenantAssetListCreateView(_InstitutionChildListCreateView):
    model = InstitutionAsset
    serializer_class = AdminInstitutionAssetSerializer
    audit_resource = "asset"

    @extend_schema(
        operation_id="admin_tenant_assets_create",
        tags=["admin"],
        request=AdminInstitutionAssetSerializer,
        responses={201: OpenApiResponse(response=AdminInstitutionAssetSerializer)},
    )
    def post(self, request, institution_id):
        """Manual (caller-metadata) asset registration — Super_Admin only (R13).

        This generic path accepts a caller-supplied ``storage_key`` pointing at
        an object already in storage. Per R13.1 it is disabled for
        non-super-admins (``_write_allowed``); per R13.2, where it remains it
        constrains ``storage_key`` to ``institution-assets/{institution_id}/``
        and validates the stored object's bytes + checksum from storage rather
        than trusting the caller-provided ``checksum_sha256``/``mime_type``. The
        multipart :class:`AdminTenantAssetUploadView` stays the primary
        creation path (R13.3).
        """
        # R13.1: only platform asset managers may register assets via this path.
        if not _write_allowed(request.user, "platform.asset.manage"):
            return _forbidden_write_response()

        try:
            Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            return Response(
                {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # R13.2: storage_key must live under this institution's asset prefix.
        # Reject traversal segments so a constrained prefix cannot be escaped.
        storage_key = str(request.data.get("storage_key") or "").strip().lstrip("/")
        required_prefix = f"institution-assets/{institution_id}/"
        if (
            not storage_key
            or ".." in storage_key
            or not storage_key.startswith(required_prefix)
            or storage_key == required_prefix
        ):
            return _asset_invalid_response(
                "storage_key must be a path under institution-assets/{institution_id}/."
            )

        declared_mime = str(request.data.get("mime_type") or "").strip().lower()

        # R13.2: validate the *stored object's* bytes + checksum from storage.
        try:
            detected_mime, computed_checksum, public_url = _validate_stored_asset_object(
                storage_key, declared_mime
            )
        except ValidationError:
            return _asset_invalid_response(
                "Stored asset object failed bytes, MIME, or checksum validation."
            )
        except Exception:
            return _asset_invalid_response("Stored asset object could not be validated.")

        # Build a payload from server-validated values; the caller-supplied
        # checksum/mime/public_url are overwritten so they are never persisted
        # as-is.
        payload = request.data.copy()
        payload["institution_id"] = str(institution_id)
        payload["storage_key"] = storage_key
        payload["mime_type"] = detected_mime
        payload["checksum_sha256"] = computed_checksum
        if public_url is not None:
            payload["public_url"] = public_url

        serializer = self.serializer_class(data=payload)
        serializer.is_valid(raise_exception=True)

        asset_type = serializer.validated_data.get("asset_type")
        current_version = (
            InstitutionAsset.objects.filter(institution_id=institution_id, asset_type=asset_type)
            .order_by("-version")
            .values_list("version", flat=True)
            .first()
            or 0
        )
        save_kwargs = dict(
            checksum_sha256=computed_checksum,
            mime_type=detected_mime,
            storage_key=storage_key,
            version=current_version + 1,
            created_at=timezone.now(),
            created_by_id=getattr(request.user, "id", None),
        )
        if public_url is not None:
            save_kwargs["public_url"] = public_url
        instance = serializer.save(**save_kwargs)
        _audit_config_change(
            request,
            resource=self.audit_resource,
            verb="created",
            entity_id=getattr(instance, "id", None),
            institution_id=institution_id,
        )
        return Response(
            {"success": True, "data": self.serializer_class(instance).data},
            status=status.HTTP_201_CREATED,
        )


class AdminTenantAssetUploadView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        tags=["admin"],
        summary="Upload a tenant institution asset (logo, signature, or seal)",
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "file": {"type": "string", "format": "binary"},
                    "asset_type": {
                        "type": "string",
                        "enum": ["logo", "signature", "seal"],
                        "default": "logo",
                    },
                },
                "required": ["file"],
            }
        },
        responses={201: OpenApiResponse(description="Asset uploaded and stored.")},
    )
    def post(self, request, institution_id):
        if not _write_allowed(request.user, "platform.asset.manage"):
            return _forbidden_write_response()
        try:
            Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            return Response({"success": False, "error": "Institution not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"success": False, "error": "Asset file is required", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        # Size guard is part of asset validation (R5.3): an oversized asset is a
        # mismatched/invalid upload, surfaced under the stable ASSET_INVALID code.
        if uploaded_file.size > _MAX_ASSET_BYTES:
            return Response(
                {"success": False, "error": "Asset file exceeds the 2MB limit", "code": "ASSET_INVALID"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        asset_type = (request.data.get("asset_type") or "logo").strip().lower()
        if asset_type not in {"logo", "signature", "seal"}:
            return Response({"success": False, "error": "Invalid asset type", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        declared_mime = (uploaded_file.content_type or "").strip().lower()
        # MIME + magic-byte validation for PNG/JPEG/WebP/SVG (R5.3). Any
        # mismatch/disallowed/empty/malformed upload → stable ASSET_INVALID.
        try:
            from apps.documents.validators import validate_asset_magic_bytes

            detected_mime = validate_asset_magic_bytes(uploaded_file, declared_mime)
        except ValidationError:
            return Response(
                {"success": False, "error": "Asset file failed MIME or magic-byte validation", "code": "ASSET_INVALID"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            # A malformed/unreadable upload is a client error, not a server fault.
            return Response(
                {"success": False, "error": "Asset file could not be validated", "code": "ASSET_INVALID"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        digest = hashlib.sha256()
        uploaded_file.seek(0)
        for chunk in uploaded_file.chunks():
            digest.update(chunk)
        checksum = digest.hexdigest()
        uploaded_file.seek(0)

        extension = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/svg+xml": ".svg",
        }[detected_mime]
        safe_name = f"{asset_type}-{uuid.uuid4().hex}{extension}"
        storage_key = f"institution-assets/{institution_id}/{safe_name}"

        try:
            from apps.common.storage import MediaStorage

            storage = MediaStorage()
            stored_name = storage.save(storage_key, uploaded_file)
            public_url = storage.url(stored_name)
        except Exception:
            return Response({"success": False, "error": "Asset storage error", "code": "STORAGE_ERROR"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        current_version = (
            InstitutionAsset.objects.filter(institution_id=institution_id, asset_type=asset_type)
            .order_by("-version")
            .values_list("version", flat=True)
            .first()
            or 0
        )
        asset = InstitutionAsset.objects.create(
            institution_id=institution_id,
            asset_type=asset_type,
            storage_key=stored_name,
            public_url=public_url,
            mime_type=detected_mime,
            checksum_sha256=checksum,
            version=current_version + 1,
            is_active=True,
            metadata={"original_name": os.path.basename(uploaded_file.name or safe_name)},
            created_at=timezone.now(),
            created_by_id=getattr(request.user, "id", None),
        )
        try:
            TenantAuditService.record_asset_upload(
                asset_id=asset.id,
                institution_id=institution_id,
                asset_type=asset_type,
                version=asset.version,
                mime_type=detected_mime,
                checksum_sha256=checksum,
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block upload
            pass
        return Response({"success": True, "data": AdminInstitutionAssetSerializer(asset).data}, status=status.HTTP_201_CREATED)


class AdminTenantAssetDetailView(_InstitutionChildDetailView):
    model = InstitutionAsset
    serializer_class = AdminInstitutionAssetSerializer
    audit_resource = "asset"
