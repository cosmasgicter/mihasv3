import { apiClient, buildQueryString } from '@/services/client'
import { applicationService } from '@/services/applications'

export const optimizedApplicationService = {
  async list(filters: any, limit = 50) {
    const params: Record<string, string> = {
      pageSize: String(limit),
      sortBy: 'date',
      sortOrder: 'desc',
    }

    if (filters.searchTerm) {
      params.search = filters.searchTerm
    }

    if (filters.statusFilter) {
      params.status = filters.statusFilter
    }

    if (filters.paymentFilter) {
      params.payment = filters.paymentFilter
    }

    if (filters.programFilter) {
      params.program = filters.programFilter
    }

    if (filters.institutionFilter) {
      params.institution = filters.institutionFilter
    }

    const result = await applicationService.list(params)

    return {
      data: result?.applications ?? [],
      count: result?.totalCount ?? 0,
      error: null,
    }
  },

  async getById(id: string) {
    try {
      const result = await applicationService.getById(id)
      return {
        data: result?.application ?? null,
        error: null,
      }
    } catch (error) {
      return {
        data: null,
        error,
      }
    }
  }
}
