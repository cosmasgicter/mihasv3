import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { useDraftManager } from '@/hooks/useDraftManager'
import { clearAllDraftData, hasDraftData } from '@/lib/draftCleanup'

export function DraftDeletionTest() {
  const { deleteDraft, clearAllDrafts, isDeleting } = useDraftManager()
  const [hasDrafts, setHasDrafts] = useState(false)

  useEffect(() => {
    checkForDrafts()
    
    // Listen for draft cleared events
    const handleDraftCleared = () => {
      checkForDrafts()
    }
    
    window.addEventListener('draftCleared', handleDraftCleared)
    window.addEventListener('storage', checkForDrafts)
    
    return () => {
      window.removeEventListener('draftCleared', handleDraftCleared)
      window.removeEventListener('storage', checkForDrafts)
    }
  }, [])

  const checkForDrafts = () => {
    setHasDrafts(hasDraftData())
  }

  const createTestDraft = () => {
    localStorage.setItem('applicationWizardDraft', JSON.stringify({
      currentStep: 1,
      formData: { test: 'data' },
      savedAt: new Date().toISOString()
    }))
    checkForDrafts()
  }

  const handleDeleteDraft = async () => {
    await deleteDraft(
      () => {
        checkForDrafts()
      },
      (error) => {
        console.error('Draft deletion failed:', error)
      }
    )
  }

  const handleClearAll = async () => {
    await clearAllDrafts(
      () => {
        checkForDrafts()
      },
      (error) => {
        console.error('Clear all failed:', error)
      }
    )
  }

  const handleManualClear = () => {
    clearAllDraftData()
    checkForDrafts()
  }

  return (
    <div className="p-6 border rounded-lg space-y-4">
      <h3 className="text-lg font-semibold">Draft Deletion Test</h3>
      
      <div className="space-y-2">
        <p>Has drafts: {hasDrafts ? 'Yes' : 'No'}</p>
        <p>Is deleting: {isDeleting ? 'Yes' : 'No'}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={createTestDraft} variant="outline">
          Create Test Draft
        </Button>
        
        <Button 
          onClick={handleDeleteDraft} 
          disabled={isDeleting || !hasDrafts}
          variant="outline"
        >
          Delete Draft (Hook)
        </Button>
        
        <Button 
          onClick={handleClearAll} 
          disabled={isDeleting || !hasDrafts}
          variant="outline"
        >
          Clear All Drafts (Hook)
        </Button>
        
        <Button 
          onClick={handleManualClear} 
          disabled={!hasDrafts}
          variant="outline"
        >
          Manual Clear
        </Button>
        
        <Button onClick={checkForDrafts} variant="outline">
          Refresh Status
        </Button>
      </div>
    </div>
  )
}