import type { UserProfile } from '@/types/database'

// ── Slice: Dialogs ────────────────────────────────────────────────────
export interface DialogsSlice {
  showCreateDialog: boolean
  showEditDialog: boolean
  showDeleteDialog: boolean
  showPermissionsDialog: boolean
  showExportDialog: boolean
  showImportDialog: boolean
  showActivityLog: boolean
  showStats: boolean
  showPassword: boolean
  selectedUser: UserProfile | null
  activityLogUserId: string | null
}

// ── Slice: Filters ────────────────────────────────────────────────────
export interface FiltersSlice {
  searchTerm: string
  roleFilter: string
  sortField: 'name' | 'role' | 'email' | 'created'
  sortDirection: 'asc' | 'desc'
  currentPage: number
}

// ── Slice: Selection ──────────────────────────────────────────────────
export interface SelectionSlice {
  selectedUsers: string[]
}

// ── Combined state ────────────────────────────────────────────────────
export interface UsersState {
  dialogs: DialogsSlice
  filters: FiltersSlice
  selection: SelectionSlice
  error: string
}

export const initialUsersState: UsersState = {
  dialogs: {
    showCreateDialog: false,
    showEditDialog: false,
    showDeleteDialog: false,
    showPermissionsDialog: false,
    showExportDialog: false,
    showImportDialog: false,
    showActivityLog: false,
    showStats: false,
    showPassword: false,
    selectedUser: null,
    activityLogUserId: null,
  },
  filters: {
    searchTerm: '',
    roleFilter: '',
    sortField: 'name',
    sortDirection: 'asc',
    currentPage: 1,
  },
  selection: {
    selectedUsers: [],
  },
  error: '',
}

export type UsersAction =
  | { type: 'SET_ERROR'; payload: string }
  // Dialogs
  | { type: 'OPEN_CREATE' }
  | { type: 'CLOSE_CREATE' }
  | { type: 'OPEN_EDIT'; user: UserProfile }
  | { type: 'CLOSE_EDIT' }
  | { type: 'OPEN_DELETE'; user: UserProfile }
  | { type: 'CLOSE_DELETE' }
  | { type: 'OPEN_PERMISSIONS'; user: UserProfile }
  | { type: 'CLOSE_PERMISSIONS' }
  | { type: 'OPEN_EXPORT' }
  | { type: 'CLOSE_EXPORT' }
  | { type: 'OPEN_IMPORT' }
  | { type: 'CLOSE_IMPORT' }
  | { type: 'OPEN_ACTIVITY_LOG'; userId: string }
  | { type: 'CLOSE_ACTIVITY_LOG' }
  | { type: 'TOGGLE_STATS' }
  | { type: 'TOGGLE_PASSWORD' }
  // Filters
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_ROLE_FILTER'; payload: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'TOGGLE_SORT'; field: FiltersSlice['sortField'] }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'RESET_PAGE' }
  // Selection
  | { type: 'TOGGLE_USER'; userId: string }
  | { type: 'SELECT_ALL'; userIds: string[] }
  | { type: 'DESELECT_ALL' }
  | { type: 'REMOVE_FROM_SELECTION'; userId: string }

