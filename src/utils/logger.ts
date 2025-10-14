type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  data?: any
  timestamp: string
}

class Logger {
  private isDevelopment = import.meta.env.DEV

  private log(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString()
    }

    // Only log in development or for errors/warnings
    if (this.isDevelopment || level === 'error' || level === 'warn') {
      const method = level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'
      console[method](`[${level.toUpperCase()}] ${message}`, data || '')
    }

    // In production, send errors to monitoring service
    if (!this.isDevelopment && level === 'error') {
      this.sendToMonitoring(entry)
    }
  }

  private sendToMonitoring(entry: LogEntry) {
    // Send to external monitoring service (Sentry, LogRocket, etc.)
    // For now, just store in localStorage for debugging
    try {
      const logs = JSON.parse(localStorage.getItem('error_logs') || '[]')
      logs.push(entry)
      localStorage.setItem('error_logs', JSON.stringify(logs.slice(-50))) // Keep last 50
    } catch (e) {
      // Silently fail if localStorage is not available
    }
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data)
  }

  info(message: string, data?: any) {
    this.log('info', message, data)
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data)
  }

  error(message: string, data?: any) {
    this.log('error', message, data)
  }
}

export const logger = new Logger()
