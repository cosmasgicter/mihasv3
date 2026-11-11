"""Local-database rule for seed and bootstrap commands (platform-simplification task 6.6).

A command of the Documented_Local_Stack may write only to a Local_Database: its
``DATABASE_URL`` host is ``localhost``, ``127.0.0.1``, ``::1`` or ``postgres`` (the
Postgres service name in every compose file), and the settings are not production.
The settings test matters because the production web container also reaches its
database as ``postgres``. Requirement 1.5.

This is an allowlist. The denylist it replaces (four substrings in
``harness_seed_tenants``) let any other remote host through.
"""
from __future__ import annotations

import os
from urllib.parse import urlsplit

from django.core.management.base import CommandError

LOCAL_DATABASE_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "postgres"})


def _is_production_settings(environ) -> bool:
    return (
        environ.get("DJANGO_SETTINGS_MODULE", "").endswith(".prod")
        or environ.get("ENVIRONMENT", "").lower() == "production"
    )


def require_local_database(command_name: str, environ=None) -> None:
    """Raise ``CommandError`` (exit status 2) unless the database is a Local_Database.

    Messages name the command and the variable, never the URL: a connection string
    can carry a password.
    """
    environ = os.environ if environ is None else environ
    if _is_production_settings(environ):
        raise CommandError(
            f"{command_name} refuses to run under production settings.", returncode=2
        )
    url = environ.get("DATABASE_URL", "")
    try:
        host = urlsplit(url).hostname
    except ValueError:
        host = None
    if host not in LOCAL_DATABASE_HOSTS:
        raise CommandError(
            f"{command_name} refuses to run: DATABASE_URL points at a non-local host "
            "(allowed hosts: localhost, 127.0.0.1, ::1, postgres).",
            returncode=2,
        )
