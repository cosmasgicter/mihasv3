import { apiClient } from '@/services/api/client'
import { env } from '@/lib/env'
import type { JobDetail, JobSummary, PaginatedResponse } from '@/services/api/contracts'

type RawJobSummary = {
  id: string
  title: string
  company: string
  location: string
  work_mode: 'remote' | 'hybrid' | 'on_site'
  match_score: number
  recommendation: 'apply_now' | 'review' | 'watch' | 'ignore'
}

type RawJobDetail = RawJobSummary & {
  application_url: string
  fit_reasons: string[]
  missing_signals: string[]
  source_names: string[]
}

const scaffoldJobs: JobSummary[] = [
  {
    id: '7db809ec-6655-4bf0-93b5-38b778342680',
    title: 'Senior Data Analyst',
    company: 'Impact Finance Africa',
    location: 'Lusaka, Zambia',
    workMode: 'hybrid',
    matchScore: 91,
    recommendation: 'apply_now',
  },
  {
    id: '270f9d66-8859-4a8d-9062-e4efbc637b4f',
    title: 'Programme Operations Associate',
    company: 'Regional NGO Network',
    location: 'Nairobi, Kenya',
    workMode: 'remote',
    matchScore: 83,
    recommendation: 'review',
  },
]

const scaffoldJobDetails: Record<string, JobDetail> = {
  '7db809ec-6655-4bf0-93b5-38b778342680': {
    ...scaffoldJobs[0],
    applicationUrl: 'https://example.com/jobs/senior-data-analyst',
    fitReasons: [
      'Strong overlap between analytics workflow ownership and the role requirements.',
      'The posting values operational clarity, reporting, and stakeholder communication.',
      'Hybrid Lusaka setup stays within the preferred location and work-mode range.',
    ],
    missingSignals: [
      'Add stronger ATS keywords around SQL modeling and dashboard governance.',
      'Clarify measurable outcomes in recent roles to improve shortlist probability.',
    ],
    sourceNames: ['impact-finance-africa', 'regional-careers-feed'],
  },
  '270f9d66-8859-4a8d-9062-e4efbc637b4f': {
    ...scaffoldJobs[1],
    applicationUrl: 'https://example.com/jobs/programme-operations-associate',
    fitReasons: [
      'Remote-friendly role with strong alignment on operations, reporting, and coordination.',
      'Good strategic value because the employer sits in a target sector.',
    ],
    missingSignals: [
      'Requires a tighter narrative around programme delivery and donor reporting.',
      'Could benefit from a sector-specific resume variant before applying.',
    ],
    sourceNames: ['regional-careers-feed', 'ngo-opportunities-africa'],
  },
}

function mapJobSummary(job: RawJobSummary): JobSummary {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.work_mode,
    matchScore: job.match_score,
    recommendation: job.recommendation,
  }
}

function mapJobDetail(job: RawJobDetail): JobDetail {
  return {
    ...mapJobSummary(job),
    applicationUrl: job.application_url,
    fitReasons: job.fit_reasons,
    missingSignals: job.missing_signals,
    sourceNames: job.source_names,
  }
}

export async function listJobs(): Promise<PaginatedResponse<JobSummary>> {
  try {
    const payload = await apiClient.get<PaginatedResponse<RawJobSummary>>('/api/v1/jobs/')
    return {
      ...payload,
      results: payload.results.map(mapJobSummary),
    }
  } catch (error) {
    if (env.demoMode) return { page: 1, pageSize: 20, totalCount: scaffoldJobs.length, results: scaffoldJobs }
    throw error
  }
}

export async function getJobDetail(jobId: string): Promise<JobDetail> {
  try {
    const payload = await apiClient.get<RawJobDetail>(`/api/v1/jobs/${jobId}/`)
    return mapJobDetail(payload)
  } catch (error) {
    if (env.demoMode) {
      return scaffoldJobDetails[jobId] || {
        ...scaffoldJobs[0],
        id: jobId,
        applicationUrl: 'https://example.com/jobs/scaffold-job',
        fitReasons: ['Replace scaffold detail data with live backend detail responses.'],
        missingSignals: ['Add real AI fit explanation and gap analysis.'],
        sourceNames: ['scaffold-source'],
      }
    }
    throw error
  }
}
