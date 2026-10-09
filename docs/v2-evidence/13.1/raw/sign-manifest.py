#!/usr/bin/env python3
"""Sign / verify the task 13.1 candidate manifest.

The "signature" is a content-addressed digest that binds manifest.json to the
raw artifacts it cites. It is deliberately simple and reproducible with nothing
but a Python interpreter and this repository:

    artifact_digest_sha256 = sha256(
        for each artifact path named anywhere in manifest.json, sorted:
            b"<relative path>\\n<sha256 of file contents>\\n"
    )

plus the candidate commit and the two content hashes the manifest pins
(the OpenAPI contract and the generated client), which are checked against the
real files rather than trusted.

Usage:
    sign-manifest.py            # recompute and write artifact_digest_sha256
    sign-manifest.py --verify   # recompute and compare; non-zero exit on drift
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # docs/v2-evidence/13.1/raw
EVIDENCE = HERE.parent                          # docs/v2-evidence/13.1
REPO = EVIDENCE.parents[2]                      # repo root
MANIFEST = EVIDENCE / "manifest.json"

PINNED = {
    "schema_contract_sha256": "backend/schema/openapi.v2.candidate.yaml",
    "generated_client_sha256": "apps/admissions/src/generated/api.d.ts",
}

# Matches a raw/ path anywhere inside a JSON string value, not only when the
# path is the whole value: several fields name more than one artifact in one
# comma-joined sentence, and a signature that silently skipped those would be
# binding less than it claims to.
# A trailing '.' is sentence punctuation, not part of the filename, so the
# path may not end in one.
_ARTIFACT_RE = re.compile(r'raw/[A-Za-z0-9_.\-/]*[A-Za-z0-9_\-/]')


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def artifact_paths(manifest_text: str) -> list[str]:
    """Every raw/ artifact path the manifest names, deduplicated and sorted."""
    return sorted(set(_ARTIFACT_RE.findall(manifest_text)))


def compute_digest(manifest_text: str) -> tuple[str, list[str], list[str]]:
    h = hashlib.sha256()
    present, missing = [], []
    for rel in artifact_paths(manifest_text):
        path = EVIDENCE / rel
        if not path.exists():
            missing.append(rel)
            continue
        present.append(rel)
        h.update(rel.encode())
        h.update(b"\n")
        h.update(sha256_file(path).encode())
        h.update(b"\n")
    return h.hexdigest(), present, missing


def check_pins(manifest: dict) -> list[str]:
    problems = []
    sig = manifest["signature"]
    for key, rel in PINNED.items():
        path = REPO / rel
        if not path.exists():
            problems.append(f"{rel}: missing from the tree")
            continue
        actual = sha256_file(path)
        if actual != sig.get(key):
            problems.append(f"{rel}: manifest pins {sig.get(key)} but the file is {actual}")
    return problems


def main() -> int:
    verify = "--verify" in sys.argv
    text = MANIFEST.read_text()
    manifest = json.loads(text)

    # Exclude the digest field itself so the computation is stable across runs.
    stripped = re.sub(r'"artifact_digest_sha256":\s*"[^"]*"',
                      '"artifact_digest_sha256": ""', text)
    digest, present, missing = compute_digest(stripped)
    pin_problems = check_pins(manifest)

    print(f"artifacts named by the manifest : {len(present) + len(missing)}")
    print(f"artifacts present               : {len(present)}")
    if missing:
        print(f"artifacts MISSING               : {len(missing)}")
        for m in missing:
            print(f"    {m}")
    print(f"artifact_digest_sha256          : {digest}")
    for p in pin_problems:
        print(f"PIN MISMATCH: {p}")

    if verify:
        recorded = manifest["signature"]["artifact_digest_sha256"]
        ok = (recorded == digest) and not missing and not pin_problems
        print(f"recorded digest                 : {recorded}")
        print("VERIFY: " + ("PASS" if ok else "FAIL"))
        return 0 if ok else 1

    MANIFEST.write_text(re.sub(r'"artifact_digest_sha256":\s*"[^"]*"',
                               f'"artifact_digest_sha256": "{digest}"', text))
    print(f"wrote artifact_digest_sha256 into {MANIFEST.relative_to(REPO)}")
    return 1 if (missing or pin_problems) else 0


if __name__ == "__main__":
    raise SystemExit(main())
