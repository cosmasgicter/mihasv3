---
name: open-design
description: Build web prototypes, dashboards, and presentation decks using the Open Design local-first AI design framework. Auto-integrates portable DESIGN.md systems, Turn-1 discovery forms, high-fidelity visual directions, and self-critiques.
license: Apache-2.0
metadata:
  author: open-design-community
  version: "0.8.0"
---

# Open Design (OD) Skill

Open Design is the open-source, local-first alternative to **Claude Design**. It utilizes local coding-agent CLI runtime capabilities, structured brand-grade design system profiles (`DESIGN.md`), turn-based interactive discovery forms, and modular visual directions to produce premium, production-ready web prototypes, presentations, and applications.

Use this skill when the user requests to:
- "Build a landing page, prototype, or dashboard using the Open Design methodology"
- "Create a magazine-style presentation or pitch deck (deck mode)"
- "Establish or integrate a portable `DESIGN.md` branding system"
- "Execute high-fidelity UI/UX wireframes with visual direction selectors"

---

## 1. Core Principles of Open Design

| Concept | Description |
| :--- | :--- |
| **1. Agent-as-Teammate** | The coding agent acts as a senior designer with access to a working filesystem, palette libraries, and self-correction checkers. |
| **2. Interactive Discovery** | Never write a single pixel before resolving ambiguity. Always present a dynamic discovery form or questionnaire up front. |
| **3. Design Systems as Markdown** | Portable `DESIGN.md` structures containing color swatches, typography scales, layout specs, and anti-patterns. |
| **4. Visual Directions** | Using 5 defined aesthetic directions (Monocle, Modern Minimal, Warm Soft, Tech Utility, Brutalist) with deterministic OKLch palettes. |
| **5. High-Fidelity Device Framing** | Frame output cleanly (iPhone 15 Pro, MacBook, iPad, or Browser Chrome) to enhance context and presentation. |
| **6. Self-Critique Protocols** | Perform a 5-dimensional critique of all generated artifacts before output delivery. |

---

## 2. Interactive Discovery Protocol (Rule 1)

Every fresh design brief must begin with a **Discovery Form** instead of immediate implementation. This ensures alignment on target audience, scale, branding, and constraints, eliminating unnecessary iterations.

### The Turn-1 Discovery Questionnaire:
Before rendering an artifact, compile and present the following questions to the user:
1. **Target Surface/Platform**: (e.g., Desktop Dashboard, Mobile App, Magazine Deck, SaaS Landing)
2. **Visual Direction Preference**: Select one of the 5 curated schools:
   - *Editorial Monocle* (High-fashion, large display serif typography, generous whitespace)
   - *Modern Minimal* (Sleek, high-contrast, clean sans-serif layout)
   - *Warm Soft* (Warm cream backgrounds, soft rounded corners, inviting organic layout)
   - *Tech Utility* (Highly structured, dense metrics, monospace accents, dark mode default)
   - *Brutalist Experimental* (Thick borders, flat primary colors, overlapping grids)
3. **Audience & Tone**: (e.g., Enterprise B2B, Gen-Z Consumer, Internal Engineers)
4. **Primary Action/CTA**: (e.g., "Schedule a Demo", "Register Student", "Pay Invoice")

---

## 3. Brand-Grade Design Systems (`DESIGN.md`)

Design tokens are maintained in a portable `DESIGN.md` file at the project root. This ensures that changing a system instantly swaps tokens without modifying core component markup.

### Standard `DESIGN.md` Template:
```markdown
# [Brand/Product Name] Design System

## 1. Color Palette (OKLch or HSL)
- **Primary / Accent**: `oklch(62.8% 0.25 29.23)` (Vibrant Coral)
- **Background**: `oklch(98.5% 0.01 90.0)` (Soft Cream / Off-White)
- **Surface**: `oklch(100% 0 0)` (Pure White)
- **Text / Foreground**: `oklch(15.0% 0.02 90.0)` (Deep Charcoal)
- **Border / Separator**: `oklch(90.0% 0.01 90.0)` (Light Gray)

## 2. Typography
- **Display Font**: 'Outfit', sans-serif (tracking: -0.02em, weight: 800)
- **Body Font**: 'Inter', sans-serif (tracking: normal, weight: 400)
- **Code/Metrics Font**: 'JetBrains Mono', monospace

## 3. Layout & Grid
- **Desktop Grid**: 12-column, 24px gutter, 80px margins
- **Mobile Grid**: 4-column, 16px gutter
- **Spacing Scale**: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px

## 4. Components & Interactive States
- **Buttons**: `px-5 py-2.5 rounded-lg font-semibold transition-all hover:scale-[1.02]`
- **Cards**: `p-6 rounded-xl border border-border bg-surface shadow-sm`

## 5. Visual Anti-Patterns (AI-Slop Avoidance)
- ❌ Do NOT use generic gradients (e.g., absolute blue-to-purple).
- ❌ Avoid double headers or nested borders.
- ❌ Never use raw browser default margins or gray colors (#808080).
```

