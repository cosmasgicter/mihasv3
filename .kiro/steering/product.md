---
inclusion: always
---

# MIHAS Application System - Product Context

Live production admissions platform for Mukuba Institute of Health and Allied Sciences (Zambia). Real users, real data—treat all changes as production-critical.

## Hard Constraints (Non-Negotiable)

| Rule | Reason |
|------|--------|
| Never remove auto-save | 8-second interval prevents data loss for students |
| Never block on external API failures | HPCZ, GNC/NMCZ, ECZ APIs are unreliable—always provide fallbacks |
| Never log PII | Student applications contain medical credentials and personal data |
| Maintain backward compatibility | 86 database tables with existing data |
| Preserve offline functionality | PWA must work on unreliable Zambian connections |

## User Roles

| Role | Capabilities |
|------|-------------|
| Student | Apply, upload documents, track status, pay, schedule interviews |
| Admin | Review applications, verify eligibility, approve/reject, generate reports |
| Super Admin | Full access + user management, system config, analytics, audit logs |

## Application Flow

`Registration → Email Verification → Profile Setup → Application Wizard → Payment → Interview → Decision`

### Application Wizard (4 Steps)
1. Personal Information
2. Academic History
3. Program Selection
4. Document Upload

### Wizard Behaviors
- Auto-save: every 8 seconds, silent, non-blocking
- Validation: non-blocking—students can proceed even if eligibility checks fail
- Persistence: draft state persists across sessions
- Eligibility: advisory only, manual admin override always available

## Business Rules

| Rule | Details |
|------|---------|
| Payment timing | Required before interview scheduling |
| Documents | Requirements vary by program |
| Grading | Zambian ECZ: 1-9 scale (1-6 = pass, 7-9 = fail) |
| Interviews | First-come-first-served with admin override |
| Audit | All state changes require audit trail entries |

## Performance Targets

| Metric | Target |
|--------|--------|
| First load (3G) | <2.5s |
| Wizard navigation | <100ms |
| Auto-save | Silent, no UI blocking |
| Offline mode | Core features functional |

## External Integrations

| Service | Failure Handling |
|---------|------------------|
| Supabase (auth, DB, storage) | Critical—no fallback |
| Cloudflare (hosting, CDN) | Infrastructure layer |
| Resend (email) | Queue with retry |
| Twilio (SMS/WhatsApp) | Graceful degradation |
| HPCZ/GNC/NMCZ/ECZ (eligibility) | Advisory only, never blocking |

## Development Checklist

When modifying code, verify:
- [ ] Impact on in-progress applications (students may have drafts)
- [ ] Zambian data formats (+260 phone numbers, ECZ grades 1-9)
- [ ] Mobile responsiveness (most users are on mobile)
- [ ] Graceful degradation for external API calls
- [ ] Accessibility (screen reader support)
- [ ] Audit trails for state changes (no PII in logs)
