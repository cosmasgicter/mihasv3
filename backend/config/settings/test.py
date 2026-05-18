"""Fast local test settings with an isolated SQLite database.

Use this for the broad logic suite when a local Postgres service is not
available. Postgres-specific schema-drift checks still need a real Postgres
database before release.
"""

from .dev import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "test.sqlite3",  # noqa: F405
    }
}
