"""Property-based test — no cross-tenant cache serve (Property 2).

# Feature: system-performance-hardening, Property 2

Spec: ``.kiro/specs/system-performance-hardening`` (task 15.1). Pins the
cross-cache tenant-isolation invariant from the design's Testing Strategy and
the "Shared Cache Abstraction Layer" section:

    Property 2 — No cross-tenant cache serve
    No cache introduced by this feature (Dashboard_Cache, Catalog_Cache,
    Capability_Cache) ever serves one tenant's data to another. The cross-tenant
    guard is the scope signature embedded in the key
    (``spc:<namespace>:<version>:<scope_signature>[:<sub_key>]``):
    ``cached_or_compute(namespace, scope_signature, ...)`` only serves an entry
    whose key matches the requester's recomputed signature; any mismatch is a
    miss that recomputes (R2.7, R4.5, R13.3, R13.4).

The three feature caches ("dash", "cat", "cap") are thin callers of the single
``cached_or_compute`` mechanism, so exercising that mechanism — parametrised by
namespace — with distinct opaque scope signatures directly proves the
no-cross-serve invariant for all three caches uniformly.

Unit-level against Django's LocMemCache (the default test cache); no live DB is
required because ``cached_or_compute`` accepts the scope signature as an opaque
string (exactly what tenant A vs tenant B reduce to once
``build_scope_signature`` has run).

Run (≥100 examples, SQLite-in-memory test settings)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      python3 -m pytest tests/property/test_perf_cache_tenant_isolation.py -q

**Validates: Requirements 2.7, 4.5, 13.3, 13.4**
"""

from __future__ import annotations

from unittest.mock import patch

from django.core.cache import cache
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.common.scoped_cache import build_scope_signature, cached_or_compute

# The three flag-gated caches introduced by this feature. Each is a thin caller
# of ``cached_or_compute`` with its own namespace; the cross-tenant guard lives
# entirely in the namespaced+scope-signed key, so iterating the namespace proves
# isolation for Dashboard_Cache, Catalog_Cache, and Capability_Cache uniformly.
NAMESPACES = ("dash", "cat", "cap")

# ≥100 examples per the design's Testing Strategy minimum. Deadline relaxed
# because each example clears the process-wide cache.
HYPOTHESIS_SETTINGS = settings(max_examples=200, deadline=None)


# --- Strategies -------------------------------------------------------------

# Opaque scope signatures. In production these are 32-char SHA-256 hex digests;
# here any stable non-empty string stands in for "tenant A's resolved scope".
_signature = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    min_size=1,
    max_size=40,
)

# Two DISTINCT signatures (tenant A vs tenant B). The ``filter`` keeps them
# different after the builder's internal normalisation (strip ":" + length
# bound), which the alphabet above already respects.
distinct_signatures = st.tuples(_signature, _signature).filter(
    lambda pair: pair[0] != pair[1]
)

# Optional extra key dimension (e.g. an intake id) — isolation must hold with or
# without it. Both signatures in an example use the same sub_key so any leak
# would surface rather than be hidden by a differing sub_key.
sub_keys = st.one_of(st.none(), _signature)

# Non-empty payloads so ``cached_or_compute`` actually stores them
# (never-cache-empty). A scalar marker plus a structured body covers both shapes
# the real caches return (capability payload dict / catalog list).
ttls = st.integers(min_value=30, max_value=600)


def _payload(tag: str):
    """A distinct, non-empty payload tagged with its owning tenant."""
    return {"owner": tag, "rows": [f"{tag}-row-{i}" for i in range(3)]}


# --- Property 2 — no cross-tenant cache serve -------------------------------


