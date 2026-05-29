"""Persistence guards for jobs-ops scaffold endpoints.

The jobs-ops domain models are ``managed = False`` and their tables are not
yet provisioned in every environment (see ``docs/canonical-truth-map.md`` and
the ``.kiro/specs/jobs-ops-orm-db-drift`` spec). These helpers let endpoints
use the ORM when the tables exist and degrade gracefully — returning ``None``
or skipping the write — when they do not, so a missing relation never surfaces
as an unhandled ``ProgrammingError`` (HTTP 500).

When the backing tables are later provisioned with real data, the same call
sites transparently use the ORM instance and persist; no further change is
required. Logging stays at ``debug`` and never emits PII or secrets.
"""

from __future__ import annotations

import logging

from django.db import OperationalError, ProgrammingError

from apps.jobs.models import JobMatchScore, JobPosting

logger = logging.getLogger(__name__)


def resolve_job_posting(job_id):
    """Return the ``JobPosting`` instance, or ``None`` when row/table is absent.

    Catches the not-yet-provisioned table case (``ProgrammingError`` /
    ``OperationalError``) and the not-found case (``DoesNotExist``) uniformly
    so callers can fall back to seed data. Never raises.
    """
    try:
        return JobPosting.objects.select_related("company", "source").get(id=job_id)
    except (ProgrammingError, OperationalError):
        logger.debug("jobs_postings table unavailable; degrading to seed path")
        return None
    except JobPosting.DoesNotExist:
        return None


def persist_match_score_safe(*, job_posting, candidate, defaults) -> bool:
    """Best-effort ``JobMatchScore`` upsert. ``True`` on write, ``False`` if skipped.

    Skips silently when the ``jobs_match_scores`` table is absent so AI scoring
    still returns a result to the operator. Never raises.
    """
    try:
        JobMatchScore.objects.update_or_create(
            job_posting=job_posting,
            candidate=candidate,
            defaults=defaults,
        )
        return True
    except (ProgrammingError, OperationalError):
        logger.debug("jobs_match_scores table unavailable; skipping persistence")
        return False
