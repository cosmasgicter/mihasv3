import React from 'react'
import { Check, Clock, Wifi, WifiOff, AlertCircle } from 'lucide-react'

interface SaveStatusProps {
  isSaving: boolean
  lastSaved: Date | null
  isOnline: boolean
  pendingChanges: boolean
  error?: string
}

export function SaveStatus({ isSaving, lastSaved, isOnline, pendingChanges, error }: SaveStatusProps) {
  const getStatusIcon = () => {
    if (error) return <AlertCircle className="h-4 w-4 text-red-500" />
    if (isSaving) return <Clock className="h-4 w-4 text-blue-500 animate-spin" />
    if (!isOnline) return <WifiOff className="h-4 w-4 text-orange-500" />
    if (lastSaved) return <Check className="h-4 w-4 text-green-500" />
    return <Clock className="h-4 w-4 text-gray-400" />
  }

  const getStatusText = () => {
    if (error) return `Error: ${error}`
    if (isSaving) return 'Saving...'
    if (!isOnline && pendingChanges) return 'Offline - changes will sync when connected'
    if (!isOnline) return 'Offline'
    if (lastSaved) return `Saved ${formatTime(lastSaved)}`
    return 'Not saved'
  }

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      {getStatusIcon()}
      <span>{getStatusText()}</span>
    </div>
  )
}