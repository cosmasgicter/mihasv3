# Deterministic OCR corpus report (admissions-v2 task 7.5)

- Corpus version: `2026-07-29.1`
- Parser version: `ecz-slip-2026-07-1`
- Subject catalogue version: `ecz-62-1b6a730c7f9ab9e7`
- Capture mode: `recorded_text` (tesseract binary available: False)
- Confirmable confidence floor: `0.7`

| Metric | Value | Threshold |
| --- | --- | --- |
| Precision | 1.0 | >= 1.0 |
| Recall | 0.9231 | >= 0.85 |
| F1 | 0.96 | — |
| Mean confidence | 0.9264 | >= 0.8 |
| Wrong confirmable | 0 | <= 0 |

| Case | Truth | Correct | Wrong | Withheld | Missed | Statuses | Mean conf |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `clean_grade12_slip` | 7 | 7 | 0 | 0 | 0 | suggested=7 | 0.95 |
| `dot_leader_slip` | 6 | 6 | 0 | 0 | 0 | suggested=6 | 0.95 |
| `alias_names_slip` | 7 | 7 | 0 | 0 | 0 | suggested=7 | 0.8643 |
| `noisy_scan_slip` | 5 | 4 | 0 | 0 | 1 | suggested=4, unresolved=1 | 0.8 |
| `low_confidence_alias_slip` | 3 | 1 | 0 | 2 | 0 | low_confidence=2, suggested=1 | 0.95 |
| `duplicate_subject_slip` | 2 | 2 | 0 | 0 | 0 | duplicate=2, suggested=2 | 0.95 |
| `unknown_subject_slip` | 1 | 1 | 0 | 0 | 0 | suggested=1, unresolved=2 | 0.95 |
| `tampered_grades_slip` | 1 | 1 | 0 | 0 | 0 | invalid_grade=3, suggested=1 | 0.95 |
| `not_a_result_slip` | 0 | 0 | 0 | 0 | 0 | — | 0.0 |
| `unreadable_scan` | 0 | 0 | 0 | 0 | 0 | — | 0.0 |
| `alevel_slip` | 3 | 3 | 0 | 0 | 0 | suggested=3 | 0.95 |
| `letter_descriptor_slip` | 4 | 4 | 0 | 0 | 0 | suggested=4 | 0.95 |

**Result: PASS**
