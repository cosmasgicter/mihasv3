# backend/apps/applications/document_intelligence.py

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher


@dataclass(frozen=True)
class ConsistencyCheck:
    field: str
    extracted_value: str
    application_value: str
    match_score: float       # 0.0 - 1.0
    warning: str | None      # e.g. "name_mismatch"


@dataclass
class CompletenessResult:
    score: int               # 0-100
    document_score: int      # 0-100 (40% weight)
    consistency_score: int   # 0-100 (30% weight)
    grade_score: int         # 0-100 (30% weight)
    warnings: list[str] = field(default_factory=list)
    checks: list[ConsistencyCheck] = field(default_factory=list)


class DocumentIntelligence:
    """Extracts identity fields from document text and scores completeness."""

    REQUIRED_DOC_TYPES = {"nrc", "passport", "result_slip"}

    def compute_completeness(self, application) -> CompletenessResult:
        """Compute completeness score. Uses prefetched sets if available to avoid N+1."""
        # Use prefetched sets if available, otherwise fallback to queryset
        if hasattr(application, '_prefetched_objects_cache') and 'applicationdocument_set' in application._prefetched_objects_cache:
            docs = list(application.applicationdocument_set.all())
        else:
            docs = list(application.applicationdocument_set.all())

        if hasattr(application, '_prefetched_objects_cache') and 'applicationgrade_set' in application._prefetched_objects_cache:
            grades = list(application.applicationgrade_set.all())
        else:
            grades = list(application.applicationgrade_set.all())

        # Document score (40% weight)
        uploaded_types = {doc.document_type for doc in docs}
        doc_ratio = len(uploaded_types & self.REQUIRED_DOC_TYPES) / len(self.REQUIRED_DOC_TYPES)
        document_score = round(doc_ratio * 100)

        # Consistency score (30% weight)
        checks = []
        warnings = []
        for doc in docs:
            if doc.extracted_text:
                doc_checks = self._check_consistency(doc, application)
                checks.extend(doc_checks)
                for c in doc_checks:
                    if c.warning:
                        warnings.append(c.warning)

        consistency_score = 100
        if checks:
            avg_match = sum(c.match_score for c in checks) / len(checks)
            consistency_score = round(avg_match * 100)

        # Grade score (30% weight)
        grade_count = len(grades)
        grade_score = min(100, round((grade_count / 5) * 100))  # 5 subjects = 100%

        total = round(document_score * 0.4 + consistency_score * 0.3 + grade_score * 0.3)

        return CompletenessResult(
            score=total, document_score=document_score,
            consistency_score=consistency_score, grade_score=grade_score,
            warnings=warnings, checks=checks,
        )

    def _check_consistency(self, doc, application) -> list[ConsistencyCheck]:
        checks = []
        text = doc.extracted_text or ""

        # Name check
        if application.full_name:
            name_score = SequenceMatcher(None, text.lower(), application.full_name.lower()).ratio()
            warning = "name_mismatch" if name_score < 0.8 else None
            checks.append(ConsistencyCheck("full_name", text[:100], application.full_name, name_score, warning))

        # NRC check
        if application.nrc_number:
            nrc_pattern = re.escape(application.nrc_number)
            found = bool(re.search(nrc_pattern, text))
            checks.append(ConsistencyCheck(
                "nrc_number", "found" if found else "not_found",
                application.nrc_number, 1.0 if found else 0.0,
                None if found else "nrc_mismatch",
            ))

        return checks
