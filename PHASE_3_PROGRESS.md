# Phase 3: Remove Framer Motion from Student Dashboard

## Status: IN PROGRESS

### Changes Made
1. ✅ Phase 1: Preconnect hints (+7 pts)
2. ✅ Phase 2: Optimized images, removed motion from OptimizedImage (+5 pts)
3. 🔄 Phase 3: Remove motion from student Dashboard

### Student Dashboard Motion Usage
- Line 286: Error message motion.div
- Line 338: Draft application card motion.div
- Line 504: Submitted application card motion.div
- Line 618: Intake deadline motion.div
- Line 708: Loading spinner motion.div

### Replacement Strategy
Replace `motion.div` with `div` and add CSS class `animate-fade-in-up`

### Expected Impact
- Bundle size: -8KB (Framer Motion tree-shaken from this route)
- Performance: +15 points
- No visual regression (CSS animations replace motion)

### Total Expected Gain
Phase 1: +7 pts
Phase 2: +5 pts  
Phase 3: +15 pts
**Total: +27 points** (Score: 13 → 40)
