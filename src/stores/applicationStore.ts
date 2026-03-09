import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Application, Program, Intake } from '@/types/database'

interface ApplicationState {
  applications: Application[]
  programs: Program[]
  intakes: Intake[]
  currentApplication: Application | null
  loading: boolean
  error: string | null
  
  // Actions
  setApplications: (applications: Application[]) => void
  setPrograms: (programs: Program[]) => void
  setIntakes: (intakes: Intake[]) => void
  setCurrentApplication: (application: Application | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  addApplication: (application: Application) => void
  updateApplication: (id: string, updates: Partial<Application>) => void
  removeApplication: (id: string) => void
}

export const useApplicationStore = create<ApplicationState>()(immer((set) => ({
  applications: [],
  programs: [],
  intakes: [],
  currentApplication: null,
  loading: false,
  error: null,

  setApplications: (applications) => set((state) => {
    // Bound to 50 items to prevent unbounded memory growth in long sessions
    state.applications = applications.slice(0, 50)
  }),

  setPrograms: (programs) => set((state) => {
    state.programs = programs
  }),

  setIntakes: (intakes) => set((state) => {
    state.intakes = intakes
  }),

  setCurrentApplication: (application) => set((state) => {
    state.currentApplication = application
  }),

  setLoading: (loading) => set((state) => {
    state.loading = loading
  }),

  setError: (error) => set((state) => {
    state.error = error
  }),

  addApplication: (application) => set((state) => {
    state.applications.push(application)
    // Bound to 50 items to prevent unbounded memory growth
    if (state.applications.length > 50) {
      state.applications = state.applications.slice(-50)
    }
  }),

  updateApplication: (id, updates) => set((state) => {
    // amazonq-ignore-next-line
    const index = state.applications.findIndex(app => app.id === id)
    if (index !== -1) {
      Object.assign(state.applications[index], updates)
      if (state.currentApplication?.id === id) {
        Object.assign(state.currentApplication, updates)
      }
    }
  }),

  removeApplication: (id) => set((state) => {
    const index = state.applications.findIndex(app => app.id === id)
    if (index !== -1) {
      state.applications.splice(index, 1)
    }
    if (state.currentApplication?.id === id) {
      state.currentApplication = null
    }
  })
})))