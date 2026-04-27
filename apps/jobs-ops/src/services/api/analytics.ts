import { apiClient } from '@/services/api/client'
import { env } from '@/lib/env'
import type { DailyDigest, FunnelAnalytics, OutreachAnalytics, SourceAnalytics } from '@/services/api/contracts'

type RawSourceAnalytics = {
  source: string
  freshness_hours: number
  duplicate_ratio: number
  success_rate: number
}

type RawOutreachAnalytics = {
  campaigns_sent: number
  positive_replies: number
  interviews_generated: number
}

type RawDailyDigest = {
  headline: string
  summary: string
  generated_at: string
}

const fallbackFunnel: FunnelAnalytics = {
  discovered: 48,
  reviewed: 21,
  applied: 13,
  interviews: 3,
  offers: 0,
}

const fallbackSources: SourceAnalytics[] = [
  { source: 'impact-finance-africa', freshnessHours: 2, duplicateRatio: 0.08, successRate: 0.94 },
  { source: 'regional-careers-feed', freshnessHours: 9, duplicateRatio: 0.11, successRate: 0.88 },
  { source: 'ngo-opportunities-africa', freshnessHours: 5, duplicateRatio: 0.06, successRate: 0.91 },
]

const fallbackOutreach: OutreachAnalytics = {
  campaignsSent: 5,
  positiveReplies: 2,
  interviewsGenerated: 1,
}

const fallbackDigest: DailyDigest = {
  headline: '3 high-value roles surfaced today',
  summary:
    'The scaffold digest shows how discovery, approvals, outreach, and source health should be summarized in a single daily operating report.',
  generatedAt: new Date().toISOString(),
}

export async function getFunnelAnalytics(): Promise<FunnelAnalytics> {
  try {
    return await apiClient.get<FunnelAnalytics>('/api/v1/analytics/funnel/')
  } catch (error) {
    if (env.demoMode) return fallbackFunnel
    throw error
  }
}

export async function listSourceAnalytics(): Promise<SourceAnalytics[]> {
  try {
    const payload = await apiClient.get<RawSourceAnalytics[]>('/api/v1/analytics/sources/')
    return payload.map((item) => ({
      source: item.source,
      freshnessHours: item.freshness_hours,
      duplicateRatio: item.duplicate_ratio,
      successRate: item.success_rate,
    }))
  } catch (error) {
    if (env.demoMode) return fallbackSources
    throw error
  }
}

export async function getOutreachAnalytics(): Promise<OutreachAnalytics> {
  try {
    const payload = await apiClient.get<RawOutreachAnalytics>('/api/v1/analytics/outreach/')
    return {
      campaignsSent: payload.campaigns_sent,
      positiveReplies: payload.positive_replies,
      interviewsGenerated: payload.interviews_generated,
    }
  } catch (error) {
    if (env.demoMode) return fallbackOutreach
    throw error
  }
}

export async function getDailyDigest(): Promise<DailyDigest> {
  try {
    const payload = await apiClient.get<RawDailyDigest>('/api/v1/reports/daily-digest/')
    return {
      headline: payload.headline,
      summary: payload.summary,
      generatedAt: payload.generated_at,
    }
  } catch (error) {
    if (env.demoMode) return fallbackDigest
    throw error
  }
}
