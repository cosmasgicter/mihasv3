import { create } from 'zustand'

interface ApplicationUIState {
  currentApplicationId: string | null
  wizardStep: number
  setCurrentApplicationId: (id: string | null) => void
  setWizardStep: (step: number) => void
}

export const useApplicationStore = create<ApplicationUIState>()((set) => ({
  currentApplicationId: null,
  wizardStep: 0,

  setCurrentApplicationId: (id) => set({ currentApplicationId: id }),

  setWizardStep: (step) => set({ wizardStep: step }),
}))
