"""Health check endpoints for liveness and readiness probes.

Liveness: /health/live/ — returns HTTP 200 without any database access.
Readiness: /health/ready/ — verifies Neon Postgres and Redis connectivity.
"""

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
    """Liveness probe — returns HTTP 200 with no external dependencies."""

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
    """Readiness probe — verifies Neon Postgres and Redis connectivity."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = HealthStatusSerializer

    def get(self, request):
        db_ok = self._check_db()
        redis_ok = self._check_redis()

        if db_ok and redis_ok:
            return Response(
                {"status": "ok", "db": "ok", "redis": "ok"},
                status=200,
            )

        return Response(
            {
                "status": "unhealthy",
                "db": "ok" if db_ok else "error",
                "redis": "ok" if redis_ok else "error",
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

    def _check_redis(self):
        """Ping Redis using Django's cache framework (reuses connection pool)."""
        try:
            from django.core.cache import cache
            cache.set("_health_ping", "1", 10)
            return cache.get("_health_ping") == "1"
        except Exception:
            return False
