"""Authoritative application-readiness endpoint (admissions-v2 task 6.5).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task **6.5**
Requirements: R10.6, R11.2, R11.3, R11.5, R11.6, R12.3
Findings:     DATA-03, DATA-04, STU-11, STU-13
Design:       §8.3 (Readiness — ``GET /api/v2/student/applications/{id}/readiness/``
              "is authoritative and returns: assignment/configuration version;
              profile and identity blockers; persisted canonical grade count and
              eligibility results; versioned required-document states; fee
              quote/payment/defer state; capacity/duplicate/late checks;
              declarations; allowed next actions and recoverability codes."),
              §14.1 (V2 envelope), §5.2 (authority + object disclosure).

A thin V2 transport over :mod:`apps.applications.readiness_service`. All the
domain logic — every gate, every stable blocker code, the deterministic next
actions, and the deterministic student summary — lives in that framework-neutral
module, which is the *same* evaluator ``submit_application`` runs under the row
locks. That single evaluator is the point: the answer the student reads here and
the decision the server makes at submission can never disagree (design §8.3
"Submission reruns readiness under locks").

Authority (design §5.2):

* the **owner** always reads their own application's readiness;
* **staff** (reviewer/admin/super-admin) read it only when the application is in
  their ``AccessScopeService`` scope — this is the R11.3 reviewer readiness
  query, served by the same deterministic services rather than a parallel
  implementation, and the ``review_readiness`` checklist in the payload is what
  replaced the retired generative admin summary (task 7.4);
* anything else — a different student, an out-of-scope staff member, an unknown
  id — is masked as a non-revealing **404**, so existence cannot be inferred.

Fail-closed (R11.6, DATA-04, STU-13): when the canonical required-document
configuration cannot be evaluated and no versioned snapshot is available, the
endpoint returns the stable retryable ``CONFIGURATION_UNAVAILABLE`` (503) rather
than a readiness report built on an unverified "no requirements" assumption.
"""

from __future__ import annotations

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.applications import readiness_service
from apps.applications.assignment_resolution import AssignmentConfigurationError
from apps.applications.models import Application
from apps.common.v2.exceptions import V2ConfigurationUnavailable
from apps.common.v2.views import V2APIView

_STAFF_ROLES = ("admin", "super_admin", "reviewer")


class ApplicationReadinessResponseSerializer(serializers.Serializer):
    """Documents the readiness payload shape (design §8.3) for the schema."""

    application_id = serializers.CharField()
    status = serializers.CharField()
    version = serializers.IntegerField()
    assignment = serializers.DictField()
    configuration = serializers.DictField()
    profile = serializers.DictField()
    identity = serializers.DictField()
    grades = serializers.DictField()
    eligibility = serializers.DictField()
    documents = serializers.DictField()
    payment = serializers.DictField()
    capacity = serializers.DictField()
    duplicates = serializers.DictField()
    intake = serializers.DictField()
    declarations = serializers.ListField(child=serializers.DictField())
    blockers = serializers.ListField(child=serializers.DictField())
    can_submit = serializers.BooleanField()
    allowed_next_actions = serializers.ListField(child=serializers.DictField())
    summary = serializers.DictField()
    review_readiness = serializers.DictField()
    evaluated_at = serializers.CharField()


@extend_schema_view(
    get=extend_schema(
        operation_id="v2_student_application_readiness",
        tags=["applications"],
        summary="Authoritative application readiness",
        description=(
            "Returns the authoritative, deterministic readiness report for one "
            "application: assignment/configuration version, profile and identity "
            "blockers, persisted canonical grade count and eligibility results, "
            "versioned required-document states, fee/payment/defer state, "
            "capacity/duplicate/late checks, declarations, and the allowed next "
            "actions. Client validation never declares an application "
            "submittable on its own — submission re-runs these gates under row "
            "locks."
        ),
        parameters=[
            OpenApiParameter(
                "application_id",
                OpenApiTypes.UUID,
                OpenApiParameter.PATH,
                description="Application UUID.",
            ),
            OpenApiParameter(
                "declarations_accepted",
                OpenApiTypes.BOOL,
                OpenApiParameter.QUERY,
                required=False,
                description=(
                    "Report the declaration as accepted. Affects the declaration "
                    "section and blocker only; the submit command always "
                    "re-checks the declaration under the row lock."
                ),
            ),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationReadinessResponseSerializer),
            401: OpenApiResponse(description="Authentication required."),
            404: OpenApiResponse(description="Not found (also masks out-of-scope access)."),
            503: OpenApiResponse(
                description="CONFIGURATION_UNAVAILABLE — canonical configuration could not be evaluated (retryable)."
            ),
        },
    )
)
class V2ApplicationReadinessView(V2APIView):
    """``GET /api/v2/student/applications/{application_id}/readiness/``."""

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationReadinessResponseSerializer

    def get(self, request, application_id):
        application = self._authorized_application(request, application_id)

        declarations_accepted = str(
            request.query_params.get("declarations_accepted", "")
        ).lower() in ("1", "true", "yes")

        try:
            readiness = readiness_service.evaluate_readiness(
                application, declarations_accepted=declarations_accepted
            )
        except AssignmentConfigurationError as exc:
            # Fail closed with the stable retryable code — never a readiness
            # report built on a configuration we could not evaluate (R11.6).
            raise V2ConfigurationUnavailable(exc.message) from exc

        payload = readiness.to_payload()
        payload["summary"] = readiness_service.student_summary(readiness)
        # R11.3 / task 7.4: the structured reviewer readiness checklist that
        # replaced the retired generative "AI review summary". It is a projection
        # of the very same evaluation — no extra query, no second evaluator, and
        # nothing a caller of this endpoint could not already read from the
        # sections above — so it cannot disagree with `blockers`/`can_submit`.
        payload["review_readiness"] = readiness_service.reviewer_summary(readiness)
        return Response(payload)

    # -- authority ---------------------------------------------------------

    def _authorized_application(self, request, application_id) -> Application:
        """Owner-or-in-scope-staff read; everything else is a non-revealing 404."""
        application = (
            Application.objects.select_related("user").filter(id=application_id).first()
        )
        if application is None:
            raise NotFound()

        actor_id = str(getattr(request.user, "id", "") or "")
        if str(application.user_id) == actor_id:
            return application

        role = getattr(request.user, "role", "student")
        if role in _STAFF_ROLES:
            from apps.applications._view_helpers import _staff_can_access_application

            if _staff_can_access_application(request, application):
                return application

        # A different student, or out-of-scope staff: mask as not-found so
        # existence (and therefore any tenant attribute) cannot be inferred.
        raise NotFound()
