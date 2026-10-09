/**
 * Bulk user role/status changes as one server command (task 9.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.3.
 * Requirement: **R6.5** · Findings: **ADM-03**, **AUTH-04**.
 *
 * What this replaces. `useUserManagement.bulkUpdateRoles` / `bulkDeleteUsers`
 * were `for` loops issuing one `PATCH` per selected account and counting the
 * responses, and the SHA-256 confirmation token was computed in the browser and
 * checked in the browser — so it guarded against a mis-click and nothing else.
 * Twenty-five role changes were twenty-five unrelated events with no single
 * decision to authorize, audit, bound, or roll back.
 *
 * Now it is one command. The token still exists and still has to be typed, but
 * it is *verified server-side*, which is what makes it part of the command's
 * identity: a token computed for one selection cannot authorise a different one.
 * The command is all-or-nothing, bounded at 25 targets, applies the platform's
 * role ceiling per target, revokes sessions whose authority it changed, and is
 * audited once.
 */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { UserProfile } from '@/types/database'
import {
  userBulkConfirmationToken,
  type UserBulkOperation,
  type UserBulkResult,
} from '@/services/admin/userDirectory'
import { useUserBulkCommand } from '@/hooks/admin/useUserDirectory'
import { AVAILABLE_ROLES, getRoleLabel } from '@/pages/admin/lib/usersReducer'
import { AlertTriangle, CheckSquare, Shield, Square, Trash2, Users } from 'lucide-react'
import { toError } from '@/lib/toError'

interface BulkUserOperationsProps {
  users: UserProfile[]
  selectedUsers: string[]
  onSelectionChange: (userIds: string[]) => void
  onOperationComplete: () => void
}

/** Matches `user_bulk_service.MAX_BULK_SIZE`; the server refuses beyond it. */
export const BULK_SIZE_LIMIT = 25

