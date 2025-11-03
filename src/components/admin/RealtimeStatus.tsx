import { AlertCircle, Wifi, WifiOff } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface RealtimeStatusProps {
  isConnected: boolean
  error?: string | null
}

export function RealtimeStatus({ isConnected, error }: RealtimeStatusProps) {
  if (isConnected) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <Wifi className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          Live updates active
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="border-yellow-200 bg-yellow-50">
      <WifiOff className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="text-yellow-800">
        Live updates unavailable. Data refreshes automatically every 15 seconds.
        {error && <span className="block text-xs mt-1">{error}</span>}
      </AlertDescription>
    </Alert>
  )
}
