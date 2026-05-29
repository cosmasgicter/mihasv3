import type { SystemSetting } from '@/lib/api/adminApi'
import type { GuidedSettingDraft, NewSetting, VisibilityFilter } from './settingsValidation'
import { initialNewSetting } from './settingsValidation'

export interface SettingsState {
  guidedDrafts: Record<string, GuidedSettingDraft>
  saving: boolean
  activeMutationKey: string | null
  error: string
  success: string
  editingId: string | null
  showAddForm: boolean
  showAdvancedSettings: boolean
  searchTerm: string
  filterType: VisibilityFilter
  editForm: Partial<SystemSetting>
  newSetting: NewSetting
}

export const initialSettingsState: SettingsState = {
  guidedDrafts: {},
  saving: false,
  activeMutationKey: null,
  error: '',
  success: '',
  editingId: null,
  showAddForm: false,
  showAdvancedSettings: false,
  searchTerm: '',
  filterType: 'all',
  editForm: {},
  newSetting: initialNewSetting,
}

export type SettingsAction =
  | { type: 'SET_GUIDED_DRAFTS'; payload: Record<string, GuidedSettingDraft> }
  | { type: 'UPDATE_GUIDED_DRAFT'; key: string; field: keyof GuidedSettingDraft; value: string | boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_ACTIVE_MUTATION_KEY'; payload: string | null }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_SUCCESS'; payload: string }
  | { type: 'SET_EDITING_ID'; payload: string | null }
  | { type: 'SET_SHOW_ADD_FORM'; payload: boolean }
  | { type: 'TOGGLE_SHOW_ADD_FORM' }
  | { type: 'SET_SHOW_ADVANCED'; payload: boolean }
  | { type: 'TOGGLE_SHOW_ADVANCED' }
  | { type: 'SET_SEARCH_TERM'; payload: string }
  | { type: 'SET_FILTER_TYPE'; payload: VisibilityFilter }
  | { type: 'SET_EDIT_FORM'; payload: Partial<SystemSetting> }
  | { type: 'UPDATE_EDIT_FORM'; field: string; value: string | boolean }
  | { type: 'SET_NEW_SETTING'; payload: NewSetting }
  | { type: 'UPDATE_NEW_SETTING'; field: string; value: string | boolean }
  | { type: 'RESET_ADD_FORM' }
  | { type: 'START_EDIT'; setting: SystemSetting }
  | { type: 'CANCEL_EDIT' }

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'SET_GUIDED_DRAFTS':
      return { ...state, guidedDrafts: action.payload }
    case 'UPDATE_GUIDED_DRAFT':
      return {
        ...state,
        guidedDrafts: {
          ...state.guidedDrafts,
          [action.key]: {
            ...(state.guidedDrafts[action.key] || { value: '', description: '', category: '', is_public: false }),
            [action.field]: action.value,
          },
        },
      }
    case 'SET_SAVING':
      return { ...state, saving: action.payload }
    case 'SET_ACTIVE_MUTATION_KEY':
      return { ...state, activeMutationKey: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'SET_SUCCESS':
      return { ...state, success: action.payload }
    case 'SET_EDITING_ID':
      return { ...state, editingId: action.payload }
    case 'SET_SHOW_ADD_FORM':
      return { ...state, showAddForm: action.payload, showAdvancedSettings: action.payload ? true : state.showAdvancedSettings }
    case 'TOGGLE_SHOW_ADD_FORM': {
      const next = !state.showAddForm
      return { ...state, showAddForm: next, showAdvancedSettings: next ? true : state.showAdvancedSettings }
    }
    case 'SET_SHOW_ADVANCED':
      return { ...state, showAdvancedSettings: action.payload }
    case 'TOGGLE_SHOW_ADVANCED':
      return { ...state, showAdvancedSettings: !state.showAdvancedSettings }
    case 'SET_SEARCH_TERM':
      return { ...state, searchTerm: action.payload }
    case 'SET_FILTER_TYPE':
      return { ...state, filterType: action.payload }
    case 'SET_EDIT_FORM':
      return { ...state, editForm: action.payload }
    case 'UPDATE_EDIT_FORM':
      return { ...state, editForm: { ...state.editForm, [action.field]: action.value } }
    case 'SET_NEW_SETTING':
      return { ...state, newSetting: action.payload }
    case 'UPDATE_NEW_SETTING':
      return { ...state, newSetting: { ...state.newSetting, [action.field]: action.value } }
    case 'RESET_ADD_FORM':
      return { ...state, showAddForm: false, newSetting: initialNewSetting }
    case 'START_EDIT':
      return { ...state, editingId: action.setting.id, editForm: action.setting }
    case 'CANCEL_EDIT':
      return { ...state, editingId: null, editForm: {} }
    default:
      return state
  }
}
