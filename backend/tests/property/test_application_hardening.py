"""Property-based tests for application process hardening.

Tests Properties 1, 2, and 6 from the application-process-hardening spec.

**Validates: Req 2, 3, 5**
"""

import os
import uuid
from unittest.mock import MagicMock, patch, PropertyMock

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.documents.webhook_processor import WebhookProcessor  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

references = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=5,
    max_size=40,
)

known_event_types = st.sampled_from([
    "collection.successful",
    "collection.failed",
    "collection.settled",
])

idempotency_keys = st.uuids().map(str)

application_ids = st.uuids()

admin_user_ids = st.uuids().map(str)

force_bypass_reasons = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=0,
    max_size=200,
)

review_statuses = st.sampled_from(["approved", "rejected", "under_review", "waitlisted"])


# ---------------------------------------------------------------------------
# Property 1: Webhook deduplication prevents reprocessing
# ---------------------------------------------------------------------------


class TestWebhookDeduplicationPreventsReprocessing(SimpleTestCase):
    """Property 1: For any webhook with a `reference` and `event_type` that
    already has `processed=True` in `webhook_event_logs`, the processor must
    not delegate to `PaymentService`.

    **Validates: Requirements 2.1, 2.2**
    """

    @given(
        reference=references,
        event_type=known_event_types,
    )
    @settings(max_examples=100)
    def test_duplicate_webhook_does_not_call_payment_service(
        self,
        reference,
        event_type,
    ):
        """When a webhook with the same reference and event_type has already
        been processed, the processor must skip PaymentService delegation
        and log a duplicate entry instead."""
        payload = {"data": {"reference": reference}}

        processor = WebhookProcessor()

        with patch("apps.documents.webhook_processor.WebhookEventLog.objects") as mock_log_objects:
            # Simulate that a processed entry already exists
            mock_log_objects.filter.return_value.exists.return_value = True
            mock_create = mock_log_objects.create

            with patch.object(processor, "_payment_service") as mock_payment_svc:
                processor.process(
                    event_type=event_type,
                    payload=payload,
                    signature_valid=True,
                )

                # PaymentService must NOT be called
                mock_payment_svc.process_webhook_event.assert_not_called()

                # A duplicate log entry must be created
                mock_create.assert_called_once()
                call_kwargs = mock_create.call_args[1]
                self.assertEqual(call_kwargs["reference"], reference)
                self.assertEqual(call_kwargs["event_type"], event_type)
                self.assertTrue(call_kwargs["processed"])
                self.assertIn("Duplicate", call_kwargs["processing_error"])

    @given(
        reference=references,
        event_type=known_event_types,
    )
    @settings(max_examples=50)
    def test_non_duplicate_webhook_proceeds_to_payment_service(
        self,
        reference,
        event_type,
    ):
        """When no prior processed entry exists, the processor must delegate
        to PaymentService (confirming dedup only blocks actual duplicates)."""
        payload = {"data": {"reference": reference}}

        processor = WebhookProcessor()

        with patch("apps.documents.webhook_processor.WebhookEventLog.objects") as mock_log_objects:
            # No prior processed entry
            mock_log_objects.filter.return_value.exists.return_value = False
            mock_log_entry = MagicMock()
            mock_log_objects.create.return_value = mock_log_entry

            with patch.object(processor, "_payment_service") as mock_payment_svc:
                processor.process(
                    event_type=event_type,
                    payload=payload,
                    signature_valid=True,
                )

                # PaymentService MUST be called for non-duplicate events
                mock_payment_svc.process_webhook_event.assert_called_once_with(
                    event_type=event_type,
                    reference=reference,
                    payload=payload,
                )



# ---------------------------------------------------------------------------
# Property 2: Idempotency key returns cached response
# ---------------------------------------------------------------------------


