"""Resume and document intelligence scaffold views."""

import uuid

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.jobs_ops_seed import build_action_payload, sample_resume_assets
from apps.common.openapi_helpers import envelope_serializer


class ResumeAssetSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    asset_type = serializers.CharField()
    target_role = serializers.CharField()
    status = serializers.CharField()
    updated_at = serializers.DateTimeField()


class GeneratedTextSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    content = serializers.CharField()
    status = serializers.CharField()


class DocumentVersionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    version = serializers.IntegerField()
    summary = serializers.CharField()
    created_at = serializers.DateTimeField()


class DocumentActionSerializer(serializers.Serializer):
    message = serializers.CharField()
    status = serializers.CharField()
    reference_id = serializers.UUIDField()


RESUME_LIST_RESPONSE = envelope_serializer("ResumeListResponse", ResumeAssetSerializer(many=True))
GENERATED_TEXT_RESPONSE = envelope_serializer("GeneratedTextResponse", GeneratedTextSerializer())
VERSION_LIST_RESPONSE = envelope_serializer("DocumentVersionListResponse", DocumentVersionSerializer(many=True))
DOCUMENT_ACTION_RESPONSE = envelope_serializer("DocumentActionResponse", DocumentActionSerializer())


class ResumeListView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ResumeAssetSerializer

    @extend_schema(operation_id="documents_resumes_list", tags=["documents"], responses={200: OpenApiResponse(response=RESUME_LIST_RESPONSE)})
    def get(self, request):
        return Response(sample_resume_assets())


class ResumeVariantCreateView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentActionSerializer

    @extend_schema(operation_id="documents_resume_variants_create", tags=["documents"], responses={202: OpenApiResponse(response=DOCUMENT_ACTION_RESPONSE)})
    def post(self, request):
        return Response(build_action_payload(uuid.uuid4(), "Resume variant scaffold queued."), status=status.HTTP_202_ACCEPTED)


class CoverLetterGenerateView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = GeneratedTextSerializer

    @extend_schema(operation_id="documents_cover_letters_generate", tags=["documents"], responses={200: OpenApiResponse(response=GENERATED_TEXT_RESPONSE)})
    def post(self, request):
        return Response(
            {
                "id": uuid.uuid4(),
                "content": "This is a scaffold cover letter draft. Replace it with guarded, role-specific generation.",
                "status": "draft",
            }
        )


class QuestionBankAnswerView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = GeneratedTextSerializer

    @extend_schema(operation_id="documents_question_bank_answer", tags=["documents"], responses={200: OpenApiResponse(response=GENERATED_TEXT_RESPONSE)})
    def post(self, request):
        return Response(
            {
                "id": uuid.uuid4(),
                "content": "This is a scaffold answer-bank response. Replace it with factual, reviewed candidate answers.",
                "status": "draft",
            }
        )


class DocumentVersionListView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentVersionSerializer

    @extend_schema(operation_id="documents_versions_list", tags=["documents"], responses={200: OpenApiResponse(response=VERSION_LIST_RESPONSE)})
    def get(self, request, document_id):
        return Response(
            [
                {
                    "id": uuid.uuid4(),
                    "version": 1,
                    "summary": "Initial scaffold version for document lineage.",
                    "created_at": timezone.now(),
                },
                {
                    "id": uuid.uuid4(),
                    "version": 2,
                    "summary": "Tailored draft placeholder with redline support to be added later.",
                    "created_at": timezone.now(),
                },
            ]
        )
