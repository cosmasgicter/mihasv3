# Neon subject-catalogue inventory (read-only)

Task 7.1 bullet 1 — "Inventory/migrate canonical subject catalog and aliases".
Read against the **Neon default branch** (project `mihasApplication`,
`wild-bar-37055823`) through the Neon MCP power. **No writes, no branch created,
nothing applied.** Production (the self-hosted Postgres on EC2) was not touched
or read.

## Totals

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE is_active)          AS active,
       count(*) FILTER (WHERE is_active IS NULL)  AS null_active
FROM subjects;
--  total | active | null_active
--     65 |     65 |           0

SELECT curriculum_type, count(*) FROM subjects GROUP BY 1 ORDER BY 1;
--  a_level | 19
--  ecz     | 46
```

The canonical catalogue defined in `backend/apps/catalog/subject_catalog.py` is
**62 rows** (43 ECZ + 19 A-Level). Neon carries 65, and the three extra ECZ rows
are the finding below. Nothing from the canonical catalogue is missing.

## Finding: three duplicate identities, and the legacy row holds every reference

| Legacy row | Canonical row | Legacy category | Legacy `is_core` | `application_grades` on legacy | on canonical | `course_requirements` on legacy |
|---|---|---|---|---|---|---|
| `ADD_MATH` "Additional Mathematics" | `ADDMATH` | `Sciences` | false | **6** | 0 | 0 |
| `MUS` "Music" | `MUSIC` | `Arts` | false | **4** | 0 | 0 |
| `PHYS` "Physics" | `PHY` | `Sciences` | **true** (wrong) | **4** | 0 | **1** |

Two active rows for one real subject let a student persist "five unique
subjects" that are really four — the completeness claim R11.5 forbids. And
because it is the *legacy* rows that carry all 14 grade references plus one
eligibility rule, simply deactivating them would have stranded real students'
grades as `unresolved_subject_count`.

The legacy rows also carry **title-case categories** (`Sciences`, `Arts`). The
wizard's category grouping only rendered a curated lowercase set, so those rows
were already invisible in the selector while remaining selectable-by-id and
countable server-side.

## Collision check

```sql
SELECT g.application_id, count(*)
FROM application_grades g JOIN subjects s ON s.id = g.subject_id
WHERE s.code IN ('ADD_MATH','ADDMATH','MUS','MUSIC','PHY','PHYS')
GROUP BY 1 HAVING count(*) > 1;
--  3eb2a6b8-… | 2   (MUS grade 6 + PHYS grade 1 — different subjects)
--  f7d84191-… | 2   (ADD_MATH grade 1 + PHYS grade 1 — different subjects)
```

No application currently holds **both** variants of the *same* subject, so today's
repoint has no collision. The migration is still written collision-safe
(`LEAST(grade)` then delete the legacy row) because production may differ and
because `application_grades_application_id_subject_id_key` would otherwise abort
the whole migration.

## Constraints the contract relies on

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'application_grades'::regclass;
--  application_grades_application_id_subject_id_key  UNIQUE (application_id, subject_id)
--  application_grades_application_id_fkey            FK -> applications(id) ON DELETE CASCADE
--  application_grades_subject_id_fkey                FK -> subjects(id)
--  application_grades_grade_check                    CHECK (grade >= 1 AND grade <= 9)
```

Two consequences worth stating plainly:

1. A **fake** subject id (the invented `fallback-*` identities of STU-11, or any
   random UUID) can never reach `application_grades` — `subject_id` is a real
   foreign key. The reachable failure mode is a **deactivated** subject, which is
   exactly what this migration produces for the three retired rows, and what
   `evaluate_grades` reports as `unresolved_subject_count`.
2. The unique index is why the merge cannot be a blind `UPDATE`.

## Alias inventory

The alias corpus was inventoried from the frontend matcher
(`apps/admissions/src/lib/subjectMatcher.ts`) and moved server-side into
`subject_catalog.SUBJECT_ALIASES` (normalised alias → canonical code), published
per subject by `GET /api/v1/catalog/subjects/`. Two aliases were **deliberately
dropped** because they collapse a real, separately examinable ECZ subject into a
different one and would silently rewrite a student's answer:

| Dropped alias | Previously mapped to | Why |
|---|---|---|
| `integrated science` | Science (`SCI`) | `INTSCI` is its own catalogue subject |
| `ict` | Computer Studies (`CS`) | `ICT` is its own catalogue subject |
