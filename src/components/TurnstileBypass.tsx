import React from 'react'

interface TurnstileBypassProps {
  onVerify: (token: string) => void
  className?: string
}

export default function TurnstileBypass({ onVerify, className }: TurnstileBypassProps) {
  React.useEffect(() => {
    // Auto-verify in test mode
    if (import.meta.env.VITE_TEST_MODE) {
      onVerify('test-token')
    }
  }, [onVerify])

  if (import.meta.env.VITE_TEST_MODE) {
    return <div className={className} data-testid="turnstile-bypass">Test Mode - Captcha Bypassed</div>
  }

  return null
}