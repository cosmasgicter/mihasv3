#!/usr/bin/env python3
"""Evaluate the deterministic result-slip parser against the versioned corpus.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.5**
              (Required_Evidence: "deterministic corpus report").
Requirements: R11.4, R11.10.
Findings:     STU-06, STU-07.

Run it:

    cd backend && python3 scripts/evaluate_ocr_corpus.py
    cd backend && python3 scripts/evaluate_ocr_corpus.py --json /tmp/report.json
    cd backend && python3 scripts/evaluate_ocr_corpus.py --markdown /tmp/report.md

Exit status is 0 only when every threshold in the corpus manifest holds, so this
is usable as a gate as well as a report. ``backend/tests/integration/
test_ocr_assistance_7_5.py`` runs the same evaluation in-process.

What is being measured
----------------------
Accuracy of *assistance*, against what a human reads from the slip
(``slip_truth``) — not against the parser's own output, which would make the
number meaningless. Three failure modes are counted separately because they have
very different consequences:

* **wrong** — a confirmable candidate the slip does not support. This is the only
  dangerous class (it would pre-select a false value for a student to accept), so
  the manifest threshold is zero and precision must be 1.0.
* **withheld** — the parser resolved the subject but deliberately did not offer
  it (low confidence, duplicate). Costs recall, protects correctness.
* **missed** — no candidate at all (OCR damaged the label beyond exact
  resolution). Costs recall; the manual path covers it.

No database and no Django ORM are required: the parse is pure. Subject-ID binding
(the one DB-touching step) is deliberately excluded here and covered by the
integration test, which has a database.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ.setdefault("TESTING", "1")

CORPUS_DIR = BACKEND_ROOT / "tests" / "fixtures" / "ocr_corpus"
MANIFEST_PATH = CORPUS_DIR / "manifest.json"


@dataclass
class CaseReport:
    """One corpus case's measured outcome."""

    case_id: str
    document_type: str
    source: str
    truth_count: int
    correct: list[list[Any]] = field(default_factory=list)
    wrong: list[list[Any]] = field(default_factory=list)
    withheld: list[list[Any]] = field(default_factory=list)
    missed: list[list[Any]] = field(default_factory=list)
    status_counts: dict[str, int] = field(default_factory=dict)
    mean_confidence: float = 0.0
    exam_number: str | None = None
    exam_year: int | None = None
    expectation_failures: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "document_type": self.document_type,
            "source": self.source,
            "truth_count": self.truth_count,
            "correct": self.correct,
            "wrong": self.wrong,
            "withheld": self.withheld,
            "missed": self.missed,
            "status_counts": self.status_counts,
            "mean_confidence": self.mean_confidence,
            "exam_number": self.exam_number,
            "exam_year": self.exam_year,
            "expectation_failures": self.expectation_failures,
        }


def _load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def _tesseract_available() -> bool:
    """True only when both pytesseract and a real tesseract binary are present."""
    try:
        import pytesseract  # noqa: PLC0415
    except Exception:
        return False
    try:
        pytesseract.get_tesseract_version()
    except Exception:
        return False
    return True


def _case_text(case: dict[str, Any], *, live_ocr: bool) -> tuple[str, str]:
    """Return ``(text, source)`` for a case.

    ``source`` records honestly how the text was obtained: a live Tesseract read
    of a committed image, or the committed recorded text layer.
    """
    image_rel = case.get("image")
    if live_ocr and image_rel:
        image_path = CORPUS_DIR / image_rel
        if image_path.exists():
            import pytesseract  # noqa: PLC0415
            from PIL import Image  # noqa: PLC0415

            return pytesseract.image_to_string(Image.open(image_path)), "tesseract_image"
    return (CORPUS_DIR / case["text"]).read_text(encoding="utf-8"), "recorded_text"


