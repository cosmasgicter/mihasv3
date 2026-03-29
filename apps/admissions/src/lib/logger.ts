/**
 * Structured Logger
 * 
 * Canonical logger for the application. Provides structured log entries
 * with timestamps and level fields.
 * 
 * - Development: logs debug, info, warn, error
 * - Production: logs warn and error only (errors always logged)
 * 
 * Consolidated from: src/lib/logger.ts, src/utils/logger.ts
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
}

class Logger {
  private isDevelopment = typeof import.meta !== 'undefined'
    ? (import.meta.env?.DEV || import.meta.env?.MODE === 'development')
    : process.env.NODE_ENV !== 'production';

  private createEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
    return {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry = this.createEntry(level, message, data);

    // Always log errors; log warn in production; others only in dev
    if (this.isDevelopment || level === 'error' || level === 'warn') {
      const method = level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log';
      console[method](`[${level.toUpperCase()}] ${message}`, data ?? '');
    }

    // Production error monitoring hook (placeholder)
    if (!this.isDevelopment && level === 'error') {
      this.sendToMonitoring(entry);
    }
  }

  private sendToMonitoring(_entry: LogEntry): void {
    // monitoring service removed — placeholder for future integration
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }
}

export const logger = new Logger();