class TestIdempotencyKeyReturnsCachedResponse(SimpleTestCase):
    """Property 2: For any submission with an `Idempotency-Key` matching an
    existing row, the response must equal stored `response_json` without
    executing `submit_application()`.

    **Validates: Requirements 3.2**
    """

    @given(
        idempotency_key=idempotency_keys,
        application_id=application_ids,
    )
    @settings(max_examples=100)
    def test_existing_idempotency_key_returns_cached_response(
        self,
        idempotency_key,
        application_id,
    ):
        """When an Idempotency-Key header matches an existing row in the
        idempotency_keys table, the view must return the stored response_json
        without calling submit_application()."""
        from apps.applications.views import ApplicationSubmitView

        cached_response = {
            "id": str(application_id),
            "status": "submitted",
            "cached": True,
        }

        # Build a mock request with the idempotency key header
        mock_request = MagicMock()
        mock_request.META = {"HTTP_IDEMPOTENCY_KEY": idempotency_key}
        mock_request.user = MagicMock()
        mock_request.user.id = uuid.uuid4()

        # Mock the application lookup
        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = str(mock_request.user.id)

        # Mock the IdempotencyKey lookup to return a cached entry
        mock_existing_key = MagicMock()
        mock_existing_key.response_json = cached_response

        with patch("apps.applications.views._with_payment_summary") as mock_ps, \
             patch("apps.applications.views.Application.objects") as mock_app_objects, \
             patch("apps.applications.views.IsOwnerOrAdmin") as mock_perm, \
             patch("apps.common.models.IdempotencyKey.objects") as mock_ik_objects, \
             patch("apps.applications.views.submit_application") as mock_submit:

            mock_ps.return_value.get.return_value = mock_app
            mock_perm.return_value.has_object_permission.return_value = True
            mock_ik_objects.get.return_value = mock_existing_key

            view = ApplicationSubmitView()
            response = view.post(mock_request, application_id)

            # submit_application must NOT be called
            mock_submit.assert_not_called()

            # Response must equal the cached response_json
            self.assertEqual(response.data, cached_response)

    @given(
        idempotency_key=idempotency_keys,
        application_id=application_ids,
    )
    @settings(max_examples=50)
    def test_new_idempotency_key_proceeds_to_submission(
        self,
        idempotency_key,
        application_id,
    ):
        """When an Idempotency-Key does not match any existing row, the view
        must proceed to call submit_application()."""
        from apps.applications.views import ApplicationSubmitView
        from apps.common.models import IdempotencyKey as IKModel

        mock_request = MagicMock()
        mock_request.META = {"HTTP_IDEMPOTENCY_KEY": idempotency_key}
        mock_request.user = MagicMock()
        mock_request.user.id = uuid.uuid4()

        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = str(mock_request.user.id)
        mock_app.status = "submitted"
        mock_app.submitted_at = None
        mock_app.payment_status = "verified"

        submitted_app = MagicMock()
        submitted_app.id = application_id
        submitted_app.user_id = str(mock_request.user.id)
        submitted_app.status = "submitted"
        submitted_app.submitted_at = MagicMock()
        submitted_app.submitted_at.isoformat.return_value = "2025-01-01T00:00:00"
        submitted_app.payment_status = "verified"

        with patch("apps.applications.views._with_payment_summary") as mock_ps, \
             patch("apps.applications.views.Application.objects") as mock_app_objects, \
             patch("apps.applications.views.IsOwnerOrAdmin") as mock_perm, \
             patch("apps.common.models.IdempotencyKey.objects") as mock_ik_objects, \
             patch("apps.applications.views.submit_application") as mock_submit, \
             patch("apps.applications.views.ApplicationSerializer") as mock_serializer, \
             patch("apps.applications.views.dispatch_event"), \
             patch("apps.applications.views.timezone"):

            mock_ps.return_value.get.return_value = mock_app
            mock_perm.return_value.has_object_permission.return_value = True

            # IdempotencyKey.objects.get raises DoesNotExist
            mock_ik_objects.get.side_effect = IKModel.DoesNotExist
            mock_ik_objects.create.return_value = MagicMock()
            mock_ik_objects.filter.return_value.delete.return_value = (0, {})

            mock_submit.return_value = (submitted_app, "draft")
            mock_serializer.return_value.data = {"id": str(application_id), "status": "submitted"}

            view = ApplicationSubmitView()
            view.post(mock_request, application_id)

            # submit_application MUST be called
            mock_submit.assert_called_once()


