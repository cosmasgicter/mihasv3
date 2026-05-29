import type { UserProfile } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { UserMobileCard, UserTableRow } from '@/components/admin/UserRowCard'
import {
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
import type { FiltersSlice } from '@/pages/admin/lib/usersReducer'

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
                  <button onClick={() => onToggleSort('name')} className="flex items-center gap-1 hover:text-foreground">
                    User <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
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
                <button onClick={() => onToggleSort('created')} className="flex items-center gap-1 hover:text-foreground">
                  <Calendar className="h-4 w-4" />
                  Joined <SortIcon field="created" sortField={sortField} sortDirection={sortDirection} />
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
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="min-h-[36px] min-w-[36px]"
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
                    className="min-h-[36px] min-w-[36px]"
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
              className="min-h-[36px] min-w-[36px]"
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
