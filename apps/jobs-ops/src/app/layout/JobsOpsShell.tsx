import { useQuery } from '@tanstack/react-query'
import { Command, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { navigationItems, pinnedArtifacts } from '@/app/layout/navigation'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { env } from '@/lib/env'
import { labelize } from '@/lib/format'
import { listAutomationRuns } from '@/services/api/automation'
import { listEmailThreads } from '@/services/api/email'
import { listJobApplications } from '@/services/api/job-applications'
import { getPlatformMeta } from '@/services/api/platform'
import { useUiStore } from '@/stores/ui-store'

function toneFromRunStatus(status: string) {
  if (status === 'completed') return 'success' as const
  if (status === 'running') return 'insight' as const
  if (status === 'blocked') return 'danger' as const
  return 'warning' as const
}

export function JobsOpsShell() {
  const location = useLocation()
  const [commandQuery, setCommandQuery] = useState('')
  const deferredCommandQuery = useDeferredValue(commandQuery)
  const triggerButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const {
    commandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    sidebarCollapsed,
    toggleSidebar,
  } = useUiStore()

  const platformQuery = useQuery({
    queryKey: ['platform-meta'],
    queryFn: getPlatformMeta,
  })
  const applicationsQuery = useQuery({
    queryKey: ['job-applications'],
    queryFn: listJobApplications,
  })
  const automationRunsQuery = useQuery({
    queryKey: ['automation-runs'],
    queryFn: listAutomationRuns,
  })
  const emailThreadsQuery = useQuery({
    queryKey: ['email-threads'],
    queryFn: listEmailThreads,
  })

  const activeNavigationItem = useMemo(
    () =>
      navigationItems.find((item) =>
        item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
      ) ?? navigationItems[0],
    [location.pathname],
  )

  const quickLinks = useMemo(() => {
    const query = deferredCommandQuery.trim().toLowerCase()
    if (!query) {
      return navigationItems
    }

    return navigationItems.filter((item) => {
      const searchable = `${item.label} ${item.hint} ${item.to}`.toLowerCase()
      return searchable.includes(query)
    })
  }, [deferredCommandQuery])

  const blockedRuns = (automationRunsQuery.data?.results ?? []).filter((run) => run.status === 'blocked')
  const reviewCount = (applicationsQuery.data?.results ?? []).filter(
    (application) => application.status === 'awaiting_approval',
  ).length
  const openThreads = (emailThreadsQuery.data?.results ?? []).filter((thread) => thread.status !== 'closed').length

  const openPalette = () => {
    startTransition(() => {
      setCommandQuery('')
    })
    openCommandPalette()
  }

  const dismissPalette = useCallback(() => {
    startTransition(() => {
      setCommandQuery('')
    })
    closeCommandPalette()
    // Return focus to the trigger button
    requestAnimationFrame(() => {
      triggerButtonRef.current?.focus()
    })
  }, [closeCommandPalette])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMetaKey = event.metaKey || event.ctrlKey
      if (isMetaKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (commandPaletteOpen) {
          dismissPalette()
        } else {
          openPalette()
        }
      }

      if (event.key === 'Escape' && commandPaletteOpen) {
        dismissPalette()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteOpen])

  // Focus trap: Tab cycles within the command palette when open
  useEffect(() => {
    if (!commandPaletteOpen) return

    const onTabKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusableElements = dialog.querySelectorAll<HTMLElement>(
        'input, button, [href], [tabindex]:not([tabindex="-1"])',
      )
      if (focusableElements.length === 0) return

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]

      if (event.shiftKey) {
        // Shift+Tab: wrap from first to last
        if (document.activeElement === first) {
          event.preventDefault()
          last.focus()
        }
      } else {
        // Tab: wrap from last to first
        if (document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', onTabKeyDown)
    return () => window.removeEventListener('keydown', onTabKeyDown)
  }, [commandPaletteOpen])

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-[1720px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[auto_minmax(0,1fr)_340px]">
        <nav
          aria-label="Main navigation"
          className={`panel animate-rise flex flex-col gap-6 overflow-hidden px-4 py-5 transition-all duration-200 lg:min-h-[calc(100vh-2rem)] ${
            sidebarCollapsed ? 'lg:w-[104px]' : 'lg:w-[308px]'
          }`}
        >
          <div className="rounded-[28px] border border-primary/15 bg-[linear-gradient(140deg,rgba(13,91,215,0.16),rgba(255,255,255,0.95)_44%,rgba(12,110,84,0.13))] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className={sidebarCollapsed ? 'hidden' : ''}>
                <span className="eyebrow">Jobs Ops</span>
                <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
                  Opportunity command center
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Discovery, applications, outreach, and reporting in one operator workflow.
                </p>
              </div>
              <button
                aria-expanded={!sidebarCollapsed}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="min-h-touch min-w-touch rounded-2xl border border-line/80 bg-panel/80 p-2 text-muted transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                onClick={toggleSidebar}
                type="button"
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </button>
            </div>

            {!sidebarCollapsed ? (
              <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <div aria-label={`Review queue: ${reviewCount} items awaiting approval`} className="rounded-2xl border border-panel/70 bg-panel/70 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Review</p>
                  <p className="mt-2 font-display text-2xl font-semibold text-ink">{reviewCount}</p>
                </div>
                <div aria-label={`Blocked runs: ${blockedRuns.length} automation runs blocked`} className="rounded-2xl border border-panel/70 bg-panel/70 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Blocked</p>
                  <p className="mt-2 font-display text-2xl font-semibold text-ink">{blockedRuns.length}</p>
                </div>
                <div aria-label={`Open threads: ${openThreads} email threads active`} className="rounded-2xl border border-panel/70 bg-panel/70 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Threads</p>
                  <p className="mt-2 font-display text-2xl font-semibold text-ink">{openThreads}</p>
                </div>
              </div>
            ) : null}
          </div>

          <nav className="grid gap-2">
            {navigationItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  className={({ isActive }) =>
                    `min-h-touch rounded-2xl border px-3 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                      isActive
                        ? 'border-primary/25 bg-[linear-gradient(135deg,rgba(13,91,215,0.12),rgba(255,255,255,0.92))] text-primary'
                        : 'border-transparent text-ink hover:border-line/80 hover:bg-panel/70'
                    }`
                  }
                  to={item.to}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-panel/90 p-2 shadow-sm">
                      <Icon className="h-4 w-4" />
                    </span>
                    {!sidebarCollapsed ? (
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span className="block truncate text-xs text-muted">{item.hint}</span>
                      </span>
                    ) : null}
                  </div>
                </NavLink>
              )
            })}
          </nav>

          {!sidebarCollapsed ? (
            <div className="mt-auto rounded-[24px] border border-line/70 bg-panel/75 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Live backend</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Read models pull from the seeded `/api/v1/...` contracts. Write actions stay policy-gated.
              </p>
            </div>
          ) : null}
        </nav>

        <div className="grid min-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-4">
          <header className="panel animate-rise flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Operator route</p>
              <h2 className="mt-1 truncate font-display text-2xl font-semibold tracking-tight text-ink">
                {activeNavigationItem.label}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{activeNavigationItem.hint}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone="success">{platformQuery.data?.status ?? 'loading'}</StatusBadge>
              <StatusBadge tone="warning">{reviewCount} awaiting approval</StatusBadge>
              <StatusBadge tone={blockedRuns.length > 0 ? 'danger' : 'insight'}>
                {blockedRuns.length} blocked runs
              </StatusBadge>
              <button
                ref={triggerButtonRef}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-line/80 bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:border-primary/50 hover:text-primary"
                onClick={openPalette}
                type="button"
              >
                <Search className="h-4 w-4" />
                Command palette
                <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 font-mono text-[11px] text-muted">
                  <Command className="h-3 w-3" />
                  K
                </span>
              </button>
            </div>
          </header>

          <main id="main-content" role="main" className="panel animate-rise overflow-hidden">
            <ErrorBoundary level="page">
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

        <aside aria-label="Platform info" className="panel animate-rise hidden min-h-[calc(100vh-2rem)] flex-col gap-6 px-5 py-5 lg:flex">
          <div>
            <span className="eyebrow">Runtime</span>
            <div className="mt-3 grid gap-3">
              <div className="rounded-2xl border border-line/70 bg-panel/80 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">API Base</p>
                <p className="mt-2 break-all font-mono text-sm text-ink">{env.apiBaseUrl}</p>
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel/80 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Creator</p>
                <p className="mt-2 text-sm font-semibold text-ink">{platformQuery.data?.creator.name ?? 'Loading'}</p>
                <a
                  className="mt-1 inline-block text-sm text-primary hover:underline"
                  href={platformQuery.data?.developer.url ?? 'https://beanola.com'}
                  rel="noreferrer"
                  target="_blank"
                >
                  {platformQuery.data?.developer.name ?? 'Beanola Technologies'}
                </a>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold text-ink">System pulse</h3>
            <div className="mt-3 grid gap-3">
              <div className="rounded-2xl border border-line/70 bg-panel/75 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Review queue</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">{reviewCount}</p>
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel/75 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Automation</p>
                <div className="mt-3 grid gap-2">
                  {blockedRuns.length === 0 ? (
                    <StatusBadge tone="success">No blocked runs</StatusBadge>
                  ) : (
                    blockedRuns.slice(0, 2).map((run) => (
                      <div key={run.id} className="rounded-2xl border border-line/70 bg-canvas/70 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-ink">{labelize(run.runType)}</p>
                          <StatusBadge tone={toneFromRunStatus(run.status)}>{labelize(run.status)}</StatusBadge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted">{run.blockedReason}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold text-ink">Pinned references</h3>
            <ul className="mt-3 grid gap-2 text-sm text-muted">
              {pinnedArtifacts.map((item) => (
                <li key={item} className="rounded-2xl border border-line/70 bg-panel/75 px-3 py-3 font-mono text-xs">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {commandPaletteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 px-4 py-12 backdrop-blur-sm"
          onClick={(event) => {
            // Close when clicking the backdrop (not the dialog itself)
            if (event.target === event.currentTarget) dismissPalette()
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <div ref={dialogRef} className="panel w-full max-w-2xl p-5">
            <div className="flex items-center gap-3 rounded-2xl border border-line/80 bg-panel px-4 py-3">
              <Search className="h-4 w-4 text-muted" />
              <input
                aria-label="Search navigation"
                autoFocus
                className="w-full border-0 bg-transparent text-sm text-ink outline-none"
                onChange={(event) => {
                  startTransition(() => {
                    setCommandQuery(event.target.value)
                  })
                }}
                placeholder="Search jobs, automation, reports, or review surfaces."
                value={commandQuery}
              />
              <button
                aria-label="Close command palette"
                className="min-h-touch min-w-touch rounded-xl p-1 text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                onClick={dismissPalette}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {quickLinks.map((item) => (
                <NavLink
                  key={item.to}
                  className="min-h-touch rounded-2xl border border-line/70 bg-panel/75 px-4 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                  onClick={dismissPalette}
                  to={item.to}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.label}</p>
                      <p className="mt-1 text-sm text-muted">{item.hint}</p>
                    </div>
                    <span className="font-mono text-xs text-muted">{item.to}</span>
                  </div>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
