import { useState } from 'react'
import { FileText, Plus, Trash2, Edit2, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { animateClasses, staggerChild } from '@/lib/animations'
import { useMultiDraft } from '../hooks/useMultiDraft'

interface DraftManagerProps {
  userId: string | undefined
  currentDraftId?: string
  onLoadDraft: (draftData: any, draftId: string) => void
  onCreateNew: () => void
}

export const DraftManager = ({ userId, currentDraftId, onLoadDraft, onCreateNew }: DraftManagerProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newDraftName, setNewDraftName] = useState('')
  
  const { drafts, loading, createDraft, renameDraft, deleteDraft, loadDraft } = useMultiDraft(userId)

  const handleCreateDraft = async () => {
    if (!newDraftName.trim()) return
    try {
      const draft = await createDraft(newDraftName, {})
      if (draft) {
        setNewDraftName('')
        onCreateNew()
      }
    } catch (error) {
      console.error('Failed to create draft:', error)
    }
  }

  const handleLoadDraft = async (draftId: string) => {
    try {
      const data = await loadDraft(draftId)
      if (data) {
        onLoadDraft(data, draftId)
        setIsOpen(false)
      }
    } catch (error) {
      console.error('Failed to load draft:', error)
    }
  }

  const handleRename = async (draftId: string) => {
    if (!editName.trim()) return
    try {
      await renameDraft(draftId, editName)
      setEditingId(null)
      setEditName('')
    } catch (error) {
      console.error('Failed to rename draft:', error)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed top-20 right-4 z-40 shadow-lg"
      >
        <FileText className="h-4 w-4 mr-2" />
        Drafts ({drafts.length})
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50 transition-opacity duration-300"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed top-0 right-0 h-full w-full max-w-md bg-card border-l border-border shadow-xl z-50 overflow-y-auto animate-slide-in-right"
            style={{ animation: 'slideInRight 300ms ease-out' }}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  My Drafts
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-caption hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDraftName}
                    onChange={(e) => setNewDraftName(e.target.value)}
                    placeholder="New draft name..."
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateDraft()}
                  />
                  <Button
                    type="button"
                    onClick={handleCreateDraft}
                    disabled={!newDraftName.trim()}
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-4 sm:py-8 text-caption">Loading drafts...</div>
              ) : drafts.length === 0 ? (
                <div className="text-center py-4 sm:py-8 text-caption">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No drafts yet</p>
                  <p className="text-xs mt-1">Create a new draft to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {drafts.map((draft, index) => (
                    <div
                      key={draft.id}
                      className={`border rounded-lg p-4 ${animateClasses.slideUp} ${
                        draft.id === currentDraftId
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card'
                      }`}
                      style={staggerChild(index)}
                    >
                      {editingId === draft.id ? (
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 rounded border border-input px-2 py-1 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(draft.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleRename(draft.id)}
                          >
                            Save
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-medium text-foreground">{draft.draft_name}</h3>
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingId(draft.id)
                                setEditName(draft.draft_name)
                              }}
                              className="text-caption hover:text-foreground p-1"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await deleteDraft(draft.id)
                                } catch (error) {
                                  console.error('Failed to delete draft:', error)
                                }
                              }}
                              className="text-caption hover:text-destructive p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 text-xs text-caption mb-3">
                        <Clock className="h-3 w-3" />
                        <span>Updated {formatDate(draft.updated_at)}</span>
                      </div>

                      {draft.id !== currentDraftId && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadDraft(draft.id)}
                          className="w-full"
                        >
                          Load Draft
                        </Button>
                      )}
                      {draft.id === currentDraftId && (
                        <div className="text-xs text-primary font-medium text-center">
                          Currently Active
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
