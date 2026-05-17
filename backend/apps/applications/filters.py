"""Application filters using django-filters.

Implements task 13.2.
Requirements: 4.3
"""

from datetime import datetime, time, timedelta

import django_filters
from django.db.models import Q
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.applications.models import Application


def annotate_activity_at(queryset):
    """Annotate applications with the operational recency timestamp."""
    return queryset.annotate(activity_at=Coalesce("submitted_at", "updated_at", "created_at"))


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
    startDate = django_filters.DateFilter(method="filter_start_date")
    endDate = django_filters.DateFilter(method="filter_end_date")
    paymentStatus = django_filters.CharFilter(field_name="payment_status", lookup_expr="iexact")

    # Reviewer assignment filter (Req 11.8)
    assigned_reviewer_id = django_filters.UUIDFilter(field_name="assigned_reviewer_id")
    reviewer_assignment = django_filters.CharFilter(method="filter_reviewer_assignment")
    is_late_submission = django_filters.BooleanFilter(field_name="is_late_submission")
    has_pending_amendments = django_filters.BooleanFilter(method="filter_pending_amendments")
    review_queue = django_filters.BooleanFilter(method="filter_review_queue")
    overdue_review = django_filters.BooleanFilter(method="filter_overdue_review")
    has_pending_documents = django_filters.BooleanFilter(method="filter_pending_documents")
    has_upcoming_interviews = django_filters.BooleanFilter(method="filter_upcoming_interviews")

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

    def filter_reviewer_assignment(self, queryset, name, value):
        """Filter by whether a reviewer is assigned."""
        if value == "assigned":
            return queryset.filter(assigned_reviewer_id__isnull=False)
        if value == "unassigned":
            return queryset.filter(assigned_reviewer_id__isnull=True)
        return queryset

    def filter_pending_amendments(self, queryset, name, value):
        """Filter by existence of pending amendment requests."""
        if value is True:
            return queryset.filter(applicationamendment__status="pending").distinct()
        if value is False:
            return queryset.exclude(applicationamendment__status="pending").distinct()
        return queryset

    def filter_review_queue(self, queryset, name, value):
        if value is True:
            return queryset.filter(status__in=["submitted", "under_review"])
        if value is False:
            return queryset.exclude(status__in=["submitted", "under_review"])
        return queryset

    def filter_overdue_review(self, queryset, name, value):
        if value is None:
            return queryset

        from apps.common.models import Setting

        review_sla_days = 5
        try:
            setting = Setting.objects.filter(key="review_sla_days").first()
            if setting and setting.value is not None:
                review_sla_days = int(setting.value)
        except (TypeError, ValueError):
            review_sla_days = 5

        cutoff = timezone.now() - timedelta(days=review_sla_days)
        overdue_q = Q(status__in=["submitted", "under_review"], submitted_at__lt=cutoff)
        return queryset.filter(overdue_q) if value is True else queryset.exclude(overdue_q)

    def filter_pending_documents(self, queryset, name, value):
        pending_q = Q(applicationdocument__verification_status__isnull=True) | Q(
            applicationdocument__verification_status__in=["", "pending", "uploaded"]
        )
        return queryset.filter(pending_q).distinct() if value is True else queryset.exclude(pending_q).distinct()

    def filter_upcoming_interviews(self, queryset, name, value):
        upcoming_q = Q(
            applicationinterview__scheduled_at__gte=timezone.now(),
            applicationinterview__status__in=["scheduled", "pending"],
        )
        return queryset.filter(upcoming_q).distinct() if value is True else queryset.exclude(upcoming_q).distinct()

    def filter_sort(self, queryset, name, value):
        """Sort by activity date or full_name, ASC or DESC.

        Format: field_name or -field_name (prefix - for DESC).
        """
        allowed_fields = {"date", "activity_at", "created_at", "full_name"}
        if not value:
            return queryset

        desc = value.startswith("-")
        field = value.lstrip("-")

        if field not in allowed_fields:
            return queryset

        if field in {"date", "activity_at", "created_at"}:
            queryset = annotate_activity_at(queryset)
            if desc:
                return queryset.order_by("-activity_at", "-created_at", "-id")
            return queryset.order_by("activity_at", "created_at", "id")

        return queryset.order_by(f"-{field}" if desc else field)

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
            "date": "activity_at",
            "name": "full_name",
            "status": "status",
            "created_at": "activity_at",
            "activity_at": "activity_at",
            "full_name": "full_name",
        }

        field = field_map.get(sort_by)
        if not field:
            return queryset

        if field == "activity_at":
            queryset = annotate_activity_at(queryset)
            if sort_order.lower() == "desc":
                return queryset.order_by("-activity_at", "-created_at", "-id")
            return queryset.order_by("activity_at", "created_at", "id")

        prefix = "-" if sort_order.lower() == "desc" else ""
        return queryset.order_by(f"{prefix}{field}")

    def filter_exclude_status(self, queryset, name, value):
        """Exclude applications with the given status."""
        if not value:
            return queryset
        return queryset.exclude(status__iexact=value)

    def _as_aware_datetime(self, value, boundary_time):
        dt = datetime.combine(value, boundary_time)
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return dt

    def filter_start_date(self, queryset, name, value):
        """Filter created_at from the start of the provided local date."""
        if not value:
            return queryset
        return queryset.filter(created_at__gte=self._as_aware_datetime(value, time.min))

    def filter_end_date(self, queryset, name, value):
        """Filter created_at through the end of the provided local date."""
        if not value:
            return queryset
        return queryset.filter(created_at__lte=self._as_aware_datetime(value, time.max))
