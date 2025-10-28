# Instant Load Strategy (90-100 Score)

## Goal: First Paint < 1s, Keep Framer Motion

## Critical Path Analysis

### Current Load (283KB initial)
1. React + Router (335KB)
2. Supabase Client (153KB) 
3. React Query
4. Framer Motion (108KB)
5. LandingPage component

### Problem
Everything loads synchronously, blocking first paint.

## Solution: Progressive Hydration

### Phase 1: Minimal Shell (Target: 50KB)
Load ONLY what's needed for first paint:
- Minimal HTML/CSS
- Tiny JS loader
- Static content

### Phase 2: Hydrate on Interaction
Load React/Motion/etc AFTER first paint

## Implementation Plan

### Step 1: Static HTML Shell (Instant)
```html
<!-- index.html - Full static content -->
<body>
  <div id="root">
    <!-- Pre-rendered landing page HTML -->
    <header>MIHAS Logo + Nav</header>
    <main>Hero Section (static)</main>
  </div>
  <script type="module" src="/loader.js"></script>
</body>
```

### Step 2: Lazy Hydration
```typescript
// loader.js (5KB)
// Wait for user interaction or idle
requestIdleCallback(() => {
  import('/src/main.tsx') // Load React app
})
```

### Step 3: Route-Based Splitting
```typescript
// Only load what's needed per route
const routes = {
  '/': () => import('./pages/LandingPage'),
  '/signin': () => import('./pages/SignIn'),
  '/student/*': () => import('./pages/student/index')
}
```

### Step 4: Inline Critical CSS
```html
<style>
  /* Only above-fold CSS (5KB) */
  .hero { ... }
  .nav { ... }
</style>
<link rel="preload" href="/assets/index.css" as="style">
```

### Step 5: Defer Supabase
```typescript
// Don't load Supabase until user tries to sign in
let supabaseClient = null
export const getSupabase = async () => {
  if (!supabaseClient) {
    const { createClient } = await import('@supabase/supabase-js')
    supabaseClient = createClient(...)
  }
  return supabaseClient
}
```

## Expected Results

### Before
- FCP: 6.7s
- LCP: 8.5s
- TBT: 5,150ms
- Score: 13

### After
- FCP: 0.8s (static HTML)
- LCP: 1.2s (images lazy)
- TBT: 50ms (no JS blocking)
- Score: 90-95

## Implementation Steps

1. **Generate Static HTML** (30 min)
   - Pre-render LandingPage to HTML
   - Inline critical CSS
   
2. **Create Loader** (15 min)
   - Tiny JS that hydrates on idle
   
3. **Defer Heavy Libraries** (20 min)
   - Supabase: Load on auth action
   - Framer Motion: Load with components
   
4. **Route Splitting** (30 min)
   - Each route = separate chunk
   - Load on navigation

5. **Image Optimization** (15 min)
   - Convert to WebP
   - Add blur placeholders

## Files to Create/Modify

### New Files
- `scripts/prerender.ts` - Generate static HTML
- `src/loader.ts` - Minimal hydration loader
- `src/lib/lazySupabase.ts` - Deferred Supabase

### Modified Files
- `index.html` - Static content + inline CSS
- `src/main.tsx` - Conditional hydration
- `src/routes/config.tsx` - All routes lazy
- `vite.config.production.ts` - SSG plugin

## Quick Wins (Do First)

### 1. Inline Critical CSS (5 min, +15 pts)
Extract first 5KB of CSS, inline in `<head>`

### 2. Prerender Landing Page (20 min, +20 pts)
Use `vite-plugin-ssr` or manual HTML generation

### 3. Defer All JS (10 min, +25 pts)
```html
<script type="module" defer src="/src/main.tsx"></script>
```

### 4. Image WebP + Blur (15 min, +10 pts)
Convert PNGs to WebP, add blur placeholders

## Total Expected Gain
+70 points = **Score: 90+**

## Keep Motion.div?
YES! Motion loads AFTER first paint, doesn't block.
