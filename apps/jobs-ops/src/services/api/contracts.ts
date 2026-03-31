export type Recommendation = 'apply_now' | 'review' | 'watch' | 'ignore'

export type PaginatedResponse<T> = {
  page: number
  pageSize: number
  totalCount: number
  results: T[]
}

export type ApiEnvelope<T> = {
  success: boolean
  data: T
  error?: string
  code?: string
}

export type JobSummary = {
  id: string
  title: string
  company: string
  location: string
  workMode: 'remote' | 'hybrid' | 'on_site'
  matchScore: number
  recommendation: Recommendation
}

export type JobDetail = JobSummary & {
  applicationUrl: string
  fitReasons: string[]
  missingSignals: string[]
  sourceNames: string[]
}

export type JobApplicationItem = {
  id: string
  jobId: string
  title: string
  company: string
  status: string
  automationMode: string
  evidenceCount: number
  updatedAt: string
}

export type AutomationRule = {
  id: string
  name: string
  ruleType: string
  isEnabled: boolean
  config: Record<string, unknown>
}

export type AutomationRun = {
  id: string
  runType: string
  status: string
  triggerSource: string
  summary: string
  blockedReason: string
  updatedAt: string
}

export type OutreachContact = {
  id: string
  fullName: string
  email: string
  company: string
  role: string
  relationshipStatus: string
  tags: string[]
}

export type OutreachCampaign = {
  id: string
  name: string
  campaignType: string
  status: string
  targetCount: number
}

export type EmailThread = {
  id: string
  subject: string
  threadKey: string
  status: string
}

export type EmailMessage = {
  id: string
  threadId: string
  direction: string
  sender: string
  recipient: string
  subject: string
  bodyPreview: string
  classification: string
}

export type ResumeAsset = {
  id: string
  name: string
  assetType: string
  targetRole: string
  status: string
  updatedAt: string
}

export type FunnelAnalytics = {
  discovered: number
  reviewed: number
  applied: number
  interviews: number
  offers: number
}

export type SourceAnalytics = {
  source: string
  freshnessHours: number
  duplicateRatio: number
  successRate: number
}

export type OutreachAnalytics = {
  campaignsSent: number
  positiveReplies: number
  interviewsGenerated: number
}

export type DailyDigest = {
  headline: string
  summary: string
  generatedAt: string
}

export type PlatformMeta = {
  product: string
  creator: {
    name: string
  }
  developer: {
    name: string
    url: string
  }
  apiVersion: string
  status: string
}
