import { apiClient } from '@/services/api/client'
import type { AutomationRule, AutomationRun, PaginatedResponse } from '@/services/api/contracts'

type RawAutomationRule = {
  id: string
  name: string
  rule_type: string
  is_enabled: boolean
  config: Record<string, unknown>
}

type RawAutomationRun = {
  id: string
  run_type: string
  status: string
  trigger_source: string
  summary: string
  blocked_reason: string
  updated_at: string
}

const fallbackRules: AutomationRule[] = [
  {
    id: '8dc62f91-0b7b-49c4-b4fd-6305fb1154f8',
    name: 'High confidence apply threshold',
    ruleType: 'auto_apply_cap',
    isEnabled: false,
    config: { minimumMatchScore: 92, dailyCap: 3 },
  },
  {
    id: '177bdb06-851b-4760-bb83-8d0d90d680cb',
    name: 'Outreach cooldown',
    ruleType: 'contact_cooldown',
    isEnabled: true,
    config: { minimumDaysBetweenMessages: 10 },
  },
]

const fallbackRuns: AutomationRun[] = [
  {
    id: '2d0eaf86-5fe2-4f39-baec-c1b7b183c157',
    runType: 'job_application_submit',
    status: 'blocked',
    triggerSource: 'job_applications.submit',
    summary: 'Impact Finance application paused before final submission.',
    blockedReason: 'Manual authentication checkpoint required.',
    updatedAt: new Date().toISOString(),
  },
  {
    id: '4d47235d-a552-4c16-9bf6-04b6b0130168',
    runType: 'job_discovery',
    status: 'completed',
    triggerSource: 'jobs.discovery',
    summary: 'Morning discovery run completed across three configured source groups.',
    blockedReason: '',
    updatedAt: new Date().toISOString(),
  },
]

function mapRule(rule: RawAutomationRule): AutomationRule {
  return {
    id: rule.id,
    name: rule.name,
    ruleType: rule.rule_type,
    isEnabled: rule.is_enabled,
    config: rule.config,
  }
}

function mapRun(run: RawAutomationRun): AutomationRun {
  return {
    id: run.id,
    runType: run.run_type,
    status: run.status,
    triggerSource: run.trigger_source,
    summary: run.summary,
    blockedReason: run.blocked_reason,
    updatedAt: run.updated_at,
  }
}

export async function listAutomationRules(): Promise<PaginatedResponse<AutomationRule>> {
  try {
    const payload = await apiClient.get<PaginatedResponse<RawAutomationRule>>('/api/v1/automation/rules/')
    return {
      ...payload,
      results: payload.results.map(mapRule),
    }
  } catch {
    return {
      page: 1,
      pageSize: 20,
      totalCount: fallbackRules.length,
      results: fallbackRules,
    }
  }
}

export async function listAutomationRuns(): Promise<PaginatedResponse<AutomationRun>> {
  try {
    const payload = await apiClient.get<PaginatedResponse<RawAutomationRun>>('/api/v1/automation/runs/')
    return {
      ...payload,
      results: payload.results.map(mapRun),
    }
  } catch {
    return {
      page: 1,
      pageSize: 20,
      totalCount: fallbackRuns.length,
      results: fallbackRuns,
    }
  }
}
