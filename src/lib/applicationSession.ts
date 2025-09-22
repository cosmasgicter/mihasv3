import { supabase } from './supabase'
import { ApplicationFormData } from '@/forms/applicationSchema'
import { sanitizeForLog, safeJsonParse } from './sanitize'
import { getSecureId } from './security'

export interface ApplicationDraft {
  id?: string
  user_id: string
  form_data: Partial<ApplicationFormData>
  current_step: number
  uploaded_files: any[]
  selected_subjects?: any[]
  version: number
  expires_at: string
  last_saved_at: string
  session_id: string
}

export interface SessionWarning {
  type: 'timeout' | 'expiry'
  message: string
  timeRemaining: number
  canExtend: boolean
}

// Constants for configuration
const AUTO_SAVE_INTERVAL = 10000 // 10 seconds
const SESSION_WARNING_TIME = 25 * 60 * 1000 // 25 minutes
const SESSION_EXPIRY_TIME = 30 * 60 * 1000 // 30 minutes
const DRAFT_STORAGE_KEYS = [
  'applicationDraft',
  'applicationWizardDraft',
  'applicationDraftOffline',
  'draftFormData',
  'wizardFormData'
]
const SESSION_STORAGE_KEYS = [
  'applicationDraft',
  'applicationWizardDraft'
]

class ApplicationSessionManager {
  private sessionId: string
  private saveInterval: NodeJS.Timeout | null = null
  private warningTimeout: NodeJS.Timeout | null = null
  private expiryTimeout: NodeJS.Timeout | null = null
  private onWarning?: (warning: SessionWarning) => void
  private onExpiry?: () => void

  constructor() {
    this.sessionId = getSecureId()
  }

  // Initialize session management
  initialize(onWarning?: (warning: SessionWarning) => void, onExpiry?: () => void) {
    this.onWarning = onWarning
    this.onExpiry = onExpiry
    this.setupAutoSave()
    this.setupSessionWarnings()
  }

