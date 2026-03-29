"""Standard pagination — stub for project scaffold.

Full implementation in task 6.3.
"""

from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Standard pagination with page/pageSize/totalCount fields.

    Stub — uses DRF defaults until fully implemented.
    """

    page_size = 20
    page_size_query_param = "pageSize"
    max_page_size = 100
