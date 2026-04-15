"""Analytics scaffold views."""

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics.serializers import DailyDigestSerializer, FunnelAnalyticsSerializer, OutreachAnalyticsSerializer, SourceAnalyticsSerializer
from apps.common.jobs_ops_seed import sample_daily_digest, sample_funnel_analytics, sample_outreach_analytics, sample_source_analytics
from apps.common.openapi_helpers import envelope_serializer


FUNNEL_RESPONSE = envelope_serializer("FunnelAnalyticsResponse", FunnelAnalyticsSerializer())
SOURCE_RESPONSE = envelope_serializer("SourceAnalyticsResponse", SourceAnalyticsSerializer(many=True))
OUTREACH_RESPONSE = envelope_serializer("OutreachAnalyticsResponse", OutreachAnalyticsSerializer())
DAILY_DIGEST_RESPONSE = envelope_serializer("DailyDigestResponse", DailyDigestSerializer())


from apps.accounts.permissions import IsAdmin

class FunnelAnalyticsView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(operation_id="analytics_funnel", tags=["analytics"], responses={200: OpenApiResponse(response=FUNNEL_RESPONSE)})
    def get(self, request):
        from django.core.cache import cache
        from apps.analytics.admissions_analytics import AdmissionsAnalyticsService

        filters = {}
        if request.query_params.get("start_date"):
            filters["start_date"] = request.query_params["start_date"]
        if request.query_params.get("end_date"):
            filters["end_date"] = request.query_params["end_date"]
        if request.query_params.get("institution"):
            filters["institution"] = request.query_params["institution"]
        if request.query_params.get("program"):
            filters["program"] = request.query_params["program"]

        cache_key = f"admissions_funnel:{hash(frozenset(filters.items()))}"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        try:
            service = AdmissionsAnalyticsService()
            data = {
                "funnel": service.funnel_metrics(filters),
                "timing": service.timing_metrics(filters),
                "payments": service.payment_metrics(filters),
            }
            cache.set(cache_key, data, 300)  # 5-minute cache
            return Response(data)
        except Exception:
            return Response(sample_funnel_analytics())


class SourceAnalyticsView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(operation_id="analytics_sources", tags=["analytics"], responses={200: OpenApiResponse(response=SOURCE_RESPONSE)})
    def get(self, request):
        return Response(sample_source_analytics())


class OutreachAnalyticsView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(operation_id="analytics_outreach", tags=["analytics"], responses={200: OpenApiResponse(response=OUTREACH_RESPONSE)})
    def get(self, request):
        return Response(sample_outreach_analytics())


class DailyDigestReportView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(operation_id="reports_daily_digest", tags=["reports"], responses={200: OpenApiResponse(response=DAILY_DIGEST_RESPONSE)})
    def get(self, request):
        return Response(sample_daily_digest())
