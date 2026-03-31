"""Integration Celery task stubs."""

from celery import shared_task


@shared_task(name="integrations.send_telegram_alert_scaffold")
def send_telegram_alert_scaffold(message="scaffold alert"):
    return {
        "status": "queued",
        "message": message,
        "provider": "telegram",
    }

