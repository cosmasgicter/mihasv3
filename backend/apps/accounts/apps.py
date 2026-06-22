from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    verbose_name = "Accounts"

    def ready(self):
        # Register capability-cache invalidation signals (R5.4–5.6). The
        # handlers are no-ops unless PERF_CACHE_CAPABILITIES is enabled.
        from . import signals  # noqa: F401
