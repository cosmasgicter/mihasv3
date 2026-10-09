"""Canonical Admissions V2 API contract primitives.

This package defines the single canonical response/error/validation/pagination/
meta shapes for ``/api/v2/`` endpoints, as specified in
``.kiro/specs/admissions-v2-canonical-rebuild/design.md`` §14.

It exists to close finding **API-01**: V1 error responses alternate between a
bare ``error`` string and nested error objects, and the frontend parser can
render ``[object Object]``. V2 uses exactly one envelope for every response.

Nothing here changes the existing V1 (`/api/v1/`) contract. The V1
``EnvelopeRenderer`` and ``envelope_exception_handler`` remain the default for
``/api/v1/`` endpoints; the V2 primitives are opt-in via ``V2APIView``.

Public surface:

- ``V2_ERROR_CODES`` / ``get_error_code`` / ``register_error_code`` — the central
  error-code registry (code → user-safe message + HTTP status + retryable).
- ``build_success`` / ``build_error`` — envelope builders that always attach the
  ``meta`` block (``request_id`` + ``api_version``).
- ``V2EnvelopeRenderer`` — success renderer wrapping payloads in the envelope.
- ``v2_exception_handler`` — DRF exception handler emitting the V2 error shape.
- ``V2Pagination`` — the single page-based pagination shape.
- ``V2APIView`` — base view wiring the renderer, handler, and helper methods.
- Domain error exceptions (``V2ConflictError``, ``V2VersionConflictError``,
  ``V2ProviderUnavailable``, ``V2ConfigurationUnavailable``,
  ``V2FeeNotConfigured``, ``V2DomainError``).
"""

from apps.common.v2.error_codes import (
    V2_ERROR_CODES,
    V2ErrorCode,
    get_error_code,
    register_error_code,
)
from apps.common.v2.envelope import API_VERSION, build_error, build_success
from apps.common.v2.exceptions import (
    V2ConfigurationUnavailable,
    V2ConflictError,
    V2DomainError,
    V2FeeNotConfigured,
    V2ProviderUnavailable,
    V2VersionConflictError,
    v2_exception_handler,
)
from apps.common.v2.pagination import V2Pagination
from apps.common.v2.renderers import V2EnvelopeRenderer
from apps.common.v2.views import V2APIView

__all__ = [
    "API_VERSION",
    "V2_ERROR_CODES",
    "V2ErrorCode",
    "get_error_code",
    "register_error_code",
    "build_success",
    "build_error",
    "V2EnvelopeRenderer",
    "v2_exception_handler",
    "V2Pagination",
    "V2APIView",
    "V2DomainError",
    "V2ConflictError",
    "V2VersionConflictError",
    "V2ProviderUnavailable",
    "V2ConfigurationUnavailable",
    "V2FeeNotConfigured",
]
