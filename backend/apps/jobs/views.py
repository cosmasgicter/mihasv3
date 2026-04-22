"""Jobs API scaffold views."""

import uuid

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.common.jobs_ops_seed import build_action_payload, sample_job_applications, sample_job_detail, sample_jobs
from apps.common.openapi_helpers import ErrorResponseSerializer, envelope_serializer, paginated_serializer
from apps.jobs.models import JobPosting, JobMatchScore
from apps.jobs.serializers import (
    DiscoveryRunSerializer,
    JobActionSerializer,
    JobApplicationSerializer,
    JobDetailSerializer,
    JobSummarySerializer,
)


JOB_LIST_RESPONSE = envelope_serializer(
    "JobsListResponse",
    paginated_serializer("JobsPage", JobSummarySerializer),
)
JOB_DETAIL_RESPONSE = envelope_serializer("JobsDetailResponse", JobDetailSerializer())
DISCOVERY_RUN_RESPONSE = envelope_serializer("JobsDiscoveryRunResponse", DiscoveryRunSerializer())
JOB_ACTION_RESPONSE = envelope_serializer("JobsActionResponse", JobActionSerializer())
JOB_APPLICATION_LIST_RESPONSE = envelope_serializer(
    "JobApplicationListResponse",
    paginated_serializer("JobApplicationPage", JobApplicationSerializer),
)
JOB_APPLICATION_RESPONSE = envelope_serializer("JobApplicationResponse", JobApplicationSerializer())


class PublicReadWriteProtectedMixin:
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [permission() for permission in self.permission_classes]


@extend_schema_view(
    get=extend_schema(
        operation_id="jobs_list",
        tags=["jobs"],
        auth=[],
        parameters=[
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY),
            OpenApiParameter("recommendation", OpenApiTypes.STR, OpenApiParameter.QUERY),
        ],
        responses={200: OpenApiResponse(response=JOB_LIST_RESPONSE)},
    )
)
class JobListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = JobSummarySerializer

    def get(self, request):
        jobs = sample_jobs()
        recommendation = request.query_params.get("recommendation")
        if recommendation:
            jobs = [job for job in jobs if job["recommendation"] == recommendation]
        return Response({
            "success": True,
            "data": {
                "page": int(request.query_params.get("page", 1)),
                "pageSize": int(request.query_params.get("pageSize", 20)),
                "totalCount": len(jobs),
                "results": jobs,
            },
        })


