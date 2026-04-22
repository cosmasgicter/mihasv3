#!/usr/bin/env bash
set -euo pipefail

date_prefix="$(date +%Y.%m.%d)"
latest_same_day="$(git tag --list "v${date_prefix}-*" | sed "s/^v${date_prefix}-//" | sort -n | tail -n 1)"

if [[ -z "${latest_same_day}" ]]; then
  next_number=1
else
  next_number=$((latest_same_day + 1))
fi

tag="v${date_prefix}-${next_number}"
git tag "${tag}"

printf 'Created release tag: %s\n' "${tag}"
printf 'Push with: git push origin %s\n' "${tag}"
