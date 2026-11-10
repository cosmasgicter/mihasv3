#!/usr/bin/env python3
"""Self-test for scripts/capability_inventory.py (platform-simplification task 8.1).

Standard library only; runs with `python3 scripts/tests/test_capability_inventory.py` or pytest.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import capability_inventory as ci  # noqa: E402

SERVICES_SNIPPET = '''
class AdminCapabilityService:
    PLATFORM_CAPABILITIES: frozenset[str] = frozenset({"platform.a.manage"})
    TENANT_CAPABILITIES: frozenset[str] = frozenset({"tenant.x.read", "tenant.y.read", "tenant.z.change"})
    _DEFAULT_TENANT_READ_CAPABILITIES: frozenset[str] = frozenset({"tenant.x.read", "tenant.y.read"})
    _GRANTED_MUTATION_CAPABILITIES: dict[str, frozenset[str]] = {
        "view": frozenset(),
        "manage": frozenset({"tenant.z.change"}),
    }
'''


class Catalogue(unittest.TestCase):
    def test_reads_catalogue_and_grant_tables_without_importing_django(self):
        cat = ci.read_catalogue(SERVICES_SNIPPET)
        self.assertEqual(cat["platform"], ["platform.a.manage"])
        self.assertEqual(cat["tenant"], ["tenant.x.read", "tenant.y.read", "tenant.z.change"])
        self.assertEqual(cat["granted"]["manage"], {"tenant.z.change"})

    def test_grant_signature_groups_capabilities_obtained_the_same_way(self):
        cat = ci.read_catalogue(SERVICES_SNIPPET)
        self.assertEqual(ci.grant_signature("tenant.x.read", cat), ci.grant_signature("tenant.y.read", cat))
        self.assertNotEqual(ci.grant_signature("tenant.x.read", cat), ci.grant_signature("tenant.z.change", cat))
        self.assertEqual(ci.grant_signature("platform.a.manage", cat), "role:super_admin")

    def test_catalogue_lines_are_excluded_from_enforcement_sites(self):
        skip = ci.catalogue_lines(SERVICES_SNIPPET)
        self.assertIn(3, skip)
        self.assertIsNone(ci.classify_hit(ci.SERVICES, 3, skip))
        self.assertEqual(ci.classify_hit(ci.SERVICES, 400, skip), "backend")


class Classification(unittest.TestCase):
    def test_sites_are_classified_by_location(self):
        self.assertEqual(ci.classify_hit("backend/apps/x/views.py", 1, set()), "backend")
        self.assertEqual(ci.classify_hit("backend/tests/unit/test_x.py", 1, set()), "tests")
        self.assertEqual(ci.classify_hit("apps/admissions/src/a.tsx", 1, set()), "frontend")
        self.assertEqual(ci.classify_hit("apps/admissions/tests/unit/a.test.ts", 1, set()), "tests")
        self.assertIsNone(ci.classify_hit("apps/admissions/src/generated/api.d.ts", 1, set()))
        self.assertIsNone(ci.classify_hit("docs/canonical-truth-map.md", 1, set()))


class MergeCandidates(unittest.TestCase):
    def rec(self, signature, backend=(), frontend=()):
        return {"granted_by": signature, "backend": list(backend), "frontend": list(frontend), "tests": [], "update_set": []}

    def test_pair_told_apart_by_a_gate_is_not_a_candidate(self):
        records = {
            "tenant.a.read": self.rec("s", backend=["x.py:1"]),
            "tenant.b.read": self.rec("s", backend=["y.py:2"]),
        }
        self.assertEqual(ci.merge_candidates(records), [])

    def test_pair_always_granted_together_with_no_distinguishing_site_is_a_candidate(self):
        records = {
            "tenant.a.read": self.rec("s", backend=["x.py:1"]),
            "tenant.b.read": self.rec("s", backend=["x.py:1"]),
        }
        pairs = ci.merge_candidates(records)
        self.assertEqual([c["pair"] for c in pairs], [["tenant.a.read", "tenant.b.read"]])

    def test_different_grant_signatures_never_merge(self):
        records = {
            "tenant.a.read": self.rec("s1", backend=["x.py:1"]),
            "tenant.b.read": self.rec("s2", backend=["x.py:1"]),
        }
        self.assertEqual(ci.merge_candidates(records), [])


class RealRepository(unittest.TestCase):
    def test_current_catalogue_has_17_and_17_and_create_global_has_no_enforcement_site(self):
        data = ci.build()
        caps = data["capabilities"]
        self.assertEqual(sum(c.startswith("platform.") for c in caps), 17)
        self.assertEqual(sum(c.startswith("tenant.") for c in caps), 17)
        create_global = caps["platform.user.create_global"]
        self.assertEqual(create_global["backend"], [])
        self.assertEqual(create_global["frontend"], [])


if __name__ == "__main__":
    unittest.main()
