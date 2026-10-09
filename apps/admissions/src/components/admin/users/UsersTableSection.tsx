import type { UserProfile } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { UserMobileCard, UserTableRow } from '@/components/admin/UserRowCard'
import {
  ArrowDownUp,
  ArrowUpDown,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Phone,
  Square,
  Trophy,
} from 'lucide-react'
import { SORTABLE_COLUMNS, type FiltersSlice } from '@/pages/admin/lib/usersReducer'

/**
 * The column keys are the **registered backend sort keys** (task 9.3, R6.1), not
 * UI-invented names: the header an operator clicks and the `sort=` a request
 * carries are the same string, so a sorted view is reproducible from a URL.
 */
type SortField = FiltersSlice['sortField']

interface UsersTableSectionProps {
  paginatedUsers: UserProfile[]
  filteredUsers: UserProfile[]
  selectedUsers: string[]
  sortField: SortField
  sortDirection: 'asc' | 'desc'
  currentPage: number
  totalPages: number
  totalSorted: number
  pageSize: number
  onToggleSort: (field: SortField) => void
  onSelectAll: () => void
  onSelectUser: (userId: string) => void
  onEdit: (user: UserProfile) => void
  onPermissions: (user: UserProfile) => void
  onActivity: (userId: string) => void
  onDeactivate: (user: UserProfile) => void
  onPageChange: (page: number) => void
}

function SortIcon({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: 'asc' | 'desc' }) {
  if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />
  return sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
}

export function UsersTableSection({
  paginatedUsers,
  filteredUsers,
  selectedUsers,
  sortField,
  sortDirection,
  currentPage,
  totalPages,
  totalSorted,
  pageSize,
  onToggleSort,
  onSelectAll,
  onSelectUser,
  onEdit,
  onPermissions,
  onActivity,
  onDeactivate,
  onPageChange,
}: UsersTableSectionProps) {
  return (
    <>
      <div className="block space-y-4 lg:hidden">
        {/*
          Sort is server state, and until admissions-v2 task 11.4 it was reachable
          **only** through the desktop table's column headers — so a phone-width
          operator could read the directory but could not order it, and a sorted
          view was not reproducible from the surface that rendered it. R16.1 lets
          a table become a record list "without losing commands, filters, state,
          or pagination"; a sort key is state.

          The control drives the same `TOGGLE_SORT` action and therefore the same
          **registered backend sort keys** as the headers (`SORTABLE_COLUMNS`), so
          the two surfaces cannot drift into two vocabularies.
        */}
        {/*
          Stacked at phone width, inline from `sm`. A single wrapping row put the
          label, the field selector and the direction control side by side at
          390 px and the selector's own text was **clipped** — the "Contact" key
          rendered as "Cont", which R16.7 forbids for the same reason it forbids a
          hidden command: the operator cannot read what the surface is doing.
        */}
        <div
          className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center"
          data-testid="users-mobile-sort"
        >
          <label
            htmlFor="users-mobile-sort-field"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
          >
            <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
            Sort by
          </label>
          <select
            id="users-mobile-sort-field"
            value={sortField}
            onChange={(event) => onToggleSort(event.target.value as SortField)}
            className="min-h-touch w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-1"
          >
            {SORTABLE_COLUMNS.map((column) => (
              <option key={column.field} value={column.field}>
                {column.label}
              </option>
            ))}
          </select>
          {/* Direction is a word, never an arrow alone. */}
          <Button
            variant="outline"
            size="sm"
            className="min-h-touch min-w-touch w-full sm:w-auto"
            onClick={() => onToggleSort(sortField)}
            aria-label={`Sort direction: ${sortDirection === 'asc' ? 'ascending' : 'descending'}. Activate to reverse.`}
          >
            {sortDirection === 'asc' ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{sortDirection === 'asc' ? 'Ascending' : 'Descending'}</span>
          </Button>
        </div>

        {paginatedUsers.map((user) => {
          const userId = user.user_id || user.id
          return (
            <UserMobileCard
              key={userId}
              user={user}
              isSelected={selectedUsers.includes(userId)}
              onSelect={onSelectUser}
              onEdit={onEdit}
              onPermissions={onPermissions}
              onActivity={onActivity}
              onDeactivate={onDeactivate}
            />
          )
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border/60 lg:block">
        <table className="min-w-full divide-y divide-border/40" aria-label="Users">
          <thead className="sticky top-0 z-10 bg-muted/50 ">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <div className="flex items-center gap-2">
                  <button
                    onClick={onSelectAll}
                    className="min-h-touch min-w-touch flex items-center justify-center text-primary hover:text-primary"
                    aria-label={selectedUsers.length === filteredUsers.length ? 'Deselect all users' : 'Select all users'}
                  >
                    {selectedUsers.length === filteredUsers.length && filteredUsers.length > 0 ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                  <button onClick={() => onToggleSort('display_name')} className="flex items-center gap-1 hover:text-foreground">
                    User <SortIcon field="display_name" sortField={sortField} sortDirection={sortDirection} />
                  </button>
                </div>
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <button onClick={() => onToggleSort('email')} className="flex items-center gap-1 hover:text-foreground">
                  <Phone className="h-4 w-4" />
                  Contact <SortIcon field="email" sortField={sortField} sortDirection={sortDirection} />
                </button>
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <button onClick={() => onToggleSort('role')} className="flex items-center gap-1 hover:text-foreground">
                  <Trophy className="h-4 w-4" />
                  Role <SortIcon field="role" sortField={sortField} sortDirection={sortDirection} />
                </button>
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <button onClick={() => onToggleSort('created_at')} className="flex items-center gap-1 hover:text-foreground">
                  <Calendar className="h-4 w-4" />
                  Joined <SortIcon field="created_at" sortField={sortField} sortDirection={sortDirection} />
                </button>
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 bg-card">
            {paginatedUsers.map((user) => {
              const userId = user.user_id || user.id
              return (
                <UserTableRow
                  key={userId}
                  user={user}
                  isSelected={selectedUsers.includes(userId)}
                  onSelect={onSelectUser}
                  onEdit={onEdit}
                  onPermissions={onPermissions}
                  onActivity={onActivity}
                  onDeactivate={onDeactivate}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1}&ndash;{Math.min(currentPage * pageSize, totalSorted)} of {totalSorted}
          </p>
          {/*
            `flex-wrap`, because at 320 px a 44 px previous/next pair plus up to
            five page buttons is wider than the viewport and used to push the
            directory into a horizontal scroll. Each control is a 44 px target
            (they were 36 px until task 11.4, below R16.2's floor).
          */}
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="min-h-touch min-w-touch"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis')
                acc.push(p)
                return acc
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e${idx}`} className="px-1 text-muted-foreground">&hellip;</span>
                ) : (
                  <Button
                    key={item}
                    variant={currentPage === item ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPageChange(item as number)}
                    className="min-h-touch min-w-touch"
                  >
                    {item}
                  </Button>
                ),
              )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="min-h-touch min-w-touch"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
