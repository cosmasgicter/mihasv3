#!/usr/bin/env bash
# M5 evidence-isolation fingerprint. The directories L8 made run-scoped, plus the
# ones GATE-13.1-07 named as victims. Run before and after; diff must be empty.
cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." || exit 1
for d in 0.4 2.2 11.1 11.2 11.3 11.4 11.5 13.3; do
  n=$(find "docs/v2-evidence/$d" -type f 2>/dev/null | wc -l)
  s=$(find "docs/v2-evidence/$d" -type f -print0 2>/dev/null | sort -z \
        | xargs -0 -r sha256sum | sha256sum | cut -d' ' -f1)
  printf '%-6s files=%-5s tree_sha256=%s\n' "$d" "$n" "$s"
done
