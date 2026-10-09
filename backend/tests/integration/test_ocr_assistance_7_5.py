"""Deterministic OCR is optional assistance only — the 7.5 evidence matrix.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.5**.
Requirements: R11.4 (manual entry is the way grades become application data;
              optional OCR MAY propose candidates against the **versioned alias
              catalogue**, carrying provenance/confidence and requiring explicit
              confirmation), R11.7 (structured extraction state — extracted
              analysis is NOT overloaded into human verification notes),
              R11.9 (no admissions AI), R11.10 (a fixture corpus proves parsing
              behaviour, manual fallback, low-confidence handling, tamper/size
              rejection, and **no automatic authority** for extracted values).
Findings:     STU-06, STU-07.
Design:       §9.2 ("upload -> ... -> local OCR -> deterministic parser ->
              candidate(subject_id, grade, confidence, source_region) ->
              explicit student confirmation -> grade mutation"; "Low confidence or
              unknown subjects stay unconfirmed").

Required_Evidence (tasks.md 7.5) — this module covers the **deterministic corpus
report** leg by running the same evaluation the standalone script runs
(``backend/scripts/evaluate_ocr_corpus.py``) in-process against the committed
versioned corpus, and it adds the invariants a corpus alone cannot prove:

* extraction writes **zero** grade rows — a candidate is not application data;
* the OCR task never touches ``verification_notes`` and never overwrites a
  reviewer's decision;
* a manually entered grade survives an extraction run untouched;
* candidates are published through the document contract with confidence,
  provenance, source line, and an explicit ``requires_confirmation`` flag;
* the retired ``ai_analysis`` aliases are gone from that contract.

**Validates: Requirements R11.4, R11.7, R11.9, R11.10**
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.subject_catalog import SUBJECT_ALIASES, SUBJECT_CATALOG_VERSION
from apps.documents import document_evidence as evidence
from apps.documents import grade_extraction
from apps.documents.models import ApplicationDocument, ApplicationGrade, DocumentVerificationEvent
from tests.tenant_fixtures import build_document, build_subject, build_tenant_world

pytestmark = pytest.mark.django_db

CLEAN_SLIP = """EXAMINATIONS COUNCIL OF ZAMBIA
STATEMENT OF RESULTS
EXAMINATION NUMBER: 1234567001
YEAR: 2023

