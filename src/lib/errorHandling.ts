// Comprehensive Error Handling and Recovery System
import { supabase } from './supabase'

export interface DatabaseError {
  code: string
  message: string
  details?: any
  timestamp: Date
  userId?: string
  operation: string
}

export class ErrorLogger {
  static async logError(error: DatabaseError): Promise<void> {
    try {
      await supabase.from('error_logs').insert({
        error_code: error.code,
        error_message: error.message,
        error_details: error.details,
        user_id: error.userId,
        operation: error.operation
      })
    } catch (e) {
      console.error('Error logging failed:', e)
    }
  }
}

export class TransactionManager {
  static async executeWithRollback<T>(
    operation: () => Promise<T>,
    rollbackOperation?: () => Promise<void>
  ): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (rollbackOperation) {
        try {
          await rollbackOperation()
        } catch (rollbackError) {
          console.error('Rollback failed:', rollbackError)
        }
      }
      throw error
    }
  }
}

export async function handleDatabaseError(error: any, operation: string, data?: any): Promise<never> {
  await ErrorLogger.logError({
    code: error.code || 'UNKNOWN_ERROR',
    message: error.message || 'An unknown error occurred',
    details: error.details || error,
    timestamp: new Date(),
    userId: data?.user_id,
    operation
  })

  throw new Error(error.message || 'Database operation failed')
}

export async function safeDbOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  data?: any
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    await handleDatabaseError(error, operationName, data)
    throw error
  }
}