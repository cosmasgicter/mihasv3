-- Admissions V2 — task 7.1 (seed and enforce the canonical subject/grade
-- contract). DATA-ONLY migration: no DDL, no new table, no new column.
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/
-- Requirements: R11.4, R11.5
-- Findings:     STU-11
-- Design:       design.md §9.2 (Grades — "The subject catalog is seeded and
--               versioned by the backend. Selectors contain only canonical
--               UUIDs. … Readiness counts unique persisted records.")
--
-- Why this migration exists
-- -------------------------
-- The canonical catalogue previously reached a database only through
-- ``python manage.py seed_subjects``, a command nothing runs at boot. The 7.1
-- inventory of the live catalogue found the predictable result: 65 rows, of
-- which THREE are the same real subject stored twice under a second code, with
-- title-case categories from an older seed and one wrong ``is_core``:
--
--   ADD_MATH  "Additional Mathematics"  category 'Sciences'  <- duplicate of ADDMATH
--   MUS       "Music"                   category 'Arts'      <- duplicate of MUSIC
--   PHYS      "Physics"                 category 'Sciences', is_core = true
--                                                            <- duplicate of PHY
--
-- Two active rows for one real subject let a student persist "five unique
-- subjects" that are really four, which is exactly the completeness claim R11.5
-- forbids. Worse, in the live data it is the LEGACY rows that carry every real
-- reference (ADD_MATH 6 grades, MUS 4 grades, PHYS 4 grades + 1 course
-- requirement) while the clean codes carry none — so deactivating them without
-- repointing would strand 14 students' grades as "unresolved".
--
-- What this migration does, in order
-- ----------------------------------
--   1. Upserts the canonical catalogue by ``code``. The authority is
--      ``backend/apps/catalog/subject_catalog.py``; the two are held in step by
--      ``backend/tests/unit/test_subject_catalog_migration_7_1.py``, which parses
--      this file and compares it row for row.
--   2. Repoints every ``application_grades`` and ``course_requirements``
--      reference from each legacy duplicate onto its canonical subject,
--      collision-safe: where an application already holds the canonical subject,
--      the legacy row is dropped instead of violating
--      ``application_grades_application_id_subject_id_key`` — and the better
--      (numerically lower, ECZ = better) grade is kept.
--   3. Deactivates the legacy duplicate rows. They are NOT deleted: history
--      stays readable and ``application_grades_subject_id_fkey`` stays valid.
--
-- Idempotence: every statement is a conditional upsert or a guarded update, and
-- the script holds no session state (the identity lists are inline ``VALUES``
-- joins, not temporary tables), so a second run — in the same session or a new
-- one — changes nothing.
--
-- Online-safety: row-level writes on three small tables (65 subjects, low
-- hundreds of grades) inside one transaction. No table rewrite, no lock
-- escalation, no DDL.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The canonical catalogue (idempotent upsert by code)
-- ---------------------------------------------------------------------------

INSERT INTO subjects (id, name, code, category, is_core, is_active, curriculum_type, created_at)
SELECT gen_random_uuid(), c.name, c.code, c.category, c.is_core, true, c.curriculum_type, now()
FROM (VALUES
    -- ECZ Grade 12 — core
    ('ENG',        'English Language',        'core',       true,  'ecz'),
    ('MATH',       'Mathematics',             'core',       true,  'ecz'),
    ('CE',         'Civic Education',         'core',       true,  'ecz'),
    -- ECZ Grade 12 — sciences
    ('BIO',        'Biology',                 'sciences',   false, 'ecz'),
    ('CHEM',       'Chemistry',               'sciences',   false, 'ecz'),
    ('PHY',        'Physics',                 'sciences',   false, 'ecz'),
    ('SCI',        'Science',                 'sciences',   false, 'ecz'),
    ('INTSCI',     'Integrated Science',      'sciences',   false, 'ecz'),
    ('AGR',        'Agricultural Science',    'sciences',   false, 'ecz'),
    ('ADDMATH',    'Additional Mathematics',  'sciences',   false, 'ecz'),
    -- ECZ Grade 12 — commercial
    ('COM',        'Commerce',                'commercial', false, 'ecz'),
    ('POA',        'Principles of Accounts',  'commercial', false, 'ecz'),
    ('ECON',       'Economics',               'commercial', false, 'ecz'),
    ('BS',         'Business Studies',        'commercial', false, 'ecz'),
    ('OP',         'Office Practice',         'commercial', false, 'ecz'),
    ('ENT',        'Entrepreneurship',        'commercial', false, 'ecz'),
    -- ECZ Grade 12 — humanities
    ('GEO',        'Geography',               'humanities', false, 'ecz'),
    ('HIST',       'History',                 'humanities', false, 'ecz'),
    ('RE',         'Religious Education',     'humanities', false, 'ecz'),
    ('DS',         'Development Studies',     'humanities', false, 'ecz'),
    ('LIT',        'Literature in English',   'humanities', false, 'ecz'),
    -- ECZ Grade 12 — technology
    ('CS',         'Computer Studies',        'technology', false, 'ecz'),
    ('ICT',        'ICT',                     'technology', false, 'ecz'),
    ('DT',         'Design & Technology',     'technology', false, 'ecz'),
    ('MW',         'Metalwork',               'technology', false, 'ecz'),
    ('WW',         'Woodwork',                'technology', false, 'ecz'),
    ('TD',         'Technical Drawing',       'technology', false, 'ecz'),
    ('PM',         'Power Mechanics',         'technology', false, 'ecz'),
    -- ECZ Grade 12 — practical / creative
    ('HE',         'Home Economics',          'practical',  false, 'ecz'),
    ('FN',         'Food & Nutrition',        'practical',  false, 'ecz'),
    ('ART',        'Art & Design',            'practical',  false, 'ecz'),
    ('MUSIC',      'Music',                   'practical',  false, 'ecz'),
    ('PE',         'Physical Education',      'practical',  false, 'ecz'),
    ('FF',         'Fashion & Fabrics',       'practical',  false, 'ecz'),
    -- ECZ Grade 12 — languages
    ('FRENCH',     'French',                  'languages',  false, 'ecz'),
    ('PORT',       'Portuguese',              'languages',  false, 'ecz'),
    ('BEMBA',      'Bemba',                   'languages',  false, 'ecz'),
    ('NYANJA',     'Nyanja',                  'languages',  false, 'ecz'),
    ('TONGA',      'Tonga',                   'languages',  false, 'ecz'),
    ('LOZI',       'Lozi',                    'languages',  false, 'ecz'),
    ('KAONDE',     'Kaonde',                  'languages',  false, 'ecz'),
    ('LUNDA',      'Lunda',                   'languages',  false, 'ecz'),
    ('LUVALE',     'Luvale',                  'languages',  false, 'ecz'),
    -- A-Level (GCE Advanced Level / Cambridge)
    ('AL-ENG',     'English Language (A-Level)',      'languages',  false, 'a_level'),
    ('AL-PMATH',   'Pure Mathematics (A-Level)',      'sciences',   false, 'a_level'),
    ('AL-FMATH',   'Further Mathematics (A-Level)',   'sciences',   false, 'a_level'),
    ('AL-BIO',     'Biology (A-Level)',               'sciences',   false, 'a_level'),
    ('AL-CHEM',    'Chemistry (A-Level)',             'sciences',   false, 'a_level'),
    ('AL-PHY',     'Physics (A-Level)',               'sciences',   false, 'a_level'),
    ('AL-GEO',     'Geography (A-Level)',             'humanities', false, 'a_level'),
    ('AL-HIST',    'History (A-Level)',               'humanities', false, 'a_level'),
    ('AL-ECON',    'Economics (A-Level)',             'commercial', false, 'a_level'),
    ('AL-ACC',     'Accounting (A-Level)',            'commercial', false, 'a_level'),
    ('AL-BS',      'Business Studies (A-Level)',      'commercial', false, 'a_level'),
    ('AL-CS',      'Computer Science (A-Level)',      'technology', false, 'a_level'),
    ('AL-SOC',     'Sociology (A-Level)',             'humanities', false, 'a_level'),
    ('AL-PSY',     'Psychology (A-Level)',            'humanities', false, 'a_level'),
    ('AL-RS',      'Religious Studies (A-Level)',     'humanities', false, 'a_level'),
    ('AL-FRENCH',  'French (A-Level)',                'languages',  false, 'a_level'),
    ('AL-LIT',     'Literature in English (A-Level)', 'languages',  false, 'a_level'),
    ('AL-ART',     'Art & Design (A-Level)',          'practical',  false, 'a_level'),
    ('AL-LAW',     'Law (A-Level)',                   'humanities', false, 'a_level')
) AS c(code, name, category, is_core, curriculum_type)
ON CONFLICT (code) DO UPDATE SET
    name            = EXCLUDED.name,
    category        = EXCLUDED.category,
    is_core         = EXCLUDED.is_core,
    is_active       = true,
    curriculum_type = EXCLUDED.curriculum_type
WHERE subjects.name            IS DISTINCT FROM EXCLUDED.name
   OR subjects.category        IS DISTINCT FROM EXCLUDED.category
   OR subjects.is_core         IS DISTINCT FROM EXCLUDED.is_core
   OR subjects.is_active       IS DISTINCT FROM true
   OR subjects.curriculum_type IS DISTINCT FROM EXCLUDED.curriculum_type;

-- ---------------------------------------------------------------------------
-- 2. Retire the duplicate-identity rows, repointing every reference first
--
-- The (legacy_code, canonical_code) pair list below is repeated verbatim in each
-- statement instead of being staged in a temporary table, so the script carries
-- no session state and stays re-runnable. The migration test asserts every
-- occurrence is byte-identical and matches
-- ``subject_catalog.LEGACY_DUPLICATE_CODES``.
-- ---------------------------------------------------------------------------

-- 2a. Collision case: the application already holds the canonical subject. Keep
--     the better ECZ grade (lower is better) on the canonical row.
WITH pairs AS (
    SELECT legacy.id AS legacy_id, canonical.id AS canonical_id
    FROM (VALUES ('ADD_MATH', 'ADDMATH'), ('MUS', 'MUSIC'), ('PHYS', 'PHY')) AS m(legacy_code, canonical_code)
    JOIN subjects legacy    ON legacy.code    = m.legacy_code
    JOIN subjects canonical ON canonical.code = m.canonical_code
)
UPDATE application_grades keep
SET grade = LEAST(keep.grade, dup.grade)
FROM application_grades dup
JOIN pairs p ON dup.subject_id = p.legacy_id
WHERE keep.application_id = dup.application_id
  AND keep.subject_id     = p.canonical_id;

-- 2b. …then drop the legacy row so the repoint cannot violate
--     ``application_grades_application_id_subject_id_key``.
WITH pairs AS (
    SELECT legacy.id AS legacy_id, canonical.id AS canonical_id
    FROM (VALUES ('ADD_MATH', 'ADDMATH'), ('MUS', 'MUSIC'), ('PHYS', 'PHY')) AS m(legacy_code, canonical_code)
    JOIN subjects legacy    ON legacy.code    = m.legacy_code
    JOIN subjects canonical ON canonical.code = m.canonical_code
)
DELETE FROM application_grades dup
USING pairs p
WHERE dup.subject_id = p.legacy_id
  AND EXISTS (
      SELECT 1 FROM application_grades keep
      WHERE keep.application_id = dup.application_id
        AND keep.subject_id     = p.canonical_id
  );

-- 2c. Repoint the surviving grade references onto the canonical subject.
WITH pairs AS (
    SELECT legacy.id AS legacy_id, canonical.id AS canonical_id
    FROM (VALUES ('ADD_MATH', 'ADDMATH'), ('MUS', 'MUSIC'), ('PHYS', 'PHY')) AS m(legacy_code, canonical_code)
    JOIN subjects legacy    ON legacy.code    = m.legacy_code
    JOIN subjects canonical ON canonical.code = m.canonical_code
)
UPDATE application_grades g
SET subject_id = p.canonical_id
FROM pairs p
WHERE g.subject_id = p.legacy_id;

-- 2d. Same treatment for eligibility rules. ``course_requirements`` has no unique
--     index on (program_id, subject_id), so an exact-duplicate rule is removed
--     explicitly to avoid double-counting the same requirement.
WITH pairs AS (
    SELECT legacy.id AS legacy_id, canonical.id AS canonical_id
    FROM (VALUES ('ADD_MATH', 'ADDMATH'), ('MUS', 'MUSIC'), ('PHYS', 'PHY')) AS m(legacy_code, canonical_code)
    JOIN subjects legacy    ON legacy.code    = m.legacy_code
    JOIN subjects canonical ON canonical.code = m.canonical_code
)
DELETE FROM course_requirements dup
USING pairs p
WHERE dup.subject_id = p.legacy_id
  AND EXISTS (
      SELECT 1 FROM course_requirements keep
      WHERE keep.program_id    = dup.program_id
        AND keep.subject_id    = p.canonical_id
        AND keep.minimum_grade = dup.minimum_grade
        AND keep.is_mandatory IS NOT DISTINCT FROM dup.is_mandatory
  );

WITH pairs AS (
    SELECT legacy.id AS legacy_id, canonical.id AS canonical_id
    FROM (VALUES ('ADD_MATH', 'ADDMATH'), ('MUS', 'MUSIC'), ('PHYS', 'PHY')) AS m(legacy_code, canonical_code)
    JOIN subjects legacy    ON legacy.code    = m.legacy_code
    JOIN subjects canonical ON canonical.code = m.canonical_code
)
UPDATE course_requirements r
SET subject_id = p.canonical_id
FROM pairs p
WHERE r.subject_id = p.legacy_id;

-- 2e. Deactivate (never delete) the legacy duplicate rows.
UPDATE subjects s
SET is_active = false
FROM (VALUES ('ADD_MATH', 'ADDMATH'), ('MUS', 'MUSIC'), ('PHYS', 'PHY')) AS m(legacy_code, canonical_code)
WHERE s.code = m.legacy_code
  AND s.is_active IS DISTINCT FROM false;

COMMIT;
