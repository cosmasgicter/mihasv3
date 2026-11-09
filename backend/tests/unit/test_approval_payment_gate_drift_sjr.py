"""R7 exploration: the frontend Approve gate mirrors the backend payment gate.

Spec: student-journey-repair task 1.7, clause 1.35 (design R7-b).

The server lets staff approve for every status in ``RESOLVED_PAYMENT_STATUSES``
(including ``deferred``); the admin UI disables Approve for ``deferred`` because
it has no named constant for this question. The fix adds
``APPROVAL_PAYMENT_STATUSES`` to ``apps/admissions/src/lib/paymentStatus.ts``;
this drift guard parses that array literal and compares it with the backend.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from apps.documents.payment_constants import RESOLVED_PAYMENT_STATUSES

PAYMENT_STATUS_TS = (
    Path(__file__).resolve().parents[3] / "apps" / "admissions" / "src" / "lib" / "paymentStatus.ts"
)
_ARRAY = re.compile(
    r"export\s+const\s+APPROVAL_PAYMENT_STATUSES\s*=\s*\[(?P<body>[^\]]*)\]", re.DOTALL
)


def test_frontend_approval_statuses_equal_the_backend_resolved_set():
    source = PAYMENT_STATUS_TS.read_text(encoding="utf-8")
    match = _ARRAY.search(source)
    assert match, "APPROVAL_PAYMENT_STATUSES is not exported from paymentStatus.ts"
    frontend = set(re.findall(r"['\"]([a-z_]+)['\"]", match.group("body")))
    assert frontend == set(RESOLVED_PAYMENT_STATUSES)
