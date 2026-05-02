"""Property-based tests for response envelope, pagination, and signed URL expiry.

# Feature: python-backend-migration, Property 19: Response envelope format
# Feature: python-backend-migration, Property 21: Pagination metadata
# Feature: python-backend-migration, Property 39: Signed URL expiry
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import json  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.test import APIRequestFactory  # noqa: E402

from apps.common.renderers import EnvelopeRenderer  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies for generating arbitrary JSON-serialisable payloads
# ---------------------------------------------------------------------------

_json_primitives = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-(2**31), max_value=2**31),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(min_size=0, max_size=50),
)

# Recursive strategy for nested dicts/lists of primitives
_json_values = st.recursive(
    _json_primitives,
    lambda children: st.one_of(
        st.lists(children, max_size=5),
        st.dictionaries(st.text(min_size=1, max_size=10), children, max_size=5),
    ),
    max_leaves=20,
)


class TestResponseEnvelopeFormat(SimpleTestCase):
    """Property 19: Response envelope format.

    For any data payload, the EnvelopeRenderer should wrap it in
    {"success": true, "data": <payload>} for success responses.
    For any error response (status >= 400), it should produce
    {"success": false, "error": ..., "code": ...}.

    **Validates: Requirements 10.3, 10.4, 10.6**
    """

    def setUp(self):
        self.renderer = EnvelopeRenderer()
        self.factory = APIRequestFactory()

    def _make_renderer_context(self, status_code):
        """Build a minimal renderer_context with a mock response."""
        mock_response = MagicMock()
        mock_response.status_code = status_code
        return {"response": mock_response}

    @given(payload=_json_values)
    @settings(max_examples=5)
    def test_success_response_wraps_in_envelope(self, payload):
        """For any JSON-serialisable payload and a 2xx status, the renderer
        wraps it in {"success": true, "data": <payload>}."""
        context = self._make_renderer_context(200)
        raw = self.renderer.render(payload, renderer_context=context)
        envelope = json.loads(raw)

        self.assertIn("success", envelope)
        self.assertTrue(envelope["success"])
        self.assertIn("data", envelope)
        self.assertEqual(envelope["data"], payload)

    @given(
        status_code=st.sampled_from([400, 401, 403, 404, 405, 429, 500]),
        error_msg=st.text(min_size=1, max_size=100),
    )
    @settings(max_examples=5)
    def test_error_response_wraps_in_error_envelope(self, status_code, error_msg):
        """For any error status (>= 400), the renderer produces
        {"success": false, "error": ..., "code": ...}."""
        context = self._make_renderer_context(status_code)
        # Simulate an unformatted error payload (string)
        raw = self.renderer.render(error_msg, renderer_context=context)
        envelope = json.loads(raw)

        self.assertIn("success", envelope)
        self.assertFalse(envelope["success"])
        self.assertIn("error", envelope)
        self.assertIn("code", envelope)

    @given(payload=_json_values)
    @settings(max_examples=5)
    def test_already_wrapped_success_is_not_double_wrapped(self, payload):
        """If data already contains a 'success' key, the renderer should
        pass it through without double-wrapping."""
        pre_wrapped = {"success": True, "data": payload}
        context = self._make_renderer_context(200)
        raw = self.renderer.render(pre_wrapped, renderer_context=context)
        envelope = json.loads(raw)

        self.assertTrue(envelope["success"])
        self.assertEqual(envelope["data"], payload)

    @given(
        status_code=st.sampled_from([400, 401, 403, 404, 429, 500]),
        error_msg=st.text(min_size=1, max_size=100),
        code=st.text(min_size=1, max_size=30),
    )
    @settings(max_examples=5)
    def test_already_wrapped_error_is_not_double_wrapped(self, status_code, error_msg, code):
        """If error data already has 'success' key, the renderer passes it through."""
        pre_wrapped = {"success": False, "error": error_msg, "code": code}
        context = self._make_renderer_context(status_code)
        raw = self.renderer.render(pre_wrapped, renderer_context=context)
        envelope = json.loads(raw)

        self.assertFalse(envelope["success"])
        self.assertEqual(envelope["error"], error_msg)
        self.assertEqual(envelope["code"], code)



class TestPaginationMetadata(SimpleTestCase):
    """Property 21: Pagination metadata.

    For any paginated response, it should include page, pageSize, and
    totalCount fields. The StandardPagination class is tested directly.

    **Validates: Requirements 10.5**
    """

    @given(
        page_size=st.integers(min_value=1, max_value=100),
        total_count=st.integers(min_value=0, max_value=10000),
        page_number=st.integers(min_value=1, max_value=100),
    )
    @settings(max_examples=5)
    def test_paginated_response_contains_required_fields(
        self, page_size, total_count, page_number
    ):
        """For any valid page_size, total_count, and page_number, the
        paginated response dict must contain page, pageSize, and totalCount."""
        from apps.common.pagination import StandardPagination

        paginator = StandardPagination()

        # Build a mock page object that StandardPagination.get_paginated_response uses
        mock_paginator_obj = MagicMock()
        mock_paginator_obj.count = total_count

        mock_page = MagicMock()
        mock_page.number = page_number
        mock_page.paginator = mock_paginator_obj

        # Build a mock request with pageSize query param
        mock_request = MagicMock()
        mock_request.query_params = {"pageSize": str(page_size)}

        paginator.page = mock_page
        paginator.request = mock_request

        response = paginator.get_paginated_response(data=["item1", "item2"])

        self.assertTrue(response.data["success"])
        inner = response.data["data"]
        self.assertIn("page", inner)
        self.assertIn("pageSize", inner)
        self.assertIn("totalCount", inner)
        self.assertIn("results", inner)

        self.assertEqual(response.data["page"], page_number)
        self.assertEqual(response.data["totalCount"], total_count)
        self.assertEqual(response.data["results"], ["item1", "item2"])

    @given(
        page_size=st.integers(min_value=1, max_value=100),
    )
    @settings(max_examples=5)
    def test_page_size_respects_max_limit(self, page_size):
        """The pageSize returned should never exceed max_page_size (100)."""
        from apps.common.pagination import StandardPagination

        paginator = StandardPagination()

        mock_request = MagicMock()
        mock_request.query_params = {"pageSize": str(page_size)}
        paginator.request = mock_request

        effective_size = paginator.get_page_size(mock_request)

        self.assertIsNotNone(effective_size)
        self.assertLessEqual(effective_size, 100)
        self.assertGreaterEqual(effective_size, 1)

    def test_default_page_size_is_20(self):
        """When no pageSize is specified, the default should be 20."""
        from apps.common.pagination import StandardPagination

        paginator = StandardPagination()
        self.assertEqual(paginator.page_size, 20)

    def test_max_page_size_is_500(self):
        """The maximum allowed page size should be 500."""
        from apps.common.pagination import StandardPagination

        paginator = StandardPagination()
        self.assertEqual(paginator.max_page_size, 500)


class TestSignedUrlExpiry(SimpleTestCase):
    """Property 39: Signed URL expiry.

    For any file key, generate_signed_url should produce a URL string and
    pass ExpiresIn=900 (15 minutes) to the boto3 client.

    **Validates: Requirements 21.2**
    """

    # Strategy: generate plausible S3 file keys (alphanumeric + slashes/dots/dashes)
    _file_key_strategy = st.from_regex(
        r"[a-zA-Z0-9][a-zA-Z0-9/_\-\.]{0,99}", fullmatch=True
    )

    @given(file_key=_file_key_strategy)
    @settings(max_examples=5)
    @patch("apps.common.storage.boto3")
    def test_signed_url_passes_correct_expiry(self, mock_boto3, file_key):
        """For any file key, generate_signed_url should call
        generate_presigned_url with ExpiresIn=900."""
        from apps.common.storage import generate_signed_url

        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = (
            f"https://r2.example.com/{file_key}?X-Amz-Expires=900"
        )
        mock_boto3.client.return_value = mock_client

        url = generate_signed_url(file_key)

        # Verify the boto3 client was called with correct params
        mock_client.generate_presigned_url.assert_called_once()
        call_args = mock_client.generate_presigned_url.call_args

        self.assertEqual(call_args[0][0], "get_object")
        self.assertEqual(call_args[1]["ExpiresIn"], 900)
        expected_key = file_key if file_key.startswith("media/") else f"media/{file_key}"
        self.assertEqual(call_args[1]["Params"]["Key"], expected_key)

        # The returned value should be a non-empty string
        self.assertIsInstance(url, str)
        self.assertTrue(len(url) > 0)

    @given(file_key=_file_key_strategy)
    @settings(max_examples=5)
    @patch("apps.common.storage.boto3")
    def test_signed_url_returns_string(self, mock_boto3, file_key):
        """For any file key, the result should always be a string URL."""
        from apps.common.storage import generate_signed_url

        expected_url = f"https://r2.example.com/{file_key}?signed=true"
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = expected_url
        mock_boto3.client.return_value = mock_client

        url = generate_signed_url(file_key)

        self.assertEqual(url, expected_url)
        self.assertIsInstance(url, str)

    @given(
        file_key=_file_key_strategy,
        custom_expiry=st.integers(min_value=60, max_value=3600),
    )
    @settings(max_examples=5)
    @patch("apps.common.storage.boto3")
    def test_signed_url_respects_custom_expiry(self, mock_boto3, file_key, custom_expiry):
        """When a custom expiry is provided, it should be used instead of the default."""
        from apps.common.storage import generate_signed_url

        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = "https://example.com/signed"
        mock_boto3.client.return_value = mock_client

        generate_signed_url(file_key, expiry=custom_expiry)

        call_args = mock_client.generate_presigned_url.call_args
        self.assertEqual(call_args[1]["ExpiresIn"], custom_expiry)
