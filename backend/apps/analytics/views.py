"""Analytics scaffold views."""

import hashlib
import json
import logging

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics.serializers import DailyDigestSerializer, FunnelAnalyticsSerializer, OutreachAnalyticsSerializer, SourceAnalyticsSerializer
from apps.common.jobs_ops_seed import sample_daily_digest, sample_funnel_analytics, sample_outreach_analytics, sample_source_analytics
from apps.common.openapi_helpers import envelope_serializer

logger = logging.getLogger(__name__)


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
        from apps.accounts.permissions import is_super_admin
        from apps.analytics.admissions_analytics import AdmissionsAnalyticsService
        from apps.catalog.services import AccessScopeService

        filters = {}
        if request.query_params.get("start_date"):
            filters["start_date"] = request.query_params["start_date"]
        if request.query_params.get("end_date"):
            filters["end_date"] = request.query_params["end_date"]
        if request.query_params.get("institution"):
            filters["institution"] = request.query_params["institution"]
        if request.query_params.get("program"):
            filters["program"] = request.query_params["program"]

        # Cross-tenant isolation (R4.5): the funnel aggregates Application and
        # Payment rows, so a School_Staff caller must only ever see their own
        # institutions' counts. The aggregation is scoped inside
        # ``AdmissionsAnalyticsService`` (it receives the caller), and the cache
        # key is namespaced by the caller's resolved scope so one school's
        # cached funnel can never be served to another school. Super-admins keep
        # a single global cache namespace.
        no_school_access = False
        if is_super_admin(request.user):
            scope_token = "global"
        else:
            scope = AccessScopeService().filters_for_user(request.user)
            if scope.all_access:
                scope_token = "global"
            else:
                # R4.6: a no-scope staff member's scoped funnel is correctly all
                # zeros; flag it so the frontend shows "no school access
                # assigned" rather than reading the zeros as platform totals.
                no_school_access = scope.has_no_scope
                scope_token = "scope:" + hashlib.md5(
                    json.dumps(
                        {
                            "institution_ids": sorted(scope.institution_ids),
                            "offering_ids": sorted(scope.offering_ids),
                            "application_ids": sorted(scope.application_ids),
                        },
                        sort_keys=True,
                    ).encode()
                ).hexdigest()

        filters_hash = hashlib.md5(json.dumps(filters, sort_keys=True).encode()).hexdigest()
        cache_key = f"admissions_funnel:{scope_token}:{filters_hash}"
        cached = cache.get(cache_key)
        if cached:
            return Response({"success": True, "data": cached})

        try:
            service = AdmissionsAnalyticsService(user=request.user)
            data = {
                "no_school_access": no_school_access,
                "funnel": service.funnel_metrics(filters),
                "timing": service.timing_metrics(filters),
                "payments": service.payment_metrics(filters),
            }
            cache.set(cache_key, data, 300)  # 5-minute cache
            return Response({"success": True, "data": data})
        except Exception:
            logger.exception("Funnel analytics query failed, returning sample data")
            return Response({"success": True, "data": sample_funnel_analytics()})


class SourceAnalyticsView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(operation_id="analytics_sources", tags=["analytics"], responses={200: OpenApiResponse(response=SOURCE_RESPONSE)})
    def get(self, request):
        return Response({"success": True, "data": sample_source_analytics()})


class OutreachAnalyticsView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(operation_id="analytics_outreach", tags=["analytics"], responses={200: OpenApiResponse(response=OUTREACH_RESPONSE)})
    def get(self, request):
        return Response({"success": True, "data": sample_outreach_analytics()})


class DailyDigestReportView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(operation_id="reports_daily_digest", tags=["reports"], responses={200: OpenApiResponse(response=DAILY_DIGEST_RESPONSE)})
    def get(self, request):
        return Response({"success": True, "data": sample_daily_digest()})
