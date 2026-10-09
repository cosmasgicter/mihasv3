"""The canonical subject catalogue and its versioned alias inventory.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.1**
              ("Inventory/migrate canonical subject catalog and aliases").
Requirements: R11.4, R11.5
Findings:     STU-11
Design:       §9.2 (Grades — "The subject catalog is seeded and versioned by the
              backend. Selectors contain only canonical UUIDs.")

This module is the **single source of truth** for:

* :data:`CANONICAL_SUBJECTS` — every ECZ Grade 12 and A-Level subject the
  platform recognises, one identity per real subject;
* :data:`SUBJECT_ALIASES` — the versioned alias catalogue (normalised alias →
  canonical code) that deterministic OCR/import assistance maps candidates
  through (R11.4). It contains **no** subject identities of its own;
* :data:`LEGACY_DUPLICATE_CODES` — duplicate-identity rows found in the live
  database by the 7.1 inventory, mapped to the code that survives.

Before 7.1 the catalogue lived in three places that could drift: a Django
management command, a hand-maintained list of selectable ``fallback-*`` pseudo
IDs in the admissions wizard, and an alias map inside a frontend matcher. The
wizard list was the STU-11 bug: those IDs were selectable, counted toward client
readiness, and were then silently dropped on persist because the server requires
canonical UUIDs.

**Why duplicates matter.** The 7.1 inventory of the live catalogue found three
subjects stored twice under different codes (``ADD_MATH``/``ADDMATH``,
``MUS``/``MUSIC``, ``PHYS``/``PHY``), all three legacy rows carrying the real
``application_grades`` references. Two active rows for one real subject let a
student persist "five unique subjects" that are really four, which is exactly the
completeness claim R11.5 forbids. ``backend/scripts/
2026_07_25_01_canonical_subject_catalog.sql`` repoints the references and
deactivates the legacy rows; :data:`LEGACY_DUPLICATE_CODES` is the contract that
migration and its tests share.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass

CURRICULUM_ECZ = "ecz"
CURRICULUM_A_LEVEL = "a_level"

#: The canonical lowercase category vocabulary. Legacy rows carry title-case
#: values ("Sciences", "Arts") that the wizard's category grouping silently drops.
SUBJECT_CATEGORIES: tuple[str, ...] = (
    "core",
    "sciences",
    "commercial",
    "humanities",
    "technology",
    "practical",
    "languages",
)


@dataclass(frozen=True)
class CanonicalSubject:
    """One canonical subject identity."""

    code: str
    name: str
    category: str
    is_core: bool
    curriculum_type: str


def _ecz(code: str, name: str, category: str, *, is_core: bool = False) -> CanonicalSubject:
    return CanonicalSubject(code, name, category, is_core, CURRICULUM_ECZ)


def _alevel(code: str, name: str, category: str) -> CanonicalSubject:
    return CanonicalSubject(code, name, category, False, CURRICULUM_A_LEVEL)


#: ECZ Grade 12 (Senior Secondary Certificate), complete per the ECZ syllabus.
#:
#: "Ordinary Mathematics" (OMATH) and "Ordinary Science" (OSCI) are deliberately
#: absent — they are not ECZ syllabus entries. The canonical names are
#: "Mathematics" (core) and "Science" (the combined elective paper); both survive
#: only as aliases below.
GRADE_12_SUBJECTS: tuple[CanonicalSubject, ...] = (
    # Core
    _ecz("ENG", "English Language", "core", is_core=True),
    _ecz("MATH", "Mathematics", "core", is_core=True),
    _ecz("CE", "Civic Education", "core", is_core=True),
    # Sciences
    _ecz("BIO", "Biology", "sciences"),
    _ecz("CHEM", "Chemistry", "sciences"),
    _ecz("PHY", "Physics", "sciences"),
    _ecz("SCI", "Science", "sciences"),
    _ecz("INTSCI", "Integrated Science", "sciences"),
    _ecz("AGR", "Agricultural Science", "sciences"),
    _ecz("ADDMATH", "Additional Mathematics", "sciences"),
    # Commercial
    _ecz("COM", "Commerce", "commercial"),
    _ecz("POA", "Principles of Accounts", "commercial"),
    _ecz("ECON", "Economics", "commercial"),
    _ecz("BS", "Business Studies", "commercial"),
    _ecz("OP", "Office Practice", "commercial"),
    _ecz("ENT", "Entrepreneurship", "commercial"),
    # Humanities
    _ecz("GEO", "Geography", "humanities"),
    _ecz("HIST", "History", "humanities"),
    _ecz("RE", "Religious Education", "humanities"),
    _ecz("DS", "Development Studies", "humanities"),
    _ecz("LIT", "Literature in English", "humanities"),
    # Technology
    _ecz("CS", "Computer Studies", "technology"),
    _ecz("ICT", "ICT", "technology"),
    _ecz("DT", "Design & Technology", "technology"),
    _ecz("MW", "Metalwork", "technology"),
    _ecz("WW", "Woodwork", "technology"),
    _ecz("TD", "Technical Drawing", "technology"),
    _ecz("PM", "Power Mechanics", "technology"),
    # Practical / Creative
    _ecz("HE", "Home Economics", "practical"),
    _ecz("FN", "Food & Nutrition", "practical"),
    _ecz("ART", "Art & Design", "practical"),
    _ecz("MUSIC", "Music", "practical"),
    _ecz("PE", "Physical Education", "practical"),
    _ecz("FF", "Fashion & Fabrics", "practical"),
    # Languages
    _ecz("FRENCH", "French", "languages"),
    _ecz("PORT", "Portuguese", "languages"),
    _ecz("BEMBA", "Bemba", "languages"),
    _ecz("NYANJA", "Nyanja", "languages"),
    _ecz("TONGA", "Tonga", "languages"),
    _ecz("LOZI", "Lozi", "languages"),
    _ecz("KAONDE", "Kaonde", "languages"),
    _ecz("LUNDA", "Lunda", "languages"),
    _ecz("LUVALE", "Luvale", "languages"),
)

#: A-Level (GCE Advanced Level / Cambridge).
A_LEVEL_SUBJECTS: tuple[CanonicalSubject, ...] = (
    _alevel("AL-ENG", "English Language (A-Level)", "languages"),
    _alevel("AL-PMATH", "Pure Mathematics (A-Level)", "sciences"),
    _alevel("AL-FMATH", "Further Mathematics (A-Level)", "sciences"),
    _alevel("AL-BIO", "Biology (A-Level)", "sciences"),
    _alevel("AL-CHEM", "Chemistry (A-Level)", "sciences"),
    _alevel("AL-PHY", "Physics (A-Level)", "sciences"),
    _alevel("AL-GEO", "Geography (A-Level)", "humanities"),
    _alevel("AL-HIST", "History (A-Level)", "humanities"),
    _alevel("AL-ECON", "Economics (A-Level)", "commercial"),
    _alevel("AL-ACC", "Accounting (A-Level)", "commercial"),
    _alevel("AL-BS", "Business Studies (A-Level)", "commercial"),
    _alevel("AL-CS", "Computer Science (A-Level)", "technology"),
    _alevel("AL-SOC", "Sociology (A-Level)", "humanities"),
    _alevel("AL-PSY", "Psychology (A-Level)", "humanities"),
    _alevel("AL-RS", "Religious Studies (A-Level)", "humanities"),
    _alevel("AL-FRENCH", "French (A-Level)", "languages"),
    _alevel("AL-LIT", "Literature in English (A-Level)", "languages"),
    _alevel("AL-ART", "Art & Design (A-Level)", "practical"),
    _alevel("AL-LAW", "Law (A-Level)", "humanities"),
)

CANONICAL_SUBJECTS: tuple[CanonicalSubject, ...] = GRADE_12_SUBJECTS + A_LEVEL_SUBJECTS

#: Duplicate-identity rows found in the live catalogue by the 7.1 inventory,
#: mapped to the canonical code that survives. The legacy row is deactivated (not
#: deleted) so its history stays readable, and every reference is repointed.
LEGACY_DUPLICATE_CODES: dict[str, str] = {
    "ADD_MATH": "ADDMATH",
    "MUS": "MUSIC",
    "PHYS": "PHY",
}

#: Versioned alias catalogue: normalised alias → canonical code (R11.4).
#:
#: Aliases exist so a *deterministic* parser or a legacy import can resolve a
#: written subject name to one canonical identity. They are never selectable and
#: never become application data without explicit confirmation (task 7.5 owns the
#: OCR confirmation flow).
#:
#: Two aliases the frontend matcher previously carried are deliberately **not**
#: here: ``integrated science`` → Science and ``ict`` → Computer Studies. Both
#: collapse a real, separately examinable ECZ subject into a different one, so
#: they would silently rewrite a student's answer.
SUBJECT_ALIASES: dict[str, str] = {
    # Core abbreviations and the retired "Ordinary …" phrasings
    "maths": "MATH",
    "math": "MATH",
    "ordinary mathematics": "MATH",
    "ordinary maths": "MATH",
    "eng": "ENG",
    "english": "ENG",
    "civics": "CE",
    # Sciences
    "bio": "BIO",
    "chem": "CHEM",
    "phy": "PHY",
    "phys": "PHY",
    "combined science": "SCI",
    "general science": "SCI",
    "physical science": "SCI",
    "ordinary science": "SCI",
    "add maths": "ADDMATH",
    "add math": "ADDMATH",
    "additional math": "ADDMATH",
    "agric": "AGR",
    "agriculture": "AGR",
    "agric science": "AGR",
    # Commercial
    "commercial studies": "COM",
    "accounts": "POA",
    "accounting": "POA",
    "principles of accounting": "POA",
    "poa": "POA",
    "econ": "ECON",
    "bus studies": "BS",
    "business": "BS",
    # Humanities
    "geog": "GEO",
    "hist": "HIST",
    "re": "RE",
    "religious studies": "RE",
    "dev studies": "DS",
    "literature": "LIT",
    "lit in english": "LIT",
    "english literature": "LIT",
    # Technology
    "computer science": "CS",
    "computer studies": "CS",
    "information technology": "ICT",
    "design technology": "DT",
    "tech drawing": "TD",
    "td": "TD",
    # Practical / Creative
    "home management": "HE",
    "food nutrition": "FN",
    "art": "ART",
    "art design": "ART",
    "fashion fabrics": "FF",
    "pe": "PE",
    "phys ed": "PE",
}

_WHITESPACE = re.compile(r"\s+")
_NON_ALNUM = re.compile(r"[^a-z0-9\s]")


def normalize_subject_name(value: str | None) -> str:
    """Normalise a subject name/alias for identity comparison.

    Lowercase, ``&`` → ``and``, punctuation stripped, whitespace collapsed. The
    admissions frontend applies the identical normalisation, so a name that is
    one identity here is one identity there.
    """
    if not value:
        return ""
    lowered = str(value).lower().replace("&", " and ")
    stripped = _NON_ALNUM.sub(" ", lowered)
    return _WHITESPACE.sub(" ", stripped).strip()


SUBJECTS_BY_CODE: dict[str, CanonicalSubject] = {entry.code: entry for entry in CANONICAL_SUBJECTS}

SUBJECTS_BY_NORMALIZED_NAME: dict[str, CanonicalSubject] = {
    normalize_subject_name(entry.name): entry for entry in CANONICAL_SUBJECTS
}


def aliases_by_code() -> dict[str, list[str]]:
    """Canonical code → its sorted alias list (the published alias catalogue)."""
    grouped: dict[str, list[str]] = {code: [] for code in SUBJECTS_BY_CODE}
    for alias, code in SUBJECT_ALIASES.items():
        grouped.setdefault(code, []).append(alias)
    return {code: sorted(values) for code, values in grouped.items()}


def resolve_code(value: str | None) -> str | None:
    """Resolve a code, canonical name, alias, or legacy duplicate code to a code.

    Deterministic and exact — no fuzzy matching. Returns ``None`` when the value
    is not a recognised identity, so callers fail closed instead of guessing.
    """
    if not value:
        return None
    raw = str(value).strip()
    upper = raw.upper()
    if upper in SUBJECTS_BY_CODE:
        return upper
    if upper in LEGACY_DUPLICATE_CODES:
        return LEGACY_DUPLICATE_CODES[upper]
    normalized = normalize_subject_name(raw)
    entry = SUBJECTS_BY_NORMALIZED_NAME.get(normalized)
    if entry is not None:
        return entry.code
    return SUBJECT_ALIASES.get(normalized)


def _catalog_fingerprint() -> str:
    """Deterministic content version of the catalogue plus its alias inventory."""
    payload = {
        "subjects": [
            [entry.code, entry.name, entry.category, entry.is_core, entry.curriculum_type]
            for entry in CANONICAL_SUBJECTS
        ],
        "aliases": sorted(SUBJECT_ALIASES.items()),
        "legacy_duplicates": sorted(LEGACY_DUPLICATE_CODES.items()),
    }
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:16]


#: Published catalogue version (design §9.2 "seeded and versioned by the
#: backend"). Content-derived, so any catalogue or alias edit changes it without
#: anyone having to remember to bump a literal.
SUBJECT_CATALOG_VERSION = f"ecz-{len(CANONICAL_SUBJECTS)}-{_catalog_fingerprint()}"


def active_subjects_queryset():
    """The canonical selector queryset: active subjects only, ordered by name.

    R11.5 — "SUBJECT selectors SHALL contain only server-provided canonical IDs".
    A deactivated row can still be *referenced* by an old grade, but readiness
    never counts it, so offering it in a selector would be a trap. ``is_active IS
    NULL`` is treated as active to match the readiness evaluator, which reads
    legacy rows the same way.
    """
    from django.db.models import Q

    from apps.catalog.models import Subject

    return (
        Subject.objects.filter(Q(is_active=True) | Q(is_active__isnull=True))
        .order_by("name")
    )
