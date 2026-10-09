"""V2 pagination conforming to the canonical envelope.

Returns:

    {
      "success": true,
      "data": {
        "page": 1,
        "page_size": 20,
        "total_count": 42,
        "results": [...]
      },
      "meta": {
        "request_id": "uuid",
        "api_version": "v2"
      }
    }

Design: ``design.md`` §14.1
Requirement: R14.1
Task: 1.3
"""

from __future__ import annotations

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.common.v2.envelope import API_VERSION


class V2Pagination(PageNumberPagination):
    """Page-number pagination returning the V2 envelope shape."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 500
    page_query_param = "page"

    def get_paginated_response(self, data):
        request = self.request
        request_id = getattr(request, "request_id", None) if request else None

        return Response(
            {
                "success": True,
                "data": {
                    "page": self.page.number,
                    "page_size": self.get_page_size(self.request),
                    "total_count": self.page.paginator.count,
                    "results": data,
                },
                "meta": {
                    "request_id": request_id,
                    "api_version": API_VERSION,
                },
            }
        )

    def get_paginated_response_schema(self, schema):
        """OpenAPI schema for the V2 paginated response."""
        return {
            "type": "object",
            "required": ["success", "data", "meta"],
            "properties": {
                "success": {"type": "boolean", "example": True},
                "data": {
                    "type": "object",
                    "required": ["page", "page_size", "total_count", "results"],
                    "properties": {
                        "page": {"type": "integer", "example": 1},
                        "page_size": {"type": "integer", "example": 20},
                        "total_count": {"type": "integer", "example": 42},
                        "results": schema,
                    },
                },
                "meta": {
                    "type": "object",
                    "required": ["request_id", "api_version"],
                    "properties": {
                        "request_id": {
                            "type": "string",
                            "format": "uuid",
                            "nullable": True,
                        },
                        "api_version": {"type": "string", "example": "v2"},
                    },
                },
            },
        }
