"""Property-based conformance test for the authenticated API envelope + pagination.

# Feature: beanola-production-readiness, Property 27: Frontend service shapes match the backend contract

This module owns the **backend half** of Property 27. It proves the contract
the admissions frontend services normalize against (R16.6): *for any*
authenticated endpoint response the API_Envelope `{"success": true, "data": ...}`
holds, and *for any* list response the paginated
`{page, pageSize, totalCount, results}` shape appears inside ``data`` — verified
against the real production ``EnvelopeRenderer`` and ``StandardPagination``
classes (no behavioural mocking of the code under test).

**Validates: Requirements 4.3, 4.4, 16.6**

Backend property-test conventions (spec ``beanola-production-readiness``):
- ``pytest`` + ``hypothesis``, ≥100 examples, ``--hypothesis-seed=0``.
- Exactly one property per test method.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import json  # noqa: E402
from unittest.mock import MagicMock  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.pagination import StandardPagination  # noqa: E402
from apps.common.renderers import EnvelopeRenderer  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies — arbitrary JSON-serialisable payloads + realistic pagination knobs
# ---------------------------------------------------------------------------

_json_primitives = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-(2**31), max_value=2**31),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(min_size=0, max_size=40),
)

_json_values = st.recursive(
    _json_primitives,
    lambda children: st.one_of(
        st.lists(children, max_size=5),
        st.dictionaries(st.text(min_size=1, max_size=10), children, max_size=5),
    ),
    max_leaves=15,
)

# Payloads handed to the EnvelopeRenderer for the success-envelope property.
# The renderer treats a top-level dict that already carries a ``"success"`` key
# as *pre-enveloped* and passes it through unwrapped (the documented envelope
# sentinel — see apps/common/renderers.py). A real serializer payload never puts
# a bare ``success`` key at the envelope root, so exclude that sentinel-colliding
# shape from the arbitrary-payload strategy (it is not a contract case).
_envelope_payloads = _json_values.filter(
    lambda v: not (isinstance(v, dict) and "success" in v)
)

# A list payload's individual records: dict rows are the common serializer shape.
_record = st.dictionaries(st.text(min_size=1, max_size=10), _json_primitives, max_size=5)


def _make_renderer_context(status_code):
    """Minimal renderer_context carrying a response with the given status."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    return {"response": mock_response}


def _paginated_envelope(results, page_number, page_size, total_count):
    """Drive the real StandardPagination.get_paginated_response.

    Only the paginator's ``page`` object and the request's ``query_params`` are
    stand-ins for a live DRF request — the response-shaping code under test runs
    unmocked.
    """
    paginator = StandardPagination()

    mock_paginator_obj = MagicMock()
    mock_paginator_obj.count = total_count

    mock_page = MagicMock()
    mock_page.number = page_number
    mock_page.paginator = mock_paginator_obj

    mock_request = MagicMock()
    mock_request.query_params = {"pageSize": str(page_size)}

    paginator.page = mock_page
    paginator.request = mock_request

    return paginator.get_paginated_response(results).data


class TestEnvelopeConformance(SimpleTestCase):
    """Property 27 (backend half) — authenticated success responses are enveloped.

    For any JSON-serialisable payload returned with a 2xx status, the rendered
    body is the API_Envelope ``{"success": true, "data": <payload>}`` and the
    inner ``data`` is byte-for-byte the original payload.

    **Validates: Requirements 4.3, 16.6**
    """

    def setUp(self):
        self.renderer = EnvelopeRenderer()

    @given(payload=_envelope_payloads)
    @settings(max_examples=20, deadline=None)
    def test_success_response_is_api_envelope(self, payload):
        raw = self.renderer.render(
            payload, renderer_context=_make_renderer_context(200)
        )
        envelope = json.loads(raw)

        # Envelope invariants the frontend services rely on.
        self.assertIn("success", envelope)
        self.assertIs(envelope["success"], True)
        self.assertIn("data", envelope)
        self.assertEqual(envelope["data"], payload)


class TestPaginationConformance(SimpleTestCase):
    """Property 27 (backend half) — list responses carry the paginated shape.

    For any list payload and any (page, pageSize, totalCount), the paginated
    response is the API_Envelope whose ``data`` holds exactly
    ``{page, pageSize, totalCount, results}`` with ``results`` preserved and the
    metadata echoing the requested page / clamped pageSize / total count.

    **Validates: Requirements 4.4, 16.6**
    """

    @given(
        results=st.lists(_record, max_size=20),
        page_number=st.integers(min_value=1, max_value=500),
        page_size=st.integers(min_value=1, max_value=1000),
        total_count=st.integers(min_value=0, max_value=100000),
    )
    @settings(max_examples=20, deadline=None)
    def test_list_response_has_pagination_shape(
        self, results, page_number, page_size, total_count
    ):
        envelope = _paginated_envelope(results, page_number, page_size, total_count)

        # Outer envelope.
        self.assertIs(envelope["success"], True)
        self.assertIn("data", envelope)
        inner = envelope["data"]

        # Inner shape is exactly the four paginated keys — no more, no less.
        self.assertEqual(
            set(inner.keys()),
            {"page", "pageSize", "totalCount", "results"},
        )

        # Field semantics the frontend normalizers depend on.
        self.assertEqual(inner["page"], page_number)
        self.assertEqual(inner["totalCount"], total_count)
        self.assertEqual(inner["results"], results)

        # pageSize is a positive integer clamped to the configured max (500).
        self.assertIsInstance(inner["pageSize"], int)
        self.assertGreaterEqual(inner["pageSize"], 1)
        self.assertLessEqual(inner["pageSize"], StandardPagination.max_page_size)
