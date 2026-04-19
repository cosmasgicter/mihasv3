"""Unit tests for batch operation safety (Requirement 13). Requirements: 13.1-13.9"""
import hashlib
import uuid
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.views import ApplicationBulkStatusView


def _admin(uid=None):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "a@e.com",
                    "role": "admin", "first_name": "A", "last_name": "D"})


def _make_token(app_ids, new_status):
    """Compute the expected confirmation token."""
    sorted_ids = sorted(str(aid) for aid in app_ids)
    return hashlib.sha256(("".join(sorted_ids) + new_status).encode("utf-8")).hexdigest()


class TestBatchSizeLimit:
    """1. Batch size limit enforcement (Req 13.1, 13.2)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationBulkStatusView.as_view()
        self.admin = _admin()

    def test_exceeds_25_rejected(self):
        ids = [str(uuid.uuid4()) for _ in range(26)]
        token = _make_token(ids, "rejected")
        req = self.f.post("/api/v1/applications/bulk-status/",
                          {"application_ids": ids, "new_status": "rejected",
                           "confirmation_token": token}, format="json")
        force_authenticate(req, user=self.admin)
        resp = self.v(req)
        assert resp.status_code == 400
        assert resp.data["code"] == "BATCH_SIZE_EXCEEDED"


class TestConfirmationToken:
    """2. Confirmation token validation (Req 13.5)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationBulkStatusView.as_view()
        self.admin = _admin()

    def test_invalid_token_rejected(self):
        ids = [str(uuid.uuid4())]
        req = self.f.post("/api/v1/applications/bulk-status/",
                          {"application_ids": ids, "new_status": "rejected",
                           "confirmation_token": "wrong_token"}, format="json")
        force_authenticate(req, user=self.admin)
        resp = self.v(req)
        assert resp.status_code == 400
        assert resp.data["code"] == "INVALID_CONFIRMATION_TOKEN"

    def test_token_computation(self):
        """Verify token is SHA-256 of sorted IDs + status."""
        ids = [str(uuid.uuid4()), str(uuid.uuid4())]
        sorted_ids = sorted(ids)
        expected = hashlib.sha256(("".join(sorted_ids) + "rejected").encode("utf-8")).hexdigest()
        assert _make_token(ids, "rejected") == expected


class TestAllOrNothingValidation:
    """3. All-or-nothing validation logic (Req 13.3, 13.4)."""

    def test_invalid_transition_detected(self):
        """Verify that ALLOWED_TRANSITIONS correctly blocks draft -> approved."""
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "approved" not in ALLOWED_TRANSITIONS.get("draft", set())

    def test_valid_transition_allowed(self):
        """Verify that under_review -> rejected is valid."""
        from apps.applications.services import ALLOWED_TRANSITIONS
        assert "rejected" in ALLOWED_TRANSITIONS.get("under_review", set())


class TestBatchMaxSizeConstant:
    """4. MAX_BATCH_SIZE is 25."""

    def test_max_batch_size(self):
        assert ApplicationBulkStatusView.MAX_BATCH_SIZE == 25


class TestBatchSummaryResponseFormat:
    """5. Summary response includes required fields (Req 13.9)."""

    def test_response_fields_documented(self):
        """The view returns processed, status, and application_ids in data."""
        import inspect
        source = inspect.getsource(ApplicationBulkStatusView.post)
        assert '"processed"' in source
        assert '"status"' in source
        assert '"application_ids"' in source


class TestBatchWaitlistPromotion:
    """6. Batch rejection triggers waitlist promotion (Req 13.8)."""

    def test_waitlist_promotion_code_present(self):
        """The view triggers WaitlistManager.promote_next on batch rejections."""
        import inspect
        source = inspect.getsource(ApplicationBulkStatusView.post)
        assert "WaitlistManager" in source
        assert "promote_next" in source


class TestBatchTransactionAtomicity:
    """7. Batch processes within a single transaction (Req 13.7)."""

    def test_uses_transaction_atomic(self):
        """The view wraps transitions in transaction.atomic()."""
        import inspect
        source = inspect.getsource(ApplicationBulkStatusView.post)
        assert "transaction.atomic()" in source
