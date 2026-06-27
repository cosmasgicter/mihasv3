export type EnvLookup = Record<string, string | undefined>

function isMeaningfulValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function readImportMetaEnv(key: string): string | undefined {
  const override = (globalThis as { __BEANOLA_IMPORT_META_ENV__?: EnvLookup }).__BEANOLA_IMPORT_META_ENV__
  if (override) {
    const value = override[key]
    if (isMeaningfulValue(value)) {
      return value
    }
  }

  try {
    const env = (import.meta as ImportMeta & { env?: EnvLookup }).env
    return env?.[key]
  } catch (error) {
    // Accessing import.meta can throw in non-module environments (e.g. some tests).
    return undefined
  }
}

function readProcessEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) {
    return undefined
  }

  return process.env[key]
}

export function getEnvVariable(key: string, fallback: string): string {
  const fromImportMeta = readImportMetaEnv(key)
  if (isMeaningfulValue(fromImportMeta)) {
    return fromImportMeta
  }

  const fromProcess = readProcessEnv(key)
  if (isMeaningfulValue(fromProcess)) {
    return fromProcess
  }

  return fallback
}
