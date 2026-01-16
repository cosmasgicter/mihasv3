/**
 * AdminMobileNav Component - Mobile bottom navigation for admin
 * Provides quick access to main admin sections on mobile devices
 * 
 * @requirements 6.7 - Tablet-responsive behavior
 * @requirements 9.7 - Bottom navigation for mobile
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
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
  { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
];

interface AdminMobileNavProps {
  className?: string;
}

export function AdminMobileNav({ className }: AdminMobileNavProps) {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

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
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="mobileActiveIndicator"
                  className="absolute -top-1 w-8 h-1 bg-primary rounded-full"
                  initial={prefersReducedMotion ? {} : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                />
              )}

              {/* Icon */}
              <motion.div
                whileTap={prefersReducedMotion ? {} : { scale: 0.9 }}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 mb-1',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
              </motion.div>

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
