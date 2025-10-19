# Admin Pages Diagnosis

## Issue
Admin pages not working after Cloudflare Pages migration.

## Pages to Check
1. ✅ Dashboard (`/admin/dashboard`) - Uses `/admin/dashboard` API
2. ⏳ Applications (`/admin/applications`) - Uses Supabase direct queries
3. ⏳ Users (`/admin/users`) - Uses `/admin/users` API
4. ⏳ Programs (`/admin/programs`) - Uses `/catalog/programs` API
5. ⏳ Intakes (`/admin/intakes`) - Uses `/catalog/intakes` API
6. ⏳ Settings (`/admin/settings`) - Uses profile APIs
7. ⏳ Analytics (`/admin/analytics`) - Uses `/analytics/metrics` API

## Fixed Issues

### 1. Dashboard API (`/admin/dashboard`)
**Problem**: API was returning minimal data, frontend expected comprehensive dashboard metrics.

**Fix**: Updated `/functions/admin/dashboard.js` to return:
- All required stats fields (totalApplications, pendingApplications, etc.)
- recentActivity array
- statusBreakdown object
- periodTotals object
- processingMetrics object
- generatedAt timestamp

**Status**: ✅ FIXED

## Testing Checklist

For each admin page, verify:
- [ ] Page loads without errors
- [ ] Data displays correctly
- [ ] API calls succeed (check Network tab)
- [ ] No console errors
- [ ] Actions work (create, update, delete)

## Common Issues to Check

1. **API Endpoint Paths**: Cloudflare Pages functions don't use `/api/` prefix
2. **Authentication**: Check if `getUserFromRequest()` works correctly
3. **CORS Headers**: Ensure all endpoints have proper CORS
4. **Response Format**: Frontend expects specific data structure
5. **Supabase Queries**: Check if RLS policies allow admin access

## Next Steps

1. Test dashboard page in browser
2. Check browser console for errors
3. Check Network tab for failed API calls
4. Fix each API endpoint one by one
5. Update this document with findings
