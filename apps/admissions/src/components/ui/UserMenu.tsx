import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { User, LogOut, ChevronDown, Shield } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useSignOutAction } from '@/hooks/useSignOutAction'
import { useToastStore } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const { signOut, isSigningOut } = useSignOutAction()
  const toast = useToastStore()
  const menuRef = useRef<HTMLDivElement>(null)
  
  const fullName = profile?.full_name || user?.full_name || 'User'
  const firstName = fullName.split(' ')[0] || 'User'

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Requirements: 13.1, 13.2, 13.3, 13.4 - Improve Logout Performance
  const handleSignOut = async () => {
    setIsOpen(false)
    try {
      await signOut()
      toast.success('Signed out', 'You have been signed out successfully.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.'
      toast.error('Sign out failed', message)
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 hover:bg-muted"
        data-testid="user-menu-trigger"
        aria-label={`User menu for ${firstName}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {profile?.avatar_url && !avatarError ? (
          <img
            src={profile.avatar_url}
            alt={`Profile photo for ${fullName}`}
            className="w-8 h-8 rounded-full border border-border"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
        )}
        <span className="hidden md:block text-sm font-medium text-foreground truncate max-w-[120px]">
          {firstName}
        </span>
        <ChevronDown className={cn(
          "w-4 h-4 text-foreground transition-transform",
          isOpen && "rotate-180"
        )} />
      </Button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-card rounded-lg shadow-2xl border border-border py-1 z-[110]"
          data-testid="user-menu-dropdown"
        >
          <div className="px-4 py-2 border-b border-border">
            <p className="text-sm font-medium text-foreground truncate" title={fullName}>
              {fullName}
            </p>
            <p className="text-xs text-muted-foreground break-all" title={user?.email}>{user?.email}</p>
          </div>
          
          <Link
            to="/student/settings"
            className="flex items-center px-4 py-2 text-sm text-foreground hover:bg-muted"
            onClick={() => setIsOpen(false)}
          >
            <Shield className="w-4 h-4 mr-3" />
            Profile & Security
          </Link>
          
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="flex items-center w-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-4 h-4 mr-3" />
            {isSigningOut ? 'Signing Out...' : 'Sign Out'}
          </button>
        </div>
      )}
    </div>
  )
}
