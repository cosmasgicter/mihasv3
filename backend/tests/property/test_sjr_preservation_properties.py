"""Student-journey-repair preservation properties (backend).

Spec: student-journey-repair task 2.2; design "New preservation tests" (a)-(f)
and (h)-(j); Properties 11 and 12; clauses 3.1, 3.2, 3.4, 3.5, 3.6, 3.14, 3.17,
3.18, 3.20.

Each property records behaviour the fixes must not change. They were written
observation-first and pass on the unfixed code (HEAD 4a6c4ef); every task-3
checkpoint re-runs them unchanged. (g) lives in
``test_seed_admins_preservation_sjr.py``.

Storage is replaced at the provider boundary only; the membership and grant
model is measured for real wherever authority is under test. All people, emails,
numbers and documents are fictional.
"""
from __future__ import annotations

import ipaddress
import json
import uuid
from unittest.mock import MagicMock, patch

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import JsonResponse
from django.test import RequestFactory, override_settings
from hypothesis import HealthCheck, example, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.catalog.services import AccessScopeService
from apps.common.middleware import RateLimitMiddleware
from apps.common.request_utils import get_client_ip
from apps.documents.models import ApplicationDocument, DocumentUploadStage
from apps.documents.payment_constants import RESOLVED_PAYMENT_STATUSES
from tests.tenant_fixtures import (
    build_document,
    build_membership,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
)

pytestmark = pytest.mark.django_db(transaction=True)

def _fresh_example() -> None:
    """Reset the shared rate-limit cache between Hypothesis examples.

    ``tests/conftest.py`` clears it per *test*; one property test runs many
    examples, and the coarse IP limiter would otherwise start answering 429.
    """
    cache.clear()


def db_settings(max_examples: int):
    """Hypothesis settings for DB-backed properties (each example builds a world)."""
    return settings(
        max_examples=max_examples,
        deadline=None,
        suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow],
    )


def _client(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
                "token_type": "access",
            }
        )
    )
    return client


def _body(response) -> dict:
    """The response body without the per-request correlation id."""
    body = json.loads(response.content)
    if isinstance(body, dict):
        body.pop("request_id", None)
    return body


@pytest.fixture()
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture()
def object_storage():
    with patch("apps.common.storage.MediaStorage") as storage_cls:
        storage = MagicMock()
        storage.save.side_effect = lambda key, file_obj: key
        storage.url.side_effect = lambda key: f"https://r2.test/{key}"
        storage.delete.return_value = None
        storage_cls.return_value = storage
        yield storage


# ---------------------------------------------------------------------------
# (a) Upload acceptance and rejection codes (clause 3.5)
# ---------------------------------------------------------------------------

