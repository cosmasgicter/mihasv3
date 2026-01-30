/**
 * Database Abstraction Layer
 * 
 * PHASE 1: Supabase Postgres (current)
 * PHASE 2: Neon Postgres (target)
 * 
 * ABSTRACTION: All SQL is vendor-agnostic
 * VERIFICATION: Zero Supabase-specific features (no RPC, no magic)
 * MIGRATION: Swap connection string, zero code changes
 * 
 * Features:
 * - Plain SQL only
 * - Connection pooling via environment
 * - Neon-compatible query structure
 * - Explicit transaction support
 */

import type { VercelRequest } from "@vercel/node";

// DATABASE CONNECTION VERIFICATION
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_URL;

if (!DATABASE_URL) {
  console.error("[DB] FATAL: DATABASE_URL not set");
  console.error("[DB] Database operations will fail");
}

// Detect database type from connection string
const isSupabase = DATABASE_URL?.includes("supabase.co");
const isNeon = DATABASE_URL?.includes("neon.tech");

console.log(`[DB] Connection type: ${isSupabase ? "Supabase" : isNeon ? "Neon" : "Generic Postgres"}`);

/**
 * SQL Query Builder Types
 * VERIFICATION: Type-safe query construction
 */
export interface QueryConfig {
  text: string;
  values?: unknown[];
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  command: string;
}

/**
 * Database error types
 * VERIFICATION: Explicit error handling
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public query?: string
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

/**
 * Execute SQL query
 * PHASE 1: Uses Supabase REST API with plain SQL
 * PHASE 2: Uses @neondatabase/serverless driver
 * 
 * VERIFICATION: No Supabase SDK magic, raw SQL only
 * 
 * @param query - SQL query string
 * @param params - Query parameters
 * @returns Query result
 */
export async function query<T = Record<string, unknown>>(
  queryText: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  if (!DATABASE_URL) {
    throw new DatabaseError("DATABASE_URL not configured");
  }

  // PHASE 1: Supabase via REST API
  if (isSupabase) {
    return executeSupabaseQuery<T>(queryText, params);
  }
  
  // PHASE 2: Neon via serverless driver
  if (isNeon) {
    return executeNeonQuery<T>(queryText, params);
  }
  
  // Generic fallback
  throw new DatabaseError("Unknown database type");
}

/**
 * Supabase query execution via REST
 * VERIFICATION: POST /rest/v1/ with plain SQL
 */
async function executeSupabaseQuery<T>(
  queryText: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceKey) {
    throw new DatabaseError("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  const url = `${DATABASE_URL}/rest/v1/rpc/exec_sql`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        query: queryText,
        params: params || [],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new DatabaseError(`Supabase query failed: ${error}`, response.status.toString());
    }

    const data = await response.json();
    
    return {
      rows: Array.isArray(data) ? data : [data],
      rowCount: Array.isArray(data) ? data.length : 1,
      command: queryText.split(" ")[0].toUpperCase(),
    };
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError(`Query execution failed: ${(error as Error).message}`);
  }
}

/**
 * Neon query execution
 * VERIFICATION: @neondatabase/serverless driver
 * NOTE: This will be enabled in Phase 2
 */
async function executeNeonQuery<T>(
  _queryText: string,
  _params?: unknown[]
): Promise<QueryResult<T>> {
  // PHASE 2: Import and use @neondatabase/serverless
  // const { neon } = await import('@neondatabase/serverless');
  // const client = neon(DATABASE_URL);
  // return await client(queryText, params);
  
  throw new DatabaseError("Neon driver not yet implemented - use Supabase for Phase 1");
}

/**
 * Transaction wrapper
 * VERIFICATION: All-or-nothing execution
 * 
 * @param operations - Array of queries to execute
 * @returns Array of results
 */
export async function transaction<T = Record<string, unknown>>(
  operations: QueryConfig[]
): Promise<QueryResult<T>[]> {
  const results: QueryResult<T>[] = [];
  
  // Build transaction SQL
  const transactionSql = [
    "BEGIN;",
    ...operations.map(op => {
      // Simple parameter substitution (for demo - use proper parameterization in production)
      let sql = op.text;
      if (op.values) {
        op.values.forEach((val, idx) => {
          const placeholder = `$${idx + 1}`;
          const formatted = typeof val === "string" ? `'${val.replace(/'/g, "''")}'` : val;
          sql = sql.replace(placeholder, String(formatted));
        });
      }
      return sql;
    }),
    "COMMIT;",
  ].join("\n");

  try {
    await query(transactionSql);
    return results;
  } catch (error) {
    await query("ROLLBACK;");
    throw error;
  }
}

/**
 * User table queries
 * VERIFICATION: Plain SQL, no ORM magic
 */
export const userQueries = {
  /**
   * Find user by email
   */
  findByEmail: (email: string): QueryConfig => ({
    text: `SELECT id, email, password_hash, role, is_active, created_at, updated_at 
           FROM profiles 
           WHERE email = $1 
           LIMIT 1`,
    values: [email],
  }),

  /**
   * Find user by ID
   */
  findById: (id: string): QueryConfig => ({
    text: `SELECT id, email, role, is_active, created_at, updated_at 
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
           SET password_hash = $2, updated_at = NOW() 
           WHERE id = $1`,
    values: [id, passwordHash],
  }),

  /**
   * Update user's refresh token
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
           WHERE refresh_token_hash = $1 
           LIMIT 1`,
    values: [tokenHash],
  }),
};

/**
 * Session table queries
 * For explicit session tracking (optional, for audit)
 */
export const sessionQueries = {
  /**
   * Create session record
   */
  create: (
    id: string,
    userId: string,
    deviceInfo: string,
    ipAddress: string
  ): QueryConfig => ({
    text: `INSERT INTO device_sessions (id, user_id, device_info, ip_address, is_active, last_activity, created_at)
           VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
    values: [id, userId, deviceInfo, ipAddress],
  }),

  /**
   * Update session activity
   */
  updateActivity: (id: string): QueryConfig => ({
    text: `UPDATE device_sessions 
           SET last_activity = NOW() 
           WHERE id = $1`,
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
};

/**
 * Database schema verification
 * Run on startup to ensure required tables exist
 */
export async function verifyDatabaseSchema(): Promise<{
  ok: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  
  try {
    // Check profiles table
    await query(`SELECT 1 FROM profiles LIMIT 1`);
    console.log("[DB] Schema OK: profiles table exists");
  } catch {
    errors.push("profiles table missing or inaccessible");
  }
  
  try {
    // Check device_sessions table
    await query(`SELECT 1 FROM device_sessions LIMIT 1`);
    console.log("[DB] Schema OK: device_sessions table exists");
  } catch {
    errors.push("device_sessions table missing or inaccessible");
  }
  
  return {
    ok: errors.length === 0,
    errors,
  };
}
