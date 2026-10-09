import React from 'react'
import type { UserProfile } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { AdminRecordActions } from '@/components/admin/AdminRecordActions'
import type { AdminRecordCommand } from '@/lib/adminRecordCommands'
import { formatDate } from '@/lib/dateFormat'
import { sanitizeForDisplay } from '@/lib/sanitize'
import {
  CheckSquare,
  Shield,
  Square,
  User,
} from 'lucide-react'
import { isAdminRole } from '@/lib/auth/roles'

const AVAILABLE_ROLES = [
  { value: 'student', label: 'Student', description: 'Applicant with access to their own applications' },
  { value: 'reviewer', label: 'Reviewer', description: 'Reviews applications assigned within their institution' },
  { value: 'admin', label: 'Administrator', description: 'Scoped school operator; tenant access from memberships and grants' },
  { value: 'super_admin', label: 'Super Admin', description: 'Beanola platform-wide administrative control' },
]

const getRoleLabel = (role: string) => {
  const roleMatch = AVAILABLE_ROLES.find((entry) => entry.value === role)
  return roleMatch ? roleMatch.label : role.replace(/_/g, ' ').toUpperCase()
}

const getRoleDescription = (role: string) => {
  const roleMatch = AVAILABLE_ROLES.find((entry) => entry.value === role)
  return roleMatch?.description || 'Operational access role'
}

const getRoleIcon = (role: string) => {
  if (isAdminRole(role)) {
    return <Shield className="h-4 w-4 text-destructive" />
  }
  if (role !== 'student') {
    return <Shield className="h-4 w-4 text-primary" />
  }
  return <User className="h-4 w-4 text-foreground" />
}

const getRoleColor = (role: string) => {
  if (isAdminRole(role)) {
    return 'border-destructive/30 bg-destructive/5 text-destructive'
  }
  if (role !== 'student') {
    return 'border-primary/30 bg-primary/5 text-primary'
  }
  return 'border-border bg-muted text-foreground'
}

const formatJoinDate = (value?: string) => {
  if (!value) return 'Unknown'
  const result = formatDate(value)
  return result === 'Not available' ? 'Unknown' : result
}

export interface UserRowProps {
  user: UserProfile
  isSelected: boolean
  onSelect: (userId: string) => void
  onEdit: (user: UserProfile) => void
  onPermissions: (user: UserProfile) => void
  onActivity: (userId: string) => void
  onDeactivate: (user: UserProfile) => void
}

function areUserRowPropsEqual(prev: UserRowProps, next: UserRowProps): boolean {
  const prevId = prev.user.user_id || prev.user.id
  const nextId = next.user.user_id || next.user.id
  return (
    prevId === nextId &&
    prev.user.role === next.user.role &&
    prev.user.full_name === next.user.full_name &&
    prev.user.email === next.user.email &&
    prev.user.phone === next.user.phone &&
    prev.user.created_at === next.user.created_at &&
    prev.isSelected === next.isSelected &&
    prev.onSelect === next.onSelect &&
    prev.onEdit === next.onEdit &&
    prev.onPermissions === next.onPermissions &&
    prev.onActivity === next.onActivity &&
    prev.onDeactivate === next.onDeactivate
  )
}