export function BulkUserOperations({
  users,
  selectedUsers,
  onSelectionChange,
  onOperationComplete,
}: BulkUserOperationsProps) {
  const bulkCommand = useUserBulkCommand()
  const [pendingOperation, setPendingOperation] = useState<UserBulkOperation | null>(null)
  const [selectedRole, setSelectedRole] = useState('student')
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null)
  const [confirmInput, setConfirmInput] = useState('')
  const [result, setResult] = useState<UserBulkResult | null>(null)
  const [commandError, setCommandError] = useState<string>('')

  const selectedUserDetails = useMemo(
    () => users.filter((user) => selectedUsers.includes(user.user_id || user.id)),
    [users, selectedUsers],
  )
  const overLimit = selectedUsers.length > BULK_SIZE_LIMIT

  const openDialog = async (operation: UserBulkOperation) => {
    setCommandError('')
    setPendingOperation(operation)
    setConfirmInput('')
    // The **same** construction the server recomputes: the sorted ids plus the
    // operation and role. A short prefix is shown to the operator, so the typed
    // confirmation is still human-sized.
    const token = await userBulkConfirmationToken(
      operation,
      selectedUsers,
      operation === 'set_role' ? selectedRole : null,
    )
    setConfirmationToken(token.slice(0, 8))
  }

  const closeDialog = () => {
    setPendingOperation(null)
    setConfirmationToken(null)
    setConfirmInput('')
  }

  const run = async () => {
    if (!pendingOperation || confirmInput !== confirmationToken) return
    try {
      const answer = await bulkCommand.mutateAsync({
        operation: pendingOperation,
        user_ids: selectedUsers,
        role: pendingOperation === 'set_role' ? selectedRole : null,
      })
      setResult(answer)
      if (answer.committed) {
        // Refresh the table behind the dialog, but keep the selection until the
        // operator has read the outcome. Clearing it here would unmount this
        // component (the page renders it only while something is selected) and
        // destroy the report of the command that just ran — which is how a bulk
        // change ended up being a number in a dialog nobody saw.
        onOperationComplete()
      }
    } catch (error) {
      // A refusal is the server's answer, not a partial application: nothing was
      // changed, so the selection is left intact for the operator to correct.
      setCommandError(toError(error).message || 'The bulk change could not be applied.')
    } finally {
      closeDialog()
    }
  }

  /** Dismiss the outcome, and only then release the selection. */
  const dismissResult = () => {
    const committed = result?.committed
    setResult(null)
    if (committed) onSelectionChange([])
  }

  const handleSelectAll = () => {
    const pageIds = users
      .map((user) => user.user_id || user.id)
      .filter((id): id is string => Boolean(id))
    if (selectedUsers.length === pageIds.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(pageIds)
    }
  }

  const handleUserSelect = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      onSelectionChange(selectedUsers.filter((id) => id !== userId))
    } else {
      onSelectionChange([...selectedUsers, userId])
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-border bg-muted p-4 sm:flex-row sm:items-center">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSelectAll}
            className="min-h-touch min-w-touch flex items-center space-x-2 text-sm font-medium text-foreground hover:text-foreground"
          >
            {selectedUsers.length === users.length && users.length > 0 ? (
              <CheckSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            ) : (
              <Square className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{selectedUsers.length === users.length && users.length > 0 ? 'Deselect all' : 'Select all on this page'}</span>
          </button>
          {selectedUsers.length > 0 && (
            <span className="text-sm text-foreground">
              {selectedUsers.length} of {BULK_SIZE_LIMIT} selected
            </span>
          )}
        </div>

        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-touch min-w-touch"
              onClick={() => { void openDialog('set_role') }}
              disabled={overLimit}
            >
              <Shield className="mr-1 h-4 w-4" aria-hidden="true" />
              Change role
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-touch min-w-touch text-destructive"
              onClick={() => { void openDialog('deactivate') }}
              disabled={overLimit}
            >
              <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
              Deactivate
            </Button>
          </div>
        )}
      </div>

      {overLimit && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4" role="status">
          <p className="text-sm font-medium text-foreground">
            A bulk change covers at most {BULK_SIZE_LIMIT} accounts
          </p>
          <p className="mt-1 text-sm text-foreground">
            Deselect {selectedUsers.length - BULK_SIZE_LIMIT} to continue. The server refuses a
            larger batch rather than applying part of it.
          </p>
        </div>
      )}

      {commandError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm font-medium text-destructive">The bulk change was refused</p>
          <p className="mt-1 text-sm text-foreground">{commandError}</p>
          <p className="mt-1 text-sm text-foreground">Nothing was changed.</p>
        </div>
      )}

      {selectedUsers.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="mb-3 flex items-center font-medium text-foreground">
            <Users className="mr-2 h-4 w-4" aria-hidden="true" />
            Selected accounts ({selectedUsers.length})
          </h4>
          <div className="max-h-40 space-y-2 overflow-y-auto">
            {selectedUserDetails.map((user) => (
              <div key={user.user_id || user.id} className="flex items-center justify-between rounded bg-muted p-2">
                <div className="flex min-w-0 items-center space-x-3">
                  <button
                    onClick={() => handleUserSelect(user.user_id || user.id)}
                    className="min-h-touch min-w-touch text-primary"
                    aria-label={`Remove ${user.full_name || user.email} from the selection`}
                  >
                    <CheckSquare className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground" title={user.full_name || 'No name'}>
                      {user.full_name || 'No name'}
                    </p>
                    <p className="truncate text-xs text-foreground" title={user.email}>{user.email}</p>
                  </div>
                </div>
                <span className="rounded bg-skeleton px-2 py-1 text-xs text-foreground">
                  {getRoleLabel(user.role)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={pendingOperation !== null} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              {pendingOperation === 'deactivate' ? (
                <Trash2 className="h-5 w-5 text-destructive" aria-hidden="true" />
              ) : (
                <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
              )}
              <span>
                {pendingOperation === 'deactivate' ? 'Deactivate accounts' : 'Change role'}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-foreground">
              {pendingOperation === 'deactivate'
                ? `Remove sign-in access for ${selectedUsers.length} account${selectedUsers.length === 1 ? '' : 's'}?`
                : `Set the platform role for ${selectedUsers.length} account${selectedUsers.length === 1 ? '' : 's'}:`}
            </p>

            {pendingOperation === 'set_role' && (
              <div>
                <label htmlFor="bulk-role" className="mb-2 block text-sm font-medium text-foreground">
                  New role
                </label>
                <select
                  id="bulk-role"
                  value={selectedRole}
                  onChange={async (event) => {
                    setSelectedRole(event.target.value)
                    const token = await userBulkConfirmationToken(
                      'set_role',
                      selectedUsers,
                      event.target.value,
                    )
                    setConfirmationToken(token.slice(0, 8))
                    setConfirmInput('')
                  }}
                  className="min-h-touch h-12 w-full rounded-md border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {AVAILABLE_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm text-foreground">
                {pendingOperation === 'deactivate'
                  ? 'Records stay available for audit and history; the accounts simply cannot sign in. Active sessions are revoked immediately.'
                  : 'Active sessions are revoked so the next sign-in carries the new authority. The change applies to every selected account or to none.'}
              </p>
            </div>

            {confirmationToken && (
              <div>
                <label htmlFor="bulk-confirm" className="mb-2 block text-sm font-medium text-foreground">
                  Type{' '}
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                    data-testid="bulk-confirmation-code"
                  >
                    {confirmationToken}
                  </code>{' '}
                  to confirm
                </label>
                <input
                  id="bulk-confirm"
                  type="text"
                  value={confirmInput}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  placeholder="Enter confirmation code"
                  className="min-h-touch w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={bulkCommand.isPending}>
              Cancel
            </Button>
            <Button
              onClick={run}
              loading={bulkCommand.isPending}
              disabled={confirmInput !== confirmationToken}
              variant={pendingOperation === 'deactivate' ? 'destructive' : 'default'}
            >
              {pendingOperation === 'deactivate' ? 'Deactivate accounts' : 'Change role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {result && (
        <Dialog open onOpenChange={() => dismissResult()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-primary" aria-hidden="true" />
                <span>{result.committed ? 'Bulk change applied' : 'Bulk change refused'}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{result.updated}</p>
                  <p className="text-sm text-foreground">Updated</p>
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{result.failed}</p>
                  <p className="text-sm text-foreground">Refused</p>
                </div>
              </div>
              {!result.committed && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
                    <p className="text-sm text-foreground">
                      Nothing was changed. Fix the accounts below and try again.
                    </p>
                  </div>
                </div>
              )}
              {result.errors.length > 0 && (
                <ul className="space-y-1 text-sm text-foreground">
                  {result.errors.map((error) => (
                    <li key={error.user_id}>
                      <span className="font-mono text-xs">{error.user_id.slice(0, 8)}</span> — {error.message}
                    </li>
                  ))}
                </ul>
              )}
              {result.sessions_revoked > 0 && (
                <p className="text-sm text-foreground">
                  {result.sessions_revoked} active session
                  {result.sessions_revoked === 1 ? '' : 's'} revoked.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={dismissResult}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
