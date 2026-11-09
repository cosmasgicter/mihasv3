"""Drift guard: backend MSISDN handling against the shared vectors.

Spec: student-journey-repair task 3.27, clause 2.42 (design R8-b). The fixture
is the same file ``zambianMsisdnVectors.test.ts`` reads, so the backend and
frontend normalisers and registration pre-checks cannot drift.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from django.core.exceptions import ValidationError

from apps.common.validators import normalize_zambian_msisdn, validate_zambian_phone
from apps.documents.payment_helpers import _normalize_phone_e164

_FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "apps"
    / "admissions"
    / "tests"
    / "unit"
    / "__fixtures__"
    / "zambianMsisdnVectors.json"
)
VECTORS = json.loads(_FIXTURE.read_text(encoding="utf-8"))


@pytest.mark.parametrize("vector", VECTORS["normalise"], ids=lambda v: repr(v["input"]))
def test_normaliser_matches_shared_vectors(vector):
    if vector["expected"] is None:
        with pytest.raises(ValueError, match="INVALID_PHONE_FORMAT"):
            normalize_zambian_msisdn(vector["input"])
    else:
        assert normalize_zambian_msisdn(vector["input"]) == vector["expected"]


def test_payment_alias_is_the_same_function():
    assert _normalize_phone_e164 is normalize_zambian_msisdn


@pytest.mark.parametrize("value", VECTORS["registrationRefused"], ids=repr)
def test_registration_refuses_the_refused_list(value):
    with pytest.raises(ValidationError) as excinfo:
        validate_zambian_phone(value)
    assert value.strip() == "" or value not in " ".join(excinfo.value.messages)


@pytest.mark.parametrize("vector", VECTORS["registrationAccepted"], ids=lambda v: v["input"])
def test_registration_accepts_and_normalises(vector):
    assert validate_zambian_phone(vector["input"]) == vector["expected"]