ACCEPTED = ("application/pdf", "image/jpeg", "image/png")
# Specific declared types only. Generic (empty, octet-stream) and aliased
# (image/jpg, image/pjpeg, image/x-png) types are what R2-c changes on purpose,
# and so is letter case, because the fix lower-cases the declared value before
# the magic-byte comparison.
SPECIFIC_DECLARED = (
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "text/html",
    "text/plain",
    "application/zip",
)
HEADERS = {
    "pdf": (b"%PDF-1.7\n", "application/pdf"),
    "jpeg": (b"\xff\xd8\xff\xe0\x00\x10JFIF\x00", "image/jpeg"),
    "png": (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png"),
    "gif": (b"GIF89a\x01\x00\x01\x00", "image/gif"),
    "html": (b"<!doctype html><title>x</title>", None),
    "noise": (b"\x00\x01\x02 not a document \x03", None),
}
TENANT_MAX_BYTES = 1024


def _expected_code(document_type, declared, header, active, size_kind):
    """HEAD's upload pipeline, in its order (observed, then written down)."""
    if size_kind == "empty":
        return "EMPTY_FILE"
    if document_type != "result_slip":
        return "DOCUMENT_TYPE_NOT_REQUIRED"
    if size_kind == "oversize":
        return "FILE_TOO_LARGE"
    if declared not in ACCEPTED:
        return "INVALID_FILE_TYPE"
    if HEADERS[header][1] != declared:
        return "INVALID_FILE"
    if active:
        return "UNSAFE_FILE_CONTENT"
    return None


def _payload(header, active, size_kind) -> bytes:
    if size_kind == "empty":
        return b""
    body = HEADERS[header][0] + b" fictional evidence "
    if active:
        body += b"/JavaScript (app.alert(1))"
    body += b"\n%%EOF"
    if size_kind == "oversize":
        body += b"x" * (TENANT_MAX_BYTES + 64)
    return body


@db_settings(40)
@given(
    document_type=st.sampled_from(["result_slip", "unlisted_letter"]),
    declared=st.sampled_from(SPECIFIC_DECLARED),
    header=st.sampled_from(sorted(HEADERS)),
    active=st.booleans(),
    size_kind=st.sampled_from(["normal", "normal", "normal", "empty", "oversize"]),
)
# Every outcome is pinned explicitly; random generation alone rarely reaches 201.
@example(document_type="result_slip", declared="application/pdf", header="pdf", active=False, size_kind="normal")
@example(document_type="result_slip", declared="image/jpeg", header="jpeg", active=False, size_kind="normal")
@example(document_type="result_slip", declared="image/png", header="png", active=False, size_kind="normal")
@example(document_type="result_slip", declared="application/pdf", header="pdf", active=True, size_kind="normal")
@example(document_type="result_slip", declared="application/pdf", header="png", active=False, size_kind="normal")
@example(document_type="result_slip", declared="image/png", header="html", active=False, size_kind="normal")
@example(document_type="result_slip", declared="text/html", header="html", active=True, size_kind="normal")
@example(document_type="result_slip", declared="image/gif", header="gif", active=False, size_kind="normal")
@example(document_type="result_slip", declared="application/pdf", header="pdf", active=False, size_kind="oversize")
@example(document_type="result_slip", declared="application/pdf", header="pdf", active=False, size_kind="empty")
@example(document_type="unlisted_letter", declared="application/pdf", header="pdf", active=False, size_kind="normal")
def test_a_upload_codes_for_specific_declared_types(
    object_storage, document_type, declared, header, active, size_kind
):
    _fresh_example()
    DocumentUploadStage.objects.all().delete()
    world = build_tenant_world(application_status="draft")
    Application.objects.filter(id=world.application.id).update(
        requirements_snapshot=[
            {
                "document_type": "result_slip",
                "label": "Result slip",
                "required": True,
                "rules": {"accepted_mime_types": list(ACCEPTED), "max_size_bytes": TENANT_MAX_BYTES},
            }
        ],
        configuration_version="cfg-sjr-pres-a",
    )

    response = _client(world.student).post(
        "/api/v1/documents/upload/",
        {
            "file": SimpleUploadedFile("evidence.bin", _payload(header, active, size_kind), content_type=declared),
            "application_id": str(world.application.id),
            "document_type": document_type,
        },
        format="multipart",
        HTTP_IDEMPOTENCY_KEY=f"sjr-pres-{uuid.uuid4().hex}",
    )

    expected = _expected_code(document_type, declared, header, active, size_kind)
    if expected is None:
        assert response.status_code == 201, response.content
    else:
        assert response.status_code == 400, response.content
        assert response.json()["code"] == expected, response.content


def test_a_unevaluable_configuration_is_a_retryable_503(object_storage):
    from apps.applications.assignment_resolution import AssignmentConfigurationError

    world = build_tenant_world(application_status="draft")
    with patch(
        "apps.applications.required_documents.resolve_upload_target",
        side_effect=AssignmentConfigurationError(),
    ):
        response = _client(world.student).post(
            "/api/v1/documents/upload/",
            {
                "file": SimpleUploadedFile("slip.pdf", b"%PDF-1.7\nx\n%%EOF", content_type="application/pdf"),
                "application_id": str(world.application.id),
                "document_type": "result_slip",
            },
            format="multipart",
        )

    assert response.status_code == 503, response.content
    assert response.json()["code"] == "CONFIGURATION_UNAVAILABLE"
    assert response.json()["retryable"] is True
    object_storage.save.assert_not_called()


# ---------------------------------------------------------------------------
# (b) A trusted proxy with NUM_PROXIES=1 keeps the rightmost-forwarded rule (3.17)
# ---------------------------------------------------------------------------

TRUSTED_PEERS = st.sampled_from(["127.0.0.1", "10.0.0.7", "172.18.0.5", "192.168.1.9"])
IPV4 = st.integers(min_value=1, max_value=2**32 - 2).map(lambda n: str(ipaddress.IPv4Address(n)))


@settings(max_examples=200)
@given(peer=TRUSTED_PEERS, hops=st.lists(IPV4, min_size=1, max_size=4))
def test_b_trusted_peer_returns_the_rightmost_forwarded_address(peer, hops):
    request = RequestFactory().get(
        "/api/v1/auth/session/", REMOTE_ADDR=peer, HTTP_X_FORWARDED_FOR=", ".join(hops)
    )
    with override_settings(NUM_PROXIES=1):
        assert get_client_ip(request) == hops[-1]


# ---------------------------------------------------------------------------
# (c) Out-of-scope document ids answer one masked 404 on every surface (3.1, 3.2)
# ---------------------------------------------------------------------------

SURFACES = [
    ("get", "signed-url/"),
    ("get", "download/"),
    ("get", "info/"),
    ("post", "extract/"),
    ("delete", "delete/"),
]


def _hit(client, method, document_id, suffix):
    path = f"/api/v1/documents/{document_id}/{suffix}"
    if method == "get":
        return client.get(path)
    if method == "post":
        return client.post(path, {}, format="json")
    return client.delete(path, {"reason": "fictional removal"}, format="json")


@db_settings(10)
@given(unknown=st.uuids(version=4), actor_kind=st.sampled_from(["other_student", "other_tenant_admin"]))
def test_c_out_of_scope_documents_are_masked_identically(production_scope, unknown, actor_kind):
    _fresh_example()
    world_a, world_b = build_two_tenant_worlds(application_status="submitted")
    document = build_document(
        application=world_a.application,
        document_type="result_slip",
        file_url="documents/a/result_slip/k.pdf",
        storage_key="documents/a/result_slip/k.pdf",
        is_current=True,
    )
    if actor_kind == "other_student":
        actor = build_profile(role="student")
    else:
        actor = build_profile(role="admin")
        build_membership(user=actor, institution=world_b.institution, role="admin", permissions=["review"])
    client = _client(actor)

    for method, suffix in SURFACES:
        theirs = _hit(client, method, document.id, suffix)
        missing = _hit(client, method, unknown, suffix)
        assert theirs.status_code == missing.status_code == 404, (suffix, theirs.content)
        assert _body(theirs) == _body(missing), suffix


@db_settings(6)
@given(assigned=st.booleans())
def test_c_assignment_scoped_reviewer_never_reaches_extract_or_delete(production_scope, assigned):
    _fresh_example()
    world = build_tenant_world(application_status="submitted")
    reviewer = build_profile(role="reviewer")
    build_membership(user=reviewer, institution=world.institution, role="reviewer", permissions=["read", "review"])
    if assigned:
        Application.objects.filter(id=world.application.id).update(assigned_reviewer_id=reviewer.id)
    document = build_document(
        application=world.application,
        document_type="result_slip",
        file_url="documents/a/result_slip/k.pdf",
        storage_key="documents/a/result_slip/k.pdf",
        is_current=True,
    )
    client = _client(reviewer)

    with patch("apps.documents.tasks.extract_document_text_task.delay") as delay:
        for method, suffix in (("post", "extract/"), ("delete", "delete/")):
            theirs = _hit(client, method, document.id, suffix)
            missing = _hit(client, method, uuid.uuid4(), suffix)
            assert theirs.status_code == missing.status_code == 404, (suffix, theirs.content)
            assert _body(theirs) == _body(missing), suffix
        delay.assert_not_called()
    document.refresh_from_db()
    assert document.is_current is True


# ---------------------------------------------------------------------------
# (d) approved / rejected behave as before for every resolved payment status (3.20)
# ---------------------------------------------------------------------------


@db_settings(12)
@given(
    payment_status=st.sampled_from(RESOLVED_PAYMENT_STATUSES),
    decision=st.sampled_from(["approved", "rejected"]),
)
def test_d_review_decisions_for_resolved_payment_statuses(production_scope, payment_status, decision):
    _fresh_example()
    world = build_tenant_world(application_status="under_review")
    Application.objects.filter(id=world.application.id).update(payment_status=payment_status)
    admin = build_profile(role="admin")
    build_membership(user=admin, institution=world.institution, role="admin", permissions=["review"])
    payload = {"new_status": decision}
    if decision == "rejected":
        payload["notes"] = "Fictional reason: the programme is full."

    response = _client(admin).post(
        f"/api/v1/applications/{world.application.id}/review/", payload, format="json"
    )

    assert response.status_code == 200, response.content
    assert response.json()["data"]["new_status"] == decision
    world.application.refresh_from_db()
    assert world.application.status == decision


# ---------------------------------------------------------------------------
# (e) +260XXXXXXXXX normalises to itself (3.18)
# ---------------------------------------------------------------------------


@settings(max_examples=200)
@given(subscriber=st.from_regex(r"\A[0-9]{9}\Z", fullmatch=True))
def test_e_e164_numbers_normalise_to_themselves(subscriber):
    from apps.common.validators import validate_zambian_phone
    from apps.documents.payment_helpers import _normalize_phone_e164

    number = f"+260{subscriber}"
    assert validate_zambian_phone(number) == number
    assert _normalize_phone_e164(number) == number


# ---------------------------------------------------------------------------
# (f) An nrc-typed identity upload lists once; a legacy snapshot keeps its row (3.14)
# ---------------------------------------------------------------------------

PDF = b"%PDF-1.7\nfictional identity document\n%%EOF"


def _identity_world():
    DocumentUploadStage.objects.all().delete()
    world = build_tenant_world(application_status="draft")
    Application.objects.filter(id=world.application.id).update(
        requirements_snapshot=[
            {
                "document_type": "nrc",
                "label": "NRC",
                "required": True,
                "rules": {"accepted_mime_types": ["application/pdf"]},
            }
        ],
        configuration_version="cfg-sjr-pres-f",
    )
    world.application.refresh_from_db()
    return world


@db_settings(5)
@given(name=st.sampled_from(["nrc.pdf", "my nrc scan.pdf", "NRC-front.pdf"]))
def test_f_an_nrc_upload_lists_one_identity_row(object_storage, name):
    _fresh_example()
    world = _identity_world()
    client = _client(world.student)

    uploaded = client.post(
        "/api/v1/documents/upload/",
        {
            "file": SimpleUploadedFile(name, PDF, content_type="application/pdf"),
            "application_id": str(world.application.id),
            "document_type": "nrc",
        },
        format="multipart",
        HTTP_IDEMPOTENCY_KEY=f"sjr-pres-f-{uuid.uuid4().hex}",
    )
    assert uploaded.status_code == 201, uploaded.content

    with patch("apps.common.storage.generate_signed_url", side_effect=lambda key, *a, **k: f"https://signed.test/{key}"):
        rows = client.get(f"/api/v1/applications/{world.application.id}/documents/").json()["data"]

    identity = [row for row in rows if row["document_type"] in ("nrc", "passport", "extra_kyc")]
    assert len(identity) == 1
    assert not [row for row in rows if row.get("is_legacy_synthetic")]


def test_f_a_legacy_snapshot_with_no_document_keeps_one_synthetic_row():
    world = build_tenant_world(application_status="submitted")
    Application.objects.filter(id=world.application.id).update(
        extra_kyc_url="https://acct.r2.cloudflarestorage.com/bucket/media/legacy/identity.pdf"
    )

    with patch("apps.common.storage.generate_signed_url", side_effect=lambda key, *a, **k: f"https://signed.test/{key}"):
        rows = _client(world.student).get(
            f"/api/v1/applications/{world.application.id}/documents/"
        ).json()["data"]

    synthetic = [row for row in rows if row.get("is_legacy_synthetic")]
    assert len(synthetic) == 1
    assert synthetic[0]["document_type"] == "extra_kyc"


# ---------------------------------------------------------------------------
# (h) A presigned-only row still opens through signed-url/ (3.14)
# ---------------------------------------------------------------------------


@db_settings(5)
@given(object_name=st.sampled_from(["slip.pdf", "a b c.pdf", "nested/x/y.png"]))
def test_h_a_presigned_only_row_opens(object_name):
    _fresh_example()
    world = build_tenant_world(application_status="submitted")
    key = f"documents/{world.application.id}/result_slip/{object_name}"
    presigned = (
        f"https://acct.r2.cloudflarestorage.com/mihasapplication/media/{key.replace(' ', '%20')}"
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=deadbeef"
    )
    document = build_document(
        application=world.application,
        document_type="result_slip",
        file_url=presigned,
        storage_key=None,
        is_current=True,
    )
    signed: list[str] = []

    def sign(file_key, *args, **kwargs):
        signed.append(file_key)
        return f"https://signed.test/{file_key}?X-Amz-Signature=fresh"

    with override_settings(AWS_STORAGE_BUCKET_NAME="mihasapplication"), patch(
        "apps.common.storage.generate_signed_url", side_effect=sign
    ):
        response = _client(world.student).get(f"/api/v1/documents/{document.id}/signed-url/")

    assert response.status_code == 200, response.content
    assert signed == [key]


# ---------------------------------------------------------------------------
# (i) An unassigned in-scope reviewer gets the masked 404 on read surfaces (3.1)
# ---------------------------------------------------------------------------


def test_i_an_unassigned_reviewer_is_masked_on_read_surfaces(production_scope):
    world = build_tenant_world(application_status="submitted")
    reviewer = build_profile(role="reviewer")
    build_membership(user=reviewer, institution=world.institution, role="reviewer", permissions=["read", "review"])
    document = build_document(
        application=world.application,
        document_type="result_slip",
        file_url="documents/a/result_slip/k.pdf",
        storage_key="documents/a/result_slip/k.pdf",
        is_current=True,
    )
    client = _client(reviewer)

    with patch("apps.common.storage.generate_signed_url", return_value="https://signed.test/x"):
        for suffix in ("signed-url/", "download/", "info/"):
            theirs = client.get(f"/api/v1/documents/{document.id}/{suffix}")
            missing = client.get(f"/api/v1/documents/{uuid.uuid4()}/{suffix}")
            assert theirs.status_code == missing.status_code == 404, (suffix, theirs.content)
            assert _body(theirs) == _body(missing), suffix


# ---------------------------------------------------------------------------
# (j) A public peer cannot choose its rate-limit bucket (3.17)
# ---------------------------------------------------------------------------

# Built inside globally routable /8s rather than filtered from all of IPv4:
# Hypothesis favours small integers, which all fall in non-global ranges.
PUBLIC_IPV4 = st.tuples(
    st.sampled_from([8, 23, 41, 77, 151, 185]),
    st.integers(0, 255),
    st.integers(0, 255),
    st.integers(1, 254),
).map(lambda parts: ".".join(map(str, parts)))
LOGIN_LIMIT = 10


def _ok(_request):
    return JsonResponse({"success": True}, status=200)


@settings(max_examples=25, deadline=None)
@given(
    forged=st.lists(st.lists(PUBLIC_IPV4, min_size=1, max_size=3), min_size=LOGIN_LIMIT + 1, max_size=LOGIN_LIMIT + 1),
    peers=st.lists(PUBLIC_IPV4, min_size=2, max_size=2, unique=True),
)
def test_j_forged_forwarded_headers_count_in_the_peer_bucket(forged, peers):
    cache.clear()
    middleware = RateLimitMiddleware(_ok)
    factory = RequestFactory()
    peer, other_peer = peers

    statuses = [
        middleware(
            factory.post("/api/v1/auth/login/", REMOTE_ADDR=peer, HTTP_X_FORWARDED_FOR=", ".join(hops))
        ).status_code
        for hops in forged
    ]

    # Every request counted in the peer's own bucket, whatever it claimed.
    assert statuses[:LOGIN_LIMIT] == [200] * LOGIN_LIMIT
    assert statuses[LOGIN_LIMIT] == 429
    # A different peer forging the same header is not charged for it.
    other = middleware(
        factory.post(
            "/api/v1/auth/login/", REMOTE_ADDR=other_peer, HTTP_X_FORWARDED_FOR=", ".join(forged[0])
        )
    )
    assert other.status_code == 200
    cache.clear()
