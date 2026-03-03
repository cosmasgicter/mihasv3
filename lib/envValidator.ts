/**
 * Environment Variable Validator
 *
 * Validates required server environment variables at cold-start before any
 * handler logic runs. Returns a descriptive error naming every missing or
 * invalid variable so misconfigured deployments fail fast.
 *
 * Validates: Requirements 25.1, 25.2, 25.3, 25.4
 */

/** Minimum length for JWT secrets */
const MIN_JWT_SECRET_LENGTH = 32;

/** Valid DATABASE_URL prefixes */
const VALID_DB_PREFIXES = ['postgres://', 'postgresql://'] as const;

/** Required server environment variables */
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ARCJET_KEY',
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

export interface EnvValidationError {
  variable: string;
  message: string;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: EnvValidationError[];
}

/**
 * Check whether a DATABASE_URL value starts with a valid PostgreSQL prefix.
 */
export function validateDatabaseUrl(url: string): boolean {
  return VALID_DB_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Check whether a JWT secret meets the minimum length requirement.
 */
export function validateJwtSecret(secret: string): boolean {
  return secret.length >= MIN_JWT_SECRET_LENGTH;
}

/**
 * Validate all required server environment variables.
 *
 * Returns a result object with `valid: true` when everything is fine, or
 * `valid: false` with a list of descriptive errors.
 */
export function validateServerEnv(): EnvValidationResult {
  const errors: EnvValidationError[] = [];

  for (const name of REQUIRED_ENV_VARS) {
    const value = process.env[name];

    if (!value || value.trim().length === 0) {
      errors.push({ variable: name, message: `${name} is missing or empty` });
      continue; // skip format checks when value is absent
    }

    // Format-specific checks
    if (name === 'DATABASE_URL' && !validateDatabaseUrl(value)) {
      errors.push({
        variable: name,
        message: `DATABASE_URL must start with postgres:// or postgresql://`,
      });
    }

    if (
      (name === 'JWT_SECRET' || name === 'JWT_REFRESH_SECRET') &&
      !validateJwtSecret(value)
    ) {
      errors.push({
        variable: name,
        message: `${name} must be at least ${MIN_JWT_SECRET_LENGTH} characters long`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Run validation and throw if any variable is invalid.
 * Intended for use at the top of serverless handlers.
 */
export function requireValidEnv(): void {
  const result = validateServerEnv();
  if (!result.valid) {
    const details = result.errors.map((e) => e.message).join('; ');
    throw new Error(`Environment validation failed: ${details}`);
  }
}
