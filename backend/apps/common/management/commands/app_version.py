"""Print the running backend product version.

Supported *runtime* version-output command for the Beanola Admissions backend.

The backend is a non-package Django application (see backend/pyproject.toml and
backend/DEPLOY.md → "Release model: non-package application"): it is deployed via
requirements.txt and run in place, not installed as a pip distribution. There is
therefore no ``importlib.metadata`` distribution version to read at runtime.
Instead the product version is the drift-guarded ``settings.APP_VERSION``
(default ``2.0.0``), which is also surfaced on every HTTP response via the
``X-Backend-Version`` header and in ``/api/v1/meta/platform/``.

This command is the operator-/CI-facing way to read that version without booting
uvicorn or crafting an HTTP request:

    $ python manage.py app_version
    2.0.0

    $ python manage.py app_version --verbose
    product: Beanola Admissions Platform
    product_version: 2.0.0
    api_version: v1

The command is named ``app_version`` (not ``version``) on purpose: Django's
management utility special-cases the bare ``version`` subcommand to print the
Django framework version, which would shadow a custom command of that name.

Task 1.7 of the ``admissions-v2-canonical-rebuild`` spec (Requirements R2.8,
R17.1; finding REL-02).
"""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand

# The API-major label is intentionally distinct from the product version
# (R2.5). It mirrors the runtime meta endpoint (apps/common/meta_views.py) and
# the drift guard's API_MAJOR_LABEL.
API_MAJOR_LABEL = "v1"
PRODUCT_NAME = "Beanola Admissions Platform"


class Command(BaseCommand):
    help = "Print the running backend product version (settings.APP_VERSION)."

    # A version read must work in any environment (including a minimal/clean
    # release environment), so it does not depend on full system-check
    # readiness (e.g. cache/ratelimit checks). This keeps `manage.py
    # app_version` a reliable release/CI probe.
    requires_system_checks: list = []

    def add_arguments(self, parser):
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Print the product name and API-major label alongside the version.",
        )

    def handle(self, *args, **options):
        # Default fallback matches settings.APP_VERSION's own default so the
        # command never reports an empty version even if APP_VERSION is unset.
        version = getattr(settings, "APP_VERSION", "2.0.0") or "2.0.0"

        if options["verbose"]:
            self.stdout.write(f"product: {PRODUCT_NAME}")
            self.stdout.write(f"product_version: {version}")
            self.stdout.write(f"api_version: {API_MAJOR_LABEL}")
        else:
            # Bare, script-friendly single line so `manage.py app_version` can be
            # asserted directly (release evidence / CI).
            self.stdout.write(version)
