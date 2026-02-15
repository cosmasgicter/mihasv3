import { useState } from 'react'
import { Keyboard, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const shortcuts = [
  { keys: ['Ctrl', '→'], description: 'Next step' },
  { keys: ['Ctrl', '←'], description: 'Previous step' },
  { keys: ['Ctrl', 'S'], description: 'Save draft' },
  { keys: ['Esc'], description: 'Close dialogs' }
]

export const KeyboardShortcutsHelp = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 shadow-lg"
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50 transition-opacity duration-300"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-lg shadow-xl p-6 z-50 w-full max-w-md animate-scale-in"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-caption hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              {shortcuts.map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-900">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, i) => (
                      <span key={i}>
                        <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
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
