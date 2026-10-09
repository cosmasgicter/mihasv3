"""The tenant-context catalog view.

``GET /api/v1/catalog/context/`` — resolve shared-Beanola vs white-label portal
context from the request host, through the fail-closed
:class:`~apps.catalog.services.InstitutionContextService`. Split out of
``views.py`` by task 12.1; the view is the one that was there, lifted verbatim.
"""

from __future__ import annotations

from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.catalog._catalog_view_helpers import (
    _resolve_request_context,
    _set_public_cache,
)

class CatalogContextView(APIView):
    """GET /api/v1/catalog/context/ - resolve shared vs white-label portal context."""

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]

    @extend_schema(
        operation_id="catalog_context",
        tags=["catalog"],
        auth=[],
        responses={200: OpenApiResponse(response=OpenApiTypes.OBJECT)},
    )
    def get(self, request):
        context = _resolve_request_context(request)
        institution = context.institution
        response = Response({
            "success": True,
            "data": {
                "portal_type": context.portal_type,
                "institution_id": str(institution.id) if institution else None,
                "institution_code": institution.code if institution else None,
                "brand": context.brand,
            },
        })
        return _set_public_cache(response)
