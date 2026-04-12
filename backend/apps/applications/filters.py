"""Application filters using django-filters.

Implements task 13.2.
Requirements: 4.3
"""

import django_filters
from django.db.models import Q

from apps.applications.models import Application


class ApplicationFilter(django_filters.FilterSet):
    """Filter applications by status, payment_status, program, intake, institution, search."""

    status = django_filters.CharFilter(field_name="status", lookup_expr="iexact")
    payment = django_filters.CharFilter(field_name="payment_status", lookup_expr="iexact")
    payment_status = django_filters.CharFilter(field_name="payment_status", lookup_expr="iexact")
    program = django_filters.CharFilter(field_name="program", lookup_expr="icontains")
    intake = django_filters.CharFilter(field_name="intake", lookup_expr="icontains")
    institution = django_filters.CharFilter(field_name="institution", lookup_expr="icontains")
    search = django_filters.CharFilter(method="filter_search")
    sort = django_filters.CharFilter(method="filter_sort")

    # camelCase aliases for frontend compatibility (Bug 4 fix)
    sortBy = django_filters.CharFilter(method="filter_sort_by")
    sortOrder = django_filters.CharFilter(method="filter_sort_by")
    excludeStatus = django_filters.CharFilter(method="filter_exclude_status")
    startDate = django_filters.DateFilter(field_name="created_at", lookup_expr="gte")
    endDate = django_filters.DateFilter(field_name="created_at", lookup_expr="lte")
    paymentStatus = django_filters.CharFilter(field_name="payment_status", lookup_expr="iexact")

    class Meta:
        model = Application
        fields = ["status", "payment", "payment_status", "program", "intake", "institution"]

    def filter_search(self, queryset, name, value):
        """Search by full_name or email (case-insensitive)."""
        if not value:
            return queryset
        return queryset.filter(
            Q(full_name__icontains=value) | Q(email__icontains=value)
        )

    def filter_sort(self, queryset, name, value):
        """Sort by created_at or full_name, ASC or DESC.

        Format: field_name or -field_name (prefix - for DESC).
        """
        allowed_fields = {"created_at", "full_name"}
        if not value:
            return queryset

        desc = value.startswith("-")
        field = value.lstrip("-")

        if field not in allowed_fields:
            return queryset

        order = f"-{field}" if desc else field
        return queryset.order_by(order)

    def filter_sort_by(self, queryset, name, value):
        """Handle camelCase sortBy/sortOrder params from the frontend.

        Maps sortBy values (date, name, status) to model fields and combines
        with sortOrder (asc/desc) to produce the correct ordering.
        """
        sort_by = self.data.get("sortBy", "")
        sort_order = self.data.get("sortOrder", "desc")

        if not sort_by:
            return queryset

        field_map = {
            "date": "created_at",
            "name": "full_name",
            "status": "status",
            "created_at": "created_at",
            "full_name": "full_name",
        }

        field = field_map.get(sort_by)
        if not field:
            return queryset

        prefix = "-" if sort_order.lower() == "desc" else ""
        return queryset.order_by(f"{prefix}{field}")

    def filter_exclude_status(self, queryset, name, value):
        """Exclude applications with the given status."""
        if not value:
            return queryset
        return queryset.exclude(status__iexact=value)
