from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Flush all active sessions by rotating the JWT signing key reminder"

    def handle(self, *args, **options):
        self.stdout.write("To invalidate all sessions, rotate JWT_SIGNING_KEY in production env vars.")
        self.stdout.write("All existing tokens will fail validation immediately.")
        self.stdout.write("Users will need to re-login.")
        self.stdout.write(self.style.WARNING("This is a nuclear option. Use only for security incidents."))
