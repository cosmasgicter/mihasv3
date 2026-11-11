import React, { useState } from 'react'
import { Keyboard, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'

const shortcuts = [
  { keys: ['Ctrl', '→'], description: 'Next step' },
  { keys: ['Ctrl', '←'], description: 'Previous step' },
  { keys: ['Ctrl', 'S'], description: 'Save draft' },
  { keys: ['←', '→'], description: 'Navigate step indicators' },
  { keys: ['Home', 'End'], description: 'First / last step indicator' },
  { keys: ['Esc'], description: 'Close dialogs' }
]

export const KeyboardShortcutsHelp = () => {
  const [isOpen, setIsOpen] = useState(false)
  const focusTrapRef = useFocusTrap(isOpen)
  useEscapeKey(isOpen, () => setIsOpen(false))

  return (
    <>
      {/*
        44 x 44 (GATE-13.3-06, 13.6 §8.1 item L6; R16.2).

        Task 13.3 measured 40.000 x 44.000 at 1280 and 1440 — the height came from
        `size="sm"`'s own touch floor, the width did not. `lg:inline-flex` keeps it
        off mobile, so task 11.2's removal of the mobile floating controls (STU-03)
        is unaffected; this is the desktop remnant, now square at the minimum.
      */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 hidden min-h-touch min-w-touch shadow-lg lg:inline-flex"
        aria-label="Show keyboard shortcuts"
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-scrim/50 z-50 transition-opacity duration-300"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={focusTrapRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg shadow-md p-6 z-50 w-full max-w-md animate-scale-in"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Keyboard shortcuts
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-caption hover:text-foreground"
                aria-label="Close keyboard shortcuts"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              {shortcuts.map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-base sm:text-sm text-foreground">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, i) => (
                      <span key={i}>
                        <kbd data-text-role="caption" className="px-2 py-1 text-sm sm:text-xs font-semibold bg-muted border border-border rounded">
                          {key}
                        </kbd>
                        {i < shortcut.keys.length - 1 && (
                          <span className="mx-1 text-caption">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
