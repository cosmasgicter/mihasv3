/**
 * Breadcrumbs Component - Auto-generated breadcrumb navigation
 * 
 * Features:
 * - Auto-generates breadcrumb trail from route hierarchy
 * - Styled consistently with design system
 * - Accessible with proper ARIA attributes
 * 
 * @requirements 4.6 - Breadcrumb navigation on interior pages
 */

import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface BreadcrumbsProps {
  /** Custom breadcrumb items (overrides auto-generation) */
  items?: BreadcrumbItem[];
  /** Additional CSS classes */
  className?: string;
  /** Show home icon for first item */
  showHomeIcon?: boolean;
  /** Custom separator */
  separator?: React.ReactNode;
  /** Maximum items to show (truncates middle items) */
  maxItems?: number;
}

// Route label mappings for auto-generation
const ROUTE_LABELS: Record<string, string> = {
  '': 'Home',
  'student': 'Student',
  'admin': 'Admin',
  'auth': 'Authentication',
  'dashboard': 'Dashboard',
  'applications': 'Applications',
  'application-wizard': 'Application Wizard',
  'apply': 'Apply',
  'status': 'Status',
  'settings': 'Settings',
  'profile': 'Profile & Security',
  'notifications': 'Notifications',
  'programs': 'Programs',
  'intakes': 'Intakes',
  'users': 'Users',
  'analytics': 'Analytics',
  'ai-insights': 'AI Insights',
  'workflow': 'Workflow',
  'audit': 'Audit Trail',
  'roles': 'Role Management',
  'system-health': 'System Health',
  'track-application': 'Track Application',
  'signin': 'Sign In',
  'signup': 'Sign Up',
  'forgot-password': 'Forgot Password',
  'reset-password': 'Reset Password',
  'callback': 'Callback',
};

// Routes that should not show breadcrumbs
const EXCLUDED_ROUTES = ['/', '/auth/signin', '/auth/signup', '/auth/callback'];

/**
 * Generate breadcrumb items from current path
 */
function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [
    { label: 'Home', href: '/', icon: Home }
  ];

  let currentPath = '';
  
  for (const segment of segments) {
    currentPath += `/${segment}`;
    
    // Skip dynamic segments (like :id)
    if (segment.startsWith(':')) continue;
    
    // Check if segment looks like an ID (UUID or numeric)
    const isId = /^[0-9a-f-]{36}$/i.test(segment) || /^\d+$/.test(segment);
    if (isId) {
      items.push({
        label: 'Details',
        href: currentPath,
      });
      continue;
    }

    const label = ROUTE_LABELS[segment] || formatSegmentLabel(segment);
    items.push({
      label,
      href: currentPath,
    });
  }

  return items;
}

/**
 * Format a URL segment into a readable label
 */
function formatSegmentLabel(segment: string): string {
  return segment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Truncate breadcrumbs if they exceed maxItems
 */
function truncateBreadcrumbs(items: BreadcrumbItem[], maxItems: number): BreadcrumbItem[] {
  if (items.length <= maxItems) return items;
  
  const firstItem = items[0]!;
  const lastItems = items.slice(-(maxItems - 2));
  
  return [
    firstItem,
    { label: '...', href: '#' },
    ...lastItems,
  ];
}

export function Breadcrumbs({
  items: customItems,
  className,
  showHomeIcon = true,
  separator,
  maxItems = 5,
}: BreadcrumbsProps) {
  const location = useLocation();
  
  // Check if breadcrumbs should be shown
  const shouldShow = !EXCLUDED_ROUTES.includes(location.pathname);
  
  // Generate or use custom items
  const breadcrumbItems = useMemo(() => {
    const items = customItems || generateBreadcrumbs(location.pathname);
    return truncateBreadcrumbs(items, maxItems);
  }, [customItems, location.pathname, maxItems]);

  // Don't render if on excluded route or only home
  if (!shouldShow || breadcrumbItems.length <= 1) {
    return null;
  }

  const defaultSeparator = (
    <ChevronRight 
      className="h-4 w-4 text-muted-foreground flex-shrink-0" 
      aria-hidden="true" 
    />
  );

  return (
    <nav 
      aria-label="Breadcrumb" 
      className={cn('py-3 px-4 sm:px-6 lg:px-8', className)}
    >
      <ol 
        className="flex items-center flex-wrap gap-1 sm:gap-2 text-sm"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          const isFirst = index === 0;
          const Icon = item.icon;
          const isEllipsis = item.label === '...';

          return (
            <li 
              key={item.href + index}
              className="flex items-center gap-1 sm:gap-2"
              itemProp="itemListElement"
              itemScope
              itemType="https://schema.org/ListItem"
            >
              {/* Separator (not for first item) */}
              {!isFirst && (
                <span className="flex-shrink-0">
                  {separator || defaultSeparator}
                </span>
              )}

              {/* Breadcrumb item */}
              {isEllipsis ? (
                <span 
                  className="text-muted-foreground px-1"
                  aria-hidden="true"
                >
                  {item.label}
                </span>
              ) : isLast ? (
                <span 
                  className={cn(
                    'font-medium text-foreground',
                    'flex items-center gap-1.5'
                  )}
                  aria-current="page"
                  itemProp="name"
                >
                  {isFirst && showHomeIcon && Icon && (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">{item.label}</span>
                  {isFirst && <span className="sm:hidden">{item.label}</span>}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    'transition-colors duration-200',
                    'flex items-center gap-1.5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded',
                    'min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0',
                    'flex items-center justify-center sm:justify-start'
                  )}
                  itemProp="item"
                >
                  {isFirst && showHomeIcon && Icon && (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span 
                    className={cn(
                      isFirst ? 'hidden sm:inline' : ''
                    )}
                    itemProp="name"
                  >
                    {item.label}
                  </span>
                </Link>
              )}
              
              <meta itemProp="position" content={String(index + 1)} />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * BreadcrumbsContainer - Wrapper with consistent styling
 */
interface BreadcrumbsContainerProps {
  children?: React.ReactNode;
  className?: string;
}

export function BreadcrumbsContainer({ 
  children, 
  className 
}: BreadcrumbsContainerProps) {
  return (
    <div 
      className={cn(
        'bg-card/50 border-b border-border/50',
        '',
        className
      )}
    >
      <div className="container mx-auto max-w-7xl">
        {children || <Breadcrumbs />}
      </div>
    </div>
  );
}

export default Breadcrumbs;