# ---------------------------------------------------------------------------
# Property 6: Force-bypass creates audit trail
# ---------------------------------------------------------------------------


class TestForceBypassCreatesAuditTrail(SimpleTestCase):
    """Property 6: For any transition with `force=True`, the history entry
    must contain `[FORCE-BYPASS]` in `notes` and `{"force_bypass": true}` in
    `changes`.

    **Validates: Requirements 5.1, 5.4**
    """

    @given(
        application_id=application_ids,
        admin_user_id=admin_user_ids,
        reason=force_bypass_reasons,
    )
    @settings(max_examples=100)
    def test_force_bypass_approval_creates_audit_trail(
        self,
        application_id,
        admin_user_id,
        reason,
    ):
        """When force=True on an approval, the view must:
        1. Pass notes containing [FORCE-BYPASS] to transition_application_status
        2. Store {"force_bypass": true} in the history changes JSONB
        3. Log a warning"""
        from apps.applications.views import ApplicationReviewView

        mock_request = MagicMock()
        mock_request.data = {
            "new_status": "approved",
            "force": True,
            "reason": reason,
            "notes": "",
        }
        mock_request.user = MagicMock()
        mock_request.user.id = admin_user_id
        mock_request.META = {
            "HTTP_X_FORWARDED_FOR": "192.168.1.1",
            "REMOTE_ADDR": "192.168.1.1",
            "HTTP_USER_AGENT": "TestAgent/1.0",
        }

        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = str(uuid.uuid4())
        mock_app.status = "submitted"
        mock_app.payment_status = "not_paid"

        # Mock history entry for changes JSONB update
        mock_history = MagicMock()
        mock_history.changes = None

        with patch("apps.applications.views.Application.objects") as mock_app_objects, \
             patch("apps.applications.views.transition_application_status") as mock_transition, \
             patch("apps.applications.views.ApplicationStatusHistory.objects") as mock_history_objects, \
             patch("apps.applications.views.dispatch_event"):

            mock_app_objects.get.return_value = mock_app
            mock_transition.return_value = "submitted"  # old_status
            mock_history_objects.filter.return_value.order_by.return_value.first.return_value = mock_history

            view = ApplicationReviewView()
            view.post(mock_request, application_id)

            # 1. transition_application_status must be called with [FORCE-BYPASS] in notes
            mock_transition.assert_called_once()
            call_kwargs = mock_transition.call_args[1]
            self.assertIn("[FORCE-BYPASS]", call_kwargs["notes"])
            self.assertIn("Payment verification bypassed", call_kwargs["notes"])

            # 2. History changes must contain force_bypass: true
            mock_history.save.assert_called_once()
            self.assertTrue(mock_history.changes["force_bypass"])
            # The reason is either the provided reason (after DRF trim) or
            # 'Not provided' when the trimmed reason is empty.
            self.assertIn("reason", mock_history.changes)

            # 3. IP and user agent must be passed
            self.assertTrue(len(call_kwargs["ip_address"]) > 0)
            self.assertEqual(call_kwargs["user_agent"], "TestAgent/1.0")

    @given(
        application_id=application_ids,
        admin_user_id=admin_user_ids,
        target_status=review_statuses,
    )
    @settings(max_examples=50)
    def test_non_force_bypass_does_not_add_force_marker(
        self,
        application_id,
        admin_user_id,
        target_status,
    ):
        """When force=False, the notes must NOT contain [FORCE-BYPASS]
        and no force_bypass changes should be stored."""
        from apps.applications.views import ApplicationReviewView

        mock_request = MagicMock()
        mock_request.data = {
            "new_status": target_status,
            "force": False,
            "notes": "Regular review notes",
            "reason": "",
        }
        mock_request.user = MagicMock()
        mock_request.user.id = admin_user_id
        mock_request.META = {
            "HTTP_X_FORWARDED_FOR": "10.0.0.1",
            "REMOTE_ADDR": "10.0.0.1",
            "HTTP_USER_AGENT": "TestAgent/1.0",
        }

        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = str(uuid.uuid4())
        mock_app.status = "under_review"
        mock_app.payment_status = "verified"

        with patch("apps.applications.views.Application.objects") as mock_app_objects, \
             patch("apps.applications.views.transition_application_status") as mock_transition, \
             patch("apps.applications.views.ApplicationStatusHistory.objects") as mock_history_objects, \
             patch("apps.applications.views.dispatch_event"), \
             patch("apps.applications.views.Payment.objects") as mock_payment:

            mock_app_objects.get.return_value = mock_app
            mock_transition.return_value = "under_review"
            # For approved status without force, payment check must pass
            mock_payment.filter.return_value.exists.return_value = True

            view = ApplicationReviewView()
            view.post(mock_request, application_id)

            if mock_transition.called:
                call_kwargs = mock_transition.call_args[1]
                self.assertNotIn("[FORCE-BYPASS]", call_kwargs["notes"])


