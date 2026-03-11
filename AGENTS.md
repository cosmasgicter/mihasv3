# AGENTS.md instructions for /home/lenovo/Downloads/mihasv3

## Codex Runtime
- Target runtime: Codex 5.4 generation (Codex CLI `>= 0.111.0`).
- Skill conflict rule: if a skill exists both in project-local `.agents/skills` and user-global `~/.codex/skills`, use the project-local one.

## Skills
A skill is a set of local instructions stored in a `SKILL.md` file.

### Available skills
- accessibility: Audit and improve web accessibility following WCAG 2.1 guidelines. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/accessibility/SKILL.md)
- best-practices: Apply modern web development best practices for security, compatibility, and code quality. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/best-practices/SKILL.md)
- core-web-vitals: Optimize Core Web Vitals (LCP, INP, CLS). (file: /home/lenovo/Downloads/mihasv3/.agents/skills/core-web-vitals/SKILL.md)
- neon-postgres: Best practices for Neon Serverless Postgres. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/neon-postgres/SKILL.md)
- performance: Optimize web performance and loading speed. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/performance/SKILL.md)
- security-best-practices: Security best-practice review for supported stacks. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/security-best-practices/SKILL.md)
- security-threat-model: Repo-grounded AppSec threat modeling. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/security-threat-model/SKILL.md)
- seo: Search engine optimization guidance. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/seo/SKILL.md)
- vercel-composition-patterns: React composition patterns for scalable APIs. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/vercel-composition-patterns/SKILL.md)
- vercel-deploy: Deploy projects to Vercel. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/vercel-deploy/SKILL.md)
- vercel-react-best-practices: Vercel React/Next.js performance practices. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/vercel-react-best-practices/SKILL.md)
- web-design-guidelines: Review UI code against web interface guidelines. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/web-design-guidelines/SKILL.md)
- web-quality-audit: Comprehensive web quality audit workflow. (file: /home/lenovo/Downloads/mihasv3/.agents/skills/web-quality-audit/SKILL.md)
- browser-use: Browser automation for navigation/forms/screenshots/data extraction. (file: /home/lenovo/.codex/skills/browser-use/SKILL.md)
- doc: Read/create/edit `.docx` with formatting fidelity checks. (file: /home/lenovo/.codex/skills/doc/SKILL.md)
- executing-plans: Execute an existing implementation plan with checkpoints. (file: /home/lenovo/.codex/skills/executing-plans/SKILL.md)
- frontend-design: Build distinctive production-grade frontend UI. (file: /home/lenovo/.codex/skills/frontend-design/SKILL.md)
- playwright-skill: Browser automation and UI validation with Playwright. (file: /home/lenovo/.codex/skills/playwright-skill/SKILL.md)
- remote-browser: Cloud browser control for sandboxed environments. (file: /home/lenovo/.codex/skills/remote-browser/SKILL.md)
- screenshot: OS-level screenshot capture workflows. (file: /home/lenovo/.codex/skills/screenshot/SKILL.md)
- security-ownership-map: Security ownership/bus-factor analysis from git history. (file: /home/lenovo/.codex/skills/security-ownership-map/SKILL.md)
- systematic-debugging: Structured bug/debug workflow before proposing fixes. (file: /home/lenovo/.codex/skills/systematic-debugging/SKILL.md)
- test-driven-development: TDD workflow before implementation changes. (file: /home/lenovo/.codex/skills/test-driven-development/SKILL.md)
- verification-before-completion: Mandatory verification before claiming success. (file: /home/lenovo/.codex/skills/verification-before-completion/SKILL.md)
- webapp-testing: Toolkit for testing local web apps with Playwright. (file: /home/lenovo/.codex/skills/webapp-testing/SKILL.md)
- writing-plans: Write a multi-step implementation plan from requirements. (file: /home/lenovo/.codex/skills/writing-plans/SKILL.md)
- skill-creator: Create or update Codex skills. (file: /home/lenovo/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install skills from curated lists or GitHub repos. (file: /home/lenovo/.codex/skills/.system/skill-installer/SKILL.md)

### How to use skills
- Trigger rules: If the user names a skill or the task clearly matches a skill description, use that skill in the turn.
- Multiple matches: Use the minimal set of skills that fully covers the request; announce the order in one short line.
- Conflict handling: If duplicate skill names exist in different roots, prefer project-local `.agents/skills`.
- Missing/blocked: If a skill path is missing or unreadable, say so briefly and continue with best-effort fallback.
- Progressive disclosure: Read only as much of each `SKILL.md` (and referenced files) as needed for the request.
- Path resolution: Resolve relative paths from the skill directory first.
- Context hygiene: Avoid bulk-loading references; open only files directly needed for the current task.
