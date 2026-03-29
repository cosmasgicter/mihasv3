"""Primary ASGI entrypoint for the MIHAS Django API."""
import os

from django.core.asgi import get_asgi_application

# ASGI is the production entrypoint for Koyeb. Default to prod so a missing
# env var never silently exposes the development settings module.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

application = get_asgi_application()
