"""Automation scaffold views."""

import uuid

from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.automation.serializers import AutomationActionSerializer, AutomationRuleSerializer, AutomationRunSerializer
from apps.common.jobs_ops_seed import build_action_payload, sample_automation_rules, sample_automation_runs
from apps.common.openapi_helpers import envelope_serializer, paginated_serializer


RULE_LIST_RESPONSE = envelope_serializer(
    "AutomationRuleListResponse",
    paginated_serializer("AutomationRulePage", AutomationRuleSerializer),
)
RUN_LIST_RESPONSE = envelope_serializer(
    "AutomationRunListResponse",
    paginated_serializer("AutomationRunPage", AutomationRunSerializer),
)
RUN_RESPONSE = envelope_serializer("AutomationRunResponse", AutomationRunSerializer())
ACTION_RESPONSE = envelope_serializer("AutomationActionResponse", AutomationActionSerializer())


class PublicReadWriteProtectedMixin:
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [permission() for permission in self.permission_classes]


@extend_schema_view(
    get=extend_schema(operation_id="automation_rules_list", tags=["automation"], responses={200: OpenApiResponse(response=RULE_LIST_RESPONSE)}),
    post=extend_schema(operation_id="automation_rules_create", tags=["automation"], responses={201: OpenApiResponse(response=envelope_serializer("AutomationRuleResponse", AutomationRuleSerializer()))}),
)
class AutomationRuleListCreateView(PublicReadWriteProtectedMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AutomationRuleSerializer

    def get(self, request):
        rules = sample_automation_rules()
        return Response({"page": 1, "pageSize": 20, "totalCount": len(rules), "results": rules})

    def post(self, request):
        rule = sample_automation_rules()[0].copy()
        rule["id"] = uuid.uuid4()
        return Response(rule, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(operation_id="automation_runs_list", tags=["automation"], responses={200: OpenApiResponse(response=RUN_LIST_RESPONSE)}),
    post=extend_schema(operation_id="automation_runs_create", tags=["automation"], responses={202: OpenApiResponse(response=RUN_RESPONSE)}),
)
class AutomationRunListCreateView(PublicReadWriteProtectedMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AutomationRunSerializer

    def get(self, request):
        runs = sample_automation_runs()
        return Response({"page": 1, "pageSize": 20, "totalCount": len(runs), "results": runs})

    def post(self, request):
        run = sample_automation_runs()[0].copy()
        run["id"] = uuid.uuid4()
        return Response(run, status=status.HTTP_202_ACCEPTED)


class AutomationRunDetailView(PublicReadWriteProtectedMixin, APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AutomationRunSerializer

    @extend_schema(operation_id="automation_runs_retrieve", tags=["automation"], responses={200: OpenApiResponse(response=RUN_RESPONSE)})
    def get(self, request, run_id):
        for run in sample_automation_runs():
            if str(run["id"]) == str(run_id):
                return Response(run)
        fallback = sample_automation_runs()[0].copy()
        fallback["id"] = run_id
        return Response(fallback)


class AutomationRunApproveView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AutomationActionSerializer

    @extend_schema(operation_id="automation_runs_approve", tags=["automation"], responses={200: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request, run_id):
        return Response(build_action_payload(run_id, "Automation run approved in scaffold state.", "approved"))


class AutomationRunCancelView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AutomationActionSerializer

    @extend_schema(operation_id="automation_runs_cancel", tags=["automation"], responses={200: OpenApiResponse(response=ACTION_RESPONSE)})
    def post(self, request, run_id):
        return Response(build_action_payload(run_id, "Automation run cancelled in scaffold state.", "cancelled"))
