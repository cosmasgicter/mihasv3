# Production procedure — legacy-column contraction

Task **12.3** of `.kiro/specs/admissions-v2-canonical-rebuild/`.
Written 2026-08-11 (UTC). **Operator-gated. Not executed by task 12.3.**

---

## Why this is a written procedure and not a completed step

Production is the self-hosted Docker Postgres `mihas-postgres-1` on the AWS EC2
box, reachable only over SSH (`.kiro/steering/infrastructure.md`). It is a
different database from Neon in every respect: different host, different data,
different backup mechanism, and no shared recovery path. R15.7 requires that
production is never the first place a change lands, and the steering rules make
every production write an operator step with a backup taken first.

Task 12.3 therefore did **not**:

* SSH to `ec2-13-244-37-190.af-south-1.compute.amazonaws.com`;
* run `apply_sql_migrations` against production;
* run any read query against `mihas-postgres-1`, including the invariant queries;
* take, move, or inspect a production backup.

Dropping a column is irreversible with respect to data. On the databases task
12.3 *could* measure, three of the five gates failed and the contraction would
have destroyed the only surviving record of 16 applicants' payments. Carrying
that to production autonomously would have been the wrong act even if the gates
had passed.

**So the first thing this procedure asks an operator to do is not to apply
anything — it is to measure.** Steps 1–3 are read-only and will, on current
evidence, tell you to stop.

---

## Step 0 — Preconditions

- [ ] The Neon default branch has the contraction applied and re-verified
      (manifest §3 steps 5–6). Production is never the first apply.
- [ ] All five gates read zero on **production** (step 3 below), not only on Neon.
      Neon and production hold different data; a Neon pass says nothing about
      production's 16 unbacked rows.
- [ ] A maintenance window is agreed. `ALTER TABLE ... DROP COLUMN` takes
      `ACCESS EXCLUSIVE` on `applications`.
- [ ] Someone other than the operator has read `docs/v2-evidence/12.3/README.md`
      §3 and agrees the gates are genuinely met.

## Step 1 — Back up first. Before anything else.

```bash
chmod 600 /home/cosmas/Downloads/mihasapplication2026.pem
ssh -i /home/cosmas/Downloads/mihasapplication2026.pem \
  ubuntu@ec2-13-244-37-190.af-south-1.compute.amazonaws.com

cd ~/mihas
docker compose -f docker-compose.prod.yml ps        # every service healthy first

./deploy/backup-db.sh                               # the rollback of record
ls -lh <the path backup-db.sh reports>              # confirm non-zero size
```

This dump **is** the rollback. Neon point-in-time recovery does not cover this
database. Do not proceed without a verified backup — see
`docs/runbooks/database-backup-restore.md` for the restore side.

## Step 2 — Copy the read-only instrument onto the box

```bash
# from your workstation, in the repo root
scp -i /home/cosmas/Downloads/mihasapplication2026.pem \
  docs/v2-evidence/12.3/invariants.sql \
  ubuntu@ec2-13-244-37-190.af-south-1.compute.amazonaws.com:~/mihas/invariants.sql
```

The file contains only `SELECT`s and `\echo`s. `backend/tests/unit/`
`test_legacy_column_contraction_12_3.py::test_invariants_are_read_only` fails if
that ever stops being true.

## Step 3 — Measure production. Read the output before doing anything.

```bash
cd ~/mihas
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' < invariants.sql \
  | tee ~/legacy-column-invariants-prod-$(date -u +%Y%m%dT%H%M%SZ).txt
```

Then read, in this order:

| Read | If | Then |
|---|---|---|
| Gate 1b `unbacked_money_rows` | `> 0` | **STOP.** Those columns are the only record of those payments. The unblocking work is the pre-Lenco backfill (README §3.2), and authoring historical ledger rows for real applicant money is an owner's decision. |
| Gate 2 `missing_canonical_ids` | `> 0` | **STOP.** The snapshot-consistency gate has an empty comparison domain. Run the task-3.2 canonical assignment backfill on production first. |
| Gate 3 `projection_mismatches` | `> 0` | **STOP.** Hand to the payment lane; README §6.3 names the root cause. |
| Gate 1 per-column counts | any `> 0` for the 7 contracted columns | **STOP.** The migration's Guard 2 will refuse anyway; better to find out here. |
| today's date | `< 2026-08-15` | **STOP.** Guard 1 will refuse. |