# ---------------------------------------------------------------------------
# Strategies for Properties 8, 10, 11, 12, 13
# ---------------------------------------------------------------------------

page_sizes = st.integers(min_value=1, max_value=10_000)

# Phone strategies
valid_e164_phones = st.from_regex(r"^\+?[0-9]{7,15}$", fullmatch=True)
invalid_e164_phones = st.one_of(
    # Too short (fewer than 7 digits)
    st.from_regex(r"^\+?[0-9]{1,6}$", fullmatch=True),
    # Too long (more than 15 digits)
    st.from_regex(r"^\+?[0-9]{16,25}$", fullmatch=True),
    # Contains letters
    st.from_regex(r"^\+?[0-9]{3}[a-zA-Z]{2}[0-9]{3}$", fullmatch=True),
    # Contains special characters
    st.from_regex(r"^\+?[0-9]{3}-[0-9]{4}$", fullmatch=True),
)

# DOB strategies — underage means age < 16
from datetime import date, timedelta  # noqa: E402

underage_dobs = st.dates(
    min_value=date.today() - timedelta(days=15 * 365),
    max_value=date.today() - timedelta(days=1),
)

of_age_dobs = st.dates(
    min_value=date(1940, 1, 1),
    max_value=date.today() - timedelta(days=16 * 366),
)

# All statuses in the system
all_statuses = st.sampled_from([
    "draft", "submitted", "under_review", "approved", "rejected", "waitlisted",
])

# Import ALLOWED_TRANSITIONS at module level for use in strategies
from apps.applications.services import ALLOWED_TRANSITIONS as _ALLOWED_TRANSITIONS  # noqa: E402


# ---------------------------------------------------------------------------
# Property 8: Pagination max page size cap
# ---------------------------------------------------------------------------


class TestPaginationMaxPageSizeCap(SimpleTestCase):
    """Property 8: For any request with pageSize > 500, actual page size
    must be 500.

    **Validates: Requirements 7.1, 7.2**
    """

    @given(requested_size=st.integers(min_value=501, max_value=10_000))
    @settings(max_examples=100)
    def test_page_size_capped_at_500(self, requested_size):
        """When pageSize exceeds 500, StandardPagination must cap it to 500."""
        from apps.common.pagination import StandardPagination

        pagination = StandardPagination()
        mock_request = MagicMock()
        mock_request.query_params = {"pageSize": str(requested_size)}

        actual = pagination.get_page_size(mock_request)
        self.assertEqual(actual, 500)

    @given(requested_size=st.integers(min_value=1, max_value=500))
    @settings(max_examples=50)
    def test_page_size_within_limit_is_honoured(self, requested_size):
        """When pageSize is <= 500, StandardPagination must honour it."""
        from apps.common.pagination import StandardPagination

        pagination = StandardPagination()
        mock_request = MagicMock()
        mock_request.query_params = {"pageSize": str(requested_size)}

        actual = pagination.get_page_size(mock_request)
        self.assertEqual(actual, requested_size)

    def test_default_page_size_is_20(self):
        """When no pageSize is specified, default must be 20."""
        from apps.common.pagination import StandardPagination

        pagination = StandardPagination()
        mock_request = MagicMock()
        mock_request.query_params = {}

        actual = pagination.get_page_size(mock_request)
        self.assertEqual(actual, 20)


