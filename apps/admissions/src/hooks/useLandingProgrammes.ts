/**
 * The open programmes the landing lists (task 29.2, R12.2): catalogue reads scoped
 * by the resolved portal context, with the empty, error and 429 states kept apart.
 *
 * `/catalog/intakes/` names the intakes; for each open one, the canonical-programme
 * read the wizard already uses names the programmes it offers (filtered to the
 * school on a white-label portal). Nothing here needs a sign-in.
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { catalogService } from '@/services/catalog'
import { QUERY_CACHE_CONFIG } from '@/lib/queryCacheConfig'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { isRateLimitedError, rateLimitMessage, retryAfterOf } from '@/lib/rateLimitCopy'
import { buildLandingProgrammeRows, isIntakeOpen, type LandingProgrammeRow } from '@/lib/landingProgrammes'
import type { Program } from '@/types/database'

/** How many open intakes to read programmes for; the catalogue keeps only a few open. */
const MAX_OPEN_INTAKES = 4

export interface LandingProgrammesState {
  rows: LandingProgrammeRow[]
  isLoading: boolean
  /** A message, or `null`. A 429 reads "Too many requests…", never an empty list. */
  errorMessage: string | null
  retry: () => void
}

export function useLandingProgrammes(): LandingProgrammesState {
  const { offeringInstitutionId, isLoading: contextLoading } = usePortalBrand()
  const intakes = useQuery({
    queryKey: ['landing', 'intakes'],
    queryFn: () => catalogService.getIntakes(),
    ...QUERY_CACHE_CONFIG.static,
    retry: false,
  })
  const openIntakes = useMemo(() => {
    const now = new Date()
    return (intakes.data?.intakes ?? []).filter(intake => isIntakeOpen(intake, now)).slice(0, MAX_OPEN_INTAKES)
  }, [intakes.data])
  const programmeQueries = useQueries({
    queries: openIntakes.map(intake => ({
      queryKey: ['landing', 'programmes', intake.id, offeringInstitutionId ?? null],
      queryFn: () => catalogService.getCanonicalPrograms({ intake: intake.id, institution: offeringInstitutionId }),
      enabled: !contextLoading,
      ...QUERY_CACHE_CONFIG.static,
      retry: false,
    })),
  })

  const failed = intakes.error ?? programmeQueries.find(query => query.error)?.error ?? null
  const rows = useMemo(() => {
    const byIntake: Record<string, Program[]> = {}
    openIntakes.forEach((intake, index) => {
      byIntake[intake.id] = programmeQueries[index]?.data?.programs ?? []
    })
    return buildLandingProgrammeRows(openIntakes, byIntake, new Date())
    // programmeQueries is a new array each render; its data identities drive this.
  }, [openIntakes, ...programmeQueries.map(query => query.data)])

  return {
    rows,
    isLoading: contextLoading || intakes.isLoading || programmeQueries.some(query => query.isLoading),
    errorMessage: failed
      ? isRateLimitedError(failed)
        ? rateLimitMessage(retryAfterOf(failed))
        : 'We could not load the programmes. Try again.'
      : null,
    retry: () => {
      void intakes.refetch()
      programmeQueries.forEach(query => void query.refetch())
    },
  }
}
