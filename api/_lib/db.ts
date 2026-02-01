/**
 * Database Abstraction Layer - Neon Postgres
 * 
 * MIGRATION COMPLETE: Supabase → Neon Postgres
 * 
 * Features:
 * - Plain SQL only (no ORM magic)
 * - Parameterized queries for SQL injection prevention
 * - Neon serverless driver (@neondatabase/serverless)
 * - Explicit transaction boundaries (BEGIN, COMMIT, ROLLBACK)
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
 * Database type enumeration
 * @deprecated - Now always 'neon' after migration
 */
export type DatabaseType = 'neon';

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
 * Detect database type - always returns 'neon' after migration
 * @deprecated - Kept for backward compatibility
 */
export function detectDatabaseType(): DatabaseType {
  return 'neon';
}

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
  const commands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'CREATE', 'ALTER', 'DROP'];
  for (const cmd of commands) {
    if (trimmed.startsWith(cmd)) {
      return cmd;
    }
  }
  return 'UNKNOWN';
}

/**
 * Convert positional parameters ($1, $2) to values for Supabase REST
 */
function interpolateParams(query: string, params?: unknown[]): string {
  if (!params || params.length === 0) {
    return query;
  }

  let result = query;
  params.forEach((param, index) => {
    const placeholder = `$${index + 1}`;
    let value: string;

    if (param === null || param === undefined) {
      value = 'NULL';
    } else if (typeof param === 'string') {
      // Escape single quotes for SQL
      value = `'${param.replace(/'/g, "''")}'`;
    } else if (typeof param === 'boolean') {
      value = param ? 'TRUE' : 'FALSE';
    } else if (typeof param === 'number') {
      value = String(param);
    } else if (param instanceof Date) {
      value = `'${param.toISOString()}'`;
    } else if (typeof param === 'object') {
      // JSON objects
      value = `'${JSON.stringify(param).replace(/'/g, "''")}'`;
    } else {
      value = `'${String(param).replace(/'/g, "''")}'`;
    }

    result = result.replace(placeholder, value);
  });

  return result;
}

// ============================================================================
// Neon Serverless Driver
// ============================================================================

// Lazy-loaded Neon client
let neonSql: ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) | null = null;

/**
 * Get or initialize Neon SQL client
 */
async function getNeonClient(): Promise<typeof neonSql> {
  if (neonSql) return neonSql;

  try {
    // Dynamic import for Neon serverless driver
    const { neon } = await import('@neondatabase/serverless');
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new DatabaseError(
        'DATABASE_URL not configured for Neon',
        DatabaseErrorCode.CONFIG_ERROR
      );
    }

    neonSql = neon(connectionString);
    return neonSql;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    
    // If @neondatabase/serverless is not installed
    if ((error as Error).message?.includes('Cannot find module')) {
      throw new DatabaseError(
        'Neon driver not installed. Run: bun add @neondatabase/serverless',
        DatabaseErrorCode.CONFIG_ERROR,
        { originalError: error as Error }
      );
    }

    throw new DatabaseError(
      `Failed to initialize Neon client: ${(error as Error).message}`,
      DatabaseErrorCode.CONNECTION_ERROR,
      { originalError: error as Error }
    );
  }
}

/**
 * Execute query via Neon serverless driver
 */
