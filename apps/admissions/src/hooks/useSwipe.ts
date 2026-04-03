import { useState, useEffect, TouchEvent } from 'react'

interface SwipeInput {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  minSwipeDistance?: number
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  minSwipeDistance = 50
}: SwipeInput) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null)

  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null)
    setTouchStart({
      x: e.targetTouches[0]!.clientX,
      y: e.targetTouches[0]!.clientY
    })
  }

  const onTouchMove = (e: TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0]!.clientX,
      y: e.targetTouches[0]!.clientY
    })
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distanceX = touchStart.x - touchEnd.x
    const distanceY = touchStart.y - touchEnd.y
    const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY)

    if (isHorizontalSwipe) {
      if (distanceX > minSwipeDistance) {
        onSwipeLeft?.()
      } else if (distanceX < -minSwipeDistance) {
        onSwipeRight?.()
      }
    } else {
      if (distanceY > minSwipeDistance) {
        onSwipeUp?.()
      } else if (distanceY < -minSwipeDistance) {
        onSwipeDown?.()
      }
    }
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd
  }
}
