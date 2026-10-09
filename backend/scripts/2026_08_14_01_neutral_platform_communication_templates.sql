-- Admissions V2 - task 13.6 remediation L7: make the platform-wide
-- communication fallback templates brand-neutral. Additive follow-on to
-- 2026_05_19_seed_communication_templates.sql (data correction, no DDL).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/ task 13.6 §8.1 L7
-- Requirements: R14.1-R14.5 (tenant-aware template resolution: institution row
--               -> Beanola platform row -> safe Beanola default), R14.7-R14.8
--               (a value the tenant does not supply falls back to a Beanola
--               platform default, never to a school identity), R15.3-R15.4
--               (additive, no rewrite), R9.2 (see the paired *_rollback.sql),
--               R18.7 (rehearsed before it reaches production)
-- Findings:     GATE-13.4-01 (high) / TEN-09 (P1) - the platform-wide
--               communication fallback IS one legacy tenant's brand, and 13.4's
--               rehearsal watched one of these rows reach a real queued email
-- Steering:     .kiro/steering/product.md ("Beanola Technologies owns and
--               operates the Platform. MIHAS, KATC ... are tenants ... never the
--               platform identity"), .kiro/steering/enterprise-tenancy.md
--               ("Neutral fallback only. A missing tenant branding asset falls
--               back to the neutral Beanola asset ... never to MIHAS or KATC")
-- Evidence:     docs/v2-evidence/13.6/remediation/L7-L8-L12/README.md
-- Drift guard:  docs/v2-evidence/13.4/invariants.sql gate 19
--               (legacy_branded_fallbacks = 0)
-- Precedent:    2026_08_13_01_widen_application_snapshot_columns.sql (task 13.6
--               remediation L2) - same header shape, same DO-block guard, same
--               idempotence contract, same ledger-row-only rollback and the same
--               reason for it.
--
--
-- WHAT IS WRONG
-- =============
-- A ``communication_templates`` row with ``institution_id IS NULL`` is not "the
-- MIHAS template". It is the fallback EVERY tenant gets for that template key
-- when it has no row of its own - the middle rung of the resolution ladder
-- ``CommunicationService._resolve_template`` walks (R14.1/R14.4/R14.5):
--
--     active institution row (highest version)
--        -> active platform row, institution_id IS NULL (highest version)
--           -> the safe Beanola default in code
--
-- Every one of those platform rows carried "MIHAS Admissions". So a student of
-- ANY tenant - including a brand-new school on its first day - received a
-- MIHAS-branded email, and 13.4 §7.4 did not infer that, it watched the payment
-- expiry sweep queue ``'MIHAS Admissions - Payment Expired'`` to a real
-- recipient address through the ordinary reconciliation path.
--
-- Measured, read-only, on the restored production-lineage snapshot before this
-- script (docs/.../L7-L8-L12/raw/02-l7-before.txt): 33 rows, ALL 33 with
-- ``institution_id IS NULL``, of which 31 carry the MIHAS brand and 0 carry
-- KATC. 13.4 reported 19/19/19 on a from-empty build - both are correct: 19 rows
-- come from the seed script, and a further 12 branded rows exist ONLY on the
-- production lineage and are produced by no script in this repository.
--
--
-- WHICH LAYER THIS CHANGES
-- ========================
-- Only the DB text layer. The component system
-- (``backend/apps/common/email/``) owns structure and visual identity and is
-- already neutral: ``shell.py`` renders a "Beanola Admissions" pill, the
-- "Beanola Technologies Admissions Platform" headline and a Beanola footer
-- around every message, and every ``messages/*.py`` subject is brand-free
-- ("Application received - {app_no}", "Offer of admission - {program}").
-- ``communication_templates`` supplies the per-key subject/body text that
-- ``CommunicationService`` renders INSIDE that shell. So today a student gets a
-- Beanola-branded envelope with MIHAS-branded contents. This script corrects the
-- contents; it touches no template code, no shell, no model, no column.
--
--
-- THE NEUTRAL TEXT IS NOT INVENTED - EVERY REPLACEMENT IS QUOTED FROM THE
-- PLATFORM'S OWN NEUTRAL SOURCES
-- =======================================================================
-- Exactly three distinct legacy-brand forms occur across all 31 rows, and the
-- preflight proves the set is closed (``uncovered_rows = 0``: strip these three
-- and no MIHAS/KATC substring remains anywhere):
--
--  1. subject prefix   'MIHAS Admissions - '                    19 rows
--       -> 'Beanola Admissions - '
--       Source: ``InstitutionContextService.BEANOLA_BRAND['name']`` ==
--       "Beanola Admissions" (apps/catalog/services.py:581), and the shape is
--       byte-identical to ``communication_service._DEFAULT_SUBJECT`` ==
--       "Beanola Admissions - Notification".
--
--  2. body sign-off    'Best regards,<br>MIHAS Admissions</p>'   31 rows
--       -> 'Best regards,<br>Beanola Admissions</p>'
--       Source: byte-identical to the sign-off in
--       ``communication_service._DEFAULT_BODY`` AND to
--       ``_FALLBACK_TEMPLATES['payment_expired']``, which is the platform's own
--       already-written neutral version of one of these very rows - its body
--       differs from the seeded ``payment_expired`` body in this token and
--       nothing else.
--
--  3. body sentence    'Welcome to MIHAS!'                        1 row
--                                              (enrollment_confirmed)
--       -> 'We look forward to seeing you on campus.'
--       Source: verbatim from ``apps/common/email/messages/acceptance.py``.
--       A mechanical swap is WRONG here: the brand is the object of a sentence
--       addressed to a student about their school, and a student enrols at a
--       school, not at the platform vendor - "Welcome to Beanola Admissions!"
--       would be false as well as odd. The component system's own neutral voice
--       for exactly this moment refers to "your institution" / "the school" and
--       never names a brand, so its sentence is reused rather than a new one
--       written.
--
-- No emoji, no marketing claim, and nothing that names or implies a school the
-- recipient may not have applied to (.kiro/steering/product.md voice rules).
--
--
-- A TENANT STILL GETS ITS OWN BRAND - THROUGH THE LAYER THAT OWNS IT
-- =================================================================
-- Neutral does NOT mean a MIHAS student stops seeing MIHAS. It means the
-- platform-wide row stops being the place that decides. A tenant's own branding
-- reaches a student through the two mechanisms that already exist:
--   * an ``institution_id``-scoped template row, which ``_resolve_template``
--     prefers over the platform row - the reason the tenant column was added
--     (2026_06_08_04_communication_templates_tenant.sql); and
--   * the ``{{brand_name}}`` / ``{{contact_email}}`` / ``{{portal_url}}``
--     context tokens, which ``_build_context`` derives from the application's
--     resolved institution and defaults to Beanola when it cannot (R14.3/R14.8).
--
-- ``{{brand_name}}`` was considered for forms 1 and 2 and deliberately NOT used
-- there. ``_substitute`` renders a missing or empty context key as the empty
-- string, so a caller that reaches ``render_template`` without a full context
-- would produce a subject beginning " - " and a sign-off reading "Best
-- regards," followed by nothing. Every in-repo path goes through
-- ``CommunicationService.send``, which always builds the full context - but a
-- fallback whose correctness depends on that staying true is the wrong shape for
-- the one row every tenant lands on, and a blank brand is not neutral, it is
-- broken. A literal Beanola string cannot render empty.
--
--
-- WHY THIS IS A NEW SCRIPT AND NOT AN EDIT TO THE SEED SCRIPT
-- ==========================================================
-- ``2026_05_19_seed_communication_templates.sql`` is already applied, and its
-- sha256 is recorded in the ``migration_history`` of every database that applied
-- it. Editing it would change that checksum and break the ledger contract on
-- every one of those databases (the same reasoning L2-L3 §1.3 spells out for
-- ``2026_06_08_01``). It is left byte-identical.
--
-- Ordering makes the pair converge rather than fight. On a from-empty build the
-- seed script runs first (2026_05_19), writes the 19 branded rows, and this
-- script runs later (2026_08_14) and neutralises them - net result neutral. If a
-- ``migration_history`` wipe ever makes both pending again they re-run in the
-- same filename order, so the outcome is the same. The seed script's
-- ``ON CONFLICT ... DO UPDATE`` re-brands on re-application; this script is what
-- has the last word.
--
--
-- IDEMPOTENT + ENVIRONMENT-SAFE
-- =============================
-- Each UPDATE is scoped by the exact literal it replaces, so a row that no
-- longer contains that literal is not matched:
--   * a second run touches 0 rows and reports it (a clean no-op, not a rewrite
--     to the same value),
--   * a database that never had the seed script is a complete no-op,
--   * the 12 production-lineage-only rows that carry only the sign-off form are
--     corrected by form 2 without needing to be enumerated.
--
-- ``institution_id IS NULL`` is load-bearing in every WHERE clause. A
-- tenant-scoped MIHAS row is MIHAS's own template and legitimately carries the
-- MIHAS brand; this script must never touch one. (There are 0 such rows today,
-- which is exactly why the scope has to be written down now rather than
-- remembered later.)
--
-- ``version`` is deliberately NOT bumped. This is the same platform template
-- with its brand corrected, not a new operator-authored revision, and bumping it
-- would move the row under the ``uq_comm_templates_key_inst_version`` unique
-- index for no gain. ``updated_at`` is refreshed so the correction is visible.
--
-- Additive-only-lint clean: the runner
-- (``apply_sql_migrations._find_non_additive_violations``) rejects DROP COLUMN /
-- DROP TABLE / TRUNCATE / unqualified DELETE / narrowing ALTER COLUMN TYPE
-- USING. A scoped UPDATE is none of those. No column, index, constraint or row
-- is added or removed; the ``migration_history`` tracking row is written by the
-- runner, not by this file.

DO $$
DECLARE
    subject_rows integer;
    signoff_rows integer;
    welcome_rows integer;
BEGIN
    -- Form 1 - the subject prefix (19 rows on both lineages).
    UPDATE communication_templates
       SET subject_template = replace(
               subject_template,
               'MIHAS Admissions — ',
               'Beanola Admissions — '
           ),
           updated_at = NOW()
     WHERE institution_id IS NULL
       AND subject_template LIKE '%MIHAS Admissions — %';
    GET DIAGNOSTICS subject_rows = ROW_COUNT;

    -- Form 2 - the body sign-off (31 rows on the production lineage, 19 on a
    -- from-empty build).
    UPDATE communication_templates
       SET body_template = replace(
               body_template,
               'Best regards,<br>MIHAS Admissions</p>',
               'Best regards,<br>Beanola Admissions</p>'
           ),
           updated_at = NOW()
     WHERE institution_id IS NULL
       AND body_template LIKE '%Best regards,<br>MIHAS Admissions</p>%';
    GET DIAGNOSTICS signoff_rows = ROW_COUNT;

    -- Form 3 - the one sentence where the brand is the object, not the sender.
    UPDATE communication_templates
       SET body_template = replace(
               body_template,
               'Welcome to MIHAS!',
               'We look forward to seeing you on campus.'
           ),
           updated_at = NOW()
     WHERE institution_id IS NULL
       AND body_template LIKE '%Welcome to MIHAS!%';
    GET DIAGNOSTICS welcome_rows = ROW_COUNT;

    RAISE NOTICE 'L7 neutral platform templates: subject_prefix=% signoff=% welcome=%',
        subject_rows, signoff_rows, welcome_rows;

    -- Fail closed rather than reporting success on a partial correction. If any
    -- platform-wide row still carries a legacy tenant brand after the three
    -- known forms have been applied, a form this script does not know about has
    -- appeared and gate 19 would read FAIL after a migration that claimed to fix
    -- it. Aborting rolls the whole file back and leaves migration_history
    -- unwritten, so the next sweep retries and the operator sees which keys.
    IF EXISTS (
        SELECT 1 FROM communication_templates
        WHERE institution_id IS NULL
          AND (subject_template ILIKE '%MIHAS%' OR subject_template ILIKE '%KATC%'
               OR body_template ILIKE '%MIHAS%' OR body_template ILIKE '%KATC%')
    ) THEN
        RAISE EXCEPTION
            'GATE-13.4-01 not closed: platform-wide template(s) still legacy-branded: %',
            (SELECT string_agg(template_key, ', ' ORDER BY template_key)
               FROM communication_templates
              WHERE institution_id IS NULL
                AND (subject_template ILIKE '%MIHAS%' OR subject_template ILIKE '%KATC%'
                     OR body_template ILIKE '%MIHAS%' OR body_template ILIKE '%KATC%'));
    END IF;
END $$;

COMMENT ON COLUMN communication_templates.institution_id IS
    'Owning tenant, or NULL for the Beanola platform-wide fallback every tenant resolves to when it has no row of its own. A NULL-institution row MUST carry neutral Beanola branding, never a tenant identity - task 13.6 remediation L7, GATE-13.4-01 / TEN-09. Drift guard: docs/v2-evidence/13.4/invariants.sql gate 19.';
