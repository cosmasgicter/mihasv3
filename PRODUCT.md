# PRODUCT.md

> Read by Impeccable on every command via `node .kiro/skills/impeccable/scripts/load-context.mjs`.
> Read by ui-ux-pro-max via the design-skills steering rule.
> Update via `/impeccable teach` (interactive) or by editing this file directly.

## Identity

**MIHAS** — Mukuba Institute of Health and Applied Sciences and **KATC** — Kalulushi Training Centre. A multi-application monorepo: an admissions portal for Zambian healthcare-program students, an AI job-operations operator dashboard, and the Django backend that serves both.

Surface | App | Live
--- | --- | ---
Student admissions + admin review | `apps/admissions/` | apply.mihas.edu.zm
AI job operations dashboard | `apps/jobs-ops/` | (planned)
Backend API | `backend/` | api.mihas.edu.zm

## Register

**Product mode** — design SERVES the work. The two active apps are operational tools (multi-step admissions wizard, admin review queue, jobs-ops control panel). The work is the product; the UI's job is to disappear.

A small brand register applies to landing pages, the marketing footer, and printed PDF documents (acceptance letters, payment receipts, application slips). The PDF system uses Playfair Display + Source Sans 3 — institutional, not generic-SaaS.

## Audiences

### Students
- Zambian applicants, ages 18–35, often applying on a phone, often on weak networks (3G/Edge).
- May not have applied to anything online before.
- Need clarity, not delight. Want to know exactly what the next step is and whether they did it right.
- Cannot afford to lose work — auto-save is non-negotiable on every form.
- Read English; some prefer plain language over institutional prose.

### Admin reviewers
- Staff at the institution. Desktop or tablet, well-lit office, fast network.
- Process 50–200 applications per day during peak intake.
- Need density, not whitespace. Need keyboard shortcuts and bulk actions.
- Must trust what they see — payment status, document verification, application history must never lie.
- Hard line: cannot accidentally approve, reject, or notify the wrong applicant.

### Super admins
- The Managing Director and a small operations team.
- Need every override path documented in audit logs.
- Keep this surface visually distinct from the standard admin views (`adminColors` token set).

### Jobs-ops operators
- Internal users running outreach, CRM, automation, and email pipelines.
- Operator dashboard density. Tables, filters, queues, evidence-of-action everywhere.
- High-risk actions stay approval-gated.

### Candidate owners
- People whose careers the jobs-ops platform represents.
- Receive alerts. Approve risky outbound actions. Review tailored documents and outreach copy.

## Brand Voice

- **Calm and institutional.** This is a medical school admissions system, not a B2B SaaS.
- **Precise.** State exactly what happened, what's next, and what to do if something fails.
- **Plain English.** No "leverage", "supercharge", "unlock". No exclamation marks.
- **Respectful.** Refer to applicants as students or applicants, never users. Never patronise.
- **Truthful.** Never claim a payment is verified when it isn't. Never promise an outcome the system can't guarantee.

## Anti-References — what we are NOT

Hard list. If a screen starts looking like any of these, restart.

- **Modern-SaaS purple gradients.** No Stripe-purple, no Linear-purple, no any-purple gradient hero, no gradient text in headings.
- **Cardocalypse.** No cards nested inside cards inside cards. One container deep.
- **Inter-everywhere generic.** Inter is the body font; institutional documents and the brand surface use Playfair Display + Source Sans 3 (PDF) or considered alternatives.
- **Boost-your-productivity copy.** No marketing-speak. No "AI-powered". No "supercharge".
- **AI color palette.** No purple-to-pink, no purple-to-blue gradients, no neon mint accents on dark navy.
- **Glassmorphism on a real product.** Backdrop-blur is for modal scrims and nothing else.
- **Side-tab cards** with thick colored left borders. Cheap.
- **Emoji icons.** Use Lucide (web) or platform native (mobile). Never use emoji as structural icons.
- **Decorative animations.** Every transition expresses cause-and-effect, never pure decoration.
- **Drop-shadow stacks.** No 3-layer shadows on cards. One shadow scale, applied to elevation tiers.
- **Hero headlines that compete with the action.** Students need to find "Continue your application", not read a manifesto.
- **Empty whitespace where information belongs.** Density is fine when the audience is doing work.

## Strategic Principles

1. **Mobile-first for student flows; desktop-first for admin and jobs-ops.** Both must work on the other, but optimize for the actual use case.
2. **Auto-save is mandatory** on every form a student can fill. Settings, profile, wizard, amendment requests. Network blips, page refreshes, and accidental close must not lose work.
3. **Form errors near the field, not just a banner at top.** Error summary at top is in addition to inline, not instead.
4. **Loading states for every async action over 300ms.** Skeleton, not spinner, when the layout is known.
5. **Reduced motion is enforced globally** in `index.css` `@media (prefers-reduced-motion: reduce)`. Never override.
6. **Touch targets ≥44 × 44 px** on every interactive element. Defined as `min-h-touch` / `min-w-touch` in Tailwind.
7. **WCAG AA contrast minimum** on every text + background pair. Documented inline in `design-tokens.css`.
8. **Status colors carry icons or text**, never colour alone. Red border + ! icon, not red border alone.
9. **Payment is the source of truth.** `applications.payment_status` is a derived summary; the canonical record lives in `payments`. UI must never lie about which is the source.
10. **Drift-guard tests fail CI** if any frontend status enum, role hierarchy, error code, or payment-status mapping diverges from its backend canonical truth. See `docs/canonical-truth-map.md`.

## Hard Constraints (excerpt — full list in `.kiro/steering/product.md`)

| Rule | Reason |
|------|--------|
| Never remove auto-save without a replacement | Students apply on unstable connections. |
| Never log PII, secrets, resume contents, or document bodies | Sensitive personal data. |
| Never block core flows on third-party verification APIs | External checks must degrade gracefully. |
| Preserve mobile-first usability for admissions and review workflows | Many users on phones. |
| Keep auth cookie + CSRF protections intact | Admissions actions are state-changing and sensitive. |
| Treat uploads, automation evidence, and outbound messaging as high risk | Legal, operational, and reputational impact. |

## Reference Files Already Loaded by Every Skill Run

These are not anti-references — they are the existing source of truth:

- `.kiro/steering/product.md` — full product context (hard constraints, business rules)
- `.kiro/steering/structure.md` — file placement and module ownership map
- `.kiro/steering/tech.md` — technology stack, API contract, conventions
- `docs/canonical-truth-map.md` — domain concept ownership (status enums, error codes, role hierarchy, payment states)
- `.kiro/skills/impeccable/SKILL.md` — design vocabulary and 23 commands
- `.kiro/skills/ui-ux-pro-max/SKILL.md` — design intelligence database (50+ styles, 161 palettes, 99 UX rules, 25 chart types)

## Mode Selector

When in doubt about register on a given task:

| If the task is… | Register | Why |
|-----------------|----------|-----|
| The student application wizard, admin queue, payment step | **Product** | Tools that disappear into the work. |
| Login, signup, password reset | **Product** | Auth is a tool, not a brand surface. |
| Acceptance letter PDF, receipt PDF, application slip PDF | **Brand** | Institutional documents that travel outside the app. |
| Public landing page (`/`), marketing copy, About page | **Brand** | Brand IS the product on these pages. |
| Email templates (Zoho-sent transactional) | **Brand** | Lives in the inbox; competes with brand emails. |
| Settings, notifications, profile | **Product** | Admin-of-self utility. |

Default to product when ambiguous.
