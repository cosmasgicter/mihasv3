"""Shared HTTP request utilities."""
from __future__ import annotations

import ipaddress
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

_UNUSABLE_REMOTE = "0.0.0.0"
_warned_unusable_remote = False


def _parse_ip(value):
    try:
        return ipaddress.ip_address(str(value).strip())
    except ValueError:
        return None


def _trusted_networks():
    """Return the trusted proxy networks (settings hold parsed networks or strings)."""
    networks = []
    for entry in getattr(settings, "TRUSTED_PROXY_CIDRS", ()) or ():
        if isinstance(entry, (ipaddress.IPv4Network, ipaddress.IPv6Network)):
            networks.append(entry)
            continue
        try:
            networks.append(ipaddress.ip_network(str(entry).strip(), strict=False))
        except ValueError:
            continue
    return networks


def _is_trusted(address, networks) -> bool:
    return any(address.version == net.version and address in net for net in networks)


def get_client_ip(request) -> str:
    """Return the real client IP, trusting ``X-Forwarded-For`` only from a trusted proxy.

    1. ``REMOTE_ADDR`` is the peer. If it is missing the result is ``0.0.0.0``;
       if it is present but not an IP it is returned unchanged and never
       trusted (one WARNING per process either way, no value logged).
    2. If ``NUM_PROXIES`` is not positive, or the peer is not inside
       ``TRUSTED_PROXY_CIDRS``, the peer is returned and the header is ignored.
    3. Otherwise ``X-Forwarded-For`` is walked from the right for at most
       ``NUM_PROXIES`` hops. A malformed hop stops the walk at the last good
       address; the first hop that is not a trusted proxy is returned; if the
       hops run out the last address reached is returned.
    """
    global _warned_unusable_remote
    raw_remote = str(request.META.get("REMOTE_ADDR", "") or "").strip()
    remote = _parse_ip(raw_remote)
    if remote is None:
        if not _warned_unusable_remote:
            _warned_unusable_remote = True
            logger.warning("client_ip.remote_addr_unusable")
        # Missing: a fixed placeholder. Present but unparsable: returned as is
        # and never trusted, exactly as before (the audit and rate-limit
        # callers hash or key on the string; ``test_middleware_properties``
        # pins that an arbitrary REMOTE_ADDR string is hashed verbatim).
        return raw_remote or _UNUSABLE_REMOTE

    num_proxies = getattr(settings, "NUM_PROXIES", 1)
    networks = _trusted_networks()
    if num_proxies <= 0 or not _is_trusted(remote, networks):
        return str(remote)

    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    hops = [part.strip() for part in forwarded_for.split(",") if part.strip()]
    current = remote
    for raw in reversed(hops[-num_proxies:]):
        hop = _parse_ip(raw)
        if hop is None:
            break
        current = hop
        if not _is_trusted(hop, networks):
            break
    return str(current)
