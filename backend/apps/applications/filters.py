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
