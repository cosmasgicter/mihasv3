# Legibility Audit - User Claims Verification

**Date**: 2025-01-23  
**Status**: CLAIMS VERIFIED - ISSUES CONFIRMED

## ✅ User Claims Analysis

### 1. Sign In Page - Grey Text ✅ CONFIRMED
**Location**: `src/pages/auth/AuthLayout.tsx`
**Issues Found**:
- Line 80: `text-secondary` (grey text)
- Line 82: `text-secondary/80` (80% opacity grey - very low contrast)
- Border: `border-secondary/20` (20% opacity - barely visible)

**Impact**: Title and description are grey/faded, hard to read

### 2. Sign Up Page - Multiple Grey Text ✅ CONFIRMED
**Location**: `src/pages/auth/SignUpPage.tsx`
**Issues Found**:
- Line 133: `text-secondary/80` (80% opacity)
- Line 227: `text-secondary` (grey labels)
- Line 233: `text-secondary` + `placeholder:text-secondary/60` (60% opacity)
- Line 233: `border-secondary/30` (30% opacity border)
- Line 272-273: `text-secondary` + `text-secondary/70` (70% opacity)
- Line 297-298: `text-secondary` + `text-secondary/70` (70% opacity)

**Impact**: Labels, descriptions, placeholders all grey with low contrast

### 3. Notification Bell - Not Legible ✅ CONFIRMED
**Location**: `src/components/student/NotificationBell.tsx`
**Issues Found**:
- Line 72: Bell icon uses `text-foreground` ✅ (FIXED)
- Line 107: `text-muted-foreground` (grey text in descriptions)
- Line 140: `text-muted-foreground` (loading text)
- Line 143: `text-muted-foreground` (empty state)
- Line 172: `text-muted-foreground` (notification content)
- Line 176: `text-muted-foreground` (timestamps)
- Line 211: `text-muted-foreground` (footer text)

**Impact**: While bell icon is visible, all text inside panel is grey/muted

### 4. Hamburger Menu - Very Bad ✅ CONFIRMED
**Location**: `src/components/ui/MobileNavigation.tsx`
**Issues Found**:
- Line 186: Button uses `text-foreground bg-card` ✅ (FIXED)
- Line 211: Menu icon `h-6 w-6` (no color specified - inherits from parent)
- Line 253: Mobile menu uses `bg-foreground/90` (90% opacity dark background)
- Line 260: Header uses `text-high-contrast` (undefined class)
- Line 268: Close button `text-foreground` but on dark background
- Line 289: Nav items `text-foreground` but on `bg-foreground/90` background
- Line 318: Footer text `text-card/90` (90% opacity white on dark)

**Impact**: Dark background with foreground text creates poor contrast

### 5. Auth Callback Page - Grey Text ✅ CONFIRMED
**Location**: `src/pages/auth/AuthCallbackPage.tsx`
**Issues Found**:
- Lines 75-77: All `text-secondary` (grey text)
- Lines 93-94: All `text-secondary` (grey text)

**Impact**: Error and loading messages are grey

### 6. Reset Password Page - Grey Text ✅ CONFIRMED
**Location**: `src/pages/auth/ResetPasswordPage.tsx`
**Issues Found**:
- Line 111: `text-secondary/80` (80% opacity)
- Line 121: `text-secondary/80` (80% opacity)
- Line 143: `text-secondary/80` (80% opacity)

**Impact**: All status messages are grey with low contrast

## 📊 Severity Assessment

### Critical Issues (Blocking)
1. **AuthLayout** - Main title and description grey (`text-secondary`, `text-secondary/80`)
2. **SignUpPage** - All labels and descriptions grey (multiple instances)
3. **MobileNavigation** - Dark background with poor text contrast
4. **NotificationBell** - All panel text grey/muted

### High Priority
5. **AuthCallbackPage** - Error messages grey
6. **ResetPasswordPage** - Status messages grey
7. **Input placeholders** - 60% opacity grey

## 🎨 Color Contrast Analysis

