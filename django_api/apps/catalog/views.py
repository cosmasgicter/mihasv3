"""Catalog views.

Implements task 14.2.
Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
"""

import logging

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog.models import Institution, Intake, Program, Subject
from apps.catalog.serializers import (
    InstitutionSerializer,
    IntakeSerializer,
    ProgramCreateUpdateSerializer,
    ProgramSerializer,
    SubjectSerializer,
)
from apps.common.pagination import StandardPagination

logger = logging.getLogger(__name__)


def _is_admin(request):
    """Check if the requesting user has admin role."""
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return getattr(user, "role", "") in ("admin", "super_admin")


def _set_public_cache(response):
    """Set Cache-Control: public, max-age=300 for public responses."""
    response["Cache-Control"] = "public, max-age=300"
    return response


class ProgramListCreateView(APIView):
    """GET /api/v1/catalog/programs/ — list programs (public + admin)
    POST /api/v1/catalog/programs/ — create program (admin only)
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdmin()]
        return [AllowAny()]

    def get_authenticators(self):
        if self.request.method == "POST":
            from apps.accounts.authentication import JWTCookieAuthentication
            return [JWTCookieAuthentication()]
        # For GET, try auth but don't require it
        from apps.accounts.authentication import JWTCookieAuthentication
        return [JWTCookieAuthentication()]

    def get(self, request):
        if _is_admin(request):
            queryset = Program.objects.select_related("institution").all()
        else:
            queryset = Program.objects.select_related("institution").filter(is_active=True)

        queryset = queryset.order_by("name")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = ProgramSerializer(page, many=True)
            response = paginator.get_paginated_response(serializer.data)
        else:
            serializer = ProgramSerializer(queryset, many=True)
            response = Response(serializer.data)

        if not _is_admin(request):
            _set_public_cache(response)
        return response

    def post(self, request):
        serializer = ProgramCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        program = Program.objects.create(**serializer.validated_data)
        out = ProgramSerializer(program)
        return Response(out.data, status=status.HTTP_201_CREATED)


class ProgramDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/catalog/programs/{id}/"""

    permission_classes = [IsAdmin]

    def get(self, request, program_id):
        try:
            program = Program.objects.select_related("institution").get(id=program_id)
        except Program.DoesNotExist:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = ProgramSerializer(program)
        return Response(serializer.data)

    def patch(self, request, program_id):
        try:
            program = Program.objects.get(id=program_id)
        except Program.DoesNotExist:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProgramCreateUpdateSerializer(program, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        for attr, value in serializer.validated_data.items():
            setattr(program, attr, value)
        program.save()
        out = ProgramSerializer(program)
        return Response(out.data)

    def delete(self, request, program_id):
        try:
            program = Program.objects.get(id=program_id)
        except Program.DoesNotExist:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        program.is_active = False
        program.save(update_fields=["is_active"])
        return Response({"message": "Program deactivated"})


class IntakeListCreateView(APIView):
    """GET /api/v1/catalog/intakes/ — list intakes
    POST /api/v1/catalog/intakes/ — create intake (admin)
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdmin()]
        return [AllowAny()]

    def get_authenticators(self):
        from apps.accounts.authentication import JWTCookieAuthentication
        return [JWTCookieAuthentication()]

    def get(self, request):
        if _is_admin(request):
            queryset = Intake.objects.all()
        else:
            queryset = Intake.objects.filter(is_active=True)

        queryset = queryset.order_by("-year", "name")
        serializer = IntakeSerializer(queryset, many=True)
        response = Response(serializer.data)

        if not _is_admin(request):
            _set_public_cache(response)
        return response

    def post(self, request):
        serializer = IntakeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        intake = Intake.objects.create(**serializer.validated_data)
        out = IntakeSerializer(intake)
        return Response(out.data, status=status.HTTP_201_CREATED)


class IntakeDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/catalog/intakes/{id}/"""

    permission_classes = [IsAdmin]

    def get(self, request, intake_id):
        try:
            intake = Intake.objects.get(id=intake_id)
        except Intake.DoesNotExist:
            return Response(
                {"success": False, "error": "Intake not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = IntakeSerializer(intake)
        return Response(serializer.data)

    def patch(self, request, intake_id):
        try:
            intake = Intake.objects.get(id=intake_id)
        except Intake.DoesNotExist:
            return Response(
                {"success": False, "error": "Intake not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = IntakeSerializer(intake, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        for attr, value in serializer.validated_data.items():
            setattr(intake, attr, value)
        intake.save()
        return Response(IntakeSerializer(intake).data)

    def delete(self, request, intake_id):
        try:
            intake = Intake.objects.get(id=intake_id)
        except Intake.DoesNotExist:
            return Response(
                {"success": False, "error": "Intake not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        intake.is_active = False
        intake.save(update_fields=["is_active"])
        return Response({"message": "Intake deactivated"})


class SubjectListView(APIView):
    """GET /api/v1/catalog/subjects/ — list subjects (public)"""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        queryset = Subject.objects.all().order_by("name")
        serializer = SubjectSerializer(queryset, many=True)
        response = Response(serializer.data)
        _set_public_cache(response)
        return response


class InstitutionListCreateView(APIView):
    """GET /api/v1/catalog/institutions/ — list institutions
    POST /api/v1/catalog/institutions/ — create institution (admin)
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdmin()]
        return [AllowAny()]

    def get_authenticators(self):
        from apps.accounts.authentication import JWTCookieAuthentication
        return [JWTCookieAuthentication()]

    def get(self, request):
        if _is_admin(request):
            queryset = Institution.objects.all()
        else:
            queryset = Institution.objects.filter(is_active=True)

        queryset = queryset.order_by("name")
        serializer = InstitutionSerializer(queryset, many=True)
        response = Response(serializer.data)

        if not _is_admin(request):
            _set_public_cache(response)
        return response

    def post(self, request):
        serializer = InstitutionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        institution = Institution.objects.create(**serializer.validated_data)
        out = InstitutionSerializer(institution)
        return Response(out.data, status=status.HTTP_201_CREATED)


class InstitutionDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/catalog/institutions/{id}/"""

    permission_classes = [IsAdmin]

    def get(self, request, institution_id):
        try:
            institution = Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            return Response(
                {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = InstitutionSerializer(institution)
        return Response(serializer.data)

    def patch(self, request, institution_id):
        try:
            institution = Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            return Response(
                {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = InstitutionSerializer(institution, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        for attr, value in serializer.validated_data.items():
            setattr(institution, attr, value)
        institution.save()
        out = InstitutionSerializer(institution)
        return Response(out.data)

    def delete(self, request, institution_id):
        """Soft-delete: reject if institution has active programs (409)."""
        try:
            institution = Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            return Response(
                {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check for active programs
        active_programs = Program.objects.filter(
            institution_id=institution_id, is_active=True
        ).exists()
        if active_programs:
            return Response(
                {
                    "success": False,
                    "error": "Cannot deactivate institution with active programs",
                    "code": "CONFLICT",
                },
                status=status.HTTP_409_CONFLICT,
            )

        institution.is_active = False
        institution.save(update_fields=["is_active"])
        return Response({"message": "Institution deactivated"})
