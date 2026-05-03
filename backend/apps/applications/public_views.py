"""Public-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views accessible without authentication (e.g., application tracking).
"""

import re

from django.db.models import Q
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.applications.models import Application
from apps.applications.serializers import ApplicationTrackingSerializer
from apps.common.openapi_helpers import ErrorResponseSerializer

from ._view_helpers import ApplicationTrackingResponseSerializer


# ---------------------------------------------------------------------------
# Public Application Tracking
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_track",
        tags=["applications"],
        auth=[],
        parameters=[
            OpenApiParameter(
                "code",
                OpenApiTypes.STR,
                OpenApiParameter.QUERY,
                description="Public tracking code or application number.",
                required=True,
            ),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationTrackingResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationTrackView(APIView):
    public_endpoint_category = "public_tracking_minimized"
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = ApplicationTrackingSerializer

    # Accepted formats:
    #   APP-YYYYMMDD-XXXXXXXX  (legacy application numbers)
    #   {CODE}{YEAR}{SEQ}      (new application numbers, e.g. MIHAS202500001)
    #   TRK-{CODE}{YEAR}{HEX}  (new tracking codes, e.g. TRK-MIHAS2025ABCDEF)
    #   TRK-XXXXXXXXXXXX       (legacy tracking codes, 12 alphanum after dash)
    #   TRK + 5-6 alphanum     (legacy tracking codes, no dash)
    TRACKING_CODE_PATTERN = re.compile(
        r"^("
        r"APP-\d{8}-[A-Z0-9]{8}"           # Legacy: APP-20260416-ABCD1234
        r"|[A-Z]{2,10}\d{9,14}"             # MIHAS202500001, KATC202500002
        r"|TRK-[A-Z]{2,10}\d{4}[A-Z0-9]{6}" # TRK-MIHAS2025ABCDEF
        r"|TRK-[A-Z0-9]{12}"                # Legacy: TRK-ABCDEF123456
        r"|TRK[A-Z0-9]{5,6}"                # Legacy: TRK370990
        r")$"
    )

    def get(self, request):
        code = request.query_params.get("code", "").strip().upper()
        if not code:
            return Response({"success": False, "error": "Tracking code or application number required", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        if not self.TRACKING_CODE_PATTERN.match(code):
            return Response(
                {
                    "success": False,
                    "error": "Invalid tracking code format. Use your application number (e.g., MIHAS202500001) or tracking code (e.g., TRK-MIHAS2025ABCDEF).",
                    "code": "INVALID_FORMAT",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            app = Application.objects.get(Q(application_number=code) | Q(public_tracking_code=code))
        except Application.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "No application found for the provided tracking code. Please verify the code and try again.",
                    "code": "NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"success": True, "data": ApplicationTrackingSerializer(app).data})
