// @vitest-environment node

/**
 * Schema Verification Test
 *
 * Validates that all 9 Core_Entity tables are defined in migration SQL files
 * with the correct columns, data types, and foreign key constraints.
 *
 * This is a static verification test — it parses migration files rather than
 * connecting to the live database.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Expected schema definitions (verified against live Neon data)
// ---------------------------------------------------------------------------

interface ColumnDef {
  name: string;
  dataType: string; // regex-friendly pattern matched against the SQL
  nullable: boolean;
}

interface ForeignKeyDef {
  column: string;
  referencesTable: string;
  referencesColumn: string;
}

interface TableSchema {
  tableName: string;
  migrationFile: string; // which migration file defines this table
  requiredColumns: ColumnDef[];
  foreignKeys?: ForeignKeyDef[];
}

const CORE_ENTITIES: TableSchema[] = [
  {
    tableName: 'profiles',
    migrationFile: '002_core_schema.sql',
    requiredColumns: [
      { name: 'id', dataType: 'UUID', nullable: false },
      { name: 'email', dataType: 'VARCHAR', nullable: false },
      { name: 'role', dataType: 'VARCHAR', nullable: true },
      { name: 'first_name', dataType: 'VARCHAR', nullable: true },
      { name: 'last_name', dataType: 'VARCHAR', nullable: true },
      { name: 'phone', dataType: 'VARCHAR', nullable: true },
      { name: 'is_active', dataType: 'BOOLEAN', nullable: true },
      { name: 'password_hash', dataType: 'TEXT', nullable: true },
      { name: 'refresh_token_hash', dataType: 'TEXT', nullable: true },
      { name: 'failed_login_attempts', dataType: 'INTEGER', nullable: true },
      { name: 'locked_until', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'password_changed_at', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'created_at', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'updated_at', dataType: 'TIMESTAMPTZ', nullable: true },
    ],
    foreignKeys: [],
  },
  {
    tableName: 'applications',
    migrationFile: '002_core_schema.sql',
    requiredColumns: [
      { name: 'id', dataType: 'UUID', nullable: false },
      { name: 'application_number', dataType: 'VARCHAR', nullable: false },
      { name: 'user_id', dataType: 'UUID', nullable: false },
      { name: 'status', dataType: 'VARCHAR', nullable: false },
      { name: 'program', dataType: 'VARCHAR', nullable: false },
      { name: 'intake', dataType: 'VARCHAR', nullable: false },
      { name: 'institution', dataType: 'VARCHAR', nullable: false },
      { name: 'payment_status', dataType: 'VARCHAR', nullable: true },
      { name: 'created_at', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'updated_at', dataType: 'TIMESTAMPTZ', nullable: true },
    ],
    foreignKeys: [
      { column: 'user_id', referencesTable: 'profiles', referencesColumn: 'id' },
    ],
  },
  {
    tableName: 'application_documents',
    migrationFile: '002_core_schema.sql',
    requiredColumns: [
      { name: 'id', dataType: 'UUID', nullable: false },
      { name: 'application_id', dataType: 'UUID', nullable: false },
      { name: 'document_type', dataType: 'VARCHAR', nullable: false },
      { name: 'document_name', dataType: 'VARCHAR', nullable: false },
      { name: 'file_url', dataType: 'TEXT', nullable: true },
      { name: 'mime_type', dataType: 'VARCHAR', nullable: true },
      { name: 'system_generated', dataType: 'BOOLEAN', nullable: true },
      { name: 'verification_status', dataType: 'VARCHAR', nullable: true },
      { name: 'created_at', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'updated_at', dataType: 'TIMESTAMPTZ', nullable: true },
    ],
    foreignKeys: [
      { column: 'application_id', referencesTable: 'applications', referencesColumn: 'id' },
      { column: 'verified_by', referencesTable: 'profiles', referencesColumn: 'id' },
    ],
  },
  {
    tableName: 'notifications',
    migrationFile: '002_core_schema.sql',
    requiredColumns: [
      { name: 'id', dataType: 'UUID', nullable: false },
      { name: 'user_id', dataType: 'UUID', nullable: false },
      { name: 'title', dataType: 'VARCHAR', nullable: false },
      { name: 'message', dataType: 'TEXT', nullable: false },
      { name: 'type', dataType: 'VARCHAR', nullable: true },
      { name: 'is_read', dataType: 'BOOLEAN', nullable: true },
      { name: 'created_at', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'updated_at', dataType: 'TIMESTAMPTZ', nullable: true },
    ],
    foreignKeys: [
      { column: 'user_id', referencesTable: 'profiles', referencesColumn: 'id' },
    ],
  },
  {
    tableName: 'user_notification_preferences',
    migrationFile: '003_supporting_tables.sql',
    requiredColumns: [
      { name: 'id', dataType: 'UUID', nullable: false },
      { name: 'user_id', dataType: 'UUID', nullable: false },
      { name: 'email_enabled', dataType: 'BOOLEAN', nullable: true },
      { name: 'push_enabled', dataType: 'BOOLEAN', nullable: true },
      { name: 'sms_enabled', dataType: 'BOOLEAN', nullable: true },
      { name: 'created_at', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'updated_at', dataType: 'TIMESTAMPTZ', nullable: true },
    ],
    foreignKeys: [
      { column: 'user_id', referencesTable: 'profiles', referencesColumn: 'id' },
    ],
  },
  {
    tableName: 'programs',
    migrationFile: '002_core_schema.sql',
    requiredColumns: [
      { name: 'id', dataType: 'UUID', nullable: false },
      { name: 'name', dataType: 'VARCHAR', nullable: false },
      { name: 'code', dataType: 'VARCHAR', nullable: false },
      { name: 'is_active', dataType: 'BOOLEAN', nullable: true },
      { name: 'created_at', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'updated_at', dataType: 'TIMESTAMPTZ', nullable: true },
    ],
    foreignKeys: [],
  },
  {
    tableName: 'intakes',
    migrationFile: '002_core_schema.sql',
    requiredColumns: [
      { name: 'id', dataType: 'UUID', nullable: false },
      { name: 'name', dataType: 'VARCHAR', nullable: false },
      { name: 'application_deadline', dataType: 'DATE', nullable: true },
      { name: 'is_active', dataType: 'BOOLEAN', nullable: true },
      { name: 'created_at', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'updated_at', dataType: 'TIMESTAMPTZ', nullable: true },
    ],
    foreignKeys: [],
  },
  {
    tableName: 'institutions',
    migrationFile: '002_core_schema.sql',
    requiredColumns: [
      { name: 'id', dataType: 'UUID', nullable: false },
      { name: 'name', dataType: 'VARCHAR', nullable: false },
      { name: 'code', dataType: 'VARCHAR', nullable: false },
      { name: 'is_active', dataType: 'BOOLEAN', nullable: true },
      { name: 'created_at', dataType: 'TIMESTAMPTZ', nullable: true },
      { name: 'updated_at', dataType: 'TIMESTAMPTZ', nullable: true },
    ],
    foreignKeys: [],
  },
  {
    tableName: 'audit_logs',
    migrationFile: '002_core_schema.sql',
    requiredColumns: [
      { name: 'id', dataType: 'UUID', nullable: false },
      { name: 'actor_id', dataType: 'UUID', nullable: true },
      { name: 'action', dataType: 'VARCHAR', nullable: false },
      { name: 'entity_type', dataType: 'VARCHAR', nullable: false },
      { name: 'entity_id', dataType: 'UUID', nullable: false },
      { name: 'changes', dataType: 'JSONB', nullable: true },
      { name: 'ip_address', dataType: 'INET', nullable: true },
      { name: 'created_at', dataType: 'TIMESTAMPTZ', nullable: true },
    ],
    foreignKeys: [
      { column: 'actor_id', referencesTable: 'profiles', referencesColumn: 'id' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers to parse migration SQL
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

function readMigrationFile(filename: string): string {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Extract the CREATE TABLE block for a given table name from SQL content.
 * Returns the full block from CREATE TABLE ... to the closing ");".
 */