1. Mathematics                       3
2. Biology                           5
"""


# ---------------------------------------------------------------------------
# The versioned fixture corpus (R11.10)
# ---------------------------------------------------------------------------


def test_corpus_evaluation_meets_every_threshold():
    """The committed corpus passes: zero wrong suggestions, measured recall.

    This is the executable form of the task's "deterministic corpus report".
    ``failures`` carries the human-readable reason for any breach, so a
    regression names the case and the metric rather than just going red.
    """
    from scripts.evaluate_ocr_corpus import evaluate

    report = evaluate(allow_live_ocr=False)

    assert report["failures"] == []
    assert report["passed"] is True
    assert report["totals"]["cases"] >= 12
    # The dangerous class must be exactly zero: a wrong candidate would be
    # pre-selected for a student to accept.
    assert report["totals"]["wrong"] == 0
    assert report["metrics"]["precision"] == 1.0
    assert report["metrics"]["recall"] >= report["thresholds"]["min_recall"]
    assert report["metrics"]["mean_confidence"] >= report["thresholds"]["min_mean_confidence"]
    assert report["parser_version"] == grade_extraction.PARSER_VERSION
    assert report["catalog_version"] == SUBJECT_CATALOG_VERSION


def test_corpus_covers_the_required_behaviour_classes():
    """Every behaviour class R11.10 names has at least one committed case."""
    import json
    from pathlib import Path

    manifest = json.loads(
        (Path(__file__).resolve().parents[1] / "fixtures" / "ocr_corpus" / "manifest.json").read_text()
    )
    ids = {case["id"] for case in manifest["cases"]}
    for required in (
        "clean_grade12_slip",  # deterministic parsing
        "unreadable_scan",  # manual fallback
        "low_confidence_alias_slip",  # low-confidence handling
        "tampered_grades_slip",  # tamper rejection
        "not_a_result_slip",  # wrong document type produces nothing
        "unknown_subject_slip",  # no guessing an unrecognised label
        "duplicate_subject_slip",  # no false completeness
    ):
        assert required in ids, f"corpus is missing the {required} case"


def test_parse_is_deterministic():
    """Same text in, identical candidates out — the corpus means nothing otherwise."""
    first = grade_extraction.parse_result_slip(CLEAN_SLIP)
    second = grade_extraction.parse_result_slip(CLEAN_SLIP)
    assert first.as_dict() == second.as_dict()


# ---------------------------------------------------------------------------
# Candidates map through the task-7.1 catalogue, not a parallel table (R11.4)
# ---------------------------------------------------------------------------


def test_candidates_resolve_through_the_versioned_alias_catalogue():
    result = grade_extraction.parse_result_slip("1. Maths 4\n2. Combined Science 5\n")
    by_code = {c.subject_code: c for c in result.candidates}

    assert by_code["MATH"].match == "alias"
    assert by_code["MATH"].matched_alias in SUBJECT_ALIASES
    assert SUBJECT_ALIASES[by_code["MATH"].matched_alias] == "MATH"
    assert by_code["SCI"].match == "alias"
    # Alias-tier confidence is deliberately below canonical-tier confidence.
    assert by_code["MATH"].confidence == grade_extraction.CONFIDENCE_ALIAS


def test_unrecognised_label_is_never_guessed_to_a_near_match():
    result = grade_extraction.parse_result_slip("1. Mathmatics 4\n2. Bilogy 5\n")
    assert [c.status for c in result.candidates] == ["unresolved", "unresolved"]
    assert result.confirmable_candidates == []


def test_candidate_carries_confidence_provenance_and_source_region():
    result = grade_extraction.parse_result_slip(CLEAN_SLIP)
    candidate = next(c for c in result.candidates if c.subject_code == "MATH")
    assert candidate.confidence == grade_extraction.CONFIDENCE_CANONICAL
    assert candidate.provenance == grade_extraction.PROVENANCE_OCR
    assert candidate.source_line == 6
    assert "Mathematics" in candidate.source_text


def test_published_payload_declares_itself_non_authoritative():
    payload = grade_extraction.parse_result_slip(CLEAN_SLIP).as_dict()
    assert payload["requires_confirmation"] is True
    assert payload["authoritative"] is False
    assert payload["parser_version"] == grade_extraction.PARSER_VERSION
    assert payload["catalog_version"] == SUBJECT_CATALOG_VERSION


def test_subject_ids_bind_only_to_active_catalogue_rows():
    """A code with no active ``Subject`` row is downgraded, never offered."""
    build_subject(name="Mathematics", code="MATH")
    build_subject(name="Biology", code="BIO", is_active=False)

    result = grade_extraction.extract_candidates(CLEAN_SLIP)
    by_code = {c.subject_code: c for c in result.candidates}

    assert by_code["MATH"].subject_id is not None
    assert by_code["MATH"].confirmable is True
    assert by_code["BIO"].subject_id is None
    assert by_code["BIO"].confirmable is False
    assert by_code["BIO"].status == grade_extraction.STATUS_LOW_CONFIDENCE


# ---------------------------------------------------------------------------
# Extraction has no authority over application data (R11.4, R11.10)
# ---------------------------------------------------------------------------


def _run_extraction(document, text=CLEAN_SLIP):
    """Run the real Celery task body with local OCR stubbed to return *text*."""
    from apps.documents.tasks import extract_document_text_task

    class _Storage:
        def open(self, key, mode="rb"):
            import io

            return io.BytesIO(b"fake-image-bytes")

    with (
        patch("apps.common.storage.MediaStorage", _Storage),
        patch("apps.common.storage.get_document_storage_key", return_value="documents/slip.png"),
        patch("apps.documents.tasks.tempfile") as tmp_module,
        patch.dict("sys.modules", {"pytesseract": _FakeTesseract(text), "PIL": _FakePIL(), "PIL.Image": _FakeImage()}),
    ):
        tmp_module.NamedTemporaryFile.return_value.__enter__.return_value = _FakeTempFile()
        extract_document_text_task(document.id, force=True)
    document.refresh_from_db()
    return document


class _FakeTempFile:
    name = "/tmp/fake-slip.png"

    def write(self, _data):
        return None

    def flush(self):
        return None


class _FakeTesseract:
    def __init__(self, text):
        self._text = text

    def image_to_string(self, _image):
        return self._text


class _FakeImage:
    @staticmethod
    def open(_path):
        return object()


class _FakePIL:
    Image = _FakeImage


def test_extraction_writes_no_grade_rows():
    """The whole point of R11.4: a read is a suggestion, not application data."""
    world = build_tenant_world()
    build_subject(name="Mathematics", code="MATH")
    build_subject(name="Biology", code="BIO")
    document = build_document(application=world.application, document_type="result_slip")

    before = ApplicationGrade.objects.filter(application=world.application).count()
    _run_extraction(document)
    after = ApplicationGrade.objects.filter(application=world.application).count()

    assert before == after == 0
    # The candidates exist — they are just not authority.
    stored = grade_extraction.latest_candidates(document)
    assert stored is not None
    assert stored["confirmable_count"] == 2
    assert stored["requires_confirmation"] is True


def test_extraction_never_touches_a_manually_entered_grade():
    world = build_tenant_world()
    math = build_subject(name="Mathematics", code="MATH")
    build_subject(name="Biology", code="BIO")
    manual = ApplicationGrade.objects.create(
        id=uuid.uuid4(),
        application=world.application,
        subject=math,
        # A grade the student typed that disagrees with the slip: it must survive.
        grade=9,
    )
    document = build_document(application=world.application, document_type="result_slip")

    _run_extraction(document)

    manual.refresh_from_db()
    assert manual.grade == 9
    assert ApplicationGrade.objects.filter(application=world.application).count() == 1


def test_extraction_state_is_structured_and_verification_notes_untouched():
    """R11.7: machine output lives in its own record, not a reviewer's field."""
    world = build_tenant_world()
    build_subject(name="Mathematics", code="MATH")
    build_subject(name="Biology", code="BIO")
    reviewer_note = "Checked against the original. Legible."
    document = build_document(
        application=world.application,
        document_type="result_slip",
        verification_notes=reviewer_note,
        verification_status="verified",
        lifecycle_state=evidence.VERIFIED,
    )

    _run_extraction(document)

    assert document.verification_notes == reviewer_note
    assert document.extraction_state == "ocr_complete"
    # The human decision survives an extraction run (the STU-06 clobber bug).
    assert evidence.lifecycle_of(document) == evidence.VERIFIED
    assert document.verification_status == "verified"

    candidate_events = DocumentVerificationEvent.objects.filter(
        document_id=document.id,
        event_type=grade_extraction.EVENT_EXTRACTION_CANDIDATES,
    )
    assert candidate_events.count() == 1
    assert "extraction" in candidate_events.first().details


