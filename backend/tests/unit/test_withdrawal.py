"""Unit tests for application withdrawal (Requirement 1). Requirements: 1.1-1.11"""
import uuid
from unittest.mock import MagicMock, patch
from rest_framework.test import APIRequestFactory, force_authenticate
from apps.accounts.authentication import JWTUser
from apps.applications.duplicate_checker import NON_TERMINAL_STATUSES, TERMINAL_STATUSES
from apps.applications.withdrawal_service import (
    MAX_REASON_LENGTH, MIN_REASON_LENGTH, WITHDRAWABLE_STATUSES,
    WithdrawalError, WithdrawalService,
)
from apps.applications.views import ApplicationWithdrawView

_WS = "apps.applications.withdrawal_service.WithdrawalService.withdraw"
_AO = "apps.applications.views.Application.objects"
_AS = "apps.applications.views.ApplicationSerializer"

def _user(uid=None):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "s@e.com",
                    "role": "student", "first_name": "T", "last_name": "S"})

def _app(uid, status="submitted", aid=None):
    a = MagicMock(); a.id = aid or uuid.uuid4(); a.user_id = str(uid)
    a.status = status; a.program = "CS"; a.intake = "Jan 2026"
    a.application_number = "APP-20250101-ABCD1234"
    a.full_name = "Test"; a.email = "s@e.com"
    return a

def _req(factory, user, aid, data=None, idem_key=None):
    extra = {"HTTP_IDEMPOTENCY_KEY": idem_key} if idem_key else {}
    r = factory.post(f"/api/v1/applications/{aid}/withdraw/",
                     data=data or {}, format="json", **extra)
    force_authenticate(r, user=user)
    return r