---

## 4. Visual Direction Palette Specifications

When the user does not supply a brand, apply one of the following deterministic color-and-font stacks:

```javascript
export const VISUAL_DIRECTIONS = {
  MONOCLE: {
    name: "Editorial Monocle",
    bg: "oklch(99.0% 0.005 85.0)", // Warm bone-white
    text: "oklch(12.0% 0.01 85.0)", // Near-black charcoal
    primary: "oklch(25.0% 0.02 45.0)", // Classic deep forest green / dark bronze
    fontDisplay: "'Playfair Display', Georgia, serif",
    fontBody: "'Inter', sans-serif"
  },
  MINIMAL: {
    name: "Modern Minimal",
    bg: "oklch(100% 0 0)", // Pure white
    text: "oklch(10.0% 0 0)", // Solid ink black
    primary: "oklch(45.0% 0 0)", // Pure slate gray
    fontDisplay: "'Outfit', sans-serif",
    fontBody: "'Plus Jakarta Sans', sans-serif"
  },
  WARM_SOFT: {
    name: "Warm Soft",
    bg: "oklch(98.0% 0.015 75.0)", // Cozy warm sand
    text: "oklch(20.0% 0.02 60.0)", // Warm deep brown
    primary: "oklch(60.0% 0.18 45.0)", // Soft terracotta / clay
    fontDisplay: "'Fraunces', serif",
    fontBody: "'Quicksand', sans-serif"
  },
  TECH_UTILITY: {
    name: "Tech Utility",
    bg: "oklch(15.0% 0.01 250.0)", // Deep space blue-black
    text: "oklch(95.0% 0.005 250.0)", // High-contrast clean white
    primary: "oklch(70.0% 0.15 190.0)", // Electric cyan / neon teal
    fontDisplay: "'Space Grotesk', sans-serif",
    fontBody: "'JetBrains Mono', monospace"
  },
  BRUTALIST: {
    name: "Brutalist Experimental",
    bg: "oklch(95.0% 0.12 90.0)", // Electric canary yellow
    text: "oklch(5.0% 0 0)", // Solid deep black
    primary: "oklch(50.0% 0.30 320.0)", // Raw electric magenta
    fontDisplay: "'Syne', sans-serif",
    fontBody: "'Cabinet Grotesk', sans-serif"
  }
};
```

---

## 5. The 5-Dimensional Self-Critique Gate

Prior to packaging any output, the agent must run a mental critique scoring the implementation on a scale of 1 to 10 across 5 dimensions:

1. **Philosophy Alignment (1-10)**: Does the layout strictly represent the chosen visual direction or does it fallback to generic AI styles?
2. **Typographical Hierarchy (1-10)**: Are font scale, tracking, and leading proportional and readable?
3. **Attention to Detail (1-10)**: Are spacing, borders, shadows, and interactive hover scales cleanly refined?
4. **Functional Clarity (1-10)**: Is the main call to action highly visible and reachable? Are form layouts logical?
5. **Aesthetic Innovation (1-10)**: Does it feel premium, high-end, and custom-tailored?

*If any score is below **8/10**, the agent must automatically refactor the styling in a secondary pass before delivering the result to the user.*

---

## 6. Implementation Checklist & Verification

When executing an Open Design process:
- [ ] Present the **Discovery Form** on Turn 1 to establish Platform, Tone, and Direction.
- [ ] Create/update the `.od/DESIGN.md` guidelines at the project root.
- [ ] Implement layout templates inside clean, sandboxed `srcdoc` iframes.
- [ ] Embed pixel-accurate device frames (e.g. `assets/frames/iphone.svg`) if constructing mobile screens.
- [ ] Validate rendering output against the **5-Dimensional Self-Critique Gate**.
- [ ] Compile production-grade HTML/CSS components with zero unstyled placeholders.
