/**
 * AdminHeader Component - Header for admin dashboard
 * Shows user info, notifications, and quick actions
 * 
 * @requirements 6.1 - Admin dashboard layout
 */

import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileQuery } from '@/hooks/auth/useProfileQuery';
import { useSignOutAction } from '@/hooks/useSignOutAction';
import { useSidebar } from '@/contexts/SidebarContext';
import { useResponsive } from '@/hooks/useResponsive';
import { designTokens } from '@/design-system/tokens';
import {
  Bell,
  Search,
  Settings,
  User,
  LogOut,
  Menu,
  ChevronDown,
} from 'lucide-react';

interface AdminHeaderProps {
  className?: string;
}

export function AdminHeader({ className }: AdminHeaderProps) {
  const { user } = useAuth();
  const { signOut, isSigningOut } = useSignOutAction();
  const { profile } = useProfileQuery();
  const { collapsed, setCollapsed } = useSidebar();
  const { isMobile, isTablet } = useResponsive();
  const sidebarWidth = collapsed 
    ? designTokens.layout.sidebarCollapsed 
    : designTokens.layout.sidebarExpanded;

  // Calculate header offset based on device
  const getHeaderOffset = () => {
    if (isMobile) return 0;
    if (isTablet) return designTokens.layout.sidebarCollapsed;
    return sidebarWidth;
  };

  const headerOffset = getHeaderOffset();

  // Get display name with proper type handling
  const getDisplayName = (): string => {
    if (profile?.full_name && typeof profile.full_name === 'string') {
      return profile.full_name;
    }
    if (profile?.first_name && typeof profile.first_name === 'string') {
      return profile.first_name;
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'Admin';
  };

  const displayName = getDisplayName();
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30',
        'bg-card/80 backdrop-blur-xl border-b border-border',
        'transition-all duration-300 ease-in-out',
        className
      )}
      style={{
        left: headerOffset,
        height: designTokens.layout.headerHeight,
      }}
    >
      <div className="flex items-center justify-between h-full px-4 md:px-6">
        {/* Left side - Mobile menu toggle and search */}
        <div className="flex items-center gap-4">
          {/* Mobile menu toggle */}
          {isMobile && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5 text-muted-foreground" />
            </button>
          )}

          {/* Search bar - hidden on mobile */}
          {!isMobile && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search..."
                className={cn(
                  'pl-10 pr-4 py-2 rounded-lg',
                  'bg-muted/50 border border-border',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                  'transition-all duration-200',
                  'w-64 lg:w-80'
                )}
              />
            </div>
          )}
        </div>

        {/* Right side - Notifications and user menu */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Notifications */}
          <button
            className={cn(
              'relative p-2 rounded-lg',
              'hover:bg-accent active:scale-95 transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
            )}
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {/* Notification badge */}
            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
          </button>

          {/* Settings - hidden on mobile */}
          {!isMobile && (
            <Link
              to="/admin/settings"
              className={cn(
                'p-2 rounded-lg',
                'hover:bg-accent transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
              aria-label="Settings"
            >
              <Settings className="h-5 w-5 text-muted-foreground" />
            </Link>
          )}

          {/* User menu */}
          <div className="relative group">
            <button
              className={cn(
                'flex items-center gap-2 p-1.5 rounded-lg',
                'hover:bg-accent transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-white text-sm font-medium">{initials}</span>
              </div>
              
              {/* Name - hidden on mobile */}
              {!isMobile && (
                <>
                  <span className="text-sm font-medium text-foreground max-w-[120px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </>
              )}
            </button>

            {/* Dropdown menu */}
            <div className={cn(
              'absolute right-0 top-full mt-2 w-48',
              'bg-card border border-border rounded-lg shadow-lg',
              'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
              'transition-all duration-200',
              'z-50'
            )}>
              <div className="p-2">
                <Link
                  to="/admin/profile"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm"
                >
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </Link>
                <Link
                  to="/admin/settings"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm"
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
                <hr className="my-2 border-border" />
                <button
                  onClick={() => { void signOut() }}
                  disabled={isSigningOut}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-sm w-full"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default AdminHeader;
