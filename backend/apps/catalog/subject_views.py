"""The subject catalog view.

``GET /api/v1/catalog/subjects/`` — the **only** source of selectable subject
identities (R11.5, finding STU-11), serving active canonical rows plus the
versioned alias catalogue (R11.4). Split out of ``views.py`` by task 12.1; the
view is the one that was there, lifted verbatim.
"""

from __future__ import annotations

from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.catalog._catalog_view_helpers import (
    SubjectListResponseSerializer,
    _cached_catalog_payload,
    _set_public_cache,
)
from apps.catalog.serializers import SubjectSerializer
from apps.catalog.subject_catalog import (
    SUBJECT_CATALOG_VERSION,
    active_subjects_queryset,
    aliases_by_code,
)

@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_subjects_list",
        tags=["catalog"],
        auth=[],
        responses={200: OpenApiResponse(response=SubjectListResponseSerializer)},
    )
)
class SubjectListView(APIView):
    """GET /api/v1/catalog/subjects/ - list subjects (public)

    R11.5 (admissions-v2 task 7.1, finding STU-11): this endpoint is the **only**
    source of selectable subject identities. It serves active canonical rows
    only — a deactivated subject can still be referenced by an old grade, but
    server readiness never counts it, so offering it would be a trap — and it
    publishes the versioned alias catalogue (R11.4) alongside each subject so no
    client has to keep its own subject or alias table.
    """

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = SubjectSerializer

    def get(self, request):
        # Catalog read cache (R4.1, R4.2, R4.5–R4.7): subjects are global catalog
        # data; the body is computed under the scoped key and reused within TTL.
        def compute():
            queryset = active_subjects_queryset()
            serializer = SubjectSerializer(
                queryset, many=True, context={"alias_map": aliases_by_code()}
            )
            return {
                "success": True,
                "data": serializer.data,
                "meta": {"subject_catalog_version": SUBJECT_CATALOG_VERSION},
            }

        body = _cached_catalog_payload(request, "subjects", compute)
        response = Response(body)
        _set_public_cache(response)
        return response
