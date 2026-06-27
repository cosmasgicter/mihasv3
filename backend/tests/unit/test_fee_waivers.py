"""Unit tests for fee waivers (Requirement 12). Requirements: 12.1-12.10"""
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.documents.fee_waiver_service import (
    VALID_REASON_CODES,
    VALID_WAIVER_TYPES,
    FeeWaiverError,
    FeeWaiverService,
)
from apps.applications.admin_assignment_views import ApplicationFeeWaiverView


_AO = "apps.applications.views.Application.objects"


def _admin(uid=None, role="super_admin"):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "a@e.com",
                    "role": role, "first_name": "A", "last_name": "D"})


def _student(uid=None):
    return JWTUser({"user_id": str(uid or uuid.uuid4()), "email": "s@e.com",
                    "role": "student", "first_name": "S", "last_name": "T"})


def _app(uid=None, aid=None):
    a = MagicMock()
    a.id = aid or uuid.uuid4()
    a.user_id = str(uid or uuid.uuid4())
    a.status = "submitted"
    a.payment_status = "pending"
    a.program = "CS"
    a.intake = "Jan 2026"
    a.application_number = "APP-20250101-ABCD1234"
    return a


class TestFullWaiverGrantsForceApproved:
    """1. Full waiver sets payment_status to force_approved (Req 12.3)."""

    def test_full_waiver_force_approves(self):
        app = _app()
        mock_waiver = MagicMock()
        mock_waiver.id = uuid.uuid4()

        with (
            patch("apps.applications.models.Application.objects") as mq,
            patch("apps.documents.fee_waiver_service.FeeWaiver.objects") as fwq,
            patch("apps.applications.models.ApplicationStatusHistory.objects"),
        ):
            mq.get.return_value = app
            fwq.create.return_value = mock_waiver

            FeeWaiverService.grant_waiver(
                application_id=str(app.id),
                waiver_type="full",
                reason_code="scholarship",
                discount_percentage=100,
                admin_id=str(uuid.uuid4()),
            )

            app.save.assert_called_once()
            assert app.payment_status == "force_approved"


class TestPartialWaiverComputesDiscount:
    """2. Partial waiver computes correct discounted fee (Req 12.4)."""

    def test_50_percent_discount(self):
        with patch("apps.documents.fee_waiver_service.FeeWaiver.objects") as fwq:
            mock_waiver = MagicMock()
            mock_waiver.waiver_type = "partial"
            mock_waiver.discount_percentage = 50
            fwq.filter.return_value.order_by.return_value.first.return_value = mock_waiver

            result = FeeWaiverService.get_effective_fee(str(uuid.uuid4()), Decimal("200.00"))
            assert result == Decimal("100.00")

    def test_no_waiver_returns_full_fee(self):
        with patch("apps.documents.fee_waiver_service.FeeWaiver.objects") as fwq:
            fwq.filter.return_value.order_by.return_value.first.return_value = None

            result = FeeWaiverService.get_effective_fee(str(uuid.uuid4()), Decimal("200.00"))
            assert result == Decimal("200.00")

    def test_full_waiver_returns_zero(self):
        with patch("apps.documents.fee_waiver_service.FeeWaiver.objects") as fwq:
            mock_waiver = MagicMock()
            mock_waiver.waiver_type = "full"
            mock_waiver.discount_percentage = 100
            fwq.filter.return_value.order_by.return_value.first.return_value = mock_waiver

            result = FeeWaiverService.get_effective_fee(str(uuid.uuid4()), Decimal("200.00"))
            assert result == Decimal("0.00")