On the evidence available on 2026-08-11, the expected outcome of step 3 is
**stop**, and that is a successful run of this procedure, not a failed one.
Delete the copied `invariants.sql` and the output file when done
(`shred -u`) — the output names application numbers.

## Step 4 — Apply (only if every gate in step 3 read zero)

The script must be at the **top level** of `backend/scripts/` in the deployed
image, which means promoting it (manifest §3 step 5) and shipping a new image
first. Then, inside the `web` container:

```bash
cd ~/mihas

# 4a. Confirm discovery, change nothing. The lint rejection here is EXPECTED and
#     is the reason 4b needs the flag.
docker compose -f docker-compose.prod.yml exec web \
  python manage.py apply_sql_migrations --dry-run

# 4b. Apply. --allow-non-additive is required: this is a contraction, and the
#     additive lint rejects DROP COLUMN pre-execution without it.
docker compose -f docker-compose.prod.yml exec web \
  python manage.py apply_sql_migrations --allow-non-additive

# 4c. Idempotence: a second run must report 0 pending.
docker compose -f docker-compose.prod.yml exec web \
  python manage.py apply_sql_migrations --allow-non-additive
```

Set a lock timeout so the migration yields rather than stalling the platform
behind a long-running read. If your Postgres client settings do not already carry
one, apply the script directly with one instead of via the runner:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "SET lock_timeout = '"'"'5s'"'"';" \
     -f /dev/stdin' < backend/scripts/legacy_columns_contract_2026_08_15.sql
```

A `lock_timeout` abort rolls the whole transaction back and changes nothing —
retry in a quieter window.

**Do not add `--allow-non-additive` to `backend/Dockerfile`'s CMD.** Its absence
is what prevents a contraction from ever running unattended at boot.

## Step 5 — Verify

```bash
# the 7 columns are gone; the 2 registered exceptions remain
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
     SELECT column_name FROM information_schema.columns
      WHERE table_name = '"'"'applications'"'"'
        AND column_name IN (
          '"'"'payment_method'"'"','"'"'payer_name'"'"','"'"'payer_phone'"'"',
          '"'"'amount'"'"','"'"'paid_at'"'"','"'"'momo_ref'"'"','"'"'pop_url'"'"',
          '"'"'payment_verified_at'"'"','"'"'payment_verified_by'"'"')
      ORDER BY 1;"'
# expect EXACTLY 2 rows: payment_verified_at, payment_verified_by

# the migration recorded itself
docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
     SELECT migration_name, applied_at FROM migration_history
      WHERE migration_name = '"'"'legacy_columns_contract_2026_08_15.sql'"'"';"'

# the platform still answers, and Application queries still work
curl -fsS https://<production-host>/health/ready/
docker compose -f docker-compose.prod.yml logs --tail=100 web | grep -i "does not exist" || echo "no missing-column errors"
```

Then run the read-only post-deploy smoke:
`docs/runbooks/post-deploy-smoke-check.md`.

## Step 6 — Rollback, if step 5 fails

1. **Restore the step-1 dump.** `docs/runbooks/database-backup-restore.md`. This
   is the only path that recovers the column values; there is no other.
2. Then run the bookkeeping rollback so the forward script is re-runnable:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T postgres bash -lc \
     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     < backend/scripts/future/legacy_columns_contract_2026_08_15_rollback.sql
   ```
3. Do **not** try to re-add the columns as a fix. They would come back empty, and
   an empty `amount` on a paid application is worse than a missing one.

## Step 7 — Housekeeping

- [ ] `shred -u` the copied `invariants.sql` and any output file on the box.
- [ ] Never echo or commit the DB password, the `.pem`, or a dump.
- [ ] Record the applied timestamp and the schema fingerprint in the release
      evidence (R15.8, R18.5).
- [ ] Update `docs/runbooks/legacy-column-deprecation.md`'s Day-90 section with
      what actually happened, on the real date, in the style its existing
      retroactive notes use.