def test_re_extraction_appends_history_rather_than_rewriting_it():
    world = build_tenant_world()
    build_subject(name="Mathematics", code="MATH")
    build_subject(name="Biology", code="BIO")
    document = build_document(application=world.application, document_type="result_slip")

    _run_extraction(document)
    _run_extraction(document, text=CLEAN_SLIP.replace("Biology                           5", "Biology                           7"))

    events = list(
        DocumentVerificationEvent.objects.filter(
            document_id=document.id,
            event_type=grade_extraction.EVENT_EXTRACTION_CANDIDATES,
        ).order_by("created_at")
    )
    assert len(events) == 2
    latest = grade_extraction.latest_candidates(document)
    grades = {c["subject_code"]: c["grade"] for c in latest["candidates"]}
    assert grades["BIO"] == 7


def test_no_candidates_are_stored_for_a_non_result_document():
    world = build_tenant_world()
    document = build_document(application=world.application, document_type="nrc")

    _run_extraction(document, text="REPUBLIC OF ZAMBIA\nNATIONAL REGISTRATION CARD\n")

    assert grade_extraction.latest_candidates(document) is None
    assert document.extraction_state == "ocr_complete"


def test_unreadable_slip_leaves_the_student_on_manual_entry():
    world = build_tenant_world()
    document = build_document(application=world.application, document_type="result_slip")

    _run_extraction(document, text="   \n\n")

    assert document.extraction_state == "ocr_no_text"
    assert grade_extraction.latest_candidates(document) is None
    assert ApplicationGrade.objects.filter(application=world.application).count() == 0