  // Setup automatic saving every 10 seconds
  private setupAutoSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval)
    }
    
    this.saveInterval = setInterval(() => {
      this.autoSaveDraft()
    }, AUTO_SAVE_INTERVAL)
  }

  // Setup session timeout warnings
  private setupSessionWarnings() {
    // Warning at 5 minutes before expiry
    this.warningTimeout = setTimeout(() => {
      this.onWarning?.({
        type: 'timeout',
        message: 'Your session will expire in 5 minutes. Save your progress to avoid losing data.',
        timeRemaining: 5 * 60 * 1000,
        canExtend: true
      })
    }, SESSION_WARNING_TIME)

    // Expiry at 30 minutes
    this.expiryTimeout = setTimeout(() => {
      this.handleSessionExpiry()
    }, SESSION_EXPIRY_TIME)
  }

  // Save draft to both localStorage and database
  async saveDraft(
    userId: string,
    formData: Partial<ApplicationFormData>,
    currentStep: number,
    uploadedFiles: any[] = [],
    selectedSubjects: any[] = []
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const draft = {
        user_id: userId,
        form_data: formData,
        current_step: currentStep,
        uploaded_files: uploadedFiles,
        selected_subjects: selectedSubjects,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        last_saved_at: new Date().toISOString(),
        session_id: this.sessionId
      }

      // Save to localStorage for immediate recovery
      try {
        localStorage.setItem('applicationDraft', JSON.stringify(draft))
      } catch (error) {
        console.warn('localStorage save failed:', sanitizeForLog(error))
        return { success: false, error: 'Storage quota exceeded' }
      }

      // Try to save to database if table exists
      try {
        const { error } = await supabase
          .from('application_drafts')
          .upsert({
            user_id: userId,
            draft_data: { ...formData, uploaded_files: uploadedFiles, selected_subjects: selectedSubjects },
            step_completed: currentStep
          }, {
            onConflict: 'user_id'
          })

        if (error) console.warn('Database save failed:', sanitizeForLog(error))
      } catch (dbError) {
        console.warn('Database not available, using localStorage only')
      }

      return { success: true }
    } catch (error) {
      console.error('Error saving draft:', sanitizeForLog(error))
      return {
        success: false,
        error: error instanceof Error ? sanitizeForLog(error.message) : 'Failed to save draft'
      }
    }
  }

  // Auto-save current form state
  private async autoSaveDraft() {
    try {
      const savedDraft = localStorage.getItem('applicationDraft')
      if (savedDraft) {
        const draft = safeJsonParse(savedDraft, null)
        if (!draft) return
        // Update last saved timestamp
        draft.last_saved_at = new Date().toISOString()
        localStorage.setItem('applicationDraft', JSON.stringify(draft))
        
        // Also update database
        await supabase
          .from('application_drafts')
          .update({ 
            updated_at: new Date().toISOString(),
            last_saved_at: draft.last_saved_at
          })
          .eq('user_id', draft.user_id)
      }
    } catch (error) {
      console.error('Auto-save failed:', sanitizeForLog(error))
    }
  }

  // Load draft from database or localStorage
  async loadDraft(userId: string): Promise<ApplicationDraft | null> {
    try {
      // First try database
      try {
        const { data, error } = await supabase
          .from('application_drafts')
          .select('*')
          .eq('user_id', userId)
          .single()

        if (!error && data) {
          return {
            id: data.id,
            user_id: data.user_id,
            form_data: data.draft_data || {},
            current_step: data.step_completed || 1,
            uploaded_files: data.draft_data?.uploaded_files || [],
            selected_subjects: data.draft_data?.selected_subjects || [],
            version: 1,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            last_saved_at: data.updated_at,
            session_id: this.sessionId
          }
        }
      } catch (dbError) {
        console.warn('Database not available, using localStorage only')
      }

      // Fallback to localStorage
      const localDraft = localStorage.getItem('applicationDraft')
      if (localDraft) {
        const draft = safeJsonParse(localDraft, null)
        if (!draft) {
          localStorage.removeItem('applicationDraft')
          return null
        }
        if (draft.user_id === userId) {
          return draft
        } else {
          localStorage.removeItem('applicationDraft')
        }
      }

      return null
    } catch (error) {
      console.error('Error loading draft:', sanitizeForLog(error))
      return null
    }
  }

  // Delete draft with comprehensive cleanup
  async deleteDraft(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const errors: string[] = []

      // Clear all storage first (most important for immediate effect)
      try {
        // Clear all possible draft keys
        [...DRAFT_STORAGE_KEYS, ...SESSION_STORAGE_KEYS].forEach(key => {
          localStorage.removeItem(key)
          sessionStorage.removeItem(key)
        })
        
        // Also clear any wizard-specific keys
        localStorage.removeItem('applicationWizardDraft')
        sessionStorage.removeItem('applicationWizardDraft')
        
        // Clear any other potential draft keys
        Object.keys(localStorage).forEach(key => {
          if (key.includes('draft') || key.includes('wizard') || key.includes('application')) {
            localStorage.removeItem(key)
          }
        })
        
        Object.keys(sessionStorage).forEach(key => {
          if (key.includes('draft') || key.includes('wizard') || key.includes('application')) {
            sessionStorage.removeItem(key)
          }
        })
      } catch {
        errors.push('Storage cleanup failed')
      }

      // Parallel database operations
      const [draftResult, appResult] = await Promise.allSettled([
        supabase.from('application_drafts').delete().eq('user_id', userId),
        supabase.from('applications_new').delete().eq('user_id', userId).eq('status', 'draft')
      ])

      // Check results (but don't fail if database operations fail)
      if (draftResult.status === 'rejected' || draftResult.value.error) {
        console.warn('Database draft cleanup failed:', draftResult)
      }
      if (appResult.status === 'rejected' || appResult.value.error) {
        console.warn('Draft applications cleanup failed:', appResult)
      }

      // Clear intervals
      if (this.saveInterval) {
        clearInterval(this.saveInterval)
        this.saveInterval = null
      }

      // Force a page reload flag to ensure clean state
      sessionStorage.setItem('draftDeleted', 'true')

      return {
        success: true, // Always return success if storage was cleared
        error: errors.length > 0 ? errors.join(', ') : undefined
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? sanitizeForLog(error.message) : 'Unknown error occurred'
      }
    }
  }

  // Extend session
  async extendSession(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const newExpiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      
      // Update localStorage
      const localDraft = localStorage.getItem('applicationDraft')
      if (localDraft) {
        const draft = JSON.parse(localDraft)
        draft.expires_at = newExpiryTime
        localStorage.setItem('applicationDraft', JSON.stringify(draft))
      }

      // Reset session timers
      this.resetSessionTimers()

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? sanitizeForLog(error.message) : 'Failed to extend session'
      }
    }
  }

  // Get next version number
  private async getNextVersion(userId: string): Promise<number> {
    try {
      const { data } = await supabase
        .from('application_drafts')
        .select('version')
        .eq('user_id', userId)
        .single()

      return data ? (data.version || 0) + 1 : 1
    } catch {
      return 1
    }
  }

  // Handle session expiry
  private handleSessionExpiry() {
    this.onExpiry?.()
    // Keep data but mark as expired
    const localDraft = localStorage.getItem('applicationDraft')
    if (localDraft) {
      const draft = safeJsonParse(localDraft, null)
      if (draft) {
        draft.expired = true
        try {
          localStorage.setItem('applicationDraft', JSON.stringify(draft))
        } catch (error) {
          console.warn('Failed to mark draft as expired:', sanitizeForLog(error))
        }
      }
    }
  }

  // Reset session timers
  private resetSessionTimers() {
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout)
    }
    if (this.expiryTimeout) {
      clearTimeout(this.expiryTimeout)
    }
    this.setupSessionWarnings()
  }

  // Check if draft exists
  async hasDraft(userId: string): Promise<boolean> {
    const draft = await this.loadDraft(userId)
    return draft !== null
  }

  // Get draft info for dashboard
  async getDraftInfo(userId: string): Promise<{
    exists: boolean
    step?: number
    lastSaved?: string
    progress?: string
    expiresAt?: string
  }> {
    try {
      // Check localStorage first
      const localDraft = localStorage.getItem('applicationWizardDraft')
      if (localDraft) {
        const draft = safeJsonParse(localDraft, null)
        if (draft) {
          const steps = ['Basic KYC', 'Education', 'Payment', 'Submit']
          const savedTime = draft.savedAt ? new Date(draft.savedAt).getTime() : Date.now()
          const expiresAt = new Date(savedTime + 24 * 60 * 60 * 1000).toISOString()
          return {
            exists: true,
            step: draft.currentStep || 1,
            lastSaved: draft.savedAt,
            progress: `Step ${draft.currentStep || 1}/4: ${steps[(draft.currentStep || 1) - 1]}`,
            expiresAt
          }
        } else {
          localStorage.removeItem('applicationWizardDraft')
        }
      }

      // Check database for draft applications
      const { data: draftApps } = await supabase
        .from('applications_new')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)

      if (draftApps && draftApps.length > 0) {
        const app = draftApps[0]
        const steps = ['Basic KYC', 'Education', 'Payment', 'Submit']
        let currentStep = 1
        
        // Determine step based on what's filled
        if (app.result_slip_url) currentStep = 3
        else if (app.program && app.full_name) currentStep = 2
        
        const createdTime = new Date(app.created_at).getTime()
        const expiresAt = new Date(createdTime + 24 * 60 * 60 * 1000).toISOString()
        
        return {
          exists: true,
          step: currentStep,
          lastSaved: app.updated_at,
          progress: `Step ${currentStep}/4: ${steps[currentStep - 1]}`,
          expiresAt
        }
      }

      return { exists: false }
    } catch (error) {
      console.error('Error getting draft info:', sanitizeForLog(error))
      return { exists: false }
    }
  }

  // Cleanup on component unmount
  cleanup() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval)
      this.saveInterval = null
    }
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout)
      this.warningTimeout = null
    }
    if (this.expiryTimeout) {
      clearTimeout(this.expiryTimeout)
      this.expiryTimeout = null
    }
  }
}

export const applicationSessionManager = new ApplicationSessionManager()