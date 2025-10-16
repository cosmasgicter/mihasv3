const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) console.log(...args)
  },
  error: (...args: any[]) => {
    if (isDevelopment) console.error(...args)
    // In production, send to monitoring service
  },
  warn: (...args: any[]) => {
    if (isDevelopment) console.warn(...args)
  },
  info: (...args: any[]) => {
    if (isDevelopment) console.info(...args)
  }
}
