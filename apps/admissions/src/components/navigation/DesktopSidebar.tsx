import React, { useState, useCallback } from 'react'
import { Home, FileText, Bell, LayoutDashboard, Users, ChevronLeft, ChevronRight, ChevronDown, GraduationCap, Calendar, Settings, FileSearch, CreditCard, DollarSign, MessageSquare, Clock, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/contexts/SidebarContext'
import { Tooltip } from '@/components/ui'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
}

interface NavSection {
  id: string
  title: string
  items: NavItem[]
}

// Grouped navigation sections for admin
const adminSections: NavSection[] = [
  {
    id: 'main',
    title: 'Main',
    items: [
      { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/admin/applications', icon: FileText, label: 'Applications' },
    ],
  },
  {
    id: 'management',
    title: 'Management',
    items: [
      { to: '/admin/users', icon: Users, label: 'Users' },
      { to: '/admin/programs', icon: GraduationCap, label: 'Programs' },
      { to: '/admin/intakes', icon: Calendar, label: 'Intakes' },
      { to: '/admin/program-fees', icon: DollarSign, label: 'Program Fees' },
    ],
  },
  {
    id: 'system',
    title: 'System',
    items: [
      { to: '/admin/audit', icon: FileSearch, label: 'Audit Trail' },
      { to: '/admin/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

const studentLinks: NavItem[] = [
  { to: '/student/dashboard', icon: Home, label: 'Dashboard' },
  { to: '/student/application-wizard', icon: FileText, label: 'Applications' },
  { to: '/student/communications', icon: MessageSquare, label: 'Communications' },
  { to: '/student/history', icon: Clock, label: 'Activity History' },
  { to: '/student/payment', icon: CreditCard, label: 'Payment' },
  { to: '/student/interview', icon: Calendar, label: 'Interview' },
  { to: '/student/notifications', icon: Bell, label: 'Notifications' },
  { to: '/student/settings', icon: Settings, label: 'Profile & Settings' },
]

const isRouteActive = (currentPath: string, itemPath: string) => {
  if (itemPath === '/student/application-wizard') {
    return currentPath === '/student/application-wizard' || currentPath === '/apply'
  }

  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}

export const DesktopSidebar = React.memo(function DesktopSidebar() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const { collapsed, setCollapsed } = useSidebar()
  const visibleAdminSections = adminSections
  
  // Track which sections are expanded (all expanded by default)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(adminSections.map(s => s.id))
  )

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }, [])

  if (!user) return null

  return (
    <aside
      aria-label="Main navigation"
      className="fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-white/10 bg-slate-950 text-white shadow-2xl transition-all duration-300 ease-in-out md:flex"
      style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-expanded)' }}
    >
      {/* Header / Logo area */}
      <div className={cn(
        'relative overflow-hidden border-b border-white/10 py-4 transition-all duration-300',
        collapsed ? 'px-2' : 'px-4'
      )}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,0.28),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(34,197,94,0.16),transparent_28%)]" aria-hidden="true" />
        <div className={cn(
          'relative flex items-center rounded-3xl border border-white/10 bg-white/10 shadow-lg shadow-black/20 backdrop-blur-xl transition-all duration-300',
          collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-3'
        )} role="img" aria-label="Mukuba Institute of Health and Allied Sciences logo">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-emerald-300 text-slate-950 shadow-lg shadow-sky-950/40" aria-hidden="true">
            <span className="text-sm font-black tracking-tight">MI</span>
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/80">Admissions</p>
              <span className="block truncate text-base font-bold text-white transition-opacity duration-200 motion-reduce:transition-none">
                {isAdmin ? 'MIHAS Admin' : 'MIHAS Student'}
              </span>
            </div>
          )}
        </div>

        {/* Collapse toggle — below logo when collapsed, inline when expanded */}
        <div className={cn(
          'flex transition-all duration-300',
          collapsed ? 'justify-center mt-3' : 'justify-end mt-2'
        )}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-sm',
              'transition-colors hover:bg-white/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
          >
            {collapsed ? (
              <ChevronRight style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} />
            ) : (
              <ChevronLeft style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} />
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className={cn(
        'flex-1 overflow-y-auto py-5 space-y-2 [scrollbar-width:thin]',
        collapsed ? 'px-2' : 'px-3'
      )}>
        {isAdmin ? (
          visibleAdminSections.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              collapsed={collapsed}
              expanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              currentPath={location.pathname}
            />
          ))
        ) : (
          <div className="space-y-1">
            {!collapsed && (
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Student Workspace
              </div>
            )}
            {studentLinks.map((item) => (
              <SidebarNavItem
                key={item.to}
                item={item}
                collapsed={collapsed}
                isActive={isRouteActive(location.pathname, item.to)}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Footer with system status */}
      <div className={cn(
        'border-t border-white/10',
        collapsed ? 'p-2' : 'p-4'
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/10 px-3 py-3 text-xs text-slate-300 shadow-sm transition-opacity duration-200 motion-reduce:transition-none">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-200">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-white">Workspace ready</p>
              <p className="text-[11px] text-slate-400">Navigation synced</p>
            </div>
          </div>
        ) : (
          <Tooltip content="Workspace ready" side="right">
            <div className="flex justify-center transition-opacity duration-200 motion-reduce:transition-none" role="status">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-emerald-200 shadow-sm">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="sr-only">Workspace ready</span>
            </div>
          </Tooltip>
        )}
      </div>
    </aside>
  )
})


