import {
  Activity,
  BellRing,
  BriefcaseBusiness,
  FileSpreadsheet,
  FileStack,
  Gauge,
  GitBranch,
  Inbox,
  LayoutDashboard,
  Link2,
  Mail,
  NotebookTabs,
  Radar,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavigationItem = {
  label: string
  to: string
  icon: LucideIcon
  hint: string
}

export const navigationItems: NavigationItem[] = [
  { label: 'Overview', to: '/', icon: LayoutDashboard, hint: 'Daily operating overview' },
  { label: 'Jobs Inbox', to: '/jobs', icon: Inbox, hint: 'Discover and triage opportunities' },
  { label: 'Job Applications', to: '/job-applications', icon: BriefcaseBusiness, hint: 'Track pursuit and submission states' },
  { label: 'Automation Runs', to: '/automation/runs', icon: Activity, hint: 'Inspect orchestration and blockers' },
  { label: 'Outreach CRM', to: '/outreach/contacts', icon: Link2, hint: 'Contacts, campaigns, and referrals' },
  { label: 'Email Ops', to: '/email/threads', icon: Mail, hint: 'Threads, delivery, and replies' },
  { label: 'Resume Lab', to: '/documents/resumes', icon: FileStack, hint: 'Resumes, variants, and cover letters' },
  { label: 'Integrations', to: '/integrations', icon: NotebookTabs, hint: 'Provider setup and credentials' },
  { label: 'Source Health', to: '/sources', icon: Radar, hint: 'Adapter freshness and failures' },
  { label: 'Reports', to: '/reports', icon: Gauge, hint: 'Funnel and strategic reporting' },
  { label: 'Review', to: '/review', icon: BellRing, hint: 'Approval queue and human-in-the-loop tasks' },
  { label: 'Audit', to: '/audit', icon: GitBranch, hint: 'Evidence and system activity' },
]

export const pinnedArtifacts = [
  'backend/apps/jobs/',
  'backend/apps/automation/',
  'apps/jobs-ops/src/features/jobs/',
  'docs/design/2026-03-30-ai-job-hunting-platform-api-data-spec.md',
  'docs/design/2026-03-30-ai-job-hunting-platform-ui-spec.md',
]

export const scaffoldFocus = [
  'Preserve strict route names so backend and frontend stay aligned.',
  'Keep high-risk actions approval-gated until automation policy is complete.',
  'Replace frontend fallbacks with live endpoints one feature slice at a time.',
]

