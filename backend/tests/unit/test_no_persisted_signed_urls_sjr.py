"""Guard: no document writer persists a presigned storage URL.

student-journey-repair task 3.13 (design R4-a, clause 2.17). ``storage.url()``
on the S3 backend returns a presigned URL that expires (``AWS_QUERYSTRING_EXPIRE``,
900 s). The three document writers (upload view, condition-evidence service,
official-document generation) persist the object key; URLs exist only in
responses, signed at read time.

The scan fails on any ``storage.url(`` / ``.url(saved_name`` / ``.url(stored_name``
call in ``backend/apps`` outside the listed exceptions. Tenant assets persist
``storage.url()`` into ``public_url`` at two sites; they are not on the student
journey and are left to Spec B.
"""
from __future__ import annotations

import re
from pathlib import Path

APPS_DIR = Path(__file__).resolve().parents[2] / "apps"

# (relative path, stripped source line) -> reason
KNOWN_EXCEPTIONS = {
    ("catalog/admin_asset_views.py", "public_url = storage.url(storage_key)"): "tenant asset, Spec B",
    ("catalog/admin_asset_views.py", "public_url = storage.url(stored_name)"): "tenant asset, Spec B",
}

STORAGE_URL_CALL = re.compile(r"\bstorage\.url\(|\.url\(\s*(saved_name|stored_name)\b")

DOCUMENT_WRITERS = (
    "documents/document_storage_views.py",
    "applications/condition_evidence_service.py",
    "applications/tasks/pdf_generation.py",
)


def _calls():
    found = []
    for path in sorted(APPS_DIR.rglob("*.py")):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        rel = path.relative_to(APPS_DIR).as_posix()
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            code = line.split("#", 1)[0]
            if STORAGE_URL_CALL.search(code):
                found.append((rel, number, line.strip()))
    return found


def test_no_storage_url_call_outside_the_known_exceptions():
    unexpected = [
        f"{rel}:{number}: {line}"
        for rel, number, line in _calls()
        if (rel, line) not in KNOWN_EXCEPTIONS
    ]
    assert not unexpected, (
        "storage.url() returns an expiring presigned URL; persist the key and sign "
        "on read (resolve_document_open_url):\n" + "\n".join(unexpected)
    )


def test_the_document_writers_call_no_storage_url():
    for rel in DOCUMENT_WRITERS:
        source = (APPS_DIR / rel).read_text(encoding="utf-8")
        assert not STORAGE_URL_CALL.search(source), rel


def test_the_known_exceptions_still_exist():
    """A stale exception would hide a new call on the same line shape."""
    present = {(rel, line) for rel, _number, line in _calls()}
    assert set(KNOWN_EXCEPTIONS) <= present
