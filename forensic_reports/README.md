# Forensic Audit Reports

This directory contains generated reports from the MIHAS Frontend-Backend Forensic Audit System.

## Generated Reports

| Report | Description |
|--------|-------------|
| `contract-mismatch-report.md` | Frontend-backend API contract mismatches |
| `page-validation-matrix.md` | Page-by-page audit results |
| `loader-unification-plan.md` | Loader/spinner consolidation plan |
| `auth-workflow-report.md` | Authentication workflow analysis |
| `sse-implementation-report.md` | SSE/realtime implementation status |
| `notification-flow-report.md` | Notification and email pipeline audit |
| `performance-fixes-report.md` | Performance issues and recommendations |
| `stale-code-removal-list.md` | Dead code identified for removal |
| `final-clean-architecture-summary.md` | Executive summary of all findings |

## Running the Audit

```bash
# Run full audit
bun run audit --full

# Run specific auditors
bun run audit --contract    # Contract mismatch audit
bun run audit --page        # Page-by-page audit
bun run audit --loader      # Loader unification audit
bun run audit --auth        # Auth workflow audit
bun run audit --sse         # SSE implementation audit
bun run audit --notification # Notification pipeline audit
bun run audit --performance # Performance audit
bun run audit --deadcode    # Dead code audit
```

## Report Format

All reports are generated in Markdown format for human readability.
JSON versions are also available for programmatic processing.

## Evidence Format

All findings include evidence in this format:
- **File Path**: Relative path from project root
- **Line Numbers**: Specific lines where issue was found
- **Code Snippet**: Relevant code (max 10 lines)
- **Reason**: Why this is flagged
- **Confidence**: certain | likely | possible

## Notes

- Reports are regenerated on each audit run
- Previous reports are overwritten
- Commit reports to track audit history over time
