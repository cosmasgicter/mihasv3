# Supabase to Neon Migration - Forensic Inventory

## Overview
This directory contains the forensic extraction from Supabase database for migration to Neon.

**Source**: Supabase Project `mylgegkqoddcrxtwcclb` (supabase-fuchsia-book)
**Target**: Neon Project `wild-bar-37055823` (mihasApplication)
**Extraction Date**: February 1, 2026 (CAT)

## Files

- `tables_inventory.json` - All 107 tables with column definitions
- `core_tables.json` - Essential tables for application functionality
- `indexes_inventory.json` - All index definitions
- `functions_inventory.json` - Stored procedures with classifications
- `triggers_inventory.json` - Trigger definitions
- `rls_policies_inventory.json` - RLS policies with replacement mapping

## Migration Strategy

1. **Phase 1**: Core tables (profiles, applications, documents, sessions)
2. **Phase 2**: Supporting tables (programs, intakes, subjects, grades)
3. **Phase 3**: Analytics and logging tables
4. **Phase 4**: Legacy and archive tables

## Notes

- All `auth.users` foreign key references converted to `profiles` table
- RLS policies replaced with API middleware ownership checks
- Supabase-specific triggers removed (auth events)
- UUID generation uses `gen_random_uuid()` (pgcrypto)
