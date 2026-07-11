"""Platform metadata endpoint."""

from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.openapi_helpers import envelope_serializer


PlatformMetaSerializer = inline_serializer(
    name="PlatformMetaSerializer",
    fields={
        "product": serializers.CharField(),
        "creator": inline_serializer(
            name="PlatformMetaCreatorSerializer",
            fields={"name": serializers.CharField()},
        ),
        "developer": inline_serializer(
            name="PlatformMetaDeveloperSerializer",
            fields={
                "name": serializers.CharField(),
                "url": serializers.URLField(),
            },
        ),
        "api_version": serializers.CharField(),
        "status": serializers.CharField(),
    },
)

PLATFORM_META_RESPONSE = envelope_serializer("PlatformMetaResponse", PlatformMetaSerializer)


class PlatformMetaView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(operation_id="meta_platform", tags=["meta"], auth=[], responses={200: OpenApiResponse(response=PLATFORM_META_RESPONSE)})
    def get(self, request):
        response = Response(
            {
                "product": "Beanola Admissions Platform",
                "creator": {"name": "Cosmas Kanchepa"},
                "developer": {"name": "Beanola Technologies", "url": "https://beanola.com"},
                "api_version": "v1",
                "status": "production_ready",
            }
        )
        # This payload is a static dict with zero database access — safe to
        # cache at any intermediary (CDN, browser) that respects the header.
        # Added 2026-07-11 (full-platform-remediation-2026-07, R4.2) so a
        # future CDN/edge cache in front of Caddy can serve this without any
        # backend involvement. stale-while-revalidate lets a cache keep
        # serving a slightly-stale copy while it revalidates in the
        # background, rather than blocking on a fresh fetch.
        response["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=3600"
        return response
