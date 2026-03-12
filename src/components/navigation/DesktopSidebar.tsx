import React, { useState, useCallback } from 'react'
import { Home, FileText, Bell, LayoutDashboard, Users, ChevronLeft, ChevronRight, ChevronDown, GraduationCap, Calendar, Settings, FileSearch, CreditCard } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/contexts/SidebarContext'
import { Tooltip } from '@/components/ui/tooltip'
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
  { to: '/student/application-wizard', icon: FileText, label: 'Application' },
  { to: '/student/payment', icon: CreditCard, label: 'Payment' },
  { to: '/student/interview', icon: Calendar, label: 'Interview' },
  { to: '/student/notifications', icon: Bell, label: 'Notifications' },
  { to: '/student/settings', icon: Settings, label: 'Settings' },
]

const isRouteActive = (currentPath: string, itemPath: string) => {
  if (itemPath === '/student/application-wizard') {
    return currentPath === '/student/application-wizard' || currentPath === '/apply'
  }

  return currentPath === itemPath
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
      className="hidden md:flex flex-col fixed left-0 top-0 h-screen bg-gradient-to-b from-card via-card to-muted/70 backdrop-blur-xl border-r border-border/80 shadow-xl z-40 transition-all duration-300 ease-in-out"
      style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-expanded)' }}
    >
      {/* Header / Logo area */}
      <div className={cn(
        'border-b border-border/80 py-4 transition-all duration-300',
        collapsed ? 'px-2' : 'px-3'
      )}>
        <div className={cn(
          'flex items-center rounded-2xl bg-white/70 shadow-sm ring-1 ring-border/60 transition-all duration-300',
          collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-3'
        )} role="img" aria-label="Mukuba Institute of Health and Allied Sciences logo">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0 shadow-md" aria-hidden="true">
            <span className="text-white font-bold text-sm">MI</span>
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary/80">Portal</p>
              <span className="block text-base font-bold text-foreground truncate transition-opacity duration-200 motion-reduce:transition-none">
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
              'h-8 w-8 rounded-full border border-border/70 bg-card shadow-sm',
              'flex items-center justify-center hover:bg-accent transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
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
        'flex-1 overflow-y-auto py-4 space-y-2',
        collapsed ? 'px-1.5' : 'px-2'
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
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
        'border-t border-border/80',
        collapsed ? 'p-2' : 'p-4'
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-3 text-xs text-muted-foreground shadow-sm ring-1 ring-border/60 transition-opacity duration-200 motion-reduce:transition-none">
            <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse motion-reduce:animate-none" />
            <div>
              <p className="font-semibold text-foreground">System online</p>
              <p className="text-[11px] text-muted-foreground">Admissions workspace ready</p>
            </div>
          </div>
        ) : (
          <Tooltip content="System Online" side="right">
            <div className="flex justify-center transition-opacity duration-200 motion-reduce:transition-none" role="status">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-sm ring-1 ring-border/60">
                <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse motion-reduce:animate-none" aria-hidden="true" />
              </div>
              <span className="sr-only">System Online</span>
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
  const hasActiveItem = section.items.some(item => currentPath === item.to)

  return (
    <div className="mb-2">
      {/* Section header - only show when not collapsed */}
      {!collapsed && (
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]',
            'text-muted-foreground hover:text-foreground transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg',
            hasActiveItem && 'text-primary'
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
        <div className="mx-3 my-1 border-t border-border/40" />
      )}

      {/* Section items */}
      {(collapsed || expanded) && (
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none',
            !collapsed && 'pl-2'
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
        'relative flex items-center rounded-2xl group overflow-hidden',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
        isActive
          ? 'bg-primary text-primary-foreground shadow-md'
          : 'text-muted-foreground hover:bg-white/80 hover:text-foreground'
      )}
    >
      {/* Active indicator — only show when expanded */}
      {isActive && !collapsed && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full transition-opacity duration-200 motion-reduce:transition-none"
        />
      )}

      {/* Icon */}
      <Icon
        style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }}
        className={cn(
          'shrink-0 transition-colors duration-200',
          isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'
        )}
      />

      {/* Label - hidden when collapsed */}
      {!collapsed && (
        <span
          className={cn(
            'font-medium truncate transition-opacity duration-150 motion-reduce:transition-none',
            isActive ? 'text-primary-foreground' : 'text-foreground'
          )}
          style={{ fontSize: 'var(--type-sm)' }}
        >
          {item.label}
        </span>
      )}

      {/* Hover effect */}
      {!isActive && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl" />
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