def _evaluate_case(case: dict[str, Any], *, live_ocr: bool) -> CaseReport:
    from apps.documents.grade_extraction import parse_result_slip

    text, source = _case_text(case, live_ocr=live_ocr)
    result = parse_result_slip(text)

    truth = {(code, grade) for code, grade in (tuple(entry) for entry in case.get("slip_truth", []))}
    confirmable = {(c.subject_code, c.grade) for c in result.candidates if c.confirmable}
    resolved_any = {(c.subject_code, c.grade) for c in result.candidates if c.subject_code and c.grade}

    correct = sorted(confirmable & truth)
    wrong = sorted(confirmable - truth)
    withheld = sorted((truth & resolved_any) - confirmable)
    missed = sorted(truth - resolved_any)

    status_counts: dict[str, int] = {}
    for candidate in result.candidates:
        status_counts[candidate.status] = status_counts.get(candidate.status, 0) + 1

    report = CaseReport(
        case_id=case["id"],
        document_type=case.get("document_type", "result_slip"),
        source=source,
        truth_count=len(truth),
        correct=[list(item) for item in correct],
        wrong=[list(item) for item in wrong],
        withheld=[list(item) for item in withheld],
        missed=[list(item) for item in missed],
        status_counts=status_counts,
        mean_confidence=result.mean_confidence,
        exam_number=result.exam_number,
        exam_year=result.exam_year,
    )

    expected = case.get("expected") or {}
    expected_confirmable = sorted(tuple(entry) for entry in expected.get("confirmable", []))
    if sorted(confirmable) != expected_confirmable:
        report.expectation_failures.append(
            f"confirmable mismatch: got {sorted(confirmable)} expected {expected_confirmable}"
        )
    expected_counts = expected.get("status_counts")
    if expected_counts is not None and status_counts != {k: v for k, v in expected_counts.items()}:
        report.expectation_failures.append(
            f"status_counts mismatch: got {status_counts} expected {expected_counts}"
        )
    for label, tier in (expected.get("match_tiers") or {}).items():
        actual = next((c.match for c in result.candidates if c.raw_label == label), None)
        if actual != tier:
            report.expectation_failures.append(
                f"match tier for {label!r}: got {actual!r} expected {tier!r}"
            )
    if "exam_number" in case and result.exam_number != case["exam_number"]:
        report.expectation_failures.append(
            f"exam_number mismatch: got {result.exam_number!r} expected {case['exam_number']!r}"
        )
    if "exam_year" in case and result.exam_year != case["exam_year"]:
        report.expectation_failures.append(
            f"exam_year mismatch: got {result.exam_year!r} expected {case['exam_year']!r}"
        )
    return report


def evaluate(*, allow_live_ocr: bool = True) -> dict[str, Any]:
    """Run the whole corpus and return the structured report."""
    from apps.catalog.subject_catalog import SUBJECT_CATALOG_VERSION
    from apps.documents.grade_extraction import (
        MIN_CONFIRMABLE_CONFIDENCE,
        PARSER_VERSION,
    )

    manifest = _load_manifest()
    live_ocr = allow_live_ocr and _tesseract_available()
    cases = [_evaluate_case(case, live_ocr=live_ocr) for case in manifest["cases"]]

    total_truth = sum(c.truth_count for c in cases)
    total_correct = sum(len(c.correct) for c in cases)
    total_wrong = sum(len(c.wrong) for c in cases)
    total_withheld = sum(len(c.withheld) for c in cases)
    total_missed = sum(len(c.missed) for c in cases)
    confidences = [c.mean_confidence for c in cases if c.mean_confidence > 0]

    precision = 1.0 if (total_correct + total_wrong) == 0 else total_correct / (total_correct + total_wrong)
    recall = 1.0 if total_truth == 0 else total_correct / total_truth
    f1 = 0.0 if (precision + recall) == 0 else 2 * precision * recall / (precision + recall)
    mean_confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0.0

    thresholds = manifest["thresholds"]
    failures: list[str] = []
    for case in cases:
        failures.extend(f"{case.case_id}: {reason}" for reason in case.expectation_failures)
    if manifest["parser_version"] != PARSER_VERSION:
        failures.append(
            f"parser version drift: manifest pins {manifest['parser_version']!r}, code is {PARSER_VERSION!r}"
        )
    if total_wrong > thresholds["max_wrong_confirmable"]:
        failures.append(f"wrong confirmable candidates: {total_wrong} > {thresholds['max_wrong_confirmable']}")
    if precision < thresholds["min_precision"]:
        failures.append(f"precision {precision:.4f} < {thresholds['min_precision']}")
    if recall < thresholds["min_recall"]:
        failures.append(f"recall {recall:.4f} < {thresholds['min_recall']}")
    if mean_confidence < thresholds["min_mean_confidence"]:
        failures.append(f"mean confidence {mean_confidence:.4f} < {thresholds['min_mean_confidence']}")

    return {
        "corpus_version": manifest["corpus_version"],
        "parser_version": PARSER_VERSION,
        "catalog_version": SUBJECT_CATALOG_VERSION,
        "confirmable_confidence_floor": MIN_CONFIRMABLE_CONFIDENCE,
        "capture_mode": "tesseract_image" if live_ocr else "recorded_text",
        "tesseract_available": _tesseract_available(),
        "totals": {
            "cases": len(cases),
            "truth": total_truth,
            "correct": total_correct,
            "wrong": total_wrong,
            "withheld": total_withheld,
            "missed": total_missed,
        },
        "metrics": {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "mean_confidence": mean_confidence,
        },
        "thresholds": thresholds,
        "cases": [case.as_dict() for case in cases],
        "failures": failures,
        "passed": not failures,
    }