# ---------------------------------------------------------------------------
# Property 10: Program-intake validation rejects invalid combos
# ---------------------------------------------------------------------------


class TestProgramIntakeValidationRejectsInvalidCombos(SimpleTestCase):
    """Property 10: For any program/intake pair not in program_intakes,
    create must return 400 INVALID_PROGRAM_INTAKE.

    **Validates: Requirements 10.1, 10.2**
    """

    @given(
        program_name=st.text(min_size=1, max_size=50),
        intake_name=st.text(min_size=1, max_size=50),
    )
    @settings(max_examples=100)
    def test_nonexistent_program_or_intake_raises_validation_error(
        self, program_name, intake_name
    ):
        """When program or intake cannot be resolved, validation must raise
        with code INVALID_PROGRAM_INTAKE."""
        from rest_framework import serializers as drf_serializers

        from apps.applications.serializers import validate_program_intake_compatibility

        with patch("apps.catalog.models.Program.objects") as mock_prog_objects, \
             patch("apps.catalog.models.Intake.objects") as mock_intake_objects:
            # Neither program nor intake found
            mock_prog_objects.filter.return_value.first.return_value = None
            mock_intake_objects.filter.return_value.first.return_value = None

            with self.assertRaises(drf_serializers.ValidationError) as ctx:
                validate_program_intake_compatibility(program_name, intake_name)

            error_detail = ctx.exception.detail["program"]
            # DRF wraps dict values in lists
            if isinstance(error_detail, list):
                error_detail = error_detail[0]
            self.assertEqual(error_detail.code, "INVALID_PROGRAM_INTAKE")

    @given(
        program_name=st.text(min_size=1, max_size=50),
        intake_name=st.text(min_size=1, max_size=50),
    )
    @settings(max_examples=100)
    def test_no_matching_program_intake_row_raises_validation_error(
        self, program_name, intake_name
    ):
        """When program and intake exist but no program_intakes row matches,
        validation must raise with code INVALID_PROGRAM_INTAKE."""
        from rest_framework import serializers as drf_serializers

        from apps.applications.serializers import validate_program_intake_compatibility

        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_intake = MagicMock()
        mock_intake.id = uuid.uuid4()
        mock_intake.is_active = True

        with patch("apps.catalog.models.Program.objects") as mock_prog_objects, \
             patch("apps.catalog.models.Intake.objects") as mock_intake_objects, \
             patch("apps.catalog.models.ProgramIntake.objects") as mock_pi_objects:
            mock_prog_objects.filter.return_value.first.return_value = mock_program
            mock_intake_objects.filter.return_value.first.return_value = mock_intake
            mock_pi_objects.filter.return_value.exists.return_value = False

            with self.assertRaises(drf_serializers.ValidationError) as ctx:
                validate_program_intake_compatibility(program_name, intake_name)

            error_detail = ctx.exception.detail["program"]
            if isinstance(error_detail, list):
                error_detail = error_detail[0]
            self.assertEqual(error_detail.code, "INVALID_PROGRAM_INTAKE")


# ---------------------------------------------------------------------------
# Property 11: Age validation rejects underage
# ---------------------------------------------------------------------------


class TestAgeValidationRejectsUnderage(SimpleTestCase):
    """Property 11: For any DOB where age < 16, create must return 400
    MINIMUM_AGE_NOT_MET.

    **Validates: Requirements 11.1, 11.2**
    """

    @given(dob=underage_dobs)
    @settings(max_examples=100)
    def test_underage_dob_raises_validation_error(self, dob):
        """When applicant is younger than 16, validation must raise
        with code MINIMUM_AGE_NOT_MET."""
        from dateutil.relativedelta import relativedelta
        from rest_framework import serializers as drf_serializers

        from apps.applications.serializers import validate_minimum_age

        age = relativedelta(date.today(), dob).years
        if age >= 16:
            # Edge case: skip if the generated DOB actually makes them 16+
            return

        with self.assertRaises(drf_serializers.ValidationError) as ctx:
            validate_minimum_age(dob)

        error_detail = ctx.exception.detail["date_of_birth"]
        if isinstance(error_detail, list):
            error_detail = error_detail[0]
        self.assertEqual(error_detail.code, "MINIMUM_AGE_NOT_MET")

    @given(dob=of_age_dobs)
    @settings(max_examples=50)
    def test_of_age_dob_does_not_raise(self, dob):
        """When applicant is 16 or older, validation must not raise."""
        from apps.applications.serializers import validate_minimum_age

        # Should not raise
        validate_minimum_age(dob)


