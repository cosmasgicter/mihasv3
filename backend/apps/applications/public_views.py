"""Public-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views accessible without authentication (e.g., application tracking).

Rewritten by admissions-v2 task **10.5** (findings **STU-22** / **TEN-10**,
requirements **R13.12**, **R2.3-R2.4**, **R17.2**, **R17.7**). The tracker is the
platform's only unauthenticated read of applicant data, so its boundary is four
things at once, and each of them is here rather than spread across layers:

1. **the credential** — a random, hashed, revocable tracking secret
   (:mod:`apps.applications.tracking_secret`). An application number is a
   sequential counter and authorises nothing;
2. **the tenant host** — a trusted white-label host may reveal only its own
   tenant's application (TEN-10 / R2.4), and the neutral Beanola portal resolves
   by secret alone (design §12);
3. **the attempt budget** — failed lookups are charged per client
   (:class:`~apps.common.throttling.PublicTrackingFailureThrottle`), and the
   budget bounds *refusals*: a spent budget answers 429 to the next failure but
   never withholds a status from the holder of a correct token, because the
   address is shared (a lab, a café, any NAT) and the verifier is 100 random
   bits;
4. **the answer** — every refusal is the same answer, so nothing about it can be
   used to confirm that an application exists.
"""

import logging
import re

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.exceptions import Throttled
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.applications import tracking_secret
from apps.applications.serializers import ApplicationTrackingSerializer
from apps.catalog.services import InstitutionContextService
from apps.catalog.tenant_audit_service import TenantAuditService
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.throttling import PublicTrackingFailureThrottle

from ._view_helpers import ApplicationTrackingResponseSerializer