interface SidebarSectionProps {
  section: NavSection
  collapsed: boolean
  expanded: boolean
  onToggle: () => void
  currentPath: string
}

function SidebarSection({
  section,
  collapsed,
  expanded,
  onToggle,
  currentPath,
}: SidebarSectionProps) {
  // Check if any item in this section is active
  const hasActiveItem = section.items.some(item => isRouteActive(currentPath, item.to))

  return (
    <div className="mb-2">
      {/* Section header - only show when not collapsed */}
      {!collapsed && (
        <button
          onClick={onToggle}
          className={cn(
            'flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em]',
            'text-slate-400 transition-colors hover:text-white',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
            hasActiveItem && 'text-sky-200'
          )}
        >
          <span>{section.title}</span>
          <div
            className={cn(
              'transition-transform duration-200 motion-reduce:transition-none',
              expanded ? 'rotate-0' : '-rotate-90'
            )}
          >
            <ChevronDown className="h-4 w-4" />
          </div>
        </button>
      )}

      {/* When collapsed, show a thin divider between sections instead of header */}
      {collapsed && (
        <div className="mx-4 my-2 border-t border-white/10" />
      )}

      {/* Section items */}
      {(collapsed || expanded) && (
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none',
            !collapsed && 'pl-1'
          )}
        >
          <div className="space-y-1">
            {section.items.map((item) => (
              <SidebarNavItem
                key={item.to}
                item={item}
                collapsed={collapsed}
                isActive={isRouteActive(currentPath, item.to)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface SidebarNavItemProps {
  item: NavItem
  collapsed: boolean
  isActive: boolean
}

function SidebarNavItem({
  item,
  collapsed,
  isActive,
}: SidebarNavItemProps) {
  const Icon = item.icon

  const linkContent = (
    <Link
      to={item.to}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex min-h-11 items-center overflow-hidden rounded-2xl',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
        isActive
          ? 'bg-white text-slate-950 shadow-lg shadow-black/20'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
      )}
    >
      {/* Active indicator — only show when expanded */}
      {isActive && !collapsed && (
        <div
          className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-sky-400 transition-opacity duration-200 motion-reduce:transition-none"
        />
      )}

      {isActive && collapsed && (
        <div className="absolute inset-y-2 left-1 w-1 rounded-full bg-sky-400" aria-hidden="true" />
      )}

      {/* Icon */}
      <Icon
        style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }}
        className={cn(
          'shrink-0 transition-colors duration-200',
          isActive ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'
        )}
      />

      {/* Label - hidden when collapsed */}
      {!collapsed && (
        <span
          className={cn(
            'font-medium truncate transition-opacity duration-150 motion-reduce:transition-none',
            isActive ? 'text-slate-950' : 'text-slate-100'
          )}
          style={{ fontSize: 'var(--type-sm)' }}
        >
          {item.label}
        </span>
      )}

      {/* Hover effect */}
      {!isActive && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-400/10 to-emerald-300/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
      )}
    </Link>
  )

  // Wrap with tooltip when collapsed
  if (collapsed) {
    return (
      <Tooltip content={item.label} side="right">
        {linkContent}
      </Tooltip>
    )
  }

  return linkContent
}
