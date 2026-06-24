# Agent Instructions & Steering Context

These guidelines are automatically applied to all agent operations in this workspace.

## 1. Zero Hallucination Policy & Steering Files

To ensure correctness and eliminate hallucination, the agent must check and align with the following steering files in `.kiro/steering/` and the core codebase documentation before executing any coding, database, or design operations:

*   **[.kiro/steering/tech.md](file:///home/cosmas/Downloads/mihasv3/.kiro/steering/tech.md)**: Active monorepo package layout (Bun workspaces, standalone Python Django 5 backend), dev/build/test scripts, and libraries (React 18 + TS, Vite, Zustand, React Query, Tailwind).
*   **[.kiro/steering/infrastructure.md](file:///home/cosmas/Downloads/mihasv3/.kiro/steering/infrastructure.md)**: Database environments topology (Neon Serverless Postgres for authoring vs. production Docker Postgres container on AWS EC2 box). Enforces the **Neon first, production second** rule.
*   **[.kiro/steering/structure.md](file:///home/cosmas/Downloads/mihasv3/.kiro/steering/structure.md)**: Top-level layout, monorepo routing, admissions high-risk flow paths (wizard, settings, payments), and spec status markers (`.config.kiro` with `"status": "completed"`).
*   **[.kiro/steering/enterprise-tenancy.md](file:///home/cosmas/Downloads/mihasv3/.kiro/steering/enterprise-tenancy.md)**: Multi-tenancy authority model (Beanola owns the platform; MIHAS and KATC are tenants). Backend capability logic in `backend/apps/catalog/services.py`, DRF permissions, and frontend capability hook `useCapabilities`.
*   **[.kiro/steering/product.md](file:///home/cosmas/Downloads/mihasv3/.kiro/steering/product.md)**: Identity (MIHAS and KATC), product mode vs. brand register, and specific audience details.
*   **[.kiro/steering/design-skills.md](file:///home/cosmas/Downloads/mihasv3/.kiro/steering/design-skills.md)**: Requirements for design/UX tasks, tool instructions for `Impeccable`, `ui-ux-pro-max`, and `design-for-ai`.
*   **[.kiro/steering/engineering-skills.md](file:///home/cosmas/Downloads/mihasv3/.kiro/steering/engineering-skills.md)**: Workflow sequence (`source-code-context` → `agentic-engineering-workflow` → `code-structure-cleanup` → `grep-loop-review-workflow`).
*   **[PRODUCT.md](file:///home/cosmas/Downloads/mihasv3/PRODUCT.md)** and **[DESIGN.md](file:///home/cosmas/Downloads/mihasv3/DESIGN.md)** (Workspace root): Curated audience/brand constraints, color palettes, typography mappings, and components.
*   **[docs/canonical-truth-map.md](file:///home/cosmas/Downloads/mihasv3/docs/canonical-truth-map.md)**: Authoritative mapping of domain concepts, enums, status lists, and role definitions.

## 2. Hard System Guardrails & Enforcements

*   **Database Invariant**: Never make changes to production directly as a first step. Develop, branch (`create_branch`), and validate schemas and data queries using Neon serverless Postgres (`kiroPowers` -> `neon`) first, then apply/migrate the additive SQL scripts (located in `backend/scripts/`) to production. Destructive SQL/MCP tools are never run autonomously.
*   **Styling Restrictions**: **No purple gradients, gradient text, glassmorphism on product surfaces, or nested cards.** No emoji icons (use Lucide on web, platform-native on mobile, SVG-only in PDFs).
*   **UX/A11y Constraints**:
    *   Ensure **WCAG AA contrast minimum** on every text-background pair.
    *   Touch targets must be at least **44x44px** (utilize Tailwind `min-h-touch`, `min-w-touch`).
    *   Respect the global **reduced motion** setting (never override).
    *   Status colors must always be paired with a corresponding text label or icon.
    *   Mandatory auto-save on student-facing forms.

## 3. Utilizing Kiro / kiro-cli Custom Skills

The agent has access to all the design, product, engineering, and platform skills defined under `.kiro/skills/`. When performing specific actions:

*   Invoke **Impeccable** (`.kiro/skills/impeccable/`) for component audits, critique, layout, typography, colors, motion, and brand/product register alignment. Load the matching reference under `.kiro/skills/impeccable/reference/` for the command you are running.
*   Invoke **ui-ux-pro-max** (`.kiro/skills/ui-ux-pro-max/`) for searching design-system tokens, color palettes, font pairings, and UX guidelines. Run `python3 .kiro/skills/ui-ux-pro-max/scripts/search.py` with custom flags to resolve specifications.
*   Invoke **design-for-ai** (`.kiro/skills/design-for-ai/`) in CHECKER or APPLIER modes to verify visual design principles, composition, and typography rules.
*   For any backend, API, or general coding task, follow the engineering workflow sequence (check local implementation context, plan scoped changes, clean up structure/duplicates, and review feedback iteratively).
