"""Automation Celery task stubs."""

from celery import shared_task


@shared_task(name="automation.execute_run_scaffold")
def execute_run_scaffold(run_type="generic"):
    return {
        "status": "queued",
        "run_type": run_type,
        "message": "Replace with orchestration implementation and step persistence.",
    }