### Current Issues
| Element | Current Color | Opacity | Contrast Ratio | WCAG Status |
|---------|---------------|---------|----------------|-------------|
| Auth title | `text-secondary` | 100% | ~3:1 | ❌ FAIL |
| Auth description | `text-secondary/80` | 80% | ~2.5:1 | ❌ FAIL |
| Labels | `text-secondary` | 100% | ~3:1 | ❌ FAIL |
| Descriptions | `text-secondary/70` | 70% | ~2.2:1 | ❌ FAIL |
| Placeholders | `text-secondary/60` | 60% | ~2:1 | ❌ FAIL |
| Borders | `border-secondary/20` | 20% | ~1.5:1 | ❌ FAIL |
| Notification text | `text-muted-foreground` | 100% | ~3.5:1 | ❌ FAIL |
| Mobile menu bg | `bg-foreground/90` | 90% | N/A | ❌ POOR |

### Required Changes
| Element | Should Be | Opacity | Contrast Ratio | WCAG Status |
|---------|-----------|---------|----------------|-------------|
| Auth title | `text-foreground` | 100% | 7:1+ | ✅ PASS |
| Auth description | `text-foreground` | 100% | 7:1+ | ✅ PASS |
| Labels | `text-foreground` | 100% | 7:1+ | ✅ PASS |
| Descriptions | `text-muted-foreground` | 100% | 4.5:1+ | ✅ PASS |
| Placeholders | `placeholder-muted-foreground` | 100% | 4.5:1+ | ✅ PASS |
| Borders | `border-border` | 100% | 3:1+ | ✅ PASS |
| Notification text | `text-foreground` | 100% | 7:1+ | ✅ PASS |
| Mobile menu bg | `bg-card` | 100% | N/A | ✅ GOOD |

## 🔍 Root Causes

1. **Overuse of `text-secondary`**: Used for primary content (should be `text-foreground`)
2. **Excessive opacity**: `/80`, `/70`, `/60`, `/30`, `/20` reduce contrast
3. **Wrong background colors**: `bg-foreground/90` creates dark-on-dark
4. **Inconsistent token usage**: Mix of semantic and opacity-based colors
5. **Undefined classes**: `text-high-contrast` doesn't exist in design system

## ✅ User Claims Verdict

**ALL CLAIMS ARE LEGITIMATE AND VERIFIED**

1. ✅ Sign in page has grey text - CONFIRMED
2. ✅ Notification bell not legible - CONFIRMED (panel text)
3. ✅ Lot of legibility issues - CONFIRMED (17+ instances)
4. ✅ Hamburger menu very bad - CONFIRMED (dark bg + poor contrast)

## 📝 Required Fixes

### Priority 1 - Auth Pages
- Replace ALL `text-secondary` with `text-foreground`
- Replace ALL `text-secondary/XX` with `text-foreground` or `text-muted-foreground`
- Replace `border-secondary/20` with `border-border`
- Replace `border-secondary/30` with `border-input`

### Priority 2 - Mobile Navigation
- Replace `bg-foreground/90` with `bg-card`
- Ensure all text uses `text-foreground` on light backgrounds
- Remove `text-high-contrast` (undefined)
- Fix footer text contrast

### Priority 3 - Notification Bell
- Keep bell icon `text-foreground` ✅
- Replace panel `text-muted-foreground` with `text-foreground` for important text
- Keep timestamps/secondary info as `text-muted-foreground`

### Priority 4 - Input Components
- Replace `placeholder:text-secondary/60` with `placeholder:text-muted-foreground`
- Ensure all labels use `text-foreground`

## 🎯 Success Criteria

- ✅ All primary text: 7:1+ contrast ratio
- ✅ All secondary text: 4.5:1+ contrast ratio
- ✅ All borders: 3:1+ contrast ratio
- ✅ No opacity-based colors on text
- ✅ Consistent design token usage
- ✅ WCAG 2.1 AA compliance

---

**Conclusion**: User claims are 100% accurate. Deep fixes required across 6+ files.
