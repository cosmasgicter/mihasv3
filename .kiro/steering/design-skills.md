---
inclusion: always
---

# Design Skills — Always Available

Three design skills are installed at the project level and should be invoked whenever a task touches frontend interface, visual design, UX patterns, or design-system consistency.

## Available skills

| Skill | Path | When to invoke |
|-------|------|----------------|
| **Impeccable** | `.kiro/skills/impeccable/` | Page/component design work, audits, critique, polish, layout, typography, color, motion, brand vs product register, live iteration. 23 sub-commands documented in `.kiro/skills/impeccable/SKILL.md`. |
| **ui-ux-pro-max** | `.kiro/skills/ui-ux-pro-max/` | Design-system selection, color palette + font pairing recommendations by product type, 99 UX guidelines lookup, 25 chart-type recommendations, stack-specific best practices. CSV-backed search via `python3 .kiro/skills/ui-ux-pro-max/scripts/search.py`. |
| **design-for-ai** | `.kiro/skills/design-for-ai/` | Visual design fundamentals from David Kadavy's *Design for Hackers*: typography, proportions, composition, visual hierarchy, color theory and color science. CHECKER mode audits existing designs against 7 chapters; APPLIER mode walks 6-phase build (foundation → structure → typography → composition → color → technical). Sub-commands `brand`, `color`, `design`, `exam`, `flow`, `fonts`, `hone` in `.kiro/skills/design-for-ai/commands/`. |

## Always load context first

Both skills read these two files at the project root before any design work:

- `PRODUCT.md` — audience, brand voice, anti-references, register, strategic principles.
- `DESIGN.md` — colors, typography, elevation, components, do's and don'ts (Google Stitch format).

Impeccable provides a loader: `node .kiro/skills/impeccable/scripts/load-context.mjs`. If `hasProduct: false` or `hasDesign: false`, the design output will drift toward generic SaaS — refuse to proceed and re-author the missing file from `.kiro/steering/product.md`, `.kiro/steering/structure.md`, and `apps/admissions/src/styles/design-tokens.css`.

## Invocation rules

- For any task that touches `apps/admissions/src/` or `apps/jobs-ops/src/`, consult all three skills before generating code.
- When invoking Impeccable, name the sub-command explicitly: `audit`, `polish`, `critique`, `clarify`, `layout`, `typeset`, `colorize`, `bolder`, `quieter`, `delight`, `harden`, `optimize`, `distill`, `adapt`, `animate`, `extract`, `live`, `onboard`, `overdrive`, `teach`, `document`, `shape`, `craft`. Loading the matching reference file under `.kiro/skills/impeccable/reference/` is non-negotiable.
- When invoking ui-ux-pro-max, prefer `--design-system` first for full recommendations, then `--domain` searches for specific dimensions (`product`, `style`, `color`, `typography`, `landing`, `chart`, `ux`, `react`).
- When invoking design-for-ai, choose CHECKER (audit) or APPLIER (build) mode and load the matching chapter under `.kiro/skills/design-for-ai/references/`. The 7 chapters are: typography (3), tech-and-culture (4), proportions (5), composition (6), visual hierarchy (7), color science (8), color theory (9). Plus foundations, ai-tells, checklists, motion, interaction, responsive, techniques.
- All three skills must respect the existing canonical truth map (`docs/canonical-truth-map.md`). Do not invent design tokens — read from `apps/admissions/src/styles/design-tokens.css` and `apps/admissions/src/design-system/tokens.colors.cjs`.

## Hard guardrails (already enforced)

These are duplicated from `PRODUCT.md` so they survive even if the design loader fails:

- **No purple gradients, gradient text, glassmorphism on product surfaces, or nested cards.**
- **No emoji icons.** Use Lucide on web, platform-native on mobile, SVG-only in PDFs.
- **WCAG AA contrast minimum** on every text + background pair. AAA where reasonable.
- **Touch targets ≥44 × 44 px** on every interactive element. Tailwind utilities `min-h-touch`, `min-w-touch`.
- **Reduced motion enforced globally** in `apps/admissions/src/index.css`. Never override.
- **Inter font fallback chain stays full.** Never reduce.
- **Status colours always paired with an icon or label.** Never colour alone.
- **Auto-save mandatory on every student form.** Never remove without a replacement.

## Optional CLI gate (already installed)

The Impeccable CLI is installed globally (`impeccable --version` → `2.1.9`).
Run on any frontend directory or PR branch:

```bash
impeccable detect apps/admissions/src/
```

29 deterministic anti-pattern rules. Exit-non-zero on any P0 finding. Wire into CI alongside the existing canonical-truth drift-guard suite when ready.

## File locations

```
PRODUCT.md                           # always loaded
DESIGN.md                            # always loaded
.kiro/skills/impeccable/             # 36 reference docs, 23 scripts
.kiro/skills/ui-ux-pro-max/          # 16 CSV data files, 3 Python scripts, templates
.kiro/steering/design-skills.md      # this file (inclusion: always)
docs/canonical-truth-map.md          # domain truth — read before any new enum
```