@extend_schema_view(
    post=extend_schema(
        operation_id="jobs_discovery_run_create",
        tags=["jobs"],
        responses={
            202: OpenApiResponse(response=DISCOVERY_RUN_RESPONSE),
            401: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class DiscoveryRunCreateView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DiscoveryRunSerializer

    def post(self, request):
        return Response({"success": True, "data": {
            "id": uuid.uuid4(),
            "source": "multi-source-scaffold",
            "status": "queued",
            "jobs_discovered": 0,
            "started_at": timezone.now(),
            "completed_at": None,
        }}, status=status.HTTP_202_ACCEPTED)


@extend_schema_view(
    get=extend_schema(
        operation_id="jobs_discovery_run_retrieve",
        tags=["jobs"],
        responses={200: OpenApiResponse(response=DISCOVERY_RUN_RESPONSE)},
    )
)
class DiscoveryRunDetailView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DiscoveryRunSerializer

    def get(self, request, run_id):
        return Response({"success": True, "data": {
            "id": run_id,
            "source": "impact-finance-africa",
            "status": "completed",
            "jobs_discovered": 12,
            "started_at": timezone.now(),
            "completed_at": timezone.now(),
        }})


@extend_schema_view(
    get=extend_schema(
        operation_id="jobs_retrieve",
        tags=["jobs"],
        auth=[],
        responses={200: OpenApiResponse(response=JOB_DETAIL_RESPONSE)},
    )
)
class JobDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = JobDetailSerializer

    def get(self, request, job_id):
        return Response({"success": True, "data": sample_job_detail(str(job_id))})


class JobActionBaseView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JobActionSerializer

    def build_response(self, reference_id, message, action_status="queued", http_status=status.HTTP_202_ACCEPTED):
        return Response({"success": True, "data": build_action_payload(reference_id, message, action_status)}, status=http_status)


class JobScoreView(JobActionBaseView):
    @extend_schema(
        operation_id="jobs_score",
        tags=["jobs"],
        responses={202: OpenApiResponse(response=JOB_ACTION_RESPONSE)},
    )
    def post(self, request, job_id):
        try:
            job = JobPosting.objects.get(id=job_id)
        except JobPosting.DoesNotExist:
            return Response({"success": False, "error": "Job not found"}, status=status.HTTP_404_NOT_FOUND)

        from apps.jobs.ai_service import score_job_match
        job_data = {"title": job.title, "company": getattr(job, "company_name", ""), "location": getattr(job, "location", ""), "description": getattr(job, "description", ""), "requirements": getattr(job, "requirements", "")}
        candidate_data = request.data.get("candidate", {})
        result = score_job_match(job_data, candidate_data)

        if result:
            # Save score
            JobMatchScore.objects.update_or_create(
                job=job, defaults={"score": result.get("score", 0), "reasoning": result, "scored_at": timezone.now()}
            )
            return Response({"success": True, "data": {"job_id": str(job_id), "score": result}})

        return self.build_response(job_id, "AI scoring unavailable. Manual review required.", "pending")


class JobTailorDocumentsView(JobActionBaseView):
    @extend_schema(
        operation_id="jobs_tailor_documents",
        tags=["jobs"],
        responses={202: OpenApiResponse(response=JOB_ACTION_RESPONSE)},
    )
    def post(self, request, job_id):
        try:
            job = JobPosting.objects.get(id=job_id)
        except JobPosting.DoesNotExist:
            return Response({"success": False, "error": "Job not found"}, status=status.HTTP_404_NOT_FOUND)

        from apps.jobs.ai_service import tailor_resume
        job_data = {"title": job.title, "company": getattr(job, "company_name", ""), "requirements": getattr(job, "requirements", "")}
        resume_text = request.data.get("resume_text", "")
        if not resume_text:
            return Response({"success": False, "error": "resume_text is required"}, status=status.HTTP_400_BAD_REQUEST)

        result = tailor_resume(job_data, resume_text)
        if result:
            return Response({"success": True, "data": {"job_id": str(job_id), "tailored": result}})

        return self.build_response(job_id, "AI tailoring unavailable. Try again later.", "pending")


class JobDismissView(JobActionBaseView):
    @extend_schema(
        operation_id="jobs_dismiss",
        tags=["jobs"],
        responses={200: OpenApiResponse(response=JOB_ACTION_RESPONSE)},
    )
    def post(self, request, job_id):
        return self.build_response(job_id, "Job dismissed in scaffold state.", "completed", status.HTTP_200_OK)


class JobWatchView(JobActionBaseView):
    @extend_schema(
        operation_id="jobs_watch",
        tags=["jobs"],
        responses={200: OpenApiResponse(response=JOB_ACTION_RESPONSE)},
    )
    def post(self, request, job_id):
        return self.build_response(job_id, "Job marked watch-only in scaffold state.", "completed", status.HTTP_200_OK)


@extend_schema_view(
    get=extend_schema(
        operation_id="job_applications_list",
        tags=["job-applications"],
        responses={200: OpenApiResponse(response=JOB_APPLICATION_LIST_RESPONSE)},
    ),
    post=extend_schema(
        operation_id="job_applications_create",
        tags=["job-applications"],
        responses={201: OpenApiResponse(response=JOB_APPLICATION_RESPONSE)},
    ),
)
class JobApplicationListCreateView(PublicReadWriteProtectedMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JobApplicationSerializer

    def get(self, request):
        applications = sample_job_applications()
        status_filter = request.query_params.get("status")
        if status_filter:
            applications = [item for item in applications if item["status"] == status_filter]
        return Response({
            "success": True,
            "data": {
                "page": int(request.query_params.get("page", 1)),
                "pageSize": int(request.query_params.get("pageSize", 20)),
                "totalCount": len(applications),
                "results": applications,
            },
        })

    def post(self, request):
        template = sample_job_applications()[0].copy()
        template["id"] = uuid.uuid4()
        return Response({"success": True, "data": template}, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(
        operation_id="job_applications_retrieve",
        tags=["job-applications"],
        responses={200: OpenApiResponse(response=JOB_APPLICATION_RESPONSE)},
    )
)
class JobApplicationDetailView(PublicReadWriteProtectedMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JobApplicationSerializer

    def get(self, request, application_id):
        applications = sample_job_applications()
        for item in applications:
            if str(item["id"]) == str(application_id):
                return Response({"success": True, "data": item})
        fallback = applications[0].copy()
        fallback["id"] = application_id
        return Response({"success": True, "data": fallback})


class JobApplicationActionBaseView(JobActionBaseView):
    serializer_class = JobActionSerializer


class JobApplicationSubmitView(JobApplicationActionBaseView):
    @extend_schema(operation_id="job_applications_submit", tags=["job-applications"], responses={202: OpenApiResponse(response=JOB_ACTION_RESPONSE)})
    def post(self, request, application_id):
        return self.build_response(application_id, "Job application submit scaffold queued.")


class JobApplicationPauseView(JobApplicationActionBaseView):
    @extend_schema(operation_id="job_applications_pause", tags=["job-applications"], responses={200: OpenApiResponse(response=JOB_ACTION_RESPONSE)})
    def post(self, request, application_id):
        return self.build_response(application_id, "Job application paused in scaffold state.", "paused", status.HTTP_200_OK)


class JobApplicationResumeView(JobApplicationActionBaseView):
    @extend_schema(operation_id="job_applications_resume", tags=["job-applications"], responses={202: OpenApiResponse(response=JOB_ACTION_RESPONSE)})
    def post(self, request, application_id):
        return self.build_response(application_id, "Job application resume scaffold queued.")


class JobApplicationApproveView(JobApplicationActionBaseView):
    @extend_schema(operation_id="job_applications_approve", tags=["job-applications"], responses={200: OpenApiResponse(response=JOB_ACTION_RESPONSE)})
    def post(self, request, application_id):
        return self.build_response(application_id, "Job application approved in scaffold state.", "approved", status.HTTP_200_OK)


class JobApplicationRejectView(JobApplicationActionBaseView):
    @extend_schema(operation_id="job_applications_reject", tags=["job-applications"], responses={200: OpenApiResponse(response=JOB_ACTION_RESPONSE)})
    def post(self, request, application_id):
        return self.build_response(application_id, "Job application rejected in scaffold state.", "rejected", status.HTTP_200_OK)
