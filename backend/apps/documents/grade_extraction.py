"""Deterministic result-slip parser: OCR text -> confirmable grade candidates.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.5**
              ("Make deterministic OCR optional assistance only").
Requirements: R11.4 (students enter grades manually; optional OCR MAY propose
              subject/grade candidates **against the versioned alias catalogue**,
              and candidates SHALL carry provenance/confidence and require
              **explicit confirmation** before they become application data),
              R11.7 (structured extraction state — extracted analysis is NOT
              overloaded into human verification notes), R11.9 (no admissions AI),
              R11.10 (a fixture corpus proves parsing behaviour, manual fallback,
              low-confidence handling, tamper rejection, and **no automatic
              authority** for extracted values).
Findings:     STU-06, STU-07.
Design:       §9.2 — ``upload -> malware/type/size check -> local OCR ->
              deterministic parser -> candidate(subject_id, grade, confidence,
              source_region) -> explicit student confirmation -> grade mutation``;
              "Low confidence or unknown subjects stay unconfirmed."

What this module is
-------------------
A pure, deterministic text parser plus the reader/writer for its **structured**
output. It has no model call, no network call, no fuzzy string metric, and no
randomness: the same text always produces the same candidates, which is what
makes the fixture corpus (``backend/tests/fixtures/ocr_corpus/``) a meaningful
regression gate.

Subject identity resolves **only** through the task-7.1 catalogue
(``apps.catalog.subject_catalog.resolve_code``) — the canonical names, the
versioned alias inventory, and the legacy-duplicate map. There is deliberately no
second alias table and no Levenshtein/Jaro fallback here: a near-miss that a
distance metric would "helpfully" resolve is exactly the case that silently
rewrites a student's subject, so an unrecognised label stays ``unresolved`` and
the student types it themselves.

What this module is *not*
-------------------------
It is not authority. Nothing here writes ``application_grades``; a candidate
becomes application data only when the student explicitly confirms it and the
wizard calls the canonical grade mutation. ``confirmable`` is a UI *permission*
to offer a pre-checked suggestion, never permission to apply one.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from typing import Any

from apps.catalog.subject_catalog import (
    SUBJECT_ALIASES,
    SUBJECT_CATALOG_VERSION,
    SUBJECTS_BY_CODE,
    SUBJECTS_BY_NORMALIZED_NAME,
    normalize_subject_name,
)

logger = logging.getLogger(__name__)

#: Bumped whenever the parsing rules change. Recorded on every stored candidate
#: set and asserted by the corpus evaluation, so a rule change that moves
#: accuracy shows up as a versioned, reviewable delta rather than a silent drift.
PARSER_VERSION = "ecz-slip-2026-07-1"

#: Stable operator-visible event name for a stored candidate set (R17.1). The
#: candidates live in ``document_verification_events.details`` — the append-only
#: structured-notes table from task 7.3 — and never in ``verification_notes``
#: (R11.7).
EVENT_EXTRACTION_CANDIDATES = "document.extraction.candidates"

#: The label matched a canonical subject code or canonical name exactly (after
#: normalisation). The residual uncertainty is OCR character noise, not identity.
CONFIDENCE_CANONICAL = 0.95
#: The label matched through the versioned alias catalogue. Lower because an
#: alias is an editorial judgement about equivalence, not the printed name.
CONFIDENCE_ALIAS = 0.80
#: Penalty applied when the line carried OCR noise around the match (stray
#: glyphs, filler dots, a bracketed descriptor). Deterministic, not a guess.
NOISE_PENALTY = 0.15
#: Below this a candidate is never pre-selected for the student (R11.4 "low
#: confidence ... stay unconfirmed"). It is still *shown*, labelled, so the
#: student can act on it deliberately.
MIN_CONFIRMABLE_CONFIDENCE = 0.70

#: Candidate statuses. Only ``suggested`` may be pre-selected in the UI.
STATUS_SUGGESTED = "suggested"
STATUS_LOW_CONFIDENCE = "low_confidence"
STATUS_UNRESOLVED = "unresolved"
STATUS_DUPLICATE = "duplicate"
STATUS_INVALID_GRADE = "invalid_grade"

#: Provenance label carried by every candidate: a deterministic local OCR read,
#: with no authority of its own.
PROVENANCE_OCR = "deterministic_ocr"

#: ECZ grades are the integers 1..9. Anything else on a slip line is either OCR
#: damage or a tampered document, and is reported as such rather than dropped.
MIN_GRADE = 1
MAX_GRADE = 9

# --- line shapes -----------------------------------------------------------
#
# A result-slip row is "<subject label> <grade>", with any amount of leading
# numbering and filler between the two. These regexes are intentionally boring;
# every one of them is anchored, bounded, and has no catastrophic-backtracking
# alternation.

#: Leading row numbering: "1.", "2)", "03 -".
_ROW_NUMBER = re.compile(r"^\s*\d{1,2}\s*[.)\-]\s*")
#: Trailing grade descriptor a slip may print next to the number: "(C)", "- CREDIT".
_GRADE_DESCRIPTOR = re.compile(
    r"[\s(\[\-]*(?:distinction|merit|credit|satisfactory|pass|fail|[a-f][+\-]?)[\s)\]]*$",
    re.IGNORECASE,
)
#: The trailing numeric token that carries the grade. Captured with its own width
#: so "12" is recognised as an out-of-range value instead of matching a lone "2".
_TRAILING_NUMBER = re.compile(r"(\d{1,3})\s*$")
#: Filler an OCR read leaves between label and grade: dot leaders, dashes, pipes.
_FILLER = re.compile(r"[.\u2022\-_|:]{2,}")
#: Characters that should not appear inside a printed subject name; their presence
#: is the deterministic "noisy line" signal.
_NOISE_GLYPHS = re.compile(r"[^A-Za-z0-9&()\[\].,'/\-\s+]")
#: Junk to trim off the ends of a label before it is shown to a student. The
#: verbatim line is preserved separately in ``source_text``.
_LABEL_EDGE_JUNK = re.compile(r"^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$")

#: Longest canonical subject name is five words ("Literature in English
#: (A-Level)"). A longer label is slip furniture — a title, a centre line, or a
#: header whose OCR damage stopped the keyword filter from recognising it — and
#: reporting it as a candidate is noise a student has to read past.
MAX_LABEL_TOKENS = 5
MAX_LABEL_CHARS = 48

#: Exam number: 10 or 12 digits, mirroring the frontend decoder
#: (``apps/admissions/src/lib/eczExamNumber.ts``) so both halves agree on what a
#: valid number looks like.
_EXAM_NUMBER = re.compile(r"(?<!\d)(\d{10}|\d{12})(?!\d)")
#: Examination year: a plausible four-digit year, not any four digits.
_EXAM_YEAR = re.compile(r"(?<!\d)(19[7-9]\d|20[0-4]\d)(?!\d)")

#: Header/footer words that must never be read as a subject label. Without this a
#: line like "CENTRE 1234567 3" becomes a candidate for whatever subject its
#: normalised text happens to alias to.
_NON_SUBJECT_LINE_TOKENS = frozenset(
    {
        "examination",
        "council",
        "zambia",
        "statement",
        "results",
        "result",
        "certificate",
        "candidate",
        "centre",
        "center",
        "school",
        "name",
        "number",
        "no",
        "year",
        "sex",
        "grade",
        "subject",
        "subjects",
        "page",
        "issued",
        "date",
        "total",
        "aggregate",
        "points",
        "remarks",
    }
)


@dataclass(frozen=True)
class GradeCandidate:
    """One proposed (subject, grade) pair with its provenance and confidence.

    ``subject_id`` is filled in only when the canonical code resolves to an
    **active** ``Subject`` row, because a selector/persist boundary that accepts
    anything else is exactly the STU-11 bug task 7.1 closed.
    """

    raw_label: str
    grade: int | None
    subject_code: str | None
    subject_name: str | None
    subject_id: str | None
    match: str
    matched_alias: str | None
    confidence: float
    status: str
    source_line: int
    source_text: str
    provenance: str = PROVENANCE_OCR

    @property
    def confirmable(self) -> bool:
        """May the UI offer this candidate pre-selected?

        Never a statement that the value is correct — the student still confirms.
        The canonical-identity half of this question is answered by
        :func:`attach_subject_ids`, which downgrades any code with no active
        ``Subject`` row out of ``suggested``, so a confirmable candidate that has
        been through the binding step always carries a usable ``subject_id``.
        """
        return (
            self.status == STATUS_SUGGESTED
            and self.subject_code is not None
            and self.grade is not None
            and self.confidence >= MIN_CONFIRMABLE_CONFIDENCE
        )

    def as_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["confirmable"] = self.confirmable
        return payload


@dataclass(frozen=True)
class ExtractionResult:
    """The full structured output of one deterministic parse."""

    candidates: list[GradeCandidate] = field(default_factory=list)
    exam_number: str | None = None
    exam_year: int | None = None
    parser_version: str = PARSER_VERSION
    catalog_version: str = SUBJECT_CATALOG_VERSION

    @property
    def confirmable_candidates(self) -> list[GradeCandidate]:
        return [candidate for candidate in self.candidates if candidate.confirmable]

    @property
    def mean_confidence(self) -> float:
        confirmable = self.confirmable_candidates
        if not confirmable:
            return 0.0
        return round(sum(c.confidence for c in confirmable) / len(confirmable), 4)

    def as_dict(self) -> dict[str, Any]:
        """The stored/published shape.

        ``requires_confirmation`` and ``authoritative`` are stated explicitly in
        the payload rather than left to a reader's assumption: a client that
        renders this block cannot claim it did not know the values are
        suggestions (R11.4).
        """
        return {
            "parser_version": self.parser_version,
            "catalog_version": self.catalog_version,
            "provenance": PROVENANCE_OCR,
            "requires_confirmation": True,
            "authoritative": False,
            "exam_number": self.exam_number,
            "exam_year": self.exam_year,
            "confirmable_count": len(self.confirmable_candidates),
            "mean_confidence": self.mean_confidence,
            "candidates": [candidate.as_dict() for candidate in self.candidates],
        }


def _looks_like_header(normalized_label: str) -> bool:
    """True when a line is slip furniture rather than a subject row.

    Two independent filters, because either alone leaks: the keyword filter
    misses a header whose OCR read is damaged ("EXAMlNAT!ONS COUNC!L"), and the
    length filter misses a short header ("YEAR").
    """
    if not normalized_label:
        return True
    tokens = normalized_label.split()
    if len(tokens) > MAX_LABEL_TOKENS or len(normalized_label) > MAX_LABEL_CHARS:
        return True
    return bool(set(tokens) & _NON_SUBJECT_LINE_TOKENS)


def _resolve_label(normalized_label: str) -> tuple[str | None, str, str | None]:
    """Resolve a normalised label to ``(code, match_kind, matched_alias)``.

    Exact only, and canonical identity wins over an alias, so a printed canonical
    name can never be re-pointed by an alias someone adds later.
    """
    canonical = SUBJECTS_BY_NORMALIZED_NAME.get(normalized_label)
    if canonical is not None:
        return canonical.code, "canonical", None
    upper = normalized_label.upper().replace(" ", "")
    if upper in SUBJECTS_BY_CODE:
        return upper, "canonical", None
    alias_code = SUBJECT_ALIASES.get(normalized_label)
    if alias_code is not None:
        return alias_code, "alias", normalized_label
    return None, "unresolved", None


def _split_label_and_grade(line: str) -> tuple[str, int | None, bool, bool]:
    """Split one line into ``(label, grade, out_of_range, noisy)``.

    ``out_of_range`` distinguishes "this row printed a grade we refuse" (a
    tamper/OCR-damage signal worth surfacing) from "this row has no grade at all"
    (slip furniture worth ignoring).
    """
    working = _ROW_NUMBER.sub("", line).strip()
    # Dot leaders are ordinary slip typography, not damage, so filler alone is not
    # a noise signal — only characters that cannot appear in a printed subject
    # name are. Penalising the most common real layout would push clean reads
    # below the confirmable floor for no reason.
    noisy = bool(_NOISE_GLYPHS.search(working))
    working = _FILLER.sub(" ", working)
    working = _GRADE_DESCRIPTOR.sub("", working).strip()

    match = _TRAILING_NUMBER.search(working)
    if match is None:
        return working, None, False, noisy

    raw_value = match.group(1)
    label = working[: match.start()].strip()
    try:
        value = int(raw_value)
    except ValueError:  # pragma: no cover - regex guarantees digits
        return label, None, False, noisy

    if MIN_GRADE <= value <= MAX_GRADE and len(raw_value) == 1:
        return label, value, False, noisy
    return label, None, True, noisy


def parse_result_slip(text: str | None) -> ExtractionResult:
    """Parse OCR text into candidates. Pure, deterministic, never raises."""
    if not text or not str(text).strip():
        return ExtractionResult()

    lines = str(text).splitlines()
    exam_number: str | None = None
    exam_year: int | None = None
    candidates: list[GradeCandidate] = []
    seen_codes: set[str] = set()

    for index, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue

        if exam_number is None:
            found = _EXAM_NUMBER.search(line.replace(" ", ""))
            if found is not None:
                exam_number = found.group(1)
        if exam_year is None:
            year_match = _EXAM_YEAR.search(line)
            if year_match is not None:
                exam_year = int(year_match.group(1))

        label, grade, out_of_range, noisy = _split_label_and_grade(line)
        label = _LABEL_EDGE_JUNK.sub("", label)
        normalized = normalize_subject_name(label)
        if _looks_like_header(normalized):
            continue
        if grade is None and not out_of_range:
            continue

        code, match_kind, matched_alias = _resolve_label(normalized)
        base = CONFIDENCE_CANONICAL if match_kind == "canonical" else CONFIDENCE_ALIAS
        confidence = 0.0 if code is None else round(max(base - (NOISE_PENALTY if noisy else 0.0), 0.0), 4)

        if out_of_range:
            status = STATUS_INVALID_GRADE
        elif code is None:
            status = STATUS_UNRESOLVED
        elif code in seen_codes:
            status = STATUS_DUPLICATE
        elif confidence < MIN_CONFIRMABLE_CONFIDENCE:
            status = STATUS_LOW_CONFIDENCE
        else:
            status = STATUS_SUGGESTED

        if code is not None and status in (STATUS_SUGGESTED, STATUS_LOW_CONFIDENCE):
            seen_codes.add(code)

        subject = SUBJECTS_BY_CODE.get(code) if code else None
        candidates.append(
            GradeCandidate(
                raw_label=label,
                grade=grade,
                subject_code=code,
                subject_name=subject.name if subject else None,
                subject_id=None,
                match=match_kind,
                matched_alias=matched_alias,
                confidence=confidence,
                status=status,
                source_line=index + 1,
                source_text=line[:200],
            )
        )

    # Exam metadata is only slip metadata if this is a slip. Without this guard a
    # date of birth on a scanned NRC becomes an "examination year", which is a
    # value a student could be asked to confirm about a document that has no
    # examination on it at all.
    if not any(candidate.subject_code for candidate in candidates):
        exam_number = None
        exam_year = None

    return ExtractionResult(candidates=candidates, exam_number=exam_number, exam_year=exam_year)


def attach_subject_ids(result: ExtractionResult) -> ExtractionResult:
    """Bind each resolved code to its **active** canonical ``Subject`` UUID.

    A code with no active row keeps ``subject_id=None`` and is downgraded out of
    ``suggested``: the wizard must never be handed an identity the grade
    mutation would reject (R11.5).
    """
    codes = {c.subject_code for c in result.candidates if c.subject_code}
    if not codes:
        return result

    try:
        from apps.catalog.subject_catalog import active_subjects_queryset

        rows = {
            (row["code"] or "").upper(): str(row["id"])
            for row in active_subjects_queryset().filter(code__in=codes).values("id", "code")
        }
    except Exception:  # pragma: no cover - assistance must never break upload
        logger.warning("subject id resolution failed for extraction candidates", exc_info=True)
        rows = {}

    bound: list[GradeCandidate] = []
    for candidate in result.candidates:
        subject_id = rows.get((candidate.subject_code or "").upper())
        status = candidate.status
        if candidate.subject_code and subject_id is None and status == STATUS_SUGGESTED:
            status = STATUS_LOW_CONFIDENCE
        bound.append(
            GradeCandidate(
                **{
                    **asdict(candidate),
                    "subject_id": subject_id,
                    "status": status,
                }
            )
        )
    return ExtractionResult(
        candidates=bound,
        exam_number=result.exam_number,
        exam_year=result.exam_year,
        parser_version=result.parser_version,
        catalog_version=result.catalog_version,
    )


def extract_candidates(text: str | None) -> ExtractionResult:
    """Parse *text* and bind canonical subject IDs. The task's entry point."""
    return attach_subject_ids(parse_result_slip(text))


