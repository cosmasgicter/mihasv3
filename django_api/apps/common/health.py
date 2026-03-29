"""Health check endpoints for liveness and readiness probes.

Liveness: /health/live/ — returns HTTP 200 without any database access.
Readiness: /health/ready/ — verifies Neon Postgres and Redis connectivity.
"""

import redis as redis_lib
from django.conf import settings
from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class LivenessView(APIView):
    """Liveness probe — returns HTTP 200 with no external dependencies."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"status": "ok"}, status=200)


class ReadinessView(APIView):
    """Readiness probe — verifies Neon Postgres and Redis connectivity."""

    permission_classes = [AllowAny]
    authentication_classes = []

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
        """Ping Redis using the Celery broker URL."""
        try:
            client = redis_lib.from_url(settings.CELERY_BROKER_URL)
            return client.ping()
        except Exception:
            return False
