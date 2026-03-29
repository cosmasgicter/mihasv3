const ENABLE_LOADER_LOGS = import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOADER_TELEMETRY === 'true'

export interface LoaderTelemetrySession {
  end: (meta?: Record<string, unknown>) => void
}

export function startLoaderTelemetry(name: string): LoaderTelemetrySession {
  const startTime = performance.now()

  if (ENABLE_LOADER_LOGS) {
    console.info(`[loader] ${name} started`)
  }

  return {
    end: (meta) => {
      const durationMs = Math.round(performance.now() - startTime)
      if (!ENABLE_LOADER_LOGS) {
        return
      }

      if (durationMs >= 2000) {
        console.warn(`[loader] ${name} finished in ${durationMs}ms`, meta ?? {})
        return
      }

      console.info(`[loader] ${name} finished in ${durationMs}ms`, meta ?? {})
    },
  }
}
