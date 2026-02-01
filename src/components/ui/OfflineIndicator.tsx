// @ts-nocheck
/**
 * @deprecated This component is deprecated. Use OfflineIndicator from '@/components/pwa/OfflineIndicator' instead.
 * This file will be removed in a future version.
 * 
 * Migration:
 * - Replace `import { OfflineIndicator } from '@/components/ui/OfflineIndicator'`
 * - With `import { OfflineIndicator } from '@/components/pwa/OfflineIndicator'`
 * 
 * The PWA version provides better integration with the offline manager service.
 */

/**
 * Offline Status Indicator Component
 * Shows connection status and sync information
 * Requirements: 9.2 - Provide user feedback on offline status and sync progress
 * @deprecated Use OfflineIndicator from '@/components/pwa/OfflineIndicator' instead
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOffline } from '@/hooks/useOffline'
import { Button } from './Button'

interface OfflineIndicatorProps {
  className?: string
  showDetails?: boolean
}

export function OfflineIndicator({ className, showDetails = false }: OfflineIndicatorProps) {
  const { isOnline, syncStatus, isSyncing, syncNow, lastSyncResult } = useOffline()

  const handleSyncClick = async () => {
    if (!isSyncing && isOnline) {
      try {
        await syncNow()
      } catch (error) {
        console.error('Manual sync failed:', error)
      }
    }
  }

  const getStatusColor = () => {
    if (!isOnline) return 'text-red-500'
    if (syncStatus.errors > 0) return 'text-yellow-500'
    if (syncStatus.pending > 0) return 'text-blue-500'
    return 'text-green-500'
  }

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff className="w-4 h-4" />
    if (isSyncing) return <RefreshCw className="w-4 h-4 animate-spin" />
    if (syncStatus.errors > 0) return <AlertCircle className="w-4 h-4" />
    if (syncStatus.pending > 0) return <Cloud className="w-4 h-4" />
    return <CheckCircle className="w-4 h-4" />
  }

  const getStatusText = () => {
    if (!isOnline) return 'Offline'
    if (isSyncing) return 'Syncing...'
    if (syncStatus.errors > 0) return `${syncStatus.errors} sync errors`
    if (syncStatus.pending > 0) return `${syncStatus.pending} pending`
    return 'Online'
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <motion.div
        className={cn(
          'flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium transition-colors',
          'bg-white/10 backdrop-blur-sm border border-white/20',
          getStatusColor()
        )}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          animate={isSyncing ? { rotate: 360 } : { rotate: 0 }}
          transition={isSyncing ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0.2 }}
        >
          {getStatusIcon()}
        </motion.div>
        <span>{getStatusText()}</span>
      </motion.div>

      {showDetails && (
        <AnimatePresence>
          {(syncStatus.pending > 0 || syncStatus.errors > 0) && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center space-x-2"
            >
              {isOnline && !isSyncing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSyncClick}
                  className="h-8 px-3 text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Sync Now
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}