# backend/apps/analytics/admissions_analytics.py

from django.db.models import Avg, Count, F, Q
from apps.applications.models import Application
from apps.documents.models import Payment


class AdmissionsAnalyticsService:
    """Computes live admissions metrics from Application and Payment data."""

    def funnel_metrics(self, filters: dict) -> dict:
        qs = Application.objects.all()
        qs = self._apply_filters(qs, filters)

        counts = qs.aggregate(
            drafts=Count("id", filter=Q(status="draft")),
            submitted=Count("id", filter=Q(status="submitted")),
            under_review=Count("id", filter=Q(status="under_review")),
            conditionally_approved=Count("id", filter=Q(status="conditionally_approved")),
            approved=Count("id", filter=Q(status="approved")),
            rejected=Count("id", filter=Q(status="rejected")),
            waitlisted=Count("id", filter=Q(status="waitlisted")),
            enrolled=Count("id", filter=Q(status="enrolled")),
            withdrawn=Count("id", filter=Q(status="withdrawn")),
            expired=Count("id", filter=Q(status="expired")),
            enrollment_expired=Count("id", filter=Q(status="enrollment_expired")),
        )

        total = sum(counts.values())
        submitted_plus = (
            counts["submitted"] + counts["under_review"]
            + counts["conditionally_approved"] + counts["approved"]
            + counts["rejected"] + counts["waitlisted"]
            + counts["enrolled"] + counts["withdrawn"]
            + counts["enrollment_expired"]
        )
        accepted_plus = (
            counts["conditionally_approved"]
            + counts["approved"]
            + counts["enrolled"]
        )

        return {
            **counts,
            "total": total,
            "draft_to_submission_rate": round(submitted_plus / total * 100, 1) if total else 0,
            "submission_to_approval_rate": round(accepted_plus / submitted_plus * 100, 1) if submitted_plus else 0,
        }

    def timing_metrics(self, filters: dict) -> dict:
        qs = Application.objects.exclude(submitted_at=None)
        qs = self._apply_filters(qs, filters)
        raw = qs.aggregate(
            avg_draft_to_submit_days=Avg(F("submitted_at") - F("created_at")),
            avg_submit_to_review_days=Avg(F("review_started_at") - F("submitted_at")),
            avg_review_to_decision_days=Avg(F("decision_date") - F("review_started_at")),
        )
        # Convert timedelta values to float days for JSON serialization
        return {
            k: (v.total_seconds() / 86400 if v is not None else None)
            for k, v in raw.items()
        }

    def payment_metrics(self, filters: dict) -> dict:
        qs = Payment.objects.all()
        if filters.get("start_date"):
            qs = qs.filter(created_at__gte=filters["start_date"])
        if filters.get("end_date"):
            qs = qs.filter(created_at__lte=filters["end_date"])
        return qs.aggregate(
            initiated=Count("id"),
            successful=Count("id", filter=Q(status="successful")),
            force_approved=Count("id", filter=Q(status="force_approved")),
            failed=Count("id", filter=Q(status="failed")),
            pending=Count("id", filter=Q(status="pending")),
            deferred=Count("id", filter=Q(status="deferred")),
            expired=Count("id", filter=Q(status="expired")),
        )

    def _apply_filters(self, qs, filters):
        if filters.get("start_date"):
            qs = qs.filter(created_at__gte=filters["start_date"])
        if filters.get("end_date"):
            qs = qs.filter(created_at__lte=filters["end_date"])
        if filters.get("institution"):
            qs = qs.filter(institution__icontains=filters["institution"])
        if filters.get("program"):
            qs = qs.filter(program__icontains=filters["program"])
        return qs
