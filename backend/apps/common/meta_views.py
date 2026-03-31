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
        return Response(
            {
                "product": "AI Job Hunting Platform",
                "creator": {"name": "Cosmas Kanchepa"},
                "developer": {"name": "Beanola Technologies", "url": "https://beanola.com"},
                "api_version": "v1",
                "status": "production_v1_seeded",
            }
        )
