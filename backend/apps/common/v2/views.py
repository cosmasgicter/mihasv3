"""V2 base view wiring the canonical envelope renderer, exception handler, and pagination.

Any endpoint that uses the V2 contract should inherit from ``V2APIView``
instead of raw ``APIView``. This ensures:

- Responses are wrapped in the V2 success envelope with ``meta``.
- Exceptions produce the V2 error envelope (not the V1 flat shape).
- Pagination uses the V2 shape (``page_size``, ``total_count``, snake_case).

Design: ``design.md`` §14.1
Requirement: R14.1, R14.2
Task: 1.3
"""

from __future__ import annotations

from rest_framework.views import APIView

from apps.common.v2.exceptions import v2_exception_handler
from apps.common.v2.pagination import V2Pagination
from apps.common.v2.renderers import V2EnvelopeRenderer


class V2APIView(APIView):
    """Base class for all ``/api/v2/`` views.

    Wires:
    - ``V2EnvelopeRenderer`` as the sole renderer.
    - ``v2_exception_handler`` as the exception handler.
    - ``V2Pagination`` as the default pagination class (for list views).

    Subclasses may add authentication, permission, and throttle classes as
    usual; those are not defaulted here to allow public/anonymous V2 endpoints.
    """

    renderer_classes = [V2EnvelopeRenderer]
    pagination_class = V2Pagination

    def get_exception_handler(self):
        """Use the V2 exception handler instead of the DRF global default."""
        return v2_exception_handler
