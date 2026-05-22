-- Seed the system actor profile.
--
-- Used by automated tasks instead of the literal string "system" passed to
-- transition_application_status(changed_by=...). The string-literal pattern
-- caused silent FK-type errors against profiles.id (UUID), which were caught
-- and logged inside Celery task wrappers — meaning draft expiry, condition
-- expiry, enrollment expiry, and waitlist auto-promotion all silently failed
-- in production for an extended period.
--
-- Idempotent: ON CONFLICT DO NOTHING. Safe to re-run.
-- Inactive: is_active=false so this profile cannot be authenticated as.
-- Deterministic UUID: callers reference SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000001'
-- in apps.applications.services.

INSERT INTO public.profiles (
    id, email, role, is_active, first_name, last_name, created_at
)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'system@mihas.internal',
    'super_admin',
    false,
    'System',
    'Actor',
    now()
)
ON CONFLICT (id) DO NOTHING;

-- Verification:
-- SELECT id, email, role, is_active FROM profiles
-- WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
