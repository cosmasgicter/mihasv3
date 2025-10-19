# Theme Migration Plan - CSS Variables + Semantic Tokens

## ✅ Phase 0: Setup (COMPLETE)

- [x] Created `src/styles/themes.css` with CSS variables
- [x] Updated `tailwind.config.js` with semantic tokens
- [x] Imported themes into `src/index.css`
- [x] Removed old hardcoded color system

## 🎯 Migration Phases

### Phase 1: Core Components (Week 1)
**Priority: Critical path components**

#### 1.1 Layout Components
- [ ] `src/components/navigation/Header.tsx`
- [ ] `src/components/navigation/Sidebar.tsx`
- [ ] `src/components/navigation/AppLayout.tsx`
- [ ] `src/components/navigation/MobileNav.tsx`

#### 1.2 UI Primitives
- [ ] `src/components/ui/Button.tsx`
- [ ] `src/components/ui/Card.tsx`
- [ ] `src/components/ui/Dialog.tsx`
- [ ] `src/components/ui/Toast.tsx`
- [ ] `src/components/ui/Input.tsx`

**Pattern:**
```tsx
// OLD
className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"

// NEW
className="bg-card text-card-foreground"
```

---

### Phase 2: Dashboard Pages (Week 2)
**Priority: High visibility pages**

#### 2.1 Student Dashboard
- [ ] `src/pages/student/Dashboard.tsx`
- [ ] `src/components/student/ApplicationCard.tsx`
- [ ] `src/components/student/NotificationBell.tsx`

#### 2.2 Admin Dashboard
- [ ] `src/pages/admin/Dashboard.tsx`
- [ ] `src/components/admin/applications/ApplicationsTable.tsx`
- [ ] `src/components/admin/applications/ApplicationDetailModal.tsx`

**Pattern:**
```tsx
// OLD
className="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"

// NEW
className="bg-muted border-border"
```

---

### Phase 3: Auth & Public Pages (Week 3)
**Priority: User-facing pages**

- [ ] `src/pages/auth/SignInPage.tsx`
- [ ] `src/pages/auth/SignUpPage.tsx`
- [ ] `src/pages/LandingPage.tsx`
- [ ] `src/pages/PublicApplicationTracker.tsx`

**Pattern:**
```tsx
// OLD
className="bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100"

// NEW
className="bg-accent text-accent-foreground"
```

---

### Phase 4: Remaining Components (Week 4)
**Priority: Low traffic components**

- [ ] All remaining components in `src/components/`
- [ ] All remaining pages in `src/pages/`
- [ ] Fix any missed dark mode classes

---

## 📋 Migration Checklist Per Component

### Before Migration
1. [ ] Read component file
2. [ ] Identify all `dark:` classes
3. [ ] Map to semantic tokens
4. [ ] Test in light mode
5. [ ] Test in dark mode
6. [ ] Commit changes

### Semantic Token Mapping

| Old Pattern | New Token | Usage |
|-------------|-----------|-------|
| `bg-white dark:bg-gray-800` | `bg-card` | Cards, panels |
| `bg-gray-50 dark:bg-gray-900` | `bg-muted` | Subtle backgrounds |
| `text-gray-900 dark:text-gray-100` | `text-foreground` | Primary text |
| `text-gray-600 dark:text-gray-400` | `text-muted-foreground` | Secondary text |
| `border-gray-200 dark:border-gray-700` | `border-border` | Borders |
| `bg-blue-600 dark:bg-blue-500` | `bg-primary` | Primary actions |
| `bg-red-600 dark:bg-red-500` | `bg-destructive` | Destructive actions |

---

## 🔧 Helper Script

```bash
# Find components with dark mode classes
grep -r "dark:" src/components --include="*.tsx" -l

# Count remaining dark: classes
grep -r "dark:" src/ --include="*.tsx" | wc -l

# Find conflicting classes
grep -r "dark:bg-gray-800 dark:bg-gray-200" src/ --include="*.tsx"
```

---

## 🧪 Testing Strategy

### Per Component
1. Open in browser (light mode)
2. Toggle to dark mode
3. Check all states (hover, active, disabled)
4. Verify no visual regressions

### Automated
```bash
# Build to catch any errors
npm run build:prod

# Run tests
npm run test
```

---

## 📊 Progress Tracking

**Total Components:** ~120
**Migrated:** 0
**Remaining:** 120

**Estimated Time:** 4 weeks (40 hours)
**Current Phase:** Phase 1 - Core Components

---

## 🚀 Quick Start

### Migrate a Component

1. **Find dark: classes:**
```bash
grep "dark:" src/components/ui/Button.tsx
```

2. **Replace with semantic tokens:**
```tsx
// Before
<button className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700">

// After
<button className="bg-card text-card-foreground border-border">
```

3. **Test both modes:**
```bash
npm run dev
# Toggle theme in UI
```

4. **Commit:**
```bash
git add src/components/ui/Button.tsx
git commit -m "refactor: migrate Button to semantic tokens"
```

---

## 📝 Notes

- Keep `next-themes` - it's perfect for this
- ThemeToggle component works as-is
- CSS variables handle all theme switching
- No runtime performance impact
- Can add custom themes later (blue, purple, etc.)

---

**Status:** Phase 0 Complete ✅  
**Next:** Start Phase 1 - Core Components
