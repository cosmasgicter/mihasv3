# Audit Results — Archive

This directory contains historical exploratory audit reports produced during
the 2026-04 and 2026-05 admissions system audits. They are kept as historical
record and reference material but are **not current** — the system has shipped
substantial remediation since these reports were written.

## Current canonical references

For the current system state and canonical truth, see:

- **[docs/canonical-truth-map.md](../docs/canonical-truth-map.md)** — master index of canonical sources of truth
- **[docs/admissions-system-audit-2026-05-17.md](../docs/admissions-system-audit-2026-05-17.md)** — current audit
- **[docs/release-notes-canonical-truth-2026-05.md](../docs/release-notes-canonical-truth-2026-05.md)** — what shipped in the canonical-truth program
- **[AUDIT-REPORT-2026-04-24.md](../AUDIT-REPORT-2026-04-24.md)** — April 2026 exhaustive audit (335/520 items, 18 bugs, 9 zero-day risks)

## What's in this directory

Files here are unsorted historical artifacts from various exploratory passes:

| File pattern | Origin |
|--------------|--------|
| `payment-*-analysis.md` | Payment-deep-dive audits (April 2026) |
| `exhaustive-*-pass*.md` | Exhaustive multi-pass audits |
| `admin-*-ux-audit.md`, `wizard-*-audit.md`, `student-pages-ux-audit.md` | UX deep audits |
| `backend-*-findings.md`, `admissions-*-findings.md` | Domain-specific findings |
| `batch*-*-audit.generated.md` | Batched per-area audits |
| `hardening-*.md` | Pre-payment-hardening planning |
| `FINAL-AUDIT-REPORT-2026-04-23.md`, `RE-AUDIT-REPORT-2026-04-24.md` | Final audit summaries (superseded by AUDIT-REPORT-2026-04-24.md at repo root) |
| `payment-status-callsites-2026-05-17.md` | Stream 2 callsite inventory (canonical-truth program) |
| `CONTINUATION-LEDGER-*.md` | Audit continuation tracking |

## Why we keep them

These reports document the reasoning behind specific decisions. When a future
maintainer asks "why is force_approved a first-class status?" or "why does the
system actor have a fixed UUID?", these files capture the analysis that led
to those decisions, even after the canonical-truth-map.md has consolidated
the live state.

**Do not modify these files.** Add new audits as new files; if a topic is
revisited, the new file supersedes the old one and the old one stays for
historical record.
