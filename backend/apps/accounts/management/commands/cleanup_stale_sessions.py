"""Deactivate stale legacy device sessions.

Usage:
    python manage.py cleanup_stale_sessions
    python manage.py cleanup_stale_sessions --user-id <uuid>
"""

from django.core.management.base import BaseCommand

from apps.accounts.session_lifecycle import deactivate_stale_sessions


class Command(BaseCommand):
    help = "Deactivate stale device_sessions rows that should no longer appear as active."

    def add_arguments(self, parser):
        parser.add_argument(
            "--user-id",
            dest="user_id",
            default=None,
            help="Optional profile UUID to scope the cleanup to one user.",
        )

    def handle(self, *args, **options):
        user_id = options.get("user_id")
        deactivated = deactivate_stale_sessions(user_id=user_id)
        scope = f" for user {user_id}" if user_id else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"Stale session cleanup complete: {deactivated} session(s) deactivated{scope}."
            )
        )
