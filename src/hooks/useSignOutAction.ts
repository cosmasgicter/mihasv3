import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

let activeSignOutPromise: Promise<void> | null = null
const signOutListeners = new Set<(isSigningOut: boolean) => void>()

function notifySignOutListeners() {
  const isSigningOut = activeSignOutPromise !== null
  signOutListeners.forEach(listener => listener(isSigningOut))
}

export function useSignOutAction() {
  const { signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(activeSignOutPromise !== null)

  useEffect(() => {
    signOutListeners.add(setIsSigningOut)
    return () => {
      signOutListeners.delete(setIsSigningOut)
    }
  }, [])

  const triggerSignOut = useCallback(async () => {
    if (activeSignOutPromise) {
      return activeSignOutPromise
    }

    activeSignOutPromise = (async () => {
      notifySignOutListeners()
      try {
        await signOut()
      } finally {
        activeSignOutPromise = null
        notifySignOutListeners()
      }
    })()

    return activeSignOutPromise
  }, [signOut])

  return {
    signOut: triggerSignOut,
    isSigningOut,
  }
}
