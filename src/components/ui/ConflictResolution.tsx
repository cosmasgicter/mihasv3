import React from 'react'
import { Button } from './Button'
import { AlertTriangle, Clock, Merge } from 'lucide-react'

interface ConflictResolutionProps {
  isOpen: boolean
  onClose: () => void
  onUseLocal: () => void
  onUseServer: () => void
  onMerge?: () => void
  localTimestamp: Date
  serverTimestamp: Date
}

export function ConflictResolution({
  isOpen,
  onClose,
  onUseLocal,
  onUseServer,
  onMerge,
  localTimestamp,
  serverTimestamp
}: ConflictResolutionProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <h3 className="text-lg font-semibold">Sync Conflict Detected</h3>
        </div>
        
        <p className="text-gray-600 mb-6">
          Your application has been modified elsewhere. Choose which version to keep:
        </p>
        
        <div className="space-y-3 mb-6">
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="font-medium">Your Local Changes</span>
            </div>
            <p className="text-sm text-gray-600">
              Last modified: {localTimestamp.toLocaleString()}
            </p>
          </div>
          
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-green-500" />
              <span className="font-medium">Server Version</span>
            </div>
            <p className="text-sm text-gray-600">
              Last modified: {serverTimestamp.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className="flex flex-col gap-2">
          <Button onClick={onUseLocal} className="w-full">
            Keep My Changes
          </Button>
          <Button onClick={onUseServer} variant="outline" className="w-full">
            Use Server Version
          </Button>
          {onMerge && (
            <Button onClick={onMerge} variant="outline" className="w-full">
              <Merge className="h-4 w-4 mr-2" />
              Try to Merge
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}