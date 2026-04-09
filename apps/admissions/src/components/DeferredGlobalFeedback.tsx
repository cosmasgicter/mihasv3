import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { ToastContainer } from '@/components/ui/Toast'

export function DeferredGlobalFeedback() {
  return (
    <>
      <OfflineBanner />
      <ToastContainer />
    </>
  )
}

export default DeferredGlobalFeedback
