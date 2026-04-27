import { apiClient } from '@/services/api/client'
import { env } from '@/lib/env'
import type { JobApplicationItem, PaginatedResponse } from '@/services/api/contracts'

type RawJobApplicationItem = {
  id: string
  job_id: string
  title: string
  company: string
  status: string
  automation_mode: string
  evidence_count: number
  updated_at: string
}

const fallbackApplications: JobApplicationItem[] = [
  {
    id: '1f12ed0f-50d8-4370-bc02-04f01102483f',
    jobId: '7db809ec-6655-4bf0-93b5-38b778342680',
    title: 'Senior Data Analyst',
    company: 'Impact Finance Africa',
    status: 'awaiting_approval',
    automationMode: 'draft_only',
    evidenceCount: 3,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'd83038ee-73c8-4796-bddb-dcf6f0f7b4d0',
    jobId: '270f9d66-8859-4a8d-9062-e4efbc637b4f',
    title: 'Programme Operations Associate',
    company: 'Regional NGO Network',
    status: 'submitted',
    automationMode: 'assisted_auto',
    evidenceCount: 7,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'c3fd74dc-1f80-4e79-95cf-acf41577ce50',
    jobId: 'bd249f7a-f9d5-4d2b-9dcb-bf219ef126cb',
    title: 'Digital Transformation Lead',
    company: 'Copperbelt Growth Fund',
    status: 'watch_only',
    automationMode: 'watch_only',
    evidenceCount: 1,
    updatedAt: new Date().toISOString(),
  },
]

function mapJobApplication(item: RawJobApplicationItem): JobApplicationItem {
  return {
    id: item.id,
    jobId: item.job_id,
    title: item.title,
    company: item.company,
    status: item.status,
    automationMode: item.automation_mode,
    evidenceCount: item.evidence_count,
    updatedAt: item.updated_at,
  }
}

export async function listJobApplications(): Promise<PaginatedResponse<JobApplicationItem>> {
  try {
    const payload = await apiClient.get<PaginatedResponse<RawJobApplicationItem>>('/api/v1/job-applications/')
    return {
      ...payload,
      results: payload.results.map(mapJobApplication),
    }
  } catch (error) {
    if (env.demoMode) return { page: 1, pageSize: 20, totalCount: fallbackApplications.length, results: fallbackApplications }
    throw error
  }
}
