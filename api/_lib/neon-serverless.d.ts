/**
 * Type declarations for @neondatabase/serverless
 * This module is dynamically imported when DATABASE_URL points to Neon
 */
declare module '@neondatabase/serverless' {
  export interface NeonQueryFunction {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  }

  export function neon(connectionString: string): NeonQueryFunction;
}
