from django.core.management.base import BaseCommand
import sentry_sdk


class Command(BaseCommand):
    help = 'Send a test error to GlitchTip to verify the integration'

    def handle(self, *args, **options):
        try:
            1 / 0
        except ZeroDivisionError:
            sentry_sdk.capture_exception()
            self.stdout.write(self.style.SUCCESS('Test error sent to GlitchTip. Check your dashboard.'))