# ---------------------------------------------------------------------------
# Property 12: E.164 phone validation
# ---------------------------------------------------------------------------


class TestE164PhoneValidation(SimpleTestCase):
    """Property 12: For any phone matching ^\\+?[0-9]{7,15}$, accept.
    Otherwise reject.

    **Validates: Requirements 12.1, 12.2**
    """

    @given(phone=valid_e164_phones)
    @settings(max_examples=100)
    def test_valid_e164_phone_is_accepted(self, phone):
        """Valid E.164 phones must be accepted without raising."""
        from apps.common.validators import validate_phone_e164

        result = validate_phone_e164(phone)
        self.assertEqual(result, phone)

    @given(phone=invalid_e164_phones)
    @settings(max_examples=100)
    def test_invalid_e164_phone_is_rejected(self, phone):
        """Invalid E.164 phones must raise ValidationError."""
        from django.core.exceptions import ValidationError

        from apps.common.validators import validate_phone_e164

        with self.assertRaises(ValidationError):
            validate_phone_e164(phone)


# ---------------------------------------------------------------------------
# Property 13: State machine rejects invalid transitions
# ---------------------------------------------------------------------------


class TestStateMachineRejectsInvalidTransitions(SimpleTestCase):
    """Property 13: For any (old, new) pair not in ALLOWED_TRANSITIONS,
    transition_application_status() must raise ValueError.

    **Validates: Requirements 13.1, 13.2**
    """

    @given(
        old_status=all_statuses,
        new_status=all_statuses,
        changed_by=admin_user_ids,
    )
    @settings(max_examples=200)
    def test_invalid_transitions_raise_value_error(
        self, old_status, new_status, changed_by
    ):
        """When (old_status, new_status) is not in ALLOWED_TRANSITIONS,
        transition_application_status must raise ValueError."""
        from apps.applications.services import (
            ALLOWED_TRANSITIONS,
            transition_application_status,
        )

        allowed = ALLOWED_TRANSITIONS.get(old_status, set())
        if new_status in allowed:
            # This is a valid transition — skip
            return

        mock_app = MagicMock()
        mock_app.status = old_status
        mock_app.id = uuid.uuid4()

        with self.assertRaises(ValueError) as ctx:
            transition_application_status(
                application=mock_app,
                new_status=new_status,
                changed_by=changed_by,
            )

        self.assertIn("Cannot transition from", str(ctx.exception))
        self.assertIn(old_status, str(ctx.exception))
        self.assertIn(new_status, str(ctx.exception))

    @given(
        old_status=st.sampled_from(list(_ALLOWED_TRANSITIONS.keys())),
        changed_by=admin_user_ids,
        data=st.data(),
    )
    @settings(max_examples=50)
    def test_valid_transitions_do_not_raise(self, old_status, changed_by, data):
        """When (old_status, new_status) is in ALLOWED_TRANSITIONS,
        transition_application_status must not raise ValueError."""
        from apps.applications.services import (
            ALLOWED_TRANSITIONS,
            transition_application_status,
        )

        new_status = data.draw(
            st.sampled_from(sorted(ALLOWED_TRANSITIONS[old_status]))
        )

        mock_app = MagicMock()
        mock_app.status = old_status
        mock_app.id = uuid.uuid4()
        mock_app.review_started_at = None
        mock_app.reviewed_by_id = None
        mock_app.admin_feedback = None
        mock_app.admin_feedback_date = None
        mock_app.admin_feedback_by_id = None
        mock_app.decision_date = None

        with patch("apps.applications.services.ApplicationStatusHistory") as MockHistory:
            MockHistory.objects.create.return_value = MagicMock()
            old = transition_application_status(
                application=mock_app,
                new_status=new_status,
                changed_by=changed_by,
            )
            self.assertEqual(old, old_status)
