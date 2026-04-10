# backend/apps/applications/review_queue.py

from dataclasses import dataclass
from datetime import date
from django.utils import timezone


@dataclass(frozen=True)
class ReviewPriority:
    score: float             # 0-100
    classification: str      # "ready_for_decision", "waiting_for_student", "high_risk_review"


class ReviewQueueScorer:
    """Computes deterministic priority scores for review queue ordering."""

    def score(self, application, completeness_score: int, has_doc_warnings: bool) -> ReviewPriority:
        # Completeness (30%)
        c_score = min(completeness_score, 100) * 0.3

        # Deadline urgency (25%)
        d_score = self._deadline_urgency(application) * 0.25

        # Payment readiness (20%)
        p_score = (100 if application.payment_status in ("verified", "paid", "force_approved") else 0) * 0.2

        # Document confidence (15%)
        doc_score = (50 if has_doc_warnings else 100) * 0.15

        # Time in status (10%)
        t_score = self._time_score(application) * 0.1

        total = c_score + d_score + p_score + doc_score + t_score

        # Classification
        if completeness_score >= 90 and application.payment_status in ("verified", "paid", "force_approved"):
            classification = "ready_for_decision"
        elif has_doc_warnings:
            classification = "high_risk_review"
        else:
            classification = "waiting_for_student"

        return ReviewPriority(round(total, 1), classification)

    def _deadline_urgency(self, application) -> float:
        from apps.catalog.models import Intake
        intake = Intake.objects.filter(name=application.intake).first()
        if not intake or not intake.application_deadline:
            return 50
        days_left = (intake.application_deadline - date.today()).days
        if days_left <= 0:
            return 100
        if days_left <= 7:
            return 80
        return 50

    def _time_score(self, application) -> float:
        if not application.review_started_at:
            if application.submitted_at:
                days = (timezone.now() - application.submitted_at).days
                return min(100, days * 10)
        return 50
