"""Application views.

Implements task 13.3.
Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10
"""

import csv
import io
import logging
import uuid

from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin
from apps.applications.filters import ApplicationFilter
from apps.applications.models import (
    Application, ApplicationDraft, ApplicationInterview, ApplicationStatusHistory,
)
from apps.applications.serializers import (
    ApplicationBulkStatusSerializer, ApplicationCreateSerializer,
    ApplicationDraftSerializer, ApplicationGradeSerializer,
    ApplicationInterviewSerializer, ApplicationListSerializer,
    ApplicationReviewSerializer, ApplicationSerializer, ApplicationTrackingSerializer,
)
from apps.common.pagination import StandardPagination
from apps.documents.models import ApplicationDocument, ApplicationGrade

logger = logging.getLogger(__name__)


def _generate_application_number():
    return f"APP-{timezone.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"


def _generate_tracking_code():
    return f"TRK-{uuid.uuid4().hex[:12].upper()}"


class ApplicationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = getattr(user, "role", "student")
        if role in ("admin", "super_admin"):
            queryset = Application.objects.all()
        else:
            queryset = Application.objects.filter(user_id=str(user.id))
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs
        if not request.query_params.get("sort"):
            queryset = queryset.order_by("-created_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = ApplicationListSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)
        return Response(ApplicationListSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = ApplicationCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        application = Application.objects.create(
            user_id=str(request.user.id), application_number=_generate_application_number(),
            public_tracking_code=_generate_tracking_code(), full_name=data["full_name"],
            nrc_number=data.get("nrc_number", ""), passport_number=data.get("passport_number", ""),
            date_of_birth=data["date_of_birth"], sex=data["sex"], phone=data["phone"],
            email=data["email"], residence_town=data["residence_town"],
            nationality=data.get("nationality", "Zambian"), program=data["program"],
            intake=data["intake"], institution=data["institution"], status="draft", version=1,
        )
        return Response(ApplicationSerializer(application).data, status=status.HTTP_201_CREATED)


class ApplicationDetailView(APIView):
    permission_classes = [IsOwnerOrAdmin]

    def get(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ApplicationSerializer(app).data)

    def patch(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ApplicationSerializer(app, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        app.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _get_application(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return None
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return None
        return app


class ApplicationDocumentsView(APIView):
    permission_classes = [IsOwnerOrAdmin]

    def get(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        docs = ApplicationDocument.objects.filter(application_id=application_id)
        data = [
            {
                "id": str(d.id),
                "application_id": str(d.application_id),
                "document_type": d.document_type,
                "document_name": d.document_name,
                "file_url": d.file_url,
                "file_size": d.file_size,
                "mime_type": d.mime_type,
                "verification_status": d.verification_status,
                "verification_notes": d.verification_notes,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            }
            for d in docs
        ]
        return Response(data)


class ApplicationGradesView(APIView):
    permission_classes = [IsOwnerOrAdmin]

    def get(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        grades = ApplicationGrade.objects.filter(application_id=application_id)
        data = [{"id": str(g.id), "subject_id": str(g.subject_id), "grade": g.grade, "created_at": g.created_at.isoformat() if g.created_at else None} for g in grades]
        return Response(data)

    def post(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        batch = request.data.get("grades") if isinstance(request.data, dict) else None
        if isinstance(batch, list):
            created = []
            for item in batch:
                serializer = ApplicationGradeSerializer(data=item)
                if not serializer.is_valid():
                    return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
                grade, _created = ApplicationGrade.objects.update_or_create(
                    application_id=application_id,
                    subject_id=serializer.validated_data["subject_id"],
                    defaults={"grade": serializer.validated_data["grade"]},
                )
                created.append({"id": str(grade.id), "subject_id": str(grade.subject_id), "grade": grade.grade})
            return Response({"grades": created}, status=status.HTTP_200_OK)

        serializer = ApplicationGradeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        grade, created = ApplicationGrade.objects.update_or_create(
            application_id=application_id,
            subject_id=serializer.validated_data["subject_id"],
            defaults={"grade": serializer.validated_data["grade"]},
        )
        return Response({"id": str(grade.id), "subject_id": str(grade.subject_id), "grade": grade.grade}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ApplicationSummaryView(APIView):
    permission_classes = [IsOwnerOrAdmin]

    def get(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        docs_count = ApplicationDocument.objects.filter(application_id=application_id).count()
        grades_count = ApplicationGrade.objects.filter(application_id=application_id).count()
        history = ApplicationStatusHistory.objects.filter(application_id=application_id).order_by("-created_at").values("old_status", "new_status", "notes", "created_at")[:10]
        return Response({"application": ApplicationSerializer(app).data, "documents_count": docs_count, "grades_count": grades_count, "status_history": list(history)})


class ApplicationReviewView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ApplicationReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        force = serializer.validated_data.get("force", False)
        if new_status == "approved" and not force:
            from apps.documents.models import Payment
            has_verified = Payment.objects.filter(application_id=application_id, status="verified").exists()
            if not has_verified:
                return Response({"success": False, "error": "Application has unverified payment. Use force=true to override.", "code": "PAYMENT_UNVERIFIED"}, status=status.HTTP_400_BAD_REQUEST)
        old_status = app.status
        app.status = new_status
        if not app.review_started_at:
            app.review_started_at = timezone.now()
        app.reviewed_by_id = str(request.user.id)
        if notes:
            app.admin_feedback = notes
            app.admin_feedback_date = timezone.now()
            app.admin_feedback_by_id = str(request.user.id)
        if new_status in ("approved", "rejected"):
            app.decision_date = timezone.now()
        app.save(update_fields=[
            "status",
            "review_started_at",
            "reviewed_by",
            "admin_feedback",
            "admin_feedback_date",
            "admin_feedback_by",
            "decision_date",
            "updated_at",
        ])
        ApplicationStatusHistory.objects.create(application=app, old_status=old_status, new_status=new_status, changed_by_id=str(request.user.id), notes=notes)
        return Response({"message": f"Status updated from {old_status} to {new_status}", "application_id": str(app.id), "old_status": old_status, "new_status": new_status})


class ApplicationExportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        queryset = Application.objects.all().order_by("-created_at")
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Application Number", "Full Name", "Email", "Phone", "Program", "Intake", "Institution", "Status", "Created At"])
        for app in queryset:
            writer.writerow([app.application_number, app.full_name, app.email, app.phone, app.program, app.intake, app.institution, app.status, app.created_at.isoformat() if app.created_at else ""])
        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="applications_export.csv"'
        return response


class ApplicationTrackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        code = request.query_params.get("code", "").strip()
        if not code:
            return Response({"success": False, "error": "Tracking code or application number required", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            app = Application.objects.get(Q(application_number=code) | Q(public_tracking_code=code))
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ApplicationTrackingSerializer(app).data)


class ApplicationBulkStatusView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = ApplicationBulkStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        app_ids = serializer.validated_data["application_ids"]
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        applications = Application.objects.filter(id__in=app_ids)
        updated = 0
        for app in applications:
            old_status = app.status
            app.status = new_status
            if not app.review_started_at:
                app.review_started_at = timezone.now()
            app.reviewed_by_id = str(request.user.id)
            if notes:
                app.admin_feedback = notes
                app.admin_feedback_date = timezone.now()
                app.admin_feedback_by_id = str(request.user.id)
            if new_status in ("approved", "rejected"):
                app.decision_date = timezone.now()
            app.save(update_fields=[
                "status",
                "review_started_at",
                "reviewed_by",
                "admin_feedback",
                "admin_feedback_date",
                "admin_feedback_by",
                "decision_date",
                "updated_at",
            ])
            ApplicationStatusHistory.objects.create(application=app, old_status=old_status, new_status=new_status, changed_by_id=str(request.user.id), notes=notes)
            updated += 1
        return Response({"message": f"{updated} application(s) updated", "updated": updated})


class ApplicationDraftView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_id = str(request.user.id)
        draft = ApplicationDraft.objects.filter(user_id=user_id).order_by("-updated_at").first()
        if not draft:
            return Response({"success": False, "error": "No draft found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ApplicationDraftSerializer(draft).data)

    def post(self, request):
        user_id = str(request.user.id)
        draft_data = request.data.get("draft_data", {})
        application_id = request.data.get("application_id")
        draft, created = ApplicationDraft.objects.update_or_create(user_id=user_id, application_id=application_id, defaults={"draft_data": draft_data})
        resp_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(ApplicationDraftSerializer(draft).data, status=resp_status)


class ApplicationInterviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, application_id):
        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if not IsOwnerOrAdmin().has_object_permission(request, self, application):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        interviews = ApplicationInterview.objects.filter(application_id=application_id).order_by("-scheduled_at")
        return Response(ApplicationInterviewSerializer(interviews, many=True).data)

    def post(self, request, application_id):
        if not IsAdmin().has_permission(request, self):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        try:
            Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        data = request.data.copy()
        data["application_id"] = str(application_id)
        serializer = ApplicationInterviewSerializer(data=data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        interview = ApplicationInterview.objects.create(
            application_id=application_id,
            scheduled_at=serializer.validated_data["scheduled_at"],
            mode=serializer.validated_data.get("mode", "in_person"),
            location=serializer.validated_data.get("location", ""),
            status=serializer.validated_data.get("status", "scheduled"),
            notes=serializer.validated_data.get("notes", ""),
            created_by_id=str(request.user.id),
            updated_by_id=str(request.user.id),
        )
        return Response(ApplicationInterviewSerializer(interview).data, status=status.HTTP_201_CREATED)

    def patch(self, request, application_id):
        if not IsAdmin().has_permission(request, self):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        interview = (
            ApplicationInterview.objects.filter(application_id=application_id)
            .order_by("-scheduled_at", "-created_at")
            .first()
        )

        if interview is None:
            return Response({"success": False, "error": "Interview not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ApplicationInterviewSerializer(interview, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        serializer.save(updated_by_id=str(request.user.id))
        return Response(serializer.data)
