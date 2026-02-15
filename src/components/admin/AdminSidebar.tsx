/**
 * AdminSidebar Component - Enhanced admin navigation sidebar
 * Implements collapsible sidebar with icons, labels, and section grouping
 * 
 * @requirements 6.1 - Sidebar navigation layout with collapsible sections
 * @requirements 6.7 - Tablet-responsive behavior
 */

import React, { useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/SidebarContext';
import { designTokens } from '@/design-system/tokens';
import {
  LayoutDashboard,
  FileText,
  Users,
  GraduationCap,
  Calendar,
  BarChart3,
  Brain,
  Workflow,
  TrendingUp,
  Shield,
  FileSearch,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Activity,
  Bell,
  Database,
  Gauge,
  PieChart,
  LineChart,
} from 'lucide-react';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
}

interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
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
    id: 'analytics',
    title: 'Analytics & Insights',
    items: [
      { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/admin/ai-insights', icon: Brain, label: 'AI Insights' },
      { to: '/admin/predictive-analytics', icon: LineChart, label: 'Predictive' },
      { to: '/admin/realtime-metrics', icon: Activity, label: 'Real-time' },
    ],
  },
  {
    id: 'automation',
    title: 'Automation & Flow',
    items: [
      { to: '/admin/workflow', icon: Workflow, label: 'Workflow' },
      { to: '/admin/flow-analysis', icon: TrendingUp, label: 'Flow Analysis' },
    ],
  },
  {
    id: 'system',
    title: 'System',
    items: [
      { to: '/admin/roles', icon: Shield, label: 'Roles' },
      { to: '/admin/audit', icon: FileSearch, label: 'Audit Trail' },
      { to: '/admin/system-health', icon: Gauge, label: 'System Health' },
      { to: '/admin/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

interface AdminSidebarProps {
  className?: string;
}

export function AdminSidebar({ className }: AdminSidebarProps) {
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebar();
  
  // Track which sections are expanded (all expanded by default)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(adminSections.map(s => s.id))
  );

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const sidebarWidth = collapsed 
    ? designTokens.layout.sidebarCollapsed 
    : designTokens.layout.sidebarExpanded;

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col fixed left-0 top-0 h-screen',
        'bg-card/95 backdrop-blur-xl border-r border-border shadow-xl z-40',
        'transition-all duration-300 ease-in-out',
        className
      )}
      style={{ width: sidebarWidth }}
    >
      {/* Header with logo and collapse toggle */}
      <div className={cn(
        "flex items-center p-4 border-b border-border min-h-[64px]",
        collapsed ? "flex-col gap-2 justify-center" : "justify-between"
      )}>
        {/* Logo - always visible */}
        <div className={cn(
          "flex items-center",
          collapsed ? "justify-center" : "gap-2"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary",
            "flex items-center justify-center shrink-0"
          )}>
            <span className="text-white font-bold text-sm">M</span>
          </div>
          
          {/* Text - only when expanded */}
          {!collapsed && (
            <span
              className="text-lg font-bold text-foreground truncate transition-opacity duration-200"
            >
              MIHAS Admin
            </span>
          )}
        </div>
        
        {/* Toggle button - centered below logo when collapsed */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'p-2 rounded-lg hover:bg-accent transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {adminSections.map((section) => (
          <SidebarSection
            key={section.id}
            section={section}
            collapsed={collapsed}
            expanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            currentPath={location.pathname}
          />
        ))}
      </nav>

      {/* Footer with system status */}
      <div className="p-4 border-t border-border">
        {!collapsed ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground transition-opacity duration-200">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span>System Online</span>
          </div>
        ) : (
          <div className="flex justify-center transition-opacity duration-200">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          </div>
        )}
      </div>
    </aside>
  );
}

interface SidebarSectionProps {
  section: NavSection;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  currentPath: string;
}

function SidebarSection({
  section,
  collapsed,
  expanded,
  onToggle,
  currentPath,
}: SidebarSectionProps) {
  // Check if any item in this section is active
  const hasActiveItem = section.items.some(item => currentPath === item.to);

  return (
    <div className="mb-2">
      {/* Section header - only show when not collapsed */}
      {!collapsed && (
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider',
            'text-muted-foreground hover:text-foreground transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg',
            hasActiveItem && 'text-primary'
          )}
        >
          <span>{section.title}</span>
          <div
            className="transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            <ChevronDown className="h-4 w-4" />
          </div>
        </button>
      )}

      {/* Section items */}
      {(collapsed || expanded) && (
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            !collapsed && !expanded && 'max-h-0 opacity-0',
          )}
        >
          <div className={cn('space-y-1', !collapsed && 'pl-2')}>
            {section.items.map((item) => (
              <SidebarNavItem
                key={item.to}
                item={item}
                collapsed={collapsed}
                isActive={currentPath === item.to}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface SidebarNavItemProps {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
}

function SidebarNavItem({
  item,
  collapsed,
  isActive,
}: SidebarNavItemProps) {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 px-3 py-2.5 rounded-lg group overflow-hidden',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        collapsed && 'justify-center',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
      title={collapsed ? item.label : undefined}
    >
      {/* Active indicator */}
      {isActive && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full"
        />
      )}

      {/* Icon */}
      <Icon
        className={cn(
          'h-5 w-5 shrink-0 transition-colors duration-200',
          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
        )}
      />

      {/* Label - hidden when collapsed */}
      {!collapsed && (
        <span
          className={cn(
            'text-sm font-medium truncate transition-opacity duration-150',
            isActive ? 'text-primary' : 'text-foreground'
          )}
        >
          {item.label}
        </span>
      )}

      {/* Hover effect */}
      {!isActive && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg" />
      )}
    </Link>
  );
}

export default AdminSidebar;