def _render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Deterministic OCR corpus report (admissions-v2 task 7.5)",
        "",
        f"- Corpus version: `{report['corpus_version']}`",
        f"- Parser version: `{report['parser_version']}`",
        f"- Subject catalogue version: `{report['catalog_version']}`",
        f"- Capture mode: `{report['capture_mode']}` "
        f"(tesseract binary available: {report['tesseract_available']})",
        f"- Confirmable confidence floor: `{report['confirmable_confidence_floor']}`",
        "",
        "| Metric | Value | Threshold |",
        "| --- | --- | --- |",
        f"| Precision | {report['metrics']['precision']} | >= {report['thresholds']['min_precision']} |",
        f"| Recall | {report['metrics']['recall']} | >= {report['thresholds']['min_recall']} |",
        f"| F1 | {report['metrics']['f1']} | — |",
        f"| Mean confidence | {report['metrics']['mean_confidence']} | "
        f">= {report['thresholds']['min_mean_confidence']} |",
        f"| Wrong confirmable | {report['totals']['wrong']} | "
        f"<= {report['thresholds']['max_wrong_confirmable']} |",
        "",
        "| Case | Truth | Correct | Wrong | Withheld | Missed | Statuses | Mean conf |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for case in report["cases"]:
        statuses = ", ".join(f"{k}={v}" for k, v in sorted(case["status_counts"].items())) or "—"
        lines.append(
            f"| `{case['case_id']}` | {case['truth_count']} | {len(case['correct'])} | "
            f"{len(case['wrong'])} | {len(case['withheld'])} | {len(case['missed'])} | "
            f"{statuses} | {case['mean_confidence']} |"
        )
    lines.extend(
        [
            "",
            f"**Result: {'PASS' if report['passed'] else 'FAIL'}**",
        ]
    )
    if report["failures"]:
        lines.append("")
        lines.extend(f"- {failure}" for failure in report["failures"])
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", dest="json_path", help="write the structured report to this path")
    parser.add_argument("--markdown", dest="markdown_path", help="write a markdown report to this path")
    parser.add_argument(
        "--no-live-ocr",
        action="store_true",
        help="force the recorded text layer even when a tesseract binary is installed",
    )
    args = parser.parse_args(argv)

    import django

    django.setup()

    report = evaluate(allow_live_ocr=not args.no_live_ocr)

    if args.json_path:
        Path(args.json_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if args.markdown_path:
        Path(args.markdown_path).write_text(_render_markdown(report), encoding="utf-8")

    sys.stdout.write(_render_markdown(report))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
