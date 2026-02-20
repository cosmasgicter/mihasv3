/**
 * AdminMobileNav Component - Mobile bottom navigation for admin
 * Provides quick access to main admin sections on mobile devices
 * Uses CSS transitions instead of framer-motion for performance.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 * @requirements 6.7 - Tablet-responsive behavior
 * @requirements 9.7 - Bottom navigation for mobile
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
} from 'lucide-react';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const mobileNavItems: NavItem[] = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/applications', icon: FileText, label: 'Apps' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
];

interface AdminMobileNavProps {
  className?: string;
}

export function AdminMobileNav({ className }: AdminMobileNavProps) {
  const location = useLocation();

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 md:hidden',
        'bg-card/95 backdrop-blur-xl border-t border-border',
        'safe-area-bottom',
        className
      )}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to || 
            (item.to !== '/admin/dashboard' && location.pathname.startsWith(item.to));

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'relative flex flex-col items-center justify-center',
                'w-16 h-14 rounded-xl',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                'active:scale-90 transition-transform motion-reduce:transform-none',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Active indicator */}
              {isActive && (
                <div
                  className="absolute -top-1 w-8 h-1 bg-primary rounded-full transition-opacity duration-200 motion-reduce:transition-none"
                />
              )}

              {/* Icon */}
              <Icon
                className={cn(
                  'h-5 w-5 mb-1',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              />

              {/* Label */}
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default AdminMobileNav;
