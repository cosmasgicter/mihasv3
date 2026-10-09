#!/usr/bin/env bash
# M9 — docs/ fingerprint instrument (same shape as M8's raw/00 and raw/41).
#
# Prints, for the whole docs/ tree and then per docs/v2-evidence/<task>/
# directory, a file count and a deterministic sha256 over (relative path, file
# sha256) pairs. Run once BEFORE the batch and once AFTER, then diff, to prove
# no other task's or batch's evidence directory was written.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

tree_hash() {
  # $1 = directory; deterministic over sorted "sha  relpath" lines
  local d="$1"
  find "$d" -type f -print0 2>/dev/null | LC_ALL=C sort -z \
    | xargs -0 -r sha256sum 2>/dev/null \
    | LC_ALL=C sort | sha256sum | cut -d' ' -f1
}
file_count() { find "$1" -type f 2>/dev/null | wc -l | tr -d ' '; }

echo "files=$(file_count docs)"
echo "tree_sha256=$(tree_hash docs)"
for d in $(ls -1 docs/v2-evidence 2>/dev/null | LC_ALL=C sort); do
  p="docs/v2-evidence/$d"
  if [ -d "$p" ]; then
    printf 'evidence/%-8s files=%-5s tree=%s\n' "$d" "$(file_count "$p")" "$(tree_hash "$p")"
  fi
done
