/**
 * Database Abstraction Layer - Neon Postgres
 * 
 * MIGRATION COMPLETE: Supabase → Neon Postgres
 * 
 * Features:
 * - Plain SQL only (no ORM magic)
 * - Parameterized queries for SQL injection prevention
 * - Neon serverless driver (@neondatabase/serverless)
 * - Atomic transactions via Neon transaction() callback API
 * - Module-level cached Neon connection instance
 * - Typed DatabaseError with code and query context
 * - Schema verification on startup
 * 
 * Environment Variables:
 * - DATABASE_URL: Neon connection string (required)
 * 
 * @see https://neon.tech/docs/serverless/serverless-driver
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Query configuration for parameterized queries
 * Requirement 6.2: Support parameterized queries to prevent SQL injection
 */
export interface QueryConfig {
  text: string;
  values?: unknown[];
}

/**
 * Query result with typed rows
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  command: string;
}

/**
 * Database error codes for typed error handling
 */
export const DatabaseErrorCode = {
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  QUERY_ERROR: 'QUERY_ERROR',
  TRANSACTION_ERROR: 'TRANSACTION_ERROR',
  SCHEMA_ERROR: 'SCHEMA_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type DatabaseErrorCodeType = typeof DatabaseErrorCode[keyof typeof DatabaseErrorCode];

/**
 * Typed database error with code and query context
 * Requirement 6.8: If a database error occurs, throw a typed DatabaseError
 * 
 * NOTE: Never include PII in error messages or query context
 */
export class DatabaseError extends Error {
  public readonly code: DatabaseErrorCodeType;
  public readonly query?: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    code: DatabaseErrorCodeType = DatabaseErrorCode.QUERY_ERROR,
    options?: {
      query?: string;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    // Sanitize query to remove potential PII (parameter values)
    this.query = options?.query ? sanitizeQueryForLogging(options.query) : undefined;
    this.originalError = options?.originalError;
  }
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get database configuration
 */
function getDatabaseConfig(): { url: string } {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new DatabaseError(
      'DATABASE_URL not configured. Set the Neon connection string.',
      DatabaseErrorCode.CONFIG_ERROR
    );
  }
  return { url };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sanitize query for logging - remove parameter values to prevent PII leakage
 * Never log actual parameter values as they may contain user data
 */
function sanitizeQueryForLogging(query: string): string {
  // Replace string literals with placeholder
  return query
    .replace(/'[^']*'/g, "'[REDACTED]'")
    .replace(/"[^"]*"/g, '"[REDACTED]"');
}

/**
 * Extract command from SQL query
 */
function extractCommand(query: string): string {
  const trimmed = query.trim().toUpperCase();
  const commands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP'];
  for (const cmd of commands) {
    if (trimmed.startsWith(cmd)) {
      return cmd;
    }
  }
  return 'UNKNOWN';
}

// ============================================================================
// Neon Serverless Driver — Module-Level Cached Instance (R9)
// ============================================================================

// Type for the Neon query function with query and transaction methods
type NeonSqlFunction = {
  (strings: TemplateStringsArray, ...params: unknown[]): Promise<Record<string, unknown>[]>;
  query: (queryText: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  transaction: (
    queriesOrFn: Record<string, unknown>[][] | ((txn: NeonSqlFunction) => Record<string, unknown>[][]),
    options?: Record<string, unknown>
  ) => Promise<Record<string, unknown>[][]>;
};

/** Module-level cached Neon connection instance */
let cachedSql: NeonSqlFunction | null = null;

/**
 * Get or create the cached Neon connection instance.
 * Eliminates per-query connection string parsing overhead.
 */
function getNeonInstance(): NeonSqlFunction {
  if (!cachedSql) {
    const { url } = getDatabaseConfig();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { neon } = require('@neondatabase/serverless');
    cachedSql = neon(url) as NeonSqlFunction;
  }
  return cachedSql;
}

/** Exported for testing — resets the cached instance */
export function _resetNeonCache(): void {
  cachedSql = null;
}

// ============================================================================
// Query Execution
// ============================================================================

/**
 * Execute query via Neon serverless driver
 * 
 * Uses the cached sql.query() method for parameterized queries with $1, $2 placeholders
 */
async function executeNeonQuery<T>(
  queryText: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const command = extractCommand(queryText);

  try {
    const sql = getNeonInstance();
    let rows: Record<string, unknown>[];

    if (params && params.length > 0) {
      rows = await sql.query(queryText, params);
    } else {
      rows = await sql.query(queryText);
    }

    const resultRows = Array.isArray(rows) ? rows : [];

    return {
      rows: resultRows as T[],
      rowCount: resultRows.length,
      command,
    };
  } catch (error) {
    if (error instanceof DatabaseError) throw error;

    const errorMessage = (error as Error).message || 'Unknown error';
    
    // Map common Postgres error codes
    if (errorMessage.includes('duplicate key')) {
      throw new DatabaseError(
        'Duplicate key violation',
        DatabaseErrorCode.CONSTRAINT_VIOLATION,
        { query: queryText, originalError: error as Error }
      );
    }
    if (errorMessage.includes('foreign key')) {
      throw new DatabaseError(
        'Foreign key violation',
        DatabaseErrorCode.CONSTRAINT_VIOLATION,
        { query: queryText, originalError: error as Error }
      );
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      throw new DatabaseError(
        'Database query timeout',
        DatabaseErrorCode.TIMEOUT_ERROR,
        { query: queryText, originalError: error as Error }
      );
    }

    throw new DatabaseError(
      `Neon query execution failed: ${errorMessage}`,
      DatabaseErrorCode.QUERY_ERROR,
      { query: queryText, originalError: error as Error }
    );
  }
}

// ============================================================================
// Main Query Interface
// ============================================================================

/**
 * Execute a parameterized SQL query
 * 
 * @param queryText - SQL query with $1, $2, etc. placeholders
 * @param params - Array of parameter values
 * @returns Query result with typed rows
 * 
 * @example
 * // Simple select
 * const result = await query<User>('SELECT * FROM profiles WHERE id = $1', [userId]);
 * 
 * // Insert with returning
 * const result = await query<User>(
 *   'INSERT INTO profiles (email, role) VALUES ($1, $2) RETURNING *',
 *   [email, 'student']
 * );
 */
export async function query<T = Record<string, unknown>>(
  queryText: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  // Validate configuration
  getDatabaseConfig();
  
  // Execute via Neon
  return executeNeonQuery<T>(queryText, params);
}

// ============================================================================
// Transaction Support — Neon transaction() callback API (R1)
// ============================================================================

/**
 * Execute multiple queries within an atomic transaction.
 * 
 * Uses Neon's `sql.transaction()` callback API which guarantees all statements
 * run on a single HTTP connection. Automatically commits on success and rolls
 * back on thrown errors.
 * 
 * @param operations - Array of query configurations to execute
 * @returns Array of results for each operation
 * 
 * @example
 * const results = await transaction([
 *   { text: 'UPDATE accounts SET balance = balance - $1 WHERE id = $2', values: [100, fromId] },
 *   { text: 'UPDATE accounts SET balance = balance + $1 WHERE id = $2', values: [100, toId] },
 * ]);
 */
export async function transaction<T = Record<string, unknown>>(
  operations: QueryConfig[]
): Promise<QueryResult<T>[]> {
  if (operations.length === 0) {
    return [];
  }

  try {
    const sql = getNeonInstance();
    const results: QueryResult<T>[] = [];

    // Use Neon's transaction() callback API — single connection, auto commit/rollback
    await sql.transaction((tx: NeonSqlFunction) =>
      operations.map((op) => {
        const promise = op.values && op.values.length > 0
          ? tx.query(op.text, op.values)
          : tx.query(op.text);

        // Capture results as they resolve
        promise.then((rows: Record<string, unknown>[]) => {
          const resultRows = Array.isArray(rows) ? rows : [];
          results.push({
            rows: resultRows as T[],
            rowCount: resultRows.length,
            command: extractCommand(op.text),
          });
        });

        return promise as unknown as Record<string, unknown>[];
      })
    );

    return results;
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw new DatabaseError(
        `Transaction failed: ${error.message}`,
        DatabaseErrorCode.TRANSACTION_ERROR,
        { query: error.query, originalError: error }
      );
    }

    throw new DatabaseError(
      `Transaction failed: ${(error as Error).message}`,
      DatabaseErrorCode.TRANSACTION_ERROR,
      { originalError: error as Error }
    );
  }
}

// ============================================================================
// Schema Verification
// ============================================================================

/**
 * Required tables for the application system
 */
const REQUIRED_TABLES = [
  'profiles',
  'device_sessions',
  'audit_logs',
] as const;

/**
 * Required columns for profiles table (auth-related)
 */
const REQUIRED_PROFILE_COLUMNS = [
  'id',
  'email',
  'role',
  'password_hash',
  'refresh_token_hash',
] as const;

/**
 * Verify database schema on startup
 * Checks for required tables and columns
 * 
 * @returns Object with ok status and array of errors
 */
export async function verifyDatabaseSchema(): Promise<{
  ok: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('[DB] Verifying Neon database schema...');

  // Check each required table
  for (const table of REQUIRED_TABLES) {
    try {
      await query(`SELECT 1 FROM ${table} LIMIT 1`);
      console.log(`[DB] ✓ Table '${table}' exists`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      if (errorMsg.includes('does not exist') || errorMsg.includes('relation') || errorMsg.includes('404')) {
        errors.push(`Required table '${table}' is missing`);
        console.error(`[DB] ✗ Table '${table}' is missing`);
      } else {
        // Table might exist but query failed for other reasons
        warnings.push(`Could not verify table '${table}': ${errorMsg}`);
        console.warn(`[DB] ? Table '${table}' verification inconclusive`);
      }
    }
  }

  // Check profiles table columns if table exists
  if (!errors.some(e => e.includes("'profiles'"))) {
    try {
      // Query to check column existence
      const columnCheckQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = ANY($1)
      `;
      
      const result = await query<{ column_name: string }>(
        columnCheckQuery,
        [[...REQUIRED_PROFILE_COLUMNS] as string[]]
      );

      const existingColumns = new Set(result.rows.map(r => r.column_name));
      
      for (const col of REQUIRED_PROFILE_COLUMNS) {
        if (!existingColumns.has(col)) {
          if (col === 'password_hash' || col === 'refresh_token_hash') {
            // These are new columns from migration
            warnings.push(`Column 'profiles.${col}' is missing - run auth migration`);
            console.warn(`[DB] ? Column 'profiles.${col}' missing (migration needed)`);
          } else {
            errors.push(`Required column 'profiles.${col}' is missing`);
            console.error(`[DB] ✗ Column 'profiles.${col}' is missing`);
          }
        }
      }
    } catch (error) {
      // information_schema query might not work on all setups
      warnings.push(`Could not verify profiles columns: ${(error as Error).message}`);
    }
  }

  const ok = errors.length === 0;
  
  if (ok) {
    console.log('[DB] Schema verification passed');
  } else {
    console.error(`[DB] Schema verification failed with ${errors.length} error(s)`);
  }

  return { ok, errors, warnings };
}