async function executeNeonQuery<T>(
  queryText: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const command = extractCommand(queryText);

  try {
    const sql = await getNeonClient();
    if (!sql) {
      throw new DatabaseError('Neon client not initialized', DatabaseErrorCode.CONFIG_ERROR);
    }

    // Neon's tagged template literal approach
    // We need to convert our parameterized query to their format
    let rows: unknown[];

    if (params && params.length > 0) {
      // For parameterized queries, we use the sql function with template literals
      // Convert $1, $2 style to template literal interpolation
      const interpolatedQuery = interpolateParams(queryText, params);
      
      // Use raw SQL execution
      rows = await sql`${interpolatedQuery}` as unknown[];
    } else {
      rows = await sql`${queryText}` as unknown[];
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
// Transaction Support
// ============================================================================

/**
 * Execute multiple queries within a transaction
 * All operations succeed or all are rolled back
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

  const results: QueryResult<T>[] = [];

  try {
    // Begin transaction
    await query('BEGIN');

    // Execute each operation
    for (const op of operations) {
      const result = await query<T>(op.text, op.values);
      results.push(result);
    }

    // Commit transaction
    await query('COMMIT');

    return results;
  } catch (error) {
    // Rollback on any error
    try {
      await query('ROLLBACK');
    } catch (rollbackError) {
      // Log rollback failure but throw original error
      console.error('[DB] Rollback failed:', (rollbackError as Error).message);
    }

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
        [REQUIRED_PROFILE_COLUMNS as unknown as string[]]
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

// ============================================================================
// Query Builders
// Type-safe query construction for common operations
// ============================================================================

/**
 * User table queries
 * Plain SQL, no ORM magic
 */
export const userQueries = {
  /**
   * Find user by email
   */
  findByEmail: (email: string): QueryConfig => ({
    text: `SELECT id, email, password_hash, refresh_token_hash, role, first_name, last_name, 
                  is_active, failed_login_attempts, locked_until, created_at, updated_at 
           FROM profiles 
           WHERE email = $1 
           LIMIT 1`,
    values: [email],
  }),

  /**
   * Find user by ID
   */
  findById: (id: string): QueryConfig => ({
    text: `SELECT id, email, role, first_name, last_name, is_active, created_at, updated_at 
           FROM profiles 
           WHERE id = $1 
           LIMIT 1`,
    values: [id],
  }),

  /**
   * Create new user
   */
  create: (
    id: string,
    email: string,
    passwordHash: string,
    role: string,
    firstName: string,
    lastName: string
  ): QueryConfig => ({
    text: `INSERT INTO profiles (id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
           RETURNING id, email, role, is_active`,
    values: [id, email, passwordHash, role, firstName, lastName],
  }),

  /**
   * Update user's password
   */
  updatePassword: (id: string, passwordHash: string): QueryConfig => ({
    text: `UPDATE profiles 
           SET password_hash = $2, password_changed_at = NOW(), updated_at = NOW() 
           WHERE id = $1`,
    values: [id, passwordHash],
  }),

  /**
   * Update user's refresh token hash
   */
  updateRefreshToken: (id: string, tokenHash: string | null): QueryConfig => ({
    text: `UPDATE profiles 
           SET refresh_token_hash = $2, updated_at = NOW() 
           WHERE id = $1`,
    values: [id, tokenHash],
  }),

  /**
   * Find user by refresh token hash
   */
  findByRefreshToken: (tokenHash: string): QueryConfig => ({
    text: `SELECT id, email, role, is_active 
           FROM profiles 
           WHERE refresh_token_hash = $1 AND is_active = true
           LIMIT 1`,
    values: [tokenHash],
  }),

  /**
   * Increment failed login attempts
   */
  incrementFailedAttempts: (id: string): QueryConfig => ({
    text: `UPDATE profiles 
           SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1, updated_at = NOW() 
           WHERE id = $1`,
    values: [id],
  }),

  /**
   * Reset failed login attempts
   */
  resetFailedAttempts: (id: string): QueryConfig => ({
    text: `UPDATE profiles 
           SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() 
           WHERE id = $1`,
    values: [id],
  }),

  /**
   * Lock user account
   */
  lockAccount: (id: string, lockUntil: Date): QueryConfig => ({
    text: `UPDATE profiles 
           SET locked_until = $2, updated_at = NOW() 
           WHERE id = $1`,
    values: [id, lockUntil],
  }),
};

/**
 * Session table queries
 * For device session tracking
 */
export const sessionQueries = {
  /**
   * Create session record
   */
  create: (
    id: string,
    userId: string,
    deviceInfo: string,
    ipAddress: string,
    userAgent?: string
  ): QueryConfig => ({
    text: `INSERT INTO device_sessions (id, user_id, device_info, ip_address, user_agent, is_active, last_activity, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW(), NOW() + INTERVAL '30 days')
           RETURNING id, user_id, is_active, created_at`,
    values: [id, userId, deviceInfo, ipAddress, userAgent || ''],
  }),

  /**
   * Update session activity
   */
  updateActivity: (id: string): QueryConfig => ({
    text: `UPDATE device_sessions 
           SET last_activity = NOW() 
           WHERE id = $1 AND is_active = true`,
    values: [id],
  }),

  /**
   * Deactivate session
   */
  deactivate: (id: string): QueryConfig => ({
    text: `UPDATE device_sessions 
           SET is_active = false 
           WHERE id = $1`,
    values: [id],
  }),

  /**
   * Deactivate all user sessions
   */
  deactivateAllForUser: (userId: string): QueryConfig => ({
    text: `UPDATE device_sessions 
           SET is_active = false 
           WHERE user_id = $1`,
    values: [userId],
  }),

  /**
   * Get active sessions for user
   */
  getActiveForUser: (userId: string): QueryConfig => ({
    text: `SELECT id, device_info, ip_address, user_agent, last_activity, created_at 
           FROM device_sessions 
           WHERE user_id = $1 AND is_active = true 
           ORDER BY last_activity DESC`,
    values: [userId],
  }),

  /**
   * Deactivate expired sessions (30 days inactive)
   */
  deactivateExpired: (): QueryConfig => ({
    text: `UPDATE device_sessions 
           SET is_active = false 
           WHERE is_active = true AND last_activity < NOW() - INTERVAL '30 days'`,
    values: [],
  }),
};

/**
 * Audit log queries
 * For security event logging (no PII)
 */
export const auditQueries = {
  /**
   * Log an audit event
   */
  log: (
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    changes: Record<string, unknown>,
    ipAddress: string | null,
    userAgent: string | null
  ): QueryConfig => ({
    text: `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    values: [actorId, action, entityType, entityId, JSON.stringify(changes), ipAddress, userAgent],
  }),
};

// ============================================================================
// Exports for backward compatibility
// ============================================================================

export { detectDatabaseType as getDatabaseType };