def test_slip_with_no_confirmable_candidate_reports_no_grades():
    world = build_tenant_world()
    document = build_document(application=world.application, document_type="result_slip")

    _run_extraction(document, text="1. Mathmatics 4\n2. Bilogy 5\n")

    assert document.extraction_state == "ocr_no_grades"


# ---------------------------------------------------------------------------
# The published document contract (R11.4, R11.9)
# ---------------------------------------------------------------------------


def _student_client(world) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(world.student.id),
                "email": world.student.email,
                "role": "student",
            }
        )
    )
    return client


def test_document_info_publishes_candidates_and_drops_the_ai_aliases():
    world = build_tenant_world()
    build_subject(name="Mathematics", code="MATH")
    build_subject(name="Biology", code="BIO")
    document = build_document(application=world.application, document_type="result_slip")
    _run_extraction(document)

    response = _student_client(world).get(f"/api/v1/documents/{document.id}/info/")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]

    extraction = data["extraction"]
    assert extraction["requires_confirmation"] is True
    assert extraction["authoritative"] is False
    assert extraction["provenance"] == grade_extraction.PROVENANCE_OCR
    assert extraction["parser_version"] == grade_extraction.PARSER_VERSION
    candidate = next(c for c in extraction["candidates"] if c["subject_code"] == "MATH")
    assert candidate["confirmable"] is True
    assert candidate["subject_id"]
    assert candidate["confidence"] > 0
    assert candidate["source_line"] > 0

    # R11.9 / task 7.5: the retired aliases that implied live AI authority are gone.
    assert "ai_analysis" not in data
    assert "ai_analysis_available" not in data
    # Historical provenance is still published, labelled read-only.
    assert "extraction_provenance" in data


def test_document_info_extraction_is_null_before_any_read():
    world = build_tenant_world()
    document = build_document(application=world.application, document_type="result_slip")

    response = _student_client(world).get(f"/api/v1/documents/{document.id}/info/")
    assert response.status_code == 200
    assert response.json()["data"]["extraction"] is None


def test_historical_ai_blob_is_read_only_provenance_not_a_candidate():
    """Design §18: preserve pre-7.4 extraction as labeled provenance."""
    world = build_tenant_world()
    document = build_document(
        application=world.application,
        document_type="result_slip",
        verification_notes='{"ai_analysis": {"subjects": [{"name": "Mathematics", "grade": 1}]}}',
    )

    response = _student_client(world).get(f"/api/v1/documents/{document.id}/info/")
    data = response.json()["data"]

    provenance = data["extraction_provenance"]
    assert provenance["read_only"] is True
    assert provenance["authoritative"] is False
    assert provenance["source"] == "historical_ai_extraction"
    # It is provenance, not a suggestion: it never becomes a confirmable candidate.
    assert data["extraction"] is None


def test_admissions_extraction_path_makes_no_model_call():
    """R11.9: the extraction module has no AI import and no outbound client."""
    import inspect

    source = inspect.getsource(grade_extraction)
    for forbidden in ("openai", "ai_gateway", "AI_GATEWAY", "requests.post", "httpx", "analyze_document"):
        assert forbidden not in source, f"{forbidden} must not appear in the extraction path"
