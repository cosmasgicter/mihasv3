# Migration Framework Guide

## Overview

The MIHAS Migration Framework provides a robust system for executing database migrations with built-in rollback capabilities, data validation, and progress tracking. This guide explains how to use the framework effectively.

**Requirements**: 10.4

## Features

- ✅ **Rollback Capabilities**: Every migration can be reversed safely
- ✅ **Data Validation**: Pre and post-migration integrity checks
- ✅ **Progress Tracking**: Real-time monitoring of migration execution
- ✅ **Backup Points**: Automatic backup creation before migrations
- ✅ **Audit Trail**: Complete history of all migration executions
- ✅ **Error Recovery**: Automatic rollback on validation failures

## Architecture

```
Migration Framework
├── Migration Registry (in-memory)
├── Migration History (database)
├── Migration Backups (database)
├── Migration Validations (database)
└── Migration Progress (database)
```

## Quick Start

### 1. Define a Migration

```javascript
import { createMigrationFramework } from '../_lib/migrationFramework.js';

const myMigration = {
  id: 'my_migration_20250114',
  name: 'My Migration',
  description: 'Description of what this migration does',
  
  // Optional: Tables that must exist
  requiredTables: ['table1', 'table2'],
  
  // Optional: Data dependencies
  dataDependencies: [
    {
      table: 'users',
      condition: { role: 'admin' },
      description: 'At least one admin user must exist'
    }
  ],

  // Forward migration
  async up(supabase) {
    // Your migration logic here
    const { data, error } = await supabase
      .from('my_table')
      .update({ new_field: 'value' });
    
    if (error) throw error;
    
    return {
      message: 'Migration completed successfully',
      recordsUpdated: data.length
    };
  },

  // Rollback migration
  async down(supabase) {
    // Reverse the changes
    const { error } = await supabase
      .from('my_table')
      .update({ new_field: null });
    
    if (error) throw error;
    
    return {
      message: 'Migration rolled back successfully'
    };
  },

  // Validation (optional but recommended)
  async validate(supabase) {
    const errors = [];
    
    // Check that migration was successful
    const { count } = await supabase
      .from('my_table')
      .select('*', { count: 'exact', head: true })
      .is('new_field', null);
    
    if (count > 0) {
      errors.push(`Found ${count} records without new_field`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};
```

### 2. Register and Execute Migration

```javascript
// Initialize framework
const framework = createMigrationFramework(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Register migration
framework.registerMigration(myMigration);

// Execute migration
const result = await framework.executeMigration('my_migration_20250114');

if (result.success) {
  console.log('Migration completed:', result);
} else {
  console.error('Migration failed:', result.error);
}
```

### 3. Monitor Progress

```javascript
// Get migration progress
const progress = await framework.getMigrationProgress('my_migration_20250114');

console.log('Status:', progress.status);
console.log('Started:', progress.startedAt);
console.log('Completed:', progress.completedAt);
```

### 4. Rollback if Needed

```javascript
// Rollback migration
const rollbackResult = await framework.rollbackMigration(
  'my_migration_20250114',
  result.backupId
);

if (rollbackResult.success) {
  console.log('Rollback completed');
}
```

## API Endpoints

### Get Migration History

```bash
GET /admin/migrations/history
```

Response:
```json
{
  "success": true,
  "history": [
    {
      "id": "uuid",
      "migration_id": "my_migration_20250114",
      "migration_name": "My Migration",
      "status": "completed",
      "started_at": "2025-01-14T10:00:00Z",
      "completed_at": "2025-01-14T10:05:00Z"
    }
  ],
  "count": 1
}
```

### Get Migration Progress

```bash
GET /admin/migrations/progress?migrationId=my_migration_20250114
```

Response:
```json
{
  "success": true,
  "progress": {
    "found": true,
    "status": "completed",
    "startedAt": "2025-01-14T10:00:00Z",
    "completedAt": "2025-01-14T10:05:00Z",
    "metadata": {
      "recordsUpdated": 100
    }
  }
}
```

### Execute Migration

```bash
POST /admin/migrations/execute
Content-Type: application/json

{
  "migrationId": "my_migration_20250114"
}
```

Response:
```json
{
  "success": true,
  "migrationId": "my_migration_20250114",
  "result": {
    "message": "Migration completed successfully",
    "recordsUpdated": 100
  },
  "backupId": "backup_my_migration_20250114_1705228800000"
}
```

### Rollback Migration

```bash
POST /admin/migrations/rollback
Content-Type: application/json

{
  "migrationId": "my_migration_20250114",
  "backupId": "backup_my_migration_20250114_1705228800000"
}
```

Response:
```json
{
  "success": true,
  "migrationId": "my_migration_20250114",
  "message": "Migration rolled back successfully"
}
```

### Validate Data Integrity

