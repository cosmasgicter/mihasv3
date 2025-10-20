# Root Cause - CONFIRMED

## You Were Right

The "Something went wrong" error and name display issues have the **SAME ROOT CAUSE**:

### Database Schema Mismatch

**Profile table has TWO name systems**:
1. `full_name` (single field) - NULL for admin
2. `first_name` + `last_name` (separate fields) - "Cosmas" + "Admin"

### The Chain Reaction

1. **Profile Creation**: When admin signed up, profile was created with `first_name` and `last_name` but NOT `full_name`

2. **Dashboard Code**: Checks `profile?.full_name?.split(' ')[0]`
   - Returns `undefined` when `full_name` is NULL
   - Falls back to 'Admin'

3. **Other Components**: Some check `full_name`, others check `first_name`
   - Inconsistent name display across app
   - "User" appears when both are null/undefined

4. **Error Boundary**: When profile data is incomplete/inconsistent, components throw errors trying to access undefined properties

### The Real Issues

1. **Inconsistent profile schema** - some users have `full_name`, others have `first_name`/`last_name`
2. **No fallback logic** - code assumes `full_name` always exists
3. **Profile creation bug** - not populating all name fields

## Fix Applied

1. ✅ Updated Dashboard to check: `full_name || first_name || 'Admin'`
2. ✅ Updated database: Set `full_name = first_name + last_name`

## Remaining Work

Need to check ALL components that display user names and add same fallback logic.
