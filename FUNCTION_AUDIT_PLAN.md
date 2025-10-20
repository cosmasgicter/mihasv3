# Function Audit & Fix Plan

## Total Functions: 73

### Priority 1 - Core APIs (Test First)
1. ✅ `/health` - Working
2. ✅ `/api/sessions` - Fixed
3. ✅ `/api/sessions/track` - Fixed
4. ✅ `/catalog/programs` - Working
5. ✅ `/catalog/intakes` - Working
6. `/catalog/subjects` - Test
7. `/applications` - Test
8. `/applications/[id]` - Test
9. `/auth/signin` - Test
10. `/auth/register` - Test

### Priority 2 - Admin Functions
11. `/admin/dashboard` - Test
12. `/admin/users` - Test
13. `/admin/applications/*` - Test

### Priority 3 - Notifications
14. `/notifications/send` - Test
15. `/notifications/*` - Test

### Priority 4 - Documents & Generation
16. `/documents/upload` - Test
17. `/applications/generate/slip` - Test

### Priority 5 - Analytics
18. `/analytics/*` - Test

### Priority 6 - Other
19. Interview, MCP, Push, etc.

## Testing Method
For each function:
1. Test endpoint with curl
2. Check response code
3. Verify error handling
4. Fix if broken
5. Document status