class TestNoCrossTenantCacheServe:
    """Property 2 — no cache serves one tenant's data to another.

    **Validates: Requirements 2.7, 4.5, 13.3, 13.4**
    """

    @HYPOTHESIS_SETTINGS
    @given(
        namespace=st.sampled_from(NAMESPACES),
        sigs=distinct_signatures,
        sub_key=sub_keys,
        ttl=ttls,
    )
    def test_distinct_scope_never_receives_other_scope_entry(
        self, namespace, sigs, sub_key, ttl
    ):
        """Tenant B never receives tenant A's cached entry, and A still hits.

        store(A) -> read(B) recomputes B's distinct payload (never A's) ->
        read(A) returns A's original value (hit). The scope signature embedded
        in the key is the cross-tenant guard: B's key never matches A's entry,
        so B misses and recomputes scoped to itself (R2.7, R4.5, R13.3, R13.4).
        """
        # Reset between hypothesis examples (the autouse conftest fixture only
        # clears once per test function, not per generated example).
        cache.clear()

        sig_a, sig_b = sigs
        payload_a = _payload("A")
        payload_b = _payload("B")

        a_calls = [0]
        b_calls = [0]

        def compute_a():
            a_calls[0] += 1
            return payload_a

        def compute_b():
            b_calls[0] += 1
            return payload_b

        # 1. Store tenant A's value under signature A.
        stored_a = cached_or_compute(
            namespace, sig_a, compute_a, ttl=ttl, sub_key=sub_key, enabled=True
        )
        assert stored_a == payload_a
        assert a_calls[0] == 1

        # 2. Read under signature B: must MISS A's entry and recompute B's own
        #    payload — B never receives A's data.
        served_b = cached_or_compute(
            namespace, sig_b, compute_b, ttl=ttl, sub_key=sub_key, enabled=True
        )
        assert served_b == payload_b, "tenant B must receive its own payload"
        assert served_b != payload_a, "tenant B must never receive tenant A's data"
        assert b_calls[0] == 1, "B's signature must miss and recompute, not hit A"

        # 3. Read again under signature A: A's own entry is still intact (hit) —
        #    B's write did not overwrite or poison A's scoped entry.
        served_a = cached_or_compute(
            namespace, sig_a, compute_a, ttl=ttl, sub_key=sub_key, enabled=True
        )
        assert served_a == payload_a, "tenant A must still receive its own payload"
        assert a_calls[0] == 1, "A's second read must be a hit (no recompute)"

    @HYPOTHESIS_SETTINGS
    @given(sigs=distinct_signatures, sub_key=sub_keys, ttl=ttls)
    def test_isolation_holds_across_all_three_namespaces_simultaneously(
        self, sigs, sub_key, ttl
    ):
        """Same two signatures across dash/cat/cap never bleed between caches.

        Storing under every namespace with signature A and then reading every
        namespace with signature B proves the namespace + scope signature guard
        isolates entries both across tenants AND across the three caches at once
        (a missing namespace segment or a shared key would surface here).
        """
        cache.clear()

        sig_a, sig_b = sigs

        # Store an A-owned payload in every cache namespace.
        for namespace in NAMESPACES:
            stored = cached_or_compute(
                namespace,
                sig_a,
                lambda ns=namespace: _payload(f"A-{ns}"),
                ttl=ttl,
                sub_key=sub_key,
                enabled=True,
            )
            assert stored == _payload(f"A-{namespace}")

        # Every read under signature B recomputes that namespace's own B payload
        # and never returns the A-owned entry of any namespace.
        for namespace in NAMESPACES:
            b_calls = [0]

            def compute_b(ns=namespace):
                b_calls[0] += 1
                return _payload(f"B-{ns}")

            served = cached_or_compute(
                namespace, sig_b, compute_b, ttl=ttl, sub_key=sub_key, enabled=True
            )
            assert served == _payload(f"B-{namespace}")
            assert b_calls[0] == 1, f"{namespace}: B must miss and recompute"
            # Not any A-owned payload, from this or a sibling namespace.
            for other in NAMESPACES:
                assert served != _payload(f"A-{other}"), (
                    f"{namespace} served A-owned data from {other}"
                )


# --- Cross-reference to Property 1 (kept light, file stays focused) ---------


class _FakeCapabilities:
    def __init__(self, role, is_super_admin, all_access):
        self.role = role
        self.is_super_admin = is_super_admin
        self.all_access = all_access


class _FakeQuerySet:
    def __init__(self, ids):
        self._ids = list(ids)

    def values_list(self, *_fields, flat=False):  # noqa: D401 - mimic ORM API
        return list(self._ids)


class _FakeService:
    def __init__(self, capabilities, institution_ids):
        self._capabilities = capabilities
        self._institution_ids = institution_ids

    def get_capabilities(self, _user):
        return self._capabilities

    def visible_institution_queryset(self, _user):
        return _FakeQuerySet(self._institution_ids)


class _FakeUser:
    def __init__(self, pk):
        self.pk = pk
        self.id = pk


def _resolved_signature(user_id, role, is_super_admin, all_access, institution_ids):
    """Run the real ``build_scope_signature`` with the service stubbed."""
    service = _FakeService(
        _FakeCapabilities(role, is_super_admin, all_access), institution_ids
    )
    with patch("apps.catalog.services.AdminCapabilityService", return_value=service):
        return build_scope_signature(_FakeUser(user_id))


class TestDistinctTenantsResolveToDistinctSignatures:
    """Two genuinely different resolved tenant scopes produce different
    ``build_scope_signature`` outputs, so they occupy different cache keys and
    cannot cross-serve (cross-reference Property 1).

    **Validates: Requirements 2.7, 4.5, 13.3, 13.4**
    """

    @HYPOTHESIS_SETTINGS
    @given(
        user_a=st.integers(min_value=1, max_value=20),
        user_b=st.integers(min_value=1, max_value=20),
        ids_a=st.lists(st.integers(min_value=1, max_value=9), max_size=4),
        ids_b=st.lists(st.integers(min_value=1, max_value=9), max_size=4),
    )
    def test_different_tenant_scopes_yield_different_signatures(
        self, user_a, user_b, ids_a, ids_b
    ):
        """Two scoped tenant-admins with a differing in-scope institution set
        (or differing user id) never share a scope signature."""
        sig_a = _resolved_signature(
            user_a, "admin", False, False, ids_a
        )
        sig_b = _resolved_signature(
            user_b, "admin", False, False, ids_b
        )

        same_scope = (str(user_a), sorted(str(i) for i in ids_a)) == (
            str(user_b),
            sorted(str(i) for i in ids_b),
        )
        if same_scope:
            assert sig_a == sig_b
        else:
            assert sig_a != sig_b
