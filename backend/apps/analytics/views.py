"""Analytics scaffold views."""

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics.serializers import DailyDigestSerializer, FunnelAnalyticsSerializer, OutreachAnalyticsSerializer, SourceAnalyticsSerializer
from apps.common.jobs_ops_seed import sample_daily_digest, sample_funnel_analytics, sample_outreach_analytics, sample_source_analytics
from apps.common.openapi_helpers import envelope_serializer


FUNNEL_RESPONSE = envelope_serializer("FunnelAnalyticsResponse", FunnelAnalyticsSerializer())
SOURCE_RESPONSE = envelope_serializer("SourceAnalyticsResponse", SourceAnalyticsSerializer(many=True))
OUTREACH_RESPONSE = envelope_serializer("OutreachAnalyticsResponse", OutreachAnalyticsSerializer())
DAILY_DIGEST_RESPONSE = envelope_serializer("DailyDigestResponse", DailyDigestSerializer())


class FunnelAnalyticsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(operation_id="analytics_funnel", tags=["analytics"], responses={200: OpenApiResponse(response=FUNNEL_RESPONSE)})
    def get(self, request):
        return Response(sample_funnel_analytics())


class SourceAnalyticsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(operation_id="analytics_sources", tags=["analytics"], responses={200: OpenApiResponse(response=SOURCE_RESPONSE)})
    def get(self, request):
        return Response(sample_source_analytics())


class OutreachAnalyticsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(operation_id="analytics_outreach", tags=["analytics"], responses={200: OpenApiResponse(response=OUTREACH_RESPONSE)})
    def get(self, request):
        return Response(sample_outreach_analytics())


class DailyDigestReportView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(operation_id="reports_daily_digest", tags=["reports"], responses={200: OpenApiResponse(response=DAILY_DIGEST_RESPONSE)})
    def get(self, request):
        return Response(sample_daily_digest())
