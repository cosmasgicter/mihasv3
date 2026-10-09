# Task 4.2 — storage/log secret scan (R4.3)

Proves no reusable plaintext password (or raw invitation token) is persisted to
browser storage or written to backend logs. Regenerate with the commands shown;
the durable regression guard is
`apps/admissions/tests/unit/tenantStaffInvitationSecretScan.test.ts` (9 tests).

## FRONTEND — browser storage path

| # | Check | Command | Result |
|---|-------|---------|--------|
| 1 | Onboarding wizard has no password **field/state** | `grep -n password TenantOnboardingWizard.tsx` | 9 matches — **all are comments/user-facing copy** stating the admin never sets a password (e.g. "you never set or see a password"); **0** are a password input, variable, or storage write |
| 2 | Persisted `localStorage` draft excludes invite input | `sed -n '/const draft = {/,/setItem(ONBOARDING_DRAFT_KEY/p'` | object lists only `stepIndex, reachedIndex, institutionId, profile, savedProfile, hostnameDraft, templateDraft, documentDraft, inviteCompleted, createdDomain` — **no `inviteDraft`, no `password`** |
| 3 | Invite uses the atomic server command | `grep -n 'inviteStaff\|userService.create\|createMembership'` | `tenantAdminService.inviteStaff(` ×1; **no** `userService.create(` / `createMembership(` call (the only `userService.create` text is the corrected header docstring) |
| 4 | Staff service payload has no password | `grep -c password services/admin/tenants.ts` | matches are the `TenantStaffInvitation`/`TenantStaffInvitePayload` type docs only — **no `password` field is sent or stored** |
| 5 | Staff panel invites by email, not raw UUID | `grep -c 'User/Profile ID' TenantStaffPanel.tsx` | **0** (replaced by an accessible `<datalist>` email search selector backed by `searchStaffCandidates`) |
| 6 | Accept page never persists token/password | `grep -n 'localStorage\|history.replaceState' AcceptInvitationPage.tsx` | **0** `localStorage`; uses `history.replaceState` to strip the token from the address bar |

## BACKEND — logging path (`staff_invitation_service.py`, `staff_invitation_views.py`)

| # | Check | Result |
|---|-------|--------|
| 7 | `password` only as bcrypt hash | Appears only in comments, `from ...services import hash_password`, `accept(token, password)` (the invitee's own password) → `profile.password_hash = hash_password(password)`, and a new identity created with `password_hash=None`. **No plaintext password is stored or logged.** |
| 8 | Token stored only as SHA-256 hash | `raw_token = _generate_token()` (secrets.token_urlsafe) → `token_hash = _hash_token(raw_token)` (sha256) is the only value persisted; `raw_token` is used **only** to build the emailed `staff_invitation_url(raw_token, ...)` accept link and returned to the service caller — never to the browser. `token_hash` is cleared (`= None`) on accept/revoke so a used token cannot be replayed. |
| 9 | No `logger` call leaks a secret | The 5 `logger.*` calls log: an IntegrityError repr on duplicate-invite, and best-effort warnings for session-revoke/email/audit/outbox failures. **None includes a raw token or password.** Audit/outbox metadata explicitly excludes the token/password (only `email` + `status` + non-secret ids). |

## Conclusion

No reusable plaintext password is returned, logged, or persisted in browser
storage anywhere in the invite → accept flow (R4.3). The operator-set password
field and its `localStorage` persistence (finding TEN-01) are removed; the
invited admin sets their own password by consuming a single-use, SHA-256-hashed
token (the handoff). Raw-UUID staff entry (finding TEN-05) is replaced by an
email/name search selector.
