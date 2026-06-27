// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const DASHBOARD_PATH = path.resolve(process.cwd(), 'src/pages/student/Dashboard.tsx')
const PREFETCH_PATH = path.resolve(process.cwd(), 'src/lib/speculativePrefetch.ts')

const dashboardContent = fs.readFileSync(DASHBOARD_PATH, 'utf-8')
const prefetchContent = fs.readFileSync(PREFETCH_PATH, 'utf-8')

describe('student dashboard load path', () => {
  it('enables polling only after the initial dashboard load completes', () => {
    expect(dashboardContent).toContain('const [isPollingEnabled, setIsPollingEnabled] = useState(false)')
    expect(dashboardContent).toContain('enabled: isPollingEnabled')
    expect(dashboardContent).toContain('setIsPollingEnabled(true)')
  })

  it('does not block initial dashboard render on catalog intakes', () => {
    expect(dashboardContent).not.toContain('const [localDraftResult, applicationsResult, intakesResult, interviewsResult]')
    expect(dashboardContent).toContain('void catalogService.getIntakes()')
  })

  it('refreshes dashboard cards after draft create, update, delete, or store revision changes', () => {
    expect(dashboardContent).toContain("window.addEventListener('draftCleared', handleDraftCleared)")
    expect(dashboardContent).toContain("window.addEventListener('applicationUpdated', handleReload)")
    expect(dashboardContent).toContain("window.addEventListener('applicationCreated', handleReload)")
    expect(dashboardContent).toContain('const draftRevision = useDraftRevision()')
    expect(dashboardContent).toContain('scheduleDashboardReload()')
    expect(dashboardContent).toContain('removeDraftsFromApplicationCaches(queryClient, cleanIds)')
  })

  it('keeps dashboard speculative prefetch focused on the wizard route', () => {
    const onDashboardMountBlock = prefetchContent.slice(
      prefetchContent.indexOf('export function onDashboardMount'),
      prefetchContent.indexOf('export function onAdminDashboardMount'),
    )

    expect(onDashboardMountBlock).toContain('preloadStudentWizard()')
    expect(onDashboardMountBlock).not.toContain('prefetchCatalog()')
    expect(onDashboardMountBlock).not.toContain('preloadStudentSecondaryPages()')
    expect(onDashboardMountBlock).not.toContain('prefetchStudentApplications(userId)')
    expect(onDashboardMountBlock).not.toContain('prefetchNotificationPrefs(userId)')
  })
})