function extractCreateTableBlock(sql: string, tableName: string): string | null {
  // Match CREATE TABLE IF NOT EXISTS <table> ( ... );
  const pattern = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${tableName}\\s*\\(([\\s\\S]*?)\\);`,
    'i',
  );
  const match = sql.match(pattern);
  return match ? match[0] : null;
}

/**
 * Check whether a column definition exists in a CREATE TABLE block.
 * Matches the column name followed by a data type keyword.
 */
function columnExistsInBlock(block: string, columnName: string, dataType: string): boolean {
  // Build a pattern: column_name <dataType-keyword>(optional size)
  // e.g. "email VARCHAR(255)" or "changes JSONB"
  const pattern = new RegExp(
    `\\b${columnName}\\b\\s+${dataType}`,
    'i',
  );
  return pattern.test(block);
}

/**
 * Check whether a NOT NULL constraint exists for a column in a CREATE TABLE block.
 * Returns true if the column line contains NOT NULL.
 */
function columnIsNotNull(block: string, columnName: string): boolean {
  // Find the line that defines this column
  const linePattern = new RegExp(`^\\s*${columnName}\\b.*$`, 'im');
  const lineMatch = block.match(linePattern);
  if (!lineMatch) return false;
  return /NOT\s+NULL/i.test(lineMatch[0]);
}

/**
 * Check whether a REFERENCES constraint exists for a column in a CREATE TABLE block.
 */
function foreignKeyExistsInBlock(
  block: string,
  column: string,
  referencesTable: string,
  referencesColumn: string,
): boolean {
  const pattern = new RegExp(
    `\\b${column}\\b[^,]*REFERENCES\\s+${referencesTable}\\s*\\(\\s*${referencesColumn}\\s*\\)`,
    'i',
  );
  return pattern.test(block);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Schema Verification — Core Entity Tables', () => {
  // Cache migration file contents
  const migrationCache: Record<string, string> = {};

  function getMigrationSql(filename: string): string {
    if (!migrationCache[filename]) {
      migrationCache[filename] = readMigrationFile(filename);
    }
    return migrationCache[filename];
  }

  it('should have all 9 Core_Entity migration files present', () => {
    const requiredFiles = ['002_core_schema.sql', '003_supporting_tables.sql'];
    for (const file of requiredFiles) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      expect(fs.existsSync(filePath), `Migration file ${file} should exist`).toBe(true);
    }
  });

  describe('Table existence in migration files', () => {
    for (const entity of CORE_ENTITIES) {
      it(`should define CREATE TABLE for "${entity.tableName}" in ${entity.migrationFile}`, () => {
        const sql = getMigrationSql(entity.migrationFile);
        const block = extractCreateTableBlock(sql, entity.tableName);
        expect(block, `CREATE TABLE block for ${entity.tableName} not found in ${entity.migrationFile}`).not.toBeNull();
      });
    }
  });

  describe('Required columns with correct data types', () => {
    for (const entity of CORE_ENTITIES) {
      describe(`${entity.tableName}`, () => {
        for (const col of entity.requiredColumns) {
          it(`should have column "${col.name}" with type ${col.dataType}`, () => {
            const sql = getMigrationSql(entity.migrationFile);
            const block = extractCreateTableBlock(sql, entity.tableName);
            expect(block).not.toBeNull();
            expect(
              columnExistsInBlock(block!, col.name, col.dataType),
              `Column ${col.name} (${col.dataType}) not found in ${entity.tableName}`,
            ).toBe(true);
          });
        }
      });
    }
  });

  describe('NOT NULL constraints on required columns', () => {
    for (const entity of CORE_ENTITIES) {
      const notNullCols = entity.requiredColumns.filter((c) => !c.nullable);
      if (notNullCols.length === 0) continue;

      describe(`${entity.tableName}`, () => {
        for (const col of notNullCols) {
          it(`should enforce NOT NULL on "${col.name}"`, () => {
            const sql = getMigrationSql(entity.migrationFile);
            const block = extractCreateTableBlock(sql, entity.tableName);
            expect(block).not.toBeNull();

            // PRIMARY KEY columns are implicitly NOT NULL — accept either
            const linePattern = new RegExp(`^\\s*${col.name}\\b.*$`, 'im');
            const lineMatch = block!.match(linePattern);
            expect(lineMatch, `Column ${col.name} line not found`).not.toBeNull();

            const line = lineMatch![0];
            const hasNotNull = /NOT\s+NULL/i.test(line);
            const hasPrimaryKey = /PRIMARY\s+KEY/i.test(line);
            expect(
              hasNotNull || hasPrimaryKey,
              `Column ${col.name} in ${entity.tableName} should be NOT NULL or PRIMARY KEY`,
            ).toBe(true);
          });
        }
      });
    }
  });

  describe('Foreign key constraints', () => {
    for (const entity of CORE_ENTITIES) {
      if (!entity.foreignKeys || entity.foreignKeys.length === 0) continue;

      describe(`${entity.tableName}`, () => {
        for (const fk of entity.foreignKeys!) {
          it(`should have FK "${fk.column}" -> ${fk.referencesTable}(${fk.referencesColumn})`, () => {
            const sql = getMigrationSql(entity.migrationFile);
            const block = extractCreateTableBlock(sql, entity.tableName);
            expect(block).not.toBeNull();
            expect(
              foreignKeyExistsInBlock(block!, fk.column, fk.referencesTable, fk.referencesColumn),
              `FK ${fk.column} -> ${fk.referencesTable}(${fk.referencesColumn}) not found in ${entity.tableName}`,
            ).toBe(true);
          });
        }
      });
    }
  });

  describe('Live schema alignment notes', () => {
    it('applications.program, .intake, .institution should be VARCHAR (not UUID FK)', () => {
      const sql = getMigrationSql('002_core_schema.sql');
      const block = extractCreateTableBlock(sql, 'applications');
      expect(block).not.toBeNull();

      // These columns store codes/names as VARCHAR, NOT UUID foreign keys
      expect(columnExistsInBlock(block!, 'program', 'VARCHAR')).toBe(true);
      expect(columnExistsInBlock(block!, 'intake', 'VARCHAR')).toBe(true);
      expect(columnExistsInBlock(block!, 'institution', 'VARCHAR')).toBe(true);
    });

    it('programs.code and institutions.code should have UNIQUE constraint', () => {
      const sql = getMigrationSql('002_core_schema.sql');

      const programsBlock = extractCreateTableBlock(sql, 'programs');
      expect(programsBlock).not.toBeNull();
      expect(/code\s+VARCHAR[^,]*UNIQUE/i.test(programsBlock!)).toBe(true);

      const institutionsBlock = extractCreateTableBlock(sql, 'institutions');
      expect(institutionsBlock).not.toBeNull();
      expect(/code\s+VARCHAR[^,]*UNIQUE/i.test(institutionsBlock!)).toBe(true);
    });

    it('user_notification_preferences.user_id should have UNIQUE constraint', () => {
      const sql = getMigrationSql('003_supporting_tables.sql');
      const block = extractCreateTableBlock(sql, 'user_notification_preferences');
      expect(block).not.toBeNull();
      expect(/user_id\s+UUID[^,]*UNIQUE/i.test(block!)).toBe(true);
    });
  });
});
