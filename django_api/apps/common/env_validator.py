"""Startup environment variable validation.

Reads REQUIRED_ENV_VARS from Django settings and verifies each one
exists and is non-empty in os.environ. Raises ImproperlyConfigured
with a descriptive error listing all missing vars if any are absent.
"""

import os

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def validate_required_env_vars() -> None:
    """Validate that all required environment variables are set and non-empty.

    Reads the ``REQUIRED_ENV_VARS`` list from Django settings and checks
    ``os.environ`` for each entry.  If any variable is missing or empty,
    raises ``ImproperlyConfigured`` with a message listing every offending
    variable so the operator can fix them all in one pass.
    """
    required: list[str] = getattr(settings, "REQUIRED_ENV_VARS", [])
    if not required:
        return

    missing: list[str] = [
        var for var in required if not os.environ.get(var, "").strip()
    ]

    if missing:
        formatted = ", ".join(missing)
        raise ImproperlyConfigured(
            f"Missing or empty required environment variable(s): {formatted}. "
            f"The application cannot start without these variables configured."
        )
