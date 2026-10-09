#!/usr/bin/env bash
# generate-api-types.sh — Generate V2 candidate OpenAPI schema + TypeScript client types
#
# Usage:
#   ./scripts/generate-api-types.sh           # full pipeline: schema → types
#   ./scripts/generate-api-types.sh --types   # skip schema gen, regenerate types from existing candidate
#
# Prerequisites:
#   - Python venv with backend requirements (for drf-spectacular schema gen)
#   - Bun (for openapi-typescript type generation)
#
# Output:
#   - backend/schema/openapi.v2.candidate.yaml   (generated OpenAPI 3.0.3 schema)
#   - apps/admissions/src/generated/api.d.ts     (strict TypeScript types)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
SCHEMA_DIR="$BACKEND_DIR/schema"
FRONTEND_DIR="$REPO_ROOT/apps/admissions"
GENERATED_DIR="$FRONTEND_DIR/src/generated"
CANDIDATE_SCHEMA="$SCHEMA_DIR/openapi.v2.candidate.yaml"
GENERATED_TYPES="$GENERATED_DIR/api.d.ts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[generate-api-types]${NC} $1"; }
warn() { echo -e "${YELLOW}[generate-api-types]${NC} $1"; }
error() { echo -e "${RED}[generate-api-types]${NC} $1" >&2; }

# Step 1: Generate OpenAPI schema from the candidate backend (unless --types flag)
generate_schema() {
  info "Generating V2 candidate OpenAPI schema from backend..."

  cd "$BACKEND_DIR"

  # Activate the backend venv if it exists
  if [ -f ".venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
  fi

  # Use minimal environment for schema generation (no live DB required)
  DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.dev}" \
  SECRET_KEY="${SECRET_KEY:-generate-api-types-dummy-key}" \
  JWT_SIGNING_KEY="${JWT_SIGNING_KEY:-generate-api-types-dummy-jwt}" \
  DATABASE_URL="${DATABASE_URL:-sqlite:///tmp/schema-gen.db}" \
  REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}" \
  ALLOWED_HOSTS="${ALLOWED_HOSTS:-*}" \
    python manage.py spectacular \
      --skip-checks \
      --file "$CANDIDATE_SCHEMA"

  info "Schema generated: $CANDIDATE_SCHEMA"
}

# Step 2: Generate TypeScript types from the candidate schema
generate_types() {
  info "Generating TypeScript types from candidate schema..."

  mkdir -p "$GENERATED_DIR"

  cd "$FRONTEND_DIR"

  # Generate strict types using openapi-typescript
  bunx openapi-typescript "$CANDIDATE_SCHEMA" \
    --output "$GENERATED_TYPES" \
    --immutable

  info "TypeScript types generated: $GENERATED_TYPES"
}

# Step 3: Verify the generated types compile
verify_types() {
  info "Verifying generated types compile..."

  cd "$FRONTEND_DIR"

  # Quick typecheck of the generated file (non-blocking — just warns)
  if bun x tsc --noEmit --strict "$GENERATED_TYPES" 2>/dev/null; then
    info "Types compile cleanly."
  else
    warn "Generated types have compiler warnings (expected for large schemas)."
    warn "Run 'cd apps/admissions && bun run type-check' for full project verification."
  fi
}

# Main
main() {
  local skip_schema=false

  for arg in "$@"; do
    case "$arg" in
      --types) skip_schema=true ;;
      --help|-h)
        echo "Usage: $0 [--types]"
        echo "  --types  Skip schema generation, only regenerate TypeScript types"
        exit 0
        ;;
    esac
  done

  if [ "$skip_schema" = false ]; then
    generate_schema
  else
    if [ ! -f "$CANDIDATE_SCHEMA" ]; then
      error "Candidate schema not found at $CANDIDATE_SCHEMA"
      error "Run without --types to generate the schema first."
      exit 1
    fi
    info "Skipping schema generation (--types flag)."
  fi

  generate_types
  verify_types

  echo ""
  info "Done. Generated files:"
  info "  Schema: $CANDIDATE_SCHEMA"
  info "  Types:  $GENERATED_TYPES"
}

main "$@"
