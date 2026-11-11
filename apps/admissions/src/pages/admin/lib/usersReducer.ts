import type { UserProfile } from '@/types/database'
import type { UserDirectoryQuery } from '@/services/admin/userDirectory'

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
//
// Rebuilt by admissions-v2 task 9.3 (R6.1, finding ADM-03). These are no longer
// browser-side view controls applied to one fetched page — they are the *server
// query*, and `toDirectoryQuery` below is the only place they become request
// parameters. `sortField` holds a registered backend sort key
// (`user_directory_service.SORT_FIELDS`), not a UI-invented name, so a sort an
// operator picks and a sort a URL carries are the same thing.
export type UserSortField =
  | 'display_name'
  | 'email'
  | 'role'
  | 'created_at'
  | 'is_active'

export interface FiltersSlice {
  searchTerm: string
  roleFilter: string
  /** null = the default (enabled only); false = deactivated only. */
  activeFilter: boolean | null
  /** null = any; true/false narrows to accounts with/without a membership. */
  membershipFilter: boolean | null
  institutionId: string
  sortField: UserSortField
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
    activeFilter: null,
    membershipFilter: null,
    institutionId: '',
    sortField: 'created_at',
    sortDirection: 'desc',
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
  | { type: 'SET_ACTIVE_FILTER'; payload: boolean | null }
  | { type: 'SET_MEMBERSHIP_FILTER'; payload: boolean | null }
  | { type: 'SET_INSTITUTION_FILTER'; payload: string }
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
    case 'SET_ACTIVE_FILTER':
      return { ...state, filters: { ...state.filters, activeFilter: action.payload, currentPage: 1 } }
    case 'SET_MEMBERSHIP_FILTER':
      return { ...state, filters: { ...state.filters, membershipFilter: action.payload, currentPage: 1 } }
    case 'SET_INSTITUTION_FILTER':
      return { ...state, filters: { ...state.filters, institutionId: action.payload, currentPage: 1 } }
    case 'CLEAR_FILTERS':
      return {
        ...state,
        filters: {
          ...state.filters,
          searchTerm: '',
          roleFilter: '',
          activeFilter: null,
          membershipFilter: null,
          institutionId: '',
          currentPage: 1,
        },
      }
    case 'TOGGLE_SORT': {
      const { sortField, sortDirection } = state.filters
      if (sortField === action.field) {
        return { ...state, filters: { ...state.filters, sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' } }
      }
      // A new column starts ascending except for a date, where an operator
      // means "most recent first".
      return {
        ...state,
        filters: {
          ...state.filters,
          sortField: action.field,
          sortDirection: action.field === 'created_at' ? 'desc' : 'asc',
        },
      }
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

// Canonical role contract — the four backend-supported roles only (task 2.4,
// R3.4). Mirrors backend AdminUserCreateSerializer/AdminUserUpdateSerializer
// choices and ROLE_HIERARCHY. Retired non-canonical staff roles are removed:
// the backend never issues them and scoped tenant authority is expressed
// through memberships and access grants.
export const ROLE_VALUES = ['student', 'reviewer', 'admin', 'super_admin'] as const

export const AVAILABLE_ROLES = [
  { value: 'student', label: 'Student', description: 'Applicant with access to their own applications' },
  { value: 'reviewer', label: 'Reviewer', description: 'Reviews applications assigned within their institution' },
  { value: 'admin', label: 'Administrator', description: 'Scoped school operator; tenant access from memberships and grants' },
  { value: 'super_admin', label: 'Super admin', description: 'Beanola platform-wide administrative control' },
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

/**
 * Turn the page's filter state into the **registered** server query (R6.1).
 *
 * This is the only place the directory's UI state becomes request parameters, and
 * the names are the backend's own
 * (`user_directory_service.REGISTERED_PARAMETERS`). ADM-03's second habit was a
 * UI-invented spelling (`roleFilter`, `sortField`) that no parser understood; the
 * server now echoes anything outside the registered set in
 * `filters.unknown_parameters` instead of dropping it, and this function is why
 * that list should always be empty for our own requests.
 */
export function toDirectoryQuery(
  filters: FiltersSlice,
  search: string,
  pageSize: number = PAGE_SIZE,
): UserDirectoryQuery {
  const query: UserDirectoryQuery = {
    page: filters.currentPage,
    pageSize,
    sort: filters.sortField,
    order: filters.sortDirection,
  }
  if (search) query.search = search
  if (filters.roleFilter) query.role = filters.roleFilter
  if (filters.institutionId) query.institution_id = filters.institutionId
  // `is_active` is tri-state on purpose: absent means "the platform's default"
  // (enabled accounts only), which is what the directory has always shown.
  if (filters.activeFilter !== null) query.is_active = String(filters.activeFilter)
  if (filters.membershipFilter !== null) {
    query.has_membership = String(filters.membershipFilter)
  }
  return query
}

/** The sortable columns, paired with the registered backend key each carries. */
export const SORTABLE_COLUMNS: ReadonlyArray<{
  field: UserSortField
  label: string
}> = [
  { field: 'display_name', label: 'User' },
  { field: 'email', label: 'Contact' },
  { field: 'role', label: 'Role' },
  { field: 'is_active', label: 'Status' },
  { field: 'created_at', label: 'Joined' },
]
