"""The owner's tracking-link command (admissions-v2 task 10.5).

Findings **STU-22**; requirements **R13.12**, **R13.6**, **R17.1-R17.2**.

``POST /api/v1/applications/{id}/tracking-link/`` is the one place a public
tracking secret comes into existence. It exists because the credential is stored
only as a hash: there is no read that can return it, so "where does the student
get their link" has to be a command, and a student who loses the link has to be
able to get a working one rather than reaching a dead end (R13.6).

Two consequences are deliberate and are stated to the caller:

* **issuing rotates.** One live secret per application, so a new link revokes the
  previous one. That is design §12's "revocable", and it is also the recovery
  path for a link that was shared too widely.
* **the response is the only time the plaintext exists** outside the owner's
  hands. It is never logged, never audited, and cannot be re-read.
"""

import logging

from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.applications import tracking_secret
from apps.catalog.tenant_audit_service import TenantAuditService
from apps.common.object_authorization import resolve_owned_application
from apps.common.openapi_helpers import ErrorResponseSerializer

logger = logging.getLogger(__name__)


class TrackingLinkSerializer(serializers.Serializer):
    """The issued link. ``code`` is a credential — the client must not store it."""

    code = serializers.CharField()
    url = serializers.CharField()
    path = serializers.CharField()
    issued_at = serializers.DateTimeField()
    replaced_previous = serializers.BooleanField()


class TrackingLinkResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    data = TrackingLinkSerializer()


@extend_schema_view(
    post=extend_schema(
        operation_id="applications_issue_tracking_link",
        tags=["applications"],
        request=None,
        responses={
            201: OpenApiResponse(response=TrackingLinkResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            503: OpenApiResponse(response=ErrorResponseSerializer),
        },
        description=(
            "Issue a public tracking link for an application the caller owns. "
            "Issuing revokes any previously issued link. The plaintext secret is "
            "returned once and is never recoverable."
        ),
    )
)
class ApplicationTrackingLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, application_id):
        # Owner-only, and a non-owned id is the same masked 404 a missing one is
        # (AUTH-07). Staff are not admitted: a tracking link is a credential for
        # the applicant's own status page, and issuing one would silently revoke
        # the applicant's.
        application, denied = resolve_owned_application(
            request,
            application_id,
            allow_scoped_staff=False,
            select_related=("user", "institution_ref"),
        )
        if denied is not None:
            return denied

        replaced_previous = bool(
            application.tracking_selector and not application.tracking_secret_revoked_at
        )
        try:
            issued = tracking_secret.issue(application)
        except tracking_secret.TrackingSecretUnavailable:
            logger.warning(
                "tracking link could not be issued for application %s",
                application.pk,
            )
            return Response(
                {
                    "success": False,
                    "error": (
                        "A tracking link could not be issued right now. Please try "
                        "again in a moment."
                    ),
                    "code": "TRACKING_LINK_UNAVAILABLE",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        TenantAuditService.record_tracking_link_issued(
            application_id=application.pk,
            institution_id=getattr(application, "institution_ref_id", None),
            actor_id=getattr(request.user, "pk", None),
            actor_role=getattr(request.user, "role", None),
            replaced_previous=replaced_previous,
            request=request,
        )

        path = issued.share_path()
        return Response(
            {
                "success": True,
                "data": {
                    "code": issued.code,
                    # The absolute URL is built from the **request's own** origin,
                    # so a student on their school's white-label host gets a link
                    # back to that host — which is the only host that will resolve
                    # it (TEN-10). Nothing about a tenant is guessed or hardcoded.
                    "url": request.build_absolute_uri(path),
                    "path": path,
                    "issued_at": issued.issued_at,
                    "replaced_previous": replaced_previous,
                },
            },
            status=status.HTTP_201_CREATED,
        )
