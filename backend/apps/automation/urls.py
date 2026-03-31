"""Automation URL routes."""

from django.urls import path

from apps.automation.views import (
    AutomationRuleListCreateView,
    AutomationRunApproveView,
    AutomationRunCancelView,
    AutomationRunDetailView,
    AutomationRunListCreateView,
)

app_name = "automation"

urlpatterns = [
    path("rules/", AutomationRuleListCreateView.as_view(), name="rule-list-create"),
    path("runs/", AutomationRunListCreateView.as_view(), name="run-list-create"),
    path("runs/<uuid:run_id>/", AutomationRunDetailView.as_view(), name="run-detail"),
    path("runs/<uuid:run_id>/approve/", AutomationRunApproveView.as_view(), name="run-approve"),
    path("runs/<uuid:run_id>/cancel/", AutomationRunCancelView.as_view(), name="run-cancel"),
]