```bash
POST /admin/migrations/validate
Content-Type: application/json

{
  "table": "applications",
  "checks": [
    {
      "type": "foreign_key",
      "column": "user_id",
      "referencedTable": "user_profiles"
    },
    {
      "type": "not_null",
      "column": "full_name"
    },
    {
      "type": "unique",
      "column": "application_number"
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "validation": {
    "valid": true,
    "errors": []
  }
}
```

### Get Migration Statistics

```bash
GET /admin/migrations/statistics
```

Response:
```json
{
  "success": true,
  "statistics": {
    "total_migrations": 10,
    "completed_migrations": 8,
    "failed_migrations": 1,
    "rolled_back_migrations": 1,
    "average_duration_seconds": 45.5
  }
}
```

## Best Practices

### 1. Always Include Rollback Logic

Every migration should have a `down()` function that reverses the changes:

```javascript
async up(supabase) {
  // Add column
  await supabase.from('table').update({ new_column: 'default' });
},

async down(supabase) {
  // Remove column data
  await supabase.from('table').update({ new_column: null });
}
```

### 2. Validate Before and After

Use the `validate()` function to ensure data integrity:

```javascript
async validate(supabase) {
  const errors = [];
  
  // Check for orphaned records
  const { data: orphans } = await supabase
    .rpc('find_orphaned_records', {
      table_name: 'child_table',
      foreign_key: 'parent_id',
      referenced_table: 'parent_table'
    });
  
  if (orphans?.length > 0) {
    errors.push(`Found ${orphans.length} orphaned records`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

### 3. Use Batch Processing for Large Datasets

```javascript
async up(supabase) {
  const { data: records } = await supabase.from('large_table').select('*');
  
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await supabase.from('large_table').upsert(batch);
  }
}
```

### 4. Include Descriptive Metadata

```javascript
const migration = {
  id: 'consolidate_applications_20250114',
  name: 'Consolidate Legacy Applications',
  description: 'Migrate data from applications_legacy to applications table',
  // ... rest of migration
};
```

### 5. Test Migrations in Development First

Always test migrations in a development environment before running in production:

```javascript
// Development testing
if (process.env.NODE_ENV === 'development') {
  const result = await framework.executeMigration('test_migration');
  console.log('Test result:', result);
}
```

## Database Schema

### migration_history

Tracks all migration executions:

```sql
CREATE TABLE migration_history (
  id UUID PRIMARY KEY,
  migration_id TEXT NOT NULL,
  migration_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  metadata JSONB,
  error_message TEXT
);
```

### migration_backups

Stores backup points for rollback:

```sql
CREATE TABLE migration_backups (
  id UUID PRIMARY KEY,
  backup_id TEXT NOT NULL UNIQUE,
  migration_id TEXT NOT NULL,
  backup_data JSONB,
  created_at TIMESTAMPTZ NOT NULL
);
```

### migration_validations

Records validation results:

```sql
CREATE TABLE migration_validations (
  id UUID PRIMARY KEY,
  migration_history_id UUID REFERENCES migration_history(id),
  validation_type TEXT NOT NULL,
  validation_status TEXT NOT NULL,
  validation_message TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
```

### migration_progress

Tracks detailed progress:

```sql
CREATE TABLE migration_progress (
  id UUID PRIMARY KEY,
  migration_history_id UUID REFERENCES migration_history(id),
  step_name TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL,
  progress_percentage INTEGER,
  message TEXT
);
```

## Example Migrations

See `functions/_lib/migrations/exampleMigrations.js` for complete examples:

1. **Consolidate Applications**: Migrate data from legacy table to new table
2. **Add Eligibility Score**: Add new column and calculate values
3. **Cleanup Orphaned Records**: Remove invalid foreign key references

## Troubleshooting

### Migration Fails During Execution

1. Check the error message in migration_history
2. Review the validation errors
3. Rollback using the backup_id
4. Fix the migration logic and retry

### Validation Fails

1. Review the validation errors in the response
2. Check data integrity using the validate endpoint
3. Fix data issues manually if needed
4. Re-run validation

### Rollback Fails

1. Check if the migration has a proper `down()` function
2. Verify the backup_id exists
3. Manually restore data if needed
4. Update migration_history status

## Security Considerations

- Only admin users can execute migrations
- All migrations are logged with audit trail
- Backups are created automatically
- RLS policies protect migration tables
- Validation prevents data corruption

## Performance Tips

- Use batch processing for large datasets
- Add indexes before data migrations
- Run migrations during low-traffic periods
- Monitor database performance during execution
- Use progress tracking for long-running migrations

## Next Steps

1. Review example migrations in `functions/_lib/migrations/exampleMigrations.js`
2. Create your first migration following the patterns
3. Test in development environment
4. Execute in production with monitoring
5. Keep migration history for audit purposes
