"""Health check endpoints for liveness, readiness, and Redis-specific probes.

Liveness: /health/live/ - returns HTTP 200 without any database access.
Readiness: /health/ready/ - verifies Neon Postgres and Redis connectivity.
Redis: /health/redis/ - verifies Redis only for dedicated paging/monitoring.
"""

import time

from django.db import connection
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.openapi_helpers import HealthStatusSerializer


@extend_schema_view(
    get=extend_schema(
        operation_id="health_liveness",
        tags=["health"],
        auth=[],
        responses={200: OpenApiResponse(response=HealthStatusSerializer, description="Liveness probe response.")},
    )
)
class LivenessView(APIView):
    """Liveness probe - returns HTTP 200 with no external dependencies."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = HealthStatusSerializer

    def get(self, request):
        return Response({"status": "ok"}, status=200)


@extend_schema_view(
    get=extend_schema(
        operation_id="health_readiness",
        tags=["health"],
        auth=[],
        responses={
            200: OpenApiResponse(response=HealthStatusSerializer, description="All backend dependencies are healthy."),
            503: OpenApiResponse(response=HealthStatusSerializer, description="One or more backend dependencies are unavailable."),
        },
    )
)
class ReadinessView(APIView):
    """Readiness probe - verifies Neon Postgres and Redis connectivity."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = HealthStatusSerializer

    def get(self, request):
        db_ok = self._check_db()
        redis_status, _redis_latency = self._check_redis_with_latency()

        # Return 200 as long as the database is healthy.
        # Redis is non-critical - auth and API work without it (JTI blacklist
        # and rate limiting fail-open). Returning 503 for Redis failures causes
        # Koyeb to restart the instance, which makes the outage worse.
        if db_ok:
            return Response(
                {
                    "status": "ok",
                    "db": "ok",
                    "redis": redis_status,
                },
                status=200,
            )

        return Response(
            {
                "status": "unhealthy",
                "db": "error",
                "redis": redis_status,
            },
            status=503,
        )

    def _check_db(self):
        """Run SELECT 1 against Neon Postgres."""
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            return True
        except Exception:
            return False

    def _check_redis_with_latency(self):
        """Ping Redis and return (status_str, latency_ms)."""
        start = time.monotonic()
        try:
            from django.core.cache import cache

            cache.set("_health_ping", "1", 10)
            ok = cache.get("_health_ping") == "1"
            latency = round((time.monotonic() - start) * 1000, 1)
            if ok:
                return "ok", latency
            return "degraded", latency
        except Exception:
            latency = round((time.monotonic() - start) * 1000, 1)
            return "degraded", latency


@extend_schema_view(
    get=extend_schema(
        operation_id="health_redis",
        tags=["health"],
        auth=[],
        responses={
            200: OpenApiResponse(response=HealthStatusSerializer, description="Redis is reachable."),
            503: OpenApiResponse(response=HealthStatusSerializer, description="Redis is unavailable."),
        },
    )
)
class RedisHealthView(APIView):
    """Redis-only probe for dedicated monitoring without changing readiness."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = HealthStatusSerializer

    def get(self, request):
        redis_status, _ = ReadinessView()._check_redis_with_latency()
        if redis_status == "ok":
            return Response({"status": "ok", "redis": "ok"}, status=200)
        return Response({"status": "unhealthy", "redis": "error"}, status=503)
