import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { User, Settings, LogOut, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const { user, signOut } = useAuth()
  const menuRef = useRef<HTMLDivElement>(null)
  
  const fullName = user?.user_metadata?.full_name || 'User'
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

  const handleSignOut = async () => {
    setIsOpen(false)
    await signOut()
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 hover:bg-muted"
        data-testid="user-menu-trigger"
      >
        {user?.user_metadata?.avatar_url ? (
          <img
            src={user.user_metadata.avatar_url}
            alt="Profile"
            className="w-8 h-8 rounded-full border border-border"
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
            to="/profile"
            className="flex items-center px-4 py-2 text-sm text-foreground hover:bg-muted"
            onClick={() => setIsOpen(false)}
          >
            <User className="w-4 h-4 mr-3" />
            Profile
          </Link>
          
          <Link
            to="/settings"
            className="flex items-center px-4 py-2 text-sm text-foreground hover:bg-muted"
            onClick={() => setIsOpen(false)}
          >
            <Settings className="w-4 h-4 mr-3" />
            Settings
          </Link>
          
          <button
            onClick={handleSignOut}
            className="flex items-center w-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}