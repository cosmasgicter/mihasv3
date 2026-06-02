#!/usr/bin/env python3
"""Select a balanced shard of backend property test files."""

from __future__ import annotations

import argparse
from pathlib import Path


HEAVY_FILE_WEIGHTS = {
    "test_payment_state_machine_properties.py": 10,
    "test_payment_webhook_properties.py": 8,
    "test_admissions_canonicalization.py": 8,
    "test_payment_receipt_properties.py": 7,
    "test_payment_fee_resolver_properties.py": 6,
    "test_migration_history_forward_only.py": 6,
    "test_schema_reconciliation_invariants.py": 5,
    "test_application_hardening.py": 4,
    "test_approval_flow_preservation.py": 4,
    "test_production_readiness_csrf.py": 4,
    "test_production_readiness_test_isolation.py": 3,
}


def discover_property_tests(root: Path) -> list[Path]:
    property_dir = root / "tests" / "property"
    return sorted(property_dir.glob("test_*.py"))


def weight_for(path: Path) -> int:
    return HEAVY_FILE_WEIGHTS.get(path.name, 1)


def build_shards(files: list[Path], total: int) -> list[list[Path]]:
    shards: list[list[Path]] = [[] for _ in range(total)]
    shard_weights = [0] * total

    weighted_files = sorted(
        files,
        key=lambda path: (-weight_for(path), path.name),
    )

    for path in weighted_files:
        shard_index = min(range(total), key=lambda index: (shard_weights[index], index))
        shards[shard_index].append(path)
        shard_weights[shard_index] += weight_for(path)

    return [sorted(shard) for shard in shards]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shard", type=int, required=True, help="Zero-based shard index.")
    parser.add_argument("--total", type=int, required=True, help="Total number of shards.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.total < 1:
        raise SystemExit("--total must be at least 1")

    if args.shard < 0 or args.shard >= args.total:
        raise SystemExit("--shard must be between 0 and --total - 1")

    root = Path.cwd()
    shards = build_shards(discover_property_tests(root), args.total)

    for path in shards[args.shard]:
        print(path.relative_to(root).as_posix())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
