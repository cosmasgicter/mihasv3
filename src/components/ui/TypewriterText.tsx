import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface TypewriterTextProps {
  text: string
  delay?: number
  speed?: number
  className?: string
  showCursor?: boolean
}

function TypewriterText({
  text,
  delay = 0,
  speed = 100,
  className = '',
  showCursor = true
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
      }
    }, speed)

    return () => clearInterval(timer)
  }, [text, speed, started])

  return (
    <div className={className}>
      <span>{displayedText}</span>
      {showCursor && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="inline-block w-0.5 h-1em bg-current ml-1"
        >
          |
        </motion.span>
      )}
    </div>
  )
}

export { TypewriterText }
export default TypewriterText