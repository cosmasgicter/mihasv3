from django.apps import AppConfig


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"
    verbose_name = "Common"

    def ready(self):
        # Register drf-spectacular extensions at startup.
        from . import openapi  # noqa: F401

        # Verify critical security configuration at startup.
        self._check_jwt_signing_key()
        self._check_required_env_vars()

    @staticmethod
    def _check_required_env_vars():
        """Refuse to start when a required variable is missing (prod and staging).

        Runs here, after the final settings module is loaded, so it sees
        ``REQUIRED_ENV_VARS``. Names only are reported, never values.
        """
        from django.conf import settings

        if not getattr(settings, "STARTUP_ENV_VALIDATION", False):
            return
        if getattr(settings, "IS_TEST_PROCESS", False):
            return
        from .env_validator import validate_required_env_vars

        validate_required_env_vars(settings.REQUIRED_ENV_VARS)

    @staticmethod
    def _check_jwt_signing_key():
        """Raise ImproperlyConfigured if JWT_SIGNING_KEY is empty in non-DEBUG mode."""
        import os

        from django.conf import settings
        from django.core.exceptions import ImproperlyConfigured

        if os.environ.get("TESTING") == "1":
            return

        jwt_settings = getattr(settings, "SIMPLE_JWT", {})
        signing_key = jwt_settings.get("SIGNING_KEY", "")

        if not signing_key and not settings.DEBUG:
            raise ImproperlyConfigured(
                "SIMPLE_JWT['SIGNING_KEY'] (JWT_SIGNING_KEY env var) must be set "
                "in non-DEBUG mode. The API cannot authenticate requests without it."
            )
