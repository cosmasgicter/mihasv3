"""Standard pagination with page/pageSize/totalCount fields.

Implements task 6.3.
Requirements: 10.5
"""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardPagination(PageNumberPagination):
    """Page-number pagination returning page, pageSize, totalCount, results."""

    page_size = 20
    page_size_query_param = "pageSize"
    max_page_size = 500
    page_query_param = "page"

    def get_paginated_response(self, data):
        return Response(
            {
                "page": self.page.number,
                "pageSize": self.get_page_size(self.request),
                "totalCount": self.page.paginator.count,
                "results": data,
            }
        )