class TestOnlySuperAdminCanGrantWaivers:
    """3. Only super_admin can grant waivers (Req 12.7)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationFeeWaiverView.as_view()

    def test_student_cannot_grant(self):
        student = _student()
        req = self.f.post(f"/api/v1/applications/{uuid.uuid4()}/fee-waiver/",
                          {"waiver_type": "full", "reason_code": "scholarship"}, format="json")
        force_authenticate(req, user=student)
        resp = self.v(req, application_id=uuid.uuid4())
        assert resp.status_code == 403

    def test_admin_cannot_grant(self):
        admin = _admin(role="admin")
        req = self.f.post(f"/api/v1/applications/{uuid.uuid4()}/fee-waiver/",
                          {"waiver_type": "full", "reason_code": "scholarship"}, format="json")
        force_authenticate(req, user=admin)
        resp = self.v(req, application_id=uuid.uuid4())
        assert resp.status_code == 403


class TestWaiverRecordedInHistory:
    """4. Waiver recorded in ApplicationStatusHistory (Req 12.6)."""

    def test_history_created(self):
        app = _app()
        mock_waiver = MagicMock()
        mock_waiver.id = uuid.uuid4()

        with (
            patch("apps.applications.models.Application.objects") as mq,
            patch("apps.documents.fee_waiver_service.FeeWaiver.objects") as fwq,
            patch("apps.applications.models.ApplicationStatusHistory.objects") as hq,
        ):
            mq.get.return_value = app
            fwq.create.return_value = mock_waiver

            FeeWaiverService.grant_waiver(
                application_id=str(app.id),
                waiver_type="partial",
                reason_code="financial_hardship",
                discount_percentage=50,
                admin_id=str(uuid.uuid4()),
            )

            hq.create.assert_called_once()
            call_kwargs = hq.create.call_args[1]
            assert "Fee waiver granted" in call_kwargs["notes"]


class TestWaiverValidation:
    """5. Waiver validation (Req 12.1)."""

    def test_invalid_waiver_type(self):
        with (
            patch("apps.applications.models.Application.objects"),
            patch("apps.documents.fee_waiver_service.FeeWaiver.objects"),
            patch("apps.applications.models.ApplicationStatusHistory.objects"),
        ):
            try:
                FeeWaiverService.grant_waiver(
                    application_id=str(uuid.uuid4()),
                    waiver_type="invalid",
                    reason_code="scholarship",
                    discount_percentage=100,
                    admin_id=str(uuid.uuid4()),
                )
                assert False, "Should have raised FeeWaiverError"
            except FeeWaiverError as e:
                assert e.code == "INVALID_WAIVER_TYPE"

    def test_invalid_reason_code(self):
        try:
            FeeWaiverService.grant_waiver(
                application_id=str(uuid.uuid4()),
                waiver_type="full",
                reason_code="invalid_reason",
                discount_percentage=100,
                admin_id=str(uuid.uuid4()),
            )
            assert False, "Should have raised FeeWaiverError"
        except FeeWaiverError as e:
            assert e.code == "INVALID_REASON_CODE"

    def test_invalid_discount_percentage(self):
        try:
            FeeWaiverService.grant_waiver(
                application_id=str(uuid.uuid4()),
                waiver_type="partial",
                reason_code="scholarship",
                discount_percentage=150,
                admin_id=str(uuid.uuid4()),
            )
            assert False, "Should have raised FeeWaiverError"
        except FeeWaiverError as e:
            assert e.code == "INVALID_DISCOUNT"


class TestWaiverEndpoint:
    """6. Fee waiver endpoint (Req 12.2)."""

    def setup_method(self):
        self.f = APIRequestFactory()
        self.v = ApplicationFeeWaiverView.as_view()
        self.admin = _admin()

    def test_successful_waiver(self):
        a = _app()
        mock_waiver = MagicMock()
        mock_waiver.id = uuid.uuid4()
        mock_waiver.waiver_type = "full"
        mock_waiver.reason_code = "scholarship"
        mock_waiver.discount_percentage = 100

        with (
            patch(_AO) as mq,
            patch("apps.documents.fee_waiver_service.FeeWaiverService.grant_waiver") as fws,
        ):
            mq.get.return_value = a
            fws.return_value = mock_waiver

            req = self.f.post(f"/api/v1/applications/{a.id}/fee-waiver/",
                              {"waiver_type": "full", "reason_code": "scholarship",
                               "discount_percentage": 100}, format="json")
            force_authenticate(req, user=self.admin)
            resp = self.v(req, application_id=a.id)

        assert resp.status_code == 200
        assert resp.data["success"] is True

    def test_missing_fields(self):
        a = _app()
        with patch(_AO) as mq:
            mq.get.return_value = a
            req = self.f.post(f"/api/v1/applications/{a.id}/fee-waiver/",
                              {}, format="json")
            force_authenticate(req, user=self.admin)
            resp = self.v(req, application_id=a.id)
        assert resp.status_code == 400
        assert resp.data["code"] == "VALIDATION_ERROR"


class TestWaiverConstants:
    """7. Service constants match requirements."""

    def test_valid_waiver_types(self):
        assert VALID_WAIVER_TYPES == {"full", "partial", "scholarship"}

    def test_valid_reason_codes(self):
        expected = {"staff_child", "returning_student", "orphan",
                    "scholarship", "financial_hardship", "admin_discretion"}
        assert VALID_REASON_CODES == expected
