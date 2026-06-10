"""Document_Fingerprint determinism + input-sensitivity property test (task 7.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase 3 (Official-document
consolidation), Requirement 6 (Official Document Current-Version and Fingerprint
Lifecycle).

This file implements exactly one property (Property 16) against the pure helper
``_compute_document_fingerprint`` that lands in task 7.2 (in
``backend/apps/applications/tasks/pdf_generation.py``). It is **test-first**: the
helper does not exist yet, so this property is expected to FAIL (or error on
import of the not-yet-implemented symbol) until 7.2 is implemented. The helper is
imported lazily inside the test so the module still *collects* cleanly.

Property 16 pins the contract for the fingerprint inputs enumerated in
design.md §3b / R6.1:

    application id, document type, application status + updated_at, institution
    id, template/profile id + version, logo asset id + checksum, signature asset
    id + checksum, and (receipts only) payment id + receipt number.

The helper signature defined by the design is::

    _compute_document_fingerprint(application, document_type, tenant, template,
                                  logo_asset, signature_asset, payment)

where ``tenant`` is the ``_tenant_context`` dict (``tenant["institution_id"]``),
``template`` is the ``_render_template`` dict (``template["template_id"]`` /
``template["template_version"]``), the asset args are ``InstitutionAsset``-like
objects (``.id`` + ``.checksum_sha256``) or ``None``, and ``payment`` is a
``Payment``-like object (``.id`` + ``.receipt_number``) or ``None``.

Because the helper is pure, this property runs without the database.

**Validates: Requirements 6.1, 6.5, 6.6**
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from hypothesis import given, settings
from hypothesis import strategies as st

# The two document types for which payment id + receipt number participate in
# the fingerprint (R6.1 "payment/receipt identifiers for receipts"). For every
# other document type the payment inputs are ignored entirely.
_RECEIPT_TYPES = {"payment_receipt", "finance_receipt"}

_DOCUMENT_TYPES = [
    "application_slip",
    "acceptance_letter",
    "conditional_offer",
    "payment_receipt",
    "finance_receipt",
]

# Deliberately small per-field value pools so that randomly-drawn input pairs
# collide on *all* fields often enough to exercise the equality branch of the
# iff, while the product space stays astronomically larger than the
# ≥100-example floor. Every pool carries ≥2 distinct values (plus ``None`` where
# the real input is nullable) so each field is independently varied.
_APP_ID_POOL = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
]
_STATUS_POOL = ["draft", "submitted", "approved"]
# Distinct *dates* (not just times) so no plausible serialisation collapses them.
_UPDATED_AT_POOL = [
    datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc),
    datetime(2026, 6, 8, 17, 30, tzinfo=timezone.utc),
]
_INSTITUTION_ID_POOL = [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
]
_TEMPLATE_ID_POOL = [None, "tpl-1111", "tpl-2222"]
_TEMPLATE_VERSION_POOL = [None, 1, 2]
# ``None`` models "no active asset configured"; the tuples are (asset_id,
# checksum_sha256). A version bump or asset swap surfaces here as a changed
# id+checksum pair (R6.6).
_ASSET_POOL = [
    None,
    ("logo-or-sig-1", "checksum-1"),
    ("logo-or-sig-2", "checksum-2"),
]
_PAYMENT_ID_POOL = [None, "pay-1111", "pay-2222"]
_RECEIPT_NUMBER_POOL = [None, "RCPT-0001", "RCPT-0002"]


# A single drawn fingerprint-input spec. Kept as a plain dict so both the helper
# call and the reference "effective key" can read identical values.
_spec_strategy = st.fixed_dictionaries(
    {
        "app_id": st.sampled_from(_APP_ID_POOL),
        "document_type": st.sampled_from(_DOCUMENT_TYPES),
        "status": st.sampled_from(_STATUS_POOL),
        "updated_at": st.sampled_from(_UPDATED_AT_POOL),
        "institution_id": st.sampled_from(_INSTITUTION_ID_POOL),
        "template_id": st.sampled_from(_TEMPLATE_ID_POOL),
        "template_version": st.sampled_from(_TEMPLATE_VERSION_POOL),
        "logo": st.sampled_from(_ASSET_POOL),
        "signature": st.sampled_from(_ASSET_POOL),
        "payment_id": st.sampled_from(_PAYMENT_ID_POOL),
        "receipt_number": st.sampled_from(_RECEIPT_NUMBER_POOL),
    }
)


def _asset_obj(asset: tuple[str, str] | None):
    """An ``InstitutionAsset``-like stand-in (or ``None``) for a fingerprint input."""
    if asset is None:
        return None
    asset_id, checksum = asset
    return SimpleNamespace(id=asset_id, checksum_sha256=checksum)


def _compute(spec: dict[str, Any]) -> str:
    """Call the (task-7.2) pure helper for one drawn spec.

    Imported lazily so this module collects cleanly before 7.2 exists; the
    property itself fails/errors until the helper is implemented (test-first).
    """
    from apps.applications.tasks.pdf_generation import _compute_document_fingerprint

    application = SimpleNamespace(
        id=spec["app_id"],
        status=spec["status"],
        updated_at=spec["updated_at"],
    )
    tenant = {"institution_id": spec["institution_id"]}
    template = {
        "template_id": spec["template_id"],
        "template_version": spec["template_version"],
    }
    payment = None
    if spec["payment_id"] is not None or spec["receipt_number"] is not None:
        payment = SimpleNamespace(
            id=spec["payment_id"], receipt_number=spec["receipt_number"]
        )
    return _compute_document_fingerprint(
        application,
        spec["document_type"],
        tenant,
        template,
        _asset_obj(spec["logo"]),
        _asset_obj(spec["signature"]),
        payment,
    )


def _effective_key(spec: dict[str, Any]) -> tuple:
    """The canonical set of inputs the fingerprint must depend on.

    Mirrors R6.1 exactly: every listed input participates, and the payment
    identifiers participate *only* for receipt document types. Two specs share
    an effective key iff a correct fingerprint must treat them as identical.
    """
    base = (
        spec["app_id"],
        spec["document_type"],
        spec["status"],
        spec["updated_at"],
        spec["institution_id"],
        spec["template_id"],
        spec["template_version"],
        spec["logo"],
        spec["signature"],
    )
    if spec["document_type"] in _RECEIPT_TYPES:
        return base + (spec["payment_id"], spec["receipt_number"])
    # Non-receipt documents ignore the payment inputs entirely (R6.1).
    return base


# ≥100 examples; success is pinned to ``--hypothesis-seed=0`` via the CLI flag.
# Pure helper, no DB — only the deadline is relaxed so an occasional slow draw
# (e.g. first import of the task module) does not flake the run.
_FINGERPRINT_PROPERTY_SETTINGS = settings(max_examples=25, deadline=None)


# Feature: multi-tenant-beanola-remediation, Property 16: Document_Fingerprint is a deterministic, input-sensitive function
class TestDocumentFingerprintProperty:
    """Property 16: Document_Fingerprint is a deterministic, input-sensitive function.

    For any two generation inputs, the computed Document_Fingerprint is equal if
    and only if all fingerprint inputs (application id, document type,
    application status/updated_at, institution id, template/profile id+version,
    logo/signature asset id+checksum, and payment/receipt identifiers for
    receipts) are equal; changing any one input changes the fingerprint.

    **Validates: Requirements 6.1, 6.5, 6.6**
    """

    @_FINGERPRINT_PROPERTY_SETTINGS
    @given(spec_a=_spec_strategy, spec_b=_spec_strategy)
    def test_fingerprint_equal_iff_inputs_equal(self, spec_a, spec_b):
        fp_a = _compute(spec_a)
        fp_b = _compute(spec_b)

        # Determinism: recomputing from identical inputs yields the identical,
        # non-empty fingerprint (R6.1 "deterministic").
        assert isinstance(fp_a, str) and fp_a, fp_a
        assert _compute(spec_a) == fp_a

        # Input-sensitivity (the iff): the fingerprints match exactly when — and
        # only when — the canonical fingerprint inputs match. The forward
        # direction proves "changing any one input changes the fingerprint"
        # (incl. a template-version bump R6.5 and a logo/signature asset change
        # R6.6); the reverse proves determinism across equal inputs.
        assert (fp_a == fp_b) == (_effective_key(spec_a) == _effective_key(spec_b)), {
            "fp_a": fp_a,
            "fp_b": fp_b,
            "key_a": _effective_key(spec_a),
            "key_b": _effective_key(spec_b),
        }