/** Mobile card view for a single user row */
export const UserMobileCard = React.memo<UserRowProps>(function UserMobileCard({
  user,
  isSelected,
  onSelect,
  onEdit,
  onPermissions,
  onActivity,
  onDeactivate,
}) {
  const userId = user.user_id || user.id

  /**
   * Every command this row is authorized to offer, as data (task 11.4).
   *
   * "Edit" is the primary because it is the directory's own verb — the one thing
   * an operator opens a user row to do. The backend re-enforces each command; the
   * `super_admin` omission is the same rule the desktop row applies, and it is a
   * convenience, not the boundary.
   */
  const commands: AdminRecordCommand[] = [
    { id: 'edit', label: 'Edit', prominence: 'primary', onSelect: () => onEdit(user) },
    { id: 'access', label: 'Access', prominence: 'overflow', onSelect: () => onPermissions(user) },
    { id: 'activity', label: 'Activity', prominence: 'overflow', onSelect: () => onActivity(userId) },
    ...(user.role !== 'super_admin'
      ? [
          {
            id: 'deactivate',
            label: 'Deactivate',
            prominence: 'overflow' as const,
            tone: 'destructive' as const,
            onSelect: () => onDeactivate(user),
          },
        ]
      : []),
  ]

  return (
    // The row carries its canonical id so a browser journey can address the same
    // row the server returned, instead of matching on rendered text (task 9.3).
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm" data-user-row-id={userId}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onSelect(userId)}
          className="mt-1 min-h-touch min-w-touch text-primary hover:text-primary"
          aria-label={isSelected ? 'Deselect user' : 'Select user'}
        >
          {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>
        <div className="mt-1">{getRoleIcon(user.role)}</div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <h3 className="truncate text-base font-semibold text-foreground" title={user.full_name || 'No name provided'}>
              {sanitizeForDisplay(user.full_name) || 'No name provided'}
            </h3>
            <p className="truncate text-sm text-foreground">{sanitizeForDisplay(user.email)}</p>
            <p className="truncate text-sm text-foreground">
              {sanitizeForDisplay(user.phone) || 'No phone on file'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getRoleColor(user.role)}`}>
              {getRoleLabel(user.role)}
            </span>
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground">
              Joined {formatJoinDate(user.created_at)}
            </span>
          </div>
          <p className="text-sm text-foreground">{getRoleDescription(user.role)}</p>
          <p className="font-mono text-xs text-foreground/80">
            User ID: {userId.slice(0, 8)}...
          </p>
        </div>
      </div>

      {/*
        One primary command and one counted disclosure for the rest (task 11.4,
        R16.1-R16.2). This row used to end in a flat, wrapping stack of up to four
        equally prominent buttons at 320 px, so the account itself scrolled off
        the screen under its own controls. **No command is lost** — the sheet's
        label counts what it holds, the panel stays mounted, and a keyboard
        reaches every one.
      */}
      <div className="mt-4 border-t border-border pt-4">
        <AdminRecordActions
          testId="user-record-actions"
          recordLabel={sanitizeForDisplay(user.email) || 'this account'}
          commands={commands}
        />
      </div>
    </div>
  )
}, areUserRowPropsEqual)

/** Desktop table row for a single user */
export const UserTableRow = React.memo<UserRowProps>(function UserTableRow({
  user,
  isSelected,
  onSelect,
  onEdit,
  onPermissions,
  onActivity,
  onDeactivate,
}) {
  const userId = user.user_id || user.id

  return (
    <tr className="hover:bg-muted/30" data-user-row-id={userId}>
      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <button
            onClick={() => onSelect(userId)}
            className="mt-0.5 min-h-touch min-w-touch text-primary hover:text-primary"
            aria-label={isSelected ? 'Deselect user' : 'Select user'}
          >
            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
          <div className="mt-0.5">{getRoleIcon(user.role)}</div>
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-semibold text-foreground" title={user.full_name || 'No name provided'}>
              {sanitizeForDisplay(user.full_name) || 'No name provided'}
            </p>
            <p className="truncate text-sm text-foreground">{sanitizeForDisplay(user.email)}</p>
            <p className="font-mono text-xs text-foreground/80">ID: {userId.slice(0, 8)}...</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="max-w-xs space-y-1">
          <p className="truncate text-sm text-foreground">{sanitizeForDisplay(user.phone) || 'No phone on file'}</p>
          <p className="text-xs text-foreground">Phone is also used by downstream notifications and profile autopopulation.</p>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="space-y-2">
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getRoleColor(user.role)}`}>
            {getRoleLabel(user.role)}
          </span>
          <p className="max-w-xs text-xs text-foreground">{getRoleDescription(user.role)}</p>
        </div>
      </td>
      <td className="px-4 py-4 align-top text-sm text-foreground">
        {formatJoinDate(user.created_at)}
      </td>
      <td className="px-4 py-4 align-top">
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(user)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => onPermissions(user)}>
            Access
          </Button>
          <Button variant="outline" size="sm" onClick={() => onActivity(userId)}>
            Activity
          </Button>
          {user.role !== 'super_admin' && (
            <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/5" onClick={() => onDeactivate(user)}>
              Deactivate
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}, areUserRowPropsEqual)
