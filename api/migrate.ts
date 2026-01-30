/**
 * Database Migration API
 * 
 * Runs migrations to add required columns for Bun-native auth.
 * Should be called once after deployment.
 * 
 * POST /api/migrate
 * Body: { secret: string } // Must match MIGRATE_SECRET env var
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "./_lib/db";
import { handleCors } from "./_lib/cors";
import { sendSuccess, sendError, HttpStatus } from "./_lib/errorHandler";

// Migration secret from environment
const MIGRATE_SECRET = process.env.MIGRATE_SECRET;

/**
 * Main handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse | void> {
  // Handle CORS
  if (handleCors(req, res)) return;

  // Only allow POST
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    // Verify secret
    const { secret } = req.body || {};
    if (!MIGRATE_SECRET || secret !== MIGRATE_SECRET) {
      return sendError(res, "Unauthorized", HttpStatus.UNAUTHORIZED);
    }

    const migrations: string[] = [];
    const errors: string[] = [];

    // Migration 1: Add password_hash column
    try {
      await query({
        text: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT`,
      });
      migrations.push("Added password_hash column");
    } catch (e) {
      errors.push(`password_hash: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Migration 2: Add refresh_token_hash column
    try {
      await query({
        text: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT`,
      });
      migrations.push("Added refresh_token_hash column");
    } catch (e) {
      errors.push(`refresh_token_hash: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Migration 3: Add role column
    try {
      await query({
        text: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student'`,
      });
      migrations.push("Added role column");
    } catch (e) {
      errors.push(`role: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Migration 4: Create indexes
    try {
      await query({
        text: `CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email)`,
      });
      migrations.push("Created idx_profiles_email index");
    } catch (e) {
      errors.push(`idx_profiles_email: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      await query({
        text: `CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role)`,
      });
      migrations.push("Created idx_profiles_role index");
    } catch (e) {
      errors.push(`idx_profiles_role: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Return results
    return sendSuccess(res, {
      migrations,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length > 0 
        ? "Some migrations failed" 
        : "All migrations completed successfully",
    });

  } catch (error) {
    console.error("[migrate] Error:", error);
    return sendError(res, "Migration failed", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
