# Why 13.3 publishes no DB invariant report

Task 13.2's `_Evidence:` line names a *"DB invariant report"*. Task 13.3's does
not — it names a **"visual/a11y report with reviewed screenshots and pixel
checks"** — and this task makes no database claim, so it publishes no invariant
SQL rather than copying 13.2's and re-answering questions that belong to another
bullet.

One database fact *was* found, and it is filed as a **finding** rather than as an
invariant gate, because it is a schema-width mismatch rather than a data-state
claim: `intakes.name` is `varchar(255)` while the application display snapshot
`applications.intake` is `varchar(100)`, so a legally-named long intake makes
every student application create fail with an unhandled `DataError`. See
**GATE-13.3-13** in [`README.md`](README.md) §8.

A future invariant gate for it would read:

```sql
-- Every intake name must fit the application snapshot column that copies it.
SELECT count(*) AS intakes_too_long_for_application_snapshot
FROM intakes
WHERE length(name) > 100;
```

It is written here rather than run as a gate because on a *harness* database the
only such row is the one this task created on purpose, so the query proves
nothing until it is run somewhere real. **13.4 owns the Neon rehearsal and 13.5
the production canary** — that is where this query belongs, and where it would be
answered against data nobody wrote for the test.
