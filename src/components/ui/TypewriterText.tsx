import React, { useState, useEffect } from 'react'

interface TypewriterTextProps {
  text: string
  delay?: number
  speed?: number
  className?: string
  showCursor?: boolean
  onComplete?: () => void
}

function TypewriterText({
  text,
  delay = 0,
  speed = 50,
  className = '',
  showCursor = true,
  onComplete
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (delay > 0) {
      const delayTimer = setTimeout(() => {
        setStarted(true)
      }, delay)
      return () => clearTimeout(delayTimer)
    } else {
      setStarted(true)
    }
  }, [delay])

  useEffect(() => {
    if (!started) return

    setDisplayedText('')
    let i = 0
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.slice(0, i + 1))
        i++
      } else {
        clearInterval(timer)
        onComplete?.()
      }
    }, speed)

    return () => clearInterval(timer)
  }, [text, speed, started, onComplete])

  return (
    <div className={className}>
      <span>{displayedText}</span>
      {showCursor && (
        <span
          className="inline-block w-0.5 h-1em bg-current ml-1 animate-[blink_1s_linear_infinite]"
        >
          |
        </span>
      )}
    </div>
  )
}

export { TypewriterText }
export default TypewriterText
