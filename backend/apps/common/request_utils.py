"""Shared HTTP request utilities."""

from django.conf import settings


def get_client_ip(request) -> str:
    """Return the real client IP, accounting for trusted proxies.

    Uses settings.NUM_PROXIES (default 1) to determine how many entries to trust
    from the right of X-Forwarded-For. The leftmost entries are attacker-controlled.
    """
    num_proxies = getattr(settings, "NUM_PROXIES", 1)
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for and num_proxies > 0:
        ips = [ip.strip() for ip in forwarded_for.split(",") if ip.strip()]
        if len(ips) >= num_proxies:
            return ips[-num_proxies]
    return request.META.get("REMOTE_ADDR", "")
