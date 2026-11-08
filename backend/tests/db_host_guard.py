"""Pure helper behind the session-scoped test-database host guard.

Spec: student-journey-repair task 2.1 (clause 3.16). Backend tests create and
drop a ``test_*`` database, so they must never be pointed at the Neon default
branch, production, or any managed/public host. ``tests/conftest.py`` calls
``assert_test_database_host_is_local`` before the test database is created.
"""
from __future__ import annotations

import ipaddress

# Substrings that mark a managed or production host, whatever else it resembles.
REFUSED_HOST_MARKERS = ("neon.tech", "amazonaws.com", "beanola.com")


def is_local_test_database_host(host: str | None) -> bool:
    """Return True when ``host`` is safe to create a throwaway test database on.

    Accepted: no host (SQLite file or a local unix socket), ``localhost``,
    loopback addresses, RFC 1918 addresses and dot-free Docker service names.
    Refused: anything containing a managed-host marker, and every other
    dotted name or public address.
    """
    value = (host or "").strip().lower().strip("[]")
    if not value:
        return True
    if any(marker in value for marker in REFUSED_HOST_MARKERS):
        return False
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        # Not an IP literal: only a dot-free service name (or localhost) is local.
        return "." not in value
    return address.is_loopback or (address.version == 4 and address.is_private and not address.is_link_local)


def assert_test_database_host_is_local(databases: dict) -> None:
    """Abort (``RuntimeError``) when any configured database host is not local."""
    for alias, config in databases.items():
        host = config.get("HOST") or ""
        if not is_local_test_database_host(host):
            # The host is reported by alias only: it may embed an environment name.
            raise RuntimeError(
                f"Refusing to run backend tests: database alias {alias!r} points at a "
                "non-local host. Tests create and drop a test database; use a "
                "loopback, private-network or Docker-service host (see "
                "LOCAL-TESTING.md), never Neon or production."
            )
