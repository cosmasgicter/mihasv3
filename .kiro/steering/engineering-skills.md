---
inclusion: always
---

# Engineering Workflow Skills — Always Available

Four agentic-engineering skills are installed at the project level and MUST be
applied on every coding task, in the order they naturally arise. Load the
matching `SKILL.md` before acting.

| Skill | Path | Apply when |
|-------|------|------------|
| **source-code-context** | `.kiro/skills/source-code-context/SKILL.md` | Before writing code against any API, library, or framework. Search the real local implementation instead of guessing API names or behavior. |
| **agentic-engineering-workflow** | `.kiro/skills/agentic-engineering-workflow/SKILL.md` | Any multi-step build or feature work. Governs context discipline, scoping, review loops, cleanup, and security basics end to end. |
| **code-structure-cleanup** | `.kiro/skills/code-structure-cleanup/SKILL.md` | After a feature works but has duplicated mechanics, repeated calls, or messy structure. Extract reusable service-layer modules without changing behavior. |
| **grep-loop-review-workflow** | `.kiro/skills/grep-loop-review-workflow/SKILL.md` | When iterating on review feedback for a PR/feature until tests pass and it is merge-ready. |

## Default order on any coding command

1. **source-code-context** — ground every API/behavior claim in the real code before writing anything.
2. **agentic-engineering-workflow** — plan and execute the change with proper context discipline and scoping.
3. **code-structure-cleanup** — once it works, remove duplication and extract reusable structure without behavior change.
4. **grep-loop-review-workflow** — drive the change to merge-ready: run tests, fix review feedback, repeat until green.

## Rules

- These run automatically — do not wait to be asked. They complement, not replace, the existing verification gates in `tech.md` and the design skills in `design-skills.md`.
- Read the matching `SKILL.md` before applying a skill; follow its specific steps rather than improvising.
- Skip a skill only when it is genuinely irrelevant to the task (e.g. cleanup on a one-line fix), and say so briefly.
- These never override the safety guardrails, canonical-truth map, or verification gates already in force.