def record_candidates(document, result: ExtractionResult) -> None:
    """Append the candidate set to the append-only structured history.

    ``verification_notes`` is untouched by design: that column is a human
    reviewer's field, and overloading machine output into it is the exact R11.7
    violation finding STU-06 named.
    """
    from apps.documents import document_evidence as evidence

    lifecycle = evidence.lifecycle_of(document)
    evidence.record_event(
        document=document,
        from_state=lifecycle,
        to_state=lifecycle,
        event_type=EVENT_EXTRACTION_CANDIDATES,
        details={"extraction": result.as_dict()},
    )


def latest_candidates(document) -> dict[str, Any] | None:
    """The most recent stored candidate set for *document*, or ``None``.

    Read-only. A re-extract appends a newer event, so "current" is simply the
    newest row — history of what a previous read proposed is preserved.
    """
    from apps.documents.models import DocumentVerificationEvent

    try:
        row = (
            DocumentVerificationEvent.objects.filter(
                document_id=document.id,
                event_type=EVENT_EXTRACTION_CANDIDATES,
            )
            .order_by("-created_at")
            .values_list("details", flat=True)
            .first()
        )
    except Exception:  # pragma: no cover - a read failure must not break the view
        logger.warning("extraction candidate read failed", exc_info=True)
        return None

    if not isinstance(row, dict):
        return None
    extraction = row.get("extraction")
    return extraction if isinstance(extraction, dict) else None


__all__ = [
    "CONFIDENCE_ALIAS",
    "CONFIDENCE_CANONICAL",
    "EVENT_EXTRACTION_CANDIDATES",
    "MIN_CONFIRMABLE_CONFIDENCE",
    "NOISE_PENALTY",
    "PARSER_VERSION",
    "PROVENANCE_OCR",
    "STATUS_DUPLICATE",
    "STATUS_INVALID_GRADE",
    "STATUS_LOW_CONFIDENCE",
    "STATUS_SUGGESTED",
    "STATUS_UNRESOLVED",
    "ExtractionResult",
    "GradeCandidate",
    "attach_subject_ids",
    "extract_candidates",
    "latest_candidates",
    "parse_result_slip",
    "record_candidates",
]
