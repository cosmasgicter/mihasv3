# Phase 6: Emoji Replacement Guide

## Emoji to Icon Mapping

| Emoji | Icon Component | Import |
|-------|---------------|--------|
| 🔧 | `Wrench` | lucide-react |
| 👤 | `User` | lucide-react |
| ✅ | `CheckCircle` | lucide-react |
| ❌ | `XCircle` | lucide-react |
| 🏠 | `Home` | lucide-react |
| 👨‍🎓 | `GraduationCap` | lucide-react |
| 🎉 | `PartyPopper` or `Trophy` | lucide-react |
| 🚀 | `Rocket` | lucide-react |
| ✨ | `Sparkles` | lucide-react |
| 🎓 | `GraduationCap` | lucide-react |
| 📧 | `Mail` | lucide-react |
| 📱 | `Phone` or `Smartphone` | lucide-react |
| 📊 | `BarChart3` | lucide-react |
| 💡 | `Lightbulb` | lucide-react |
| ⚡ | `Zap` | lucide-react |
| 📝 | `FileText` | lucide-react |
| 🎨 | `Palette` | lucide-react |
| 🌟 | `Star` | lucide-react |
| 💻 | `Monitor` | lucide-react |
| 📈 | `TrendingUp` | lucide-react |
| 🔒 | `Lock` | lucide-react |
| ⚠️ | `AlertTriangle` | lucide-react |
| 🔍 | `Search` | lucide-react |
| 📄 | `FileText` | lucide-react |
| 🔔 | `Bell` | lucide-react |
| ⭐ | `Star` | lucide-react |
| 🎯 | `Target` | lucide-react |
| 📋 | `ClipboardList` | lucide-react |
| 💬 | `MessageSquare` | lucide-react |
| 💔 | `HeartCrack` | lucide-react |
| ⏳ | `Clock` or `Hourglass` | lucide-react |
| 🔢 | `Hash` | lucide-react |
| 📍 | `MapPin` | lucide-react |
| 📞 | `Phone` | lucide-react |
| 📤 | `Send` | lucide-react |
| ❓ | `HelpCircle` | lucide-react |

## Files to Update

### High Priority (User-Facing)
1. `src/pages/PublicApplicationTracker.tsx` - 30+ emojis
2. `src/pages/student/Dashboard.tsx` - Welcome message
3. `src/pages/admin/Analytics.tsx` - Tab labels
4. `src/pages/admin/Programs.tsx` - Headers

### Medium Priority
5. `src/pages/AdminTest.tsx` - Test page
6. `src/pages/student/ApplicationStatus.tsx` - Section headers
7. `src/pages/student/NotificationSettings.tsx` - Status indicators
8. `src/pages/student/Settings.tsx` - Section headers
9. `src/pages/admin/AuditTrail.tsx` - Filter labels
10. `src/pages/admin/Intakes.tsx` - Capacity indicators
11. `src/pages/admin/Dashboard.tsx` - Overview header

## Replacement Strategy

### 1. Simple Text Replacement
```tsx
// Before
<h1>🔧 Admin Access Test</h1>

// After
<h1 className="flex items-center gap-2">
  <Wrench className="w-6 h-6" />
  Admin Access Test
</h1>
```

### 2. Status Indicators
```tsx
// Before
{isAdmin ? '✅ Yes' : '❌ No'}

// After
{isAdmin ? (
  <span className="flex items-center gap-1">
    <CheckCircle className="w-4 h-4 text-green-600" />
    Yes
  </span>
) : (
  <span className="flex items-center gap-1">
    <XCircle className="w-4 h-4 text-red-600" />
    No
  </span>
)}
```

### 3. Decorative Emojis
```tsx
// Before
<div className="text-4xl">⚠️</div>

// After
<AlertTriangle className="w-10 h-10 text-yellow-600" />
```

### 4. Animated Icons
```tsx
// Before
<motion.div className="text-6xl">🎓</motion.div>

// After
<motion.div>
  <GraduationCap className="w-16 h-16 text-blue-600" />
</motion.div>
```

## Implementation Notes

- Keep icon sizes consistent (w-4 h-4 for inline, w-6 h-6 for headers, w-10 h-10 for large)
- Add appropriate colors (text-blue-600, text-green-600, etc.)
- Use flex layouts for proper alignment
- Add motion to icons where emojis were animated
- Maintain semantic meaning (success = green, error = red, warning = yellow)