export function usersReducer(state: UsersState, action: UsersAction): UsersState {
  switch (action.type) {
    case 'SET_ERROR':
      return { ...state, error: action.payload }

    // ── Dialogs ─────────────────────────────────────────────────────
    case 'OPEN_CREATE':
      return { ...state, dialogs: { ...state.dialogs, showCreateDialog: true } }
    case 'CLOSE_CREATE':
      return { ...state, dialogs: { ...state.dialogs, showCreateDialog: false } }
    case 'OPEN_EDIT':
      return { ...state, dialogs: { ...state.dialogs, showEditDialog: true, selectedUser: action.user } }
    case 'CLOSE_EDIT':
      return { ...state, dialogs: { ...state.dialogs, showEditDialog: false, selectedUser: null } }
    case 'OPEN_DELETE':
      return { ...state, dialogs: { ...state.dialogs, showDeleteDialog: true, selectedUser: action.user } }
    case 'CLOSE_DELETE':
      return { ...state, dialogs: { ...state.dialogs, showDeleteDialog: false, selectedUser: null } }
    case 'OPEN_PERMISSIONS':
      return { ...state, dialogs: { ...state.dialogs, showPermissionsDialog: true, selectedUser: action.user } }
    case 'CLOSE_PERMISSIONS':
      return { ...state, dialogs: { ...state.dialogs, showPermissionsDialog: false } }
    case 'OPEN_EXPORT':
      return { ...state, dialogs: { ...state.dialogs, showExportDialog: true } }
    case 'CLOSE_EXPORT':
      return { ...state, dialogs: { ...state.dialogs, showExportDialog: false } }
    case 'OPEN_IMPORT':
      return { ...state, dialogs: { ...state.dialogs, showImportDialog: true } }
    case 'CLOSE_IMPORT':
      return { ...state, dialogs: { ...state.dialogs, showImportDialog: false } }
    case 'OPEN_ACTIVITY_LOG':
      return { ...state, dialogs: { ...state.dialogs, showActivityLog: true, activityLogUserId: action.userId } }
    case 'CLOSE_ACTIVITY_LOG':
      return { ...state, dialogs: { ...state.dialogs, showActivityLog: false, activityLogUserId: null } }
    case 'TOGGLE_STATS':
      return { ...state, dialogs: { ...state.dialogs, showStats: !state.dialogs.showStats } }
    case 'TOGGLE_PASSWORD':
      return { ...state, dialogs: { ...state.dialogs, showPassword: !state.dialogs.showPassword } }

    // ── Filters ─────────────────────────────────────────────────────
    case 'SET_SEARCH':
      return { ...state, filters: { ...state.filters, searchTerm: action.payload, currentPage: 1 } }
    case 'SET_ROLE_FILTER':
      return { ...state, filters: { ...state.filters, roleFilter: action.payload, currentPage: 1 } }
    case 'CLEAR_FILTERS':
      return { ...state, filters: { ...state.filters, searchTerm: '', roleFilter: '', currentPage: 1 } }
    case 'TOGGLE_SORT': {
      const { sortField, sortDirection } = state.filters
      if (sortField === action.field) {
        return { ...state, filters: { ...state.filters, sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' } }
      }
      return { ...state, filters: { ...state.filters, sortField: action.field, sortDirection: 'asc' } }
    }
    case 'SET_PAGE':
      return { ...state, filters: { ...state.filters, currentPage: action.page } }
    case 'RESET_PAGE':
      return { ...state, filters: { ...state.filters, currentPage: 1 } }

    // ── Selection ───────────────────────────────────────────────────
    case 'TOGGLE_USER': {
      const { selectedUsers } = state.selection
      const next = selectedUsers.includes(action.userId)
        ? selectedUsers.filter((id) => id !== action.userId)
        : [...selectedUsers, action.userId]
      return { ...state, selection: { ...state.selection, selectedUsers: next } }
    }
    case 'SELECT_ALL':
      return { ...state, selection: { ...state.selection, selectedUsers: action.userIds } }
    case 'DESELECT_ALL':
      return { ...state, selection: { ...state.selection, selectedUsers: [] } }
    case 'REMOVE_FROM_SELECTION': {
      return { ...state, selection: { ...state.selection, selectedUsers: state.selection.selectedUsers.filter((id) => id !== action.userId) } }
    }

    default:
      return state
  }
}

// ── Exported helpers (re-exported from Users.tsx for test compatibility) ──

export const ROLE_VALUES = ['student', 'reviewer', 'admissions_officer', 'registrar', 'finance_officer', 'academic_head', 'admin', 'super_admin'] as const

export const AVAILABLE_ROLES = [
  { value: 'student', label: 'Student', description: 'Regular student user' },
  { value: 'reviewer', label: 'Reviewer', description: 'Can review submitted applications' },
  { value: 'admissions_officer', label: 'Admissions Officer', description: 'Can review applications' },
  { value: 'registrar', label: 'Registrar', description: 'Academic records management' },
  { value: 'finance_officer', label: 'Finance Officer', description: 'Payment verification' },
  { value: 'academic_head', label: 'Academic Head', description: 'Department oversight' },
  { value: 'admin', label: 'Administrator', description: 'Full system access' },
  { value: 'super_admin', label: 'Super Admin', description: 'Platform-wide administrative control' },
] as const

export const getRoleLabel = (role: string) => {
  const roleMatch = AVAILABLE_ROLES.find((entry) => entry.value === role)
  return roleMatch ? roleMatch.label : role.replace(/_/g, ' ').toUpperCase()
}

export const getRoleDescription = (role: string) => {
  const roleMatch = AVAILABLE_ROLES.find((entry) => entry.value === role)
  return roleMatch?.description || 'Operational access role'
}

export const getSessionSummary = (count?: number) => {
  if (!count) {
    return 'No active sessions needed revocation.'
  }
  return `${count} active session${count === 1 ? '' : 's'} revoked.`
}

export const PAGE_SIZE = 25
