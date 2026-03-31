"""Jobs Celery task stubs."""

from celery import shared_task


@shared_task(name="jobs.run_discovery_scaffold")
def run_discovery_scaffold(source_key="all"):
    return {
        "status": "queued",
        "source_key": source_key,
        "message": "Replace with adapter-backed discovery implementation.",
    }


@shared_task(name="jobs.score_job_scaffold")
def score_job_scaffold(job_id):
    return {
        "status": "queued",
        "job_id": job_id,
        "message": "Replace with explainable job scoring implementation.",
    }

