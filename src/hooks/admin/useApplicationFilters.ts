import { useCallback, useState } from 'react'

export interface ApplicationFilters {
  searchTerm: string
  statusFilter: string
  paymentFilter: string
  programFilter: string
  institutionFilter: string
}

export const DEFAULT_APPLICATION_FILTERS: ApplicationFilters = {
  searchTerm: '',
  statusFilter: '',
  paymentFilter: '',
  programFilter: '',
  institutionFilter: ''
}

export const APPLICATION_FILTER_KEYS = [
  'searchTerm',
  'statusFilter',
  'paymentFilter',
  'programFilter',
  'institutionFilter'
] as const satisfies ReadonlyArray<keyof ApplicationFilters>

type ApplicationFilterKey = typeof APPLICATION_FILTER_KEYS[number]

const STORAGE_KEY = 'admin_applications_filters'

const isBrowserEnvironment = () => typeof window !== 'undefined'

const pickFilters = (value: unknown): Partial<ApplicationFilters> => {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const partial: Partial<ApplicationFilters> = {}

  for (const key of APPLICATION_FILTER_KEYS) {
    const candidate = (value as Record<string, unknown>)[key]
    if (typeof candidate === 'string') {
      partial[key] = candidate
    }
  }

  return partial
}

const readFiltersFromSession = (): Partial<ApplicationFilters> => {
  if (!isBrowserEnvironment()) {
    return {}
  }

  try {
    const storedValue = window.sessionStorage.getItem(STORAGE_KEY)
    if (!storedValue) {
      return {}
    }

    const parsed = JSON.parse(storedValue) as unknown
    return pickFilters(parsed)
  } catch (error) {
    console.warn('Failed to read application filters from sessionStorage', error)
    return {}
  }
}

const readFiltersFromSearchParams = (params?: URLSearchParams): Partial<ApplicationFilters> => {
  if (!params) {
    return {}
  }

  const partial: Partial<ApplicationFilters> = {}

  for (const key of APPLICATION_FILTER_KEYS) {
    const value = params.get(key)
    if (value !== null) {
      partial[key] = value
    }
  }

  return partial
}

const normalizeFilters = (partial?: Partial<ApplicationFilters>): ApplicationFilters => ({
  ...DEFAULT_APPLICATION_FILTERS,
  ...(partial ?? {})
})

const areFiltersEqual = (a: ApplicationFilters, b: ApplicationFilters) =>
  APPLICATION_FILTER_KEYS.every(key => a[key] === b[key])

const persistFilters = (filters: ApplicationFilters) => {
  if (!isBrowserEnvironment()) {
    return
  }

  const hasActiveFilters = APPLICATION_FILTER_KEYS.some(key => filters[key])

  try {
    if (hasActiveFilters) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch (error) {
    console.warn('Failed to persist application filters to sessionStorage', error)
  }
}

const resolveInitialFilters = (): ApplicationFilters => {
  if (!isBrowserEnvironment()) {
    return { ...DEFAULT_APPLICATION_FILTERS }
  }

  const sessionFilters = readFiltersFromSession()
  const urlFilters = readFiltersFromSearchParams(new URLSearchParams(window.location.search))

  return normalizeFilters({ ...sessionFilters, ...urlFilters })
}

export function useApplicationFilters() {
  const [filters, setFiltersState] = useState<ApplicationFilters>(() => resolveInitialFilters())

  const setFilters = useCallback(
    (updater: ApplicationFilters | ((prev: ApplicationFilters) => ApplicationFilters)) => {
      setFiltersState(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        const normalized = normalizeFilters(next)

        if (areFiltersEqual(prev, normalized)) {
          return prev
        }

        persistFilters(normalized)
        return normalized
      })
    },
    []
  )

  const updateFilter = useCallback(
    (key: ApplicationFilterKey, value: string) => {
      setFilters(prev => ({ ...prev, [key]: value }))
    },
    [setFilters]
  )

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_APPLICATION_FILTERS)
  }, [setFilters])

  return {
    filters,
    updateFilter,
    resetFilters,
    setFilters
  }
}
