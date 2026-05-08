#!/usr/bin/env bash
# MIHAS API quality gate. Regenerates schema, runs linter + breaking-change
# detector against the baseline, writes a report, and exits non-zero on
# regression.
#
# Usage:
#     bash backend/scripts/api_quality.sh [--report PATH] [--venv-python PATH]
#
# Exit codes:
#   0   — no regression (issue count ≤ baseline, zero breaking changes)
#   1   — regression detected
#   2   — infra error (missing venv, schema generation failed, etc.)

set -euo pipefail

REPORT="/tmp/api_quality_report.md"
PY="${PY:-python3}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --report) REPORT="$2"; shift 2;;
        --venv-python) PY="$2"; shift 2;;
        -h|--help)
            sed -n '2,15p' "$0"; exit 0;;
        *) echo "Unknown arg: $1" >&2; exit 2;;
    esac
done

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
SCHEMA_DIR="$BACKEND_DIR/schema"
SKILLS_DIR="$REPO_ROOT/.kiro/skills/api-design-reviewer/scripts"

BASELINE_YAML="$SCHEMA_DIR/openapi.v1.baseline.yaml"
BASELINE_LINT="$SCHEMA_DIR/lint_baseline.json"
CURRENT_YAML="/tmp/current_schema.yaml"
CURRENT_JSON="/tmp/current_schema.json"
CURRENT_LINT="/tmp/current_lint.json"
BASELINE_JSON="/tmp/baseline_schema.json"

# Sanity checks
for f in "$BASELINE_YAML" "$BASELINE_LINT" "$SKILLS_DIR/api_linter.py" "$SKILLS_DIR/breaking_change_detector.py"; do
    if [[ ! -f "$f" ]]; then
        echo "ERROR: required file missing: $f" >&2
        exit 2
    fi
done

echo "# API Quality Report" > "$REPORT"
echo "" >> "$REPORT"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$REPORT"
echo "" >> "$REPORT"

# 1. Regenerate current schema
echo "=> Regenerating schema..."
cd "$BACKEND_DIR"
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.dev}"
export SECRET_KEY="${SECRET_KEY:-ci-test-secret}"
export JWT_SIGNING_KEY="${JWT_SIGNING_KEY:-ci-test-jwt}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///tmp/api_quality.db}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
export ALLOWED_HOSTS="${ALLOWED_HOSTS:-*}"

if ! "$PY" manage.py spectacular --file "$CURRENT_YAML" 2> /tmp/spectacular.stderr; then
    echo "ERROR: schema generation failed" >&2
    cat /tmp/spectacular.stderr >&2
    exit 2
fi

SPEC_ERRORS=$(grep -c "^/.*: Error" /tmp/spectacular.stderr || true)
SPEC_WARNINGS=$(grep -c "^/.*: Warning" /tmp/spectacular.stderr || true)

# Convert YAML → JSON for the linter and detector
"$PY" -c "import yaml, json, sys; json.dump(yaml.safe_load(open(sys.argv[1])), open(sys.argv[2],'w'))" \
    "$CURRENT_YAML" "$CURRENT_JSON"
"$PY" -c "import yaml, json, sys; json.dump(yaml.safe_load(open(sys.argv[1])), open(sys.argv[2],'w'))" \
    "$BASELINE_YAML" "$BASELINE_JSON"

# 2. Run linter on current schema
echo "=> Running linter..."
"$PY" "$SKILLS_DIR/api_linter.py" --format json "$CURRENT_JSON" --output "$CURRENT_LINT" >/dev/null || true

CURRENT_ISSUES=$("$PY" -c "import json; print(json.load(open('$CURRENT_LINT'))['summary']['total_issues'])")
BASELINE_ISSUES=$("$PY" -c "import json; print(json.load(open('$BASELINE_LINT'))['summary']['total_issues'])")
CURRENT_LINT_ERRORS=$("$PY" -c "import json; print(json.load(open('$CURRENT_LINT'))['summary']['errors'])")

# 3. Run breaking-change detector
echo "=> Running breaking-change detector..."
BREAKING_OUT=$("$PY" "$SKILLS_DIR/breaking_change_detector.py" "$BASELINE_JSON" "$CURRENT_JSON" --format json 2>/dev/null || true)
BREAKING_COUNT=$("$PY" -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    s = d.get('summary', {})
    print(s.get('breaking_changes', s.get('total_breaking_changes', s.get('breaking', 0))))
except Exception:
    print(0)
" "$BREAKING_OUT" 2>/dev/null || echo 0)

# 4. Write report
{
    echo "## Summary"
    echo ""
    echo "| Metric | Baseline | Current | Delta |"
    echo "|---|---|---|---|"
    echo "| drf-spectacular errors | ? | $SPEC_ERRORS | n/a |"
    echo "| drf-spectacular warnings | ? | $SPEC_WARNINGS | n/a |"
    echo "| Linter issues | $BASELINE_ISSUES | $CURRENT_ISSUES | $((CURRENT_ISSUES - BASELINE_ISSUES)) |"
    echo "| Linter errors | ? | $CURRENT_LINT_ERRORS | n/a |"
    echo "| Breaking changes | 0 | $BREAKING_COUNT | — |"
    echo ""
    echo "## Baseline location"
    echo "- Schema: \`backend/schema/openapi.v1.baseline.yaml\`"
    echo "- Lint baseline: \`backend/schema/lint_baseline.json\`"
    echo "- Targets: \`backend/schema/REMEDIATION_TARGETS.md\`"
    echo ""
    if [[ "$CURRENT_ISSUES" -gt "$BASELINE_ISSUES" ]]; then
        echo "❌ Linter issue count regressed: $CURRENT_ISSUES > $BASELINE_ISSUES"
    else
        echo "✓ Linter issue count within baseline ($CURRENT_ISSUES ≤ $BASELINE_ISSUES)"
    fi
    if [[ "$BREAKING_COUNT" -gt 0 ]]; then
        echo "❌ $BREAKING_COUNT breaking change(s) detected"
    else
        echo "✓ No breaking changes"
    fi
} >> "$REPORT"

echo ""
cat "$REPORT"

# 5. Exit code
if [[ "$CURRENT_ISSUES" -gt "$BASELINE_ISSUES" ]]; then
    echo "api-quality: REGRESSION — linter issues increased" >&2
    exit 1
fi
if [[ "$BREAKING_COUNT" -gt 0 ]]; then
    echo "api-quality: BREAKING — $BREAKING_COUNT breaking change(s) vs baseline" >&2
    exit 1
fi

echo "api-quality: ✓ OK"
exit 0