logger = logging.getLogger(__name__)


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
                description=(
                    "The application's tracking secret "
                    "(TRK-XXXXXXXX-XXXXXXXXXXXXXXXXXXXX), issued to the owner by "
                    "POST /api/v1/applications/{id}/tracking-link/. An application "
                    "number is not a tracking credential."
                ),
                required=True,
            ),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationTrackingResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            429: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationTrackView(APIView):
    public_endpoint_category = "public_tracking_minimized"
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = ApplicationTrackingSerializer
    throttle_classes = [PublicTrackingFailureThrottle]

    #: The identifier shapes that are **no longer credentials**. Kept as a class
    #: attribute because it is the pre-10.5 name several suites import; it is now
    #: exactly ``tracking_secret.LEGACY_IDENTIFIER_PATTERN`` and is used only to
    #: recognise a legacy identifier so the caller can be told where to get a real
    #: tracking link — never to authorise a lookup.
    TRACKING_CODE_PATTERN: re.Pattern = tracking_secret.LEGACY_IDENTIFIER_PATTERN

    # One message per refusal class. They are constants because the refusals must
    # not vary with the database: same string, same code, same status, whether or
    # not the identifier names a real application.
    SECRET_REQUIRED_MESSAGE = (
        "That looks like an application number, not a tracking link. Public "
        "tracking needs the tracking link issued to you — open your application "
        "and choose \"Get tracking link\", or sign in to view your status."
    )
    INVALID_FORMAT_MESSAGE = (
        "Invalid tracking code format. Use the tracking link issued to you "
        "(e.g. TRK-4KP2M9XT-9QW3RT7VZ2KDN8YH6JF4)."
    )
    NOT_FOUND_MESSAGE = (
        "That tracking link is not valid. It may have been replaced by a newer "
        "link — open your application to get the current one."
    )
    RATE_LIMITED_MESSAGE = (
        "Too many tracking attempts. Please wait a few minutes and try again "
        "with the tracking link issued to you."
    )

    def get(self, request):
        code = tracking_secret.normalize(request.query_params.get("code", ""))
        if not code:
            return Response(
                {
                    "success": False,
                    "error": "Tracking code or application number required",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        kind = tracking_secret.classify(code)

        # A recognised-but-not-authoritative identifier is answered from the
        # string alone. No query runs, so this branch cannot confirm that an
        # application exists — and it costs the caller nothing, because a student
        # reading the number off their own slip has not attempted anything.
        if kind == tracking_secret.KIND_LEGACY:
            self._audit(request, outcome="secret_required")
            return Response(
                {
                    "success": False,
                    "error": self.SECRET_REQUIRED_MESSAGE,
                    "code": "TRACKING_SECRET_REQUIRED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if kind == tracking_secret.KIND_UNRECOGNISED:
            self._audit(request, outcome="invalid_format")
            return Response(
                {
                    "success": False,
                    "error": self.INVALID_FORMAT_MESSAGE,
                    "code": "INVALID_FORMAT",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        application = tracking_secret.resolve(code)
        if application is None:
            return self._refuse(request, outcome="not_found")

        # Tenant host binding (TEN-10, R2.4, design §12): a trusted white-label
        # host may reveal only its own tenant's application. The neutral Beanola
        # portal resolves by secret alone — the secret is the authority there, and
        # the response carries no tenant data beyond the school's display name.
        context = InstitutionContextService().resolve(self._request_host(request))
        host_institution = getattr(context, "institution", None)
        if host_institution is not None:
            if str(getattr(application, "institution_ref_id", "") or "") != str(
                host_institution.id
            ):
                # Byte-identical to an unknown secret: a school's own portal must
                # not become a way to confirm that a code belongs *somewhere else*.
                return self._refuse(
                    request,
                    outcome="host_mismatch",
                    institution_id=host_institution.id,
                    host_bound=True,
                )

        self._audit(
            request,
            outcome="disclosed",
            application_id=application.id,
            institution_id=getattr(application, "institution_ref_id", None),
            host_bound=host_institution is not None,
        )
        return Response(
            {"success": True, "data": ApplicationTrackingSerializer(application).data}
        )

    # ------------------------------------------------------------------
    # Refusal, budget, audit
    # ------------------------------------------------------------------

    def _refuse(self, request, *, outcome, institution_id=None, host_bound=False):
        """The one refusal for a well-formed secret that resolved nothing.

        Unknown selector, revoked secret, wrong verifier and tenant-host mismatch
        all arrive here and leave with the same status, code and message. The
        *audit* distinguishes them, because an operator needs to; the response
        does not, because a caller must not.

        This is also where the failed-attempt budget is spent, and the only place
        it is consulted: the budget bounds *refusals*, so a caller who has already
        spent it is told 429 instead — while a correct token, which never reaches
        this method, still resolves from the same address.
        """
        throttle = self._failure_throttle(request)
        if throttle is not None and self._is_exhausted(throttle, request):
            self._audit(
                request,
                outcome="rate_limited",
                institution_id=institution_id,
                host_bound=host_bound,
            )
            # No charge on a request that was refused by the budget: the window
            # slides off the attempts that were actually answered, so a caller
            # who keeps knocking cannot extend their own lockout indefinitely.
            raise Throttled(wait=throttle.wait())

        if throttle is not None:
            self._charge_failed_attempt(throttle, request)
        self._audit(
            request,
            outcome=outcome,
            institution_id=institution_id,
            host_bound=host_bound,
        )
        return Response(
            {
                "success": False,
                "error": self.NOT_FOUND_MESSAGE,
                "code": "NOT_FOUND",
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    def _failure_throttle(self, request):
        """The one throttle instance this request's refusal decision uses."""
        for throttle in self.get_throttles():
            if hasattr(throttle, "record_failure") and hasattr(
                throttle, "is_exhausted"
            ):
                try:
                    throttle.allow_request(request, self)
                except Exception:  # pragma: no cover - a cache outage must not 500
                    logger.warning(
                        "public tracking failure budget could not be read",
                        exc_info=True,
                    )
                    return None
                return throttle
        return None

    @staticmethod
    def _is_exhausted(throttle, request) -> bool:
        try:
            return bool(throttle.is_exhausted(request))
        except Exception:  # pragma: no cover - a cache outage must not 500
            logger.warning(
                "public tracking failure budget could not be read", exc_info=True
            )
            return False

    @staticmethod
    def _charge_failed_attempt(throttle, request) -> None:
        """Spend one unit of this client's failed-attempt budget."""
        try:
            throttle.record_failure(request)
        except Exception:  # pragma: no cover - a cache outage must not 500
            logger.warning(
                "public tracking failure budget could not be recorded", exc_info=True
            )

    @staticmethod
    def _request_host(request) -> str:
        return request.headers.get("X-Forwarded-Host") or request.get_host()

    @staticmethod
    def _audit(
        request,
        *,
        outcome: str,
        application_id=None,
        institution_id=None,
        host_bound: bool = False,
    ) -> None:
        """Record the attempt without the token (design §12, R17.2)."""
        TenantAuditService.record_public_tracking_attempt(
            outcome=outcome,
            application_id=application_id,
            institution_id=institution_id,
            host_bound=host_bound,
            request=request,
        )
