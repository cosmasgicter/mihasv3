#!/usr/bin/env bash
# The one local bring-up path (platform-simplification task 11.1, requirements 1.1 and 1.10).
#
#   bash harness/bin/local-setup.sh
#
# Checks the five prerequisites before it starts anything, installs the JavaScript
# dependencies from the lockfile, then brings the isolated harness stack up from an empty
# database. It sets no variable of its own: whatever the caller exported reaches
# `harness/bin/harness`, which reads every value as ${VAR:-default}.
# A missing tool exits 3 and names the tool.
set -euo pipefail
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
need() {
  command -v "$1" >/dev/null 2>&1 || { echo "local-setup: missing prerequisite: $1 ($2)" >&2; exit 3; }
}
need docker "Docker with Compose v2"
docker compose version >/dev/null 2>&1 || { echo "local-setup: missing prerequisite: docker compose (Compose v2)" >&2; exit 3; }
need bun "Bun, https://bun.sh"
need git "Git"
need curl "curl"
need python3 "python3 3.8 or later"
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' \
  || { echo "local-setup: missing prerequisite: python3 3.8 or later" >&2; exit 3; }
cd "${REPO_ROOT}"
bun install --frozen-lockfile
exec bash harness/bin/harness up
