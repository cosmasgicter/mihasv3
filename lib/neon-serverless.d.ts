/**
 * Type declarations for @neondatabase/serverless
 * This module is dynamically imported when DATABASE_URL points to Neon
 */
declare module '@neondatabase/serverless' {
  export interface NeonQueryFunction {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
    /** Execute a parameterized query with $1, $2 placeholders */
    query: (queryText: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
    /** Execute multiple queries in a single atomic transaction */
    transaction: <T = Record<string, unknown>[]>(
      queriesOrFn: Record<string, unknown>[][] | ((txn: NeonQueryFunction) => Record<string, unknown>[][]),
      options?: {
        isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
        readOnly?: boolean;
        deferrable?: boolean;
        arrayMode?: boolean;
        fullResults?: boolean;
      }
    ) => Promise<T>;
  }

  export function neon(connectionString: string): NeonQueryFunction;
}
