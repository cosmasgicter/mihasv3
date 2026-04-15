from django.core.management.base import BaseCommand

from apps.catalog.tasks import intake_manager_task


class Command(BaseCommand):
    help = "Run the intake manager task synchronously"

    def handle(self, *args, **options):
        intake_manager_task.apply()
        self.stdout.write(self.style.SUCCESS("intake_manager_task completed"))
