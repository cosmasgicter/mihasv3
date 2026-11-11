import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui'
import type { UserProfile } from '@/types/database'
import type { AdminUserEffectiveCapabilities } from '@/services/admin/users'
import { Building2, Lock, ShieldCheck, ShieldAlert } from 'lucide-react'

interface UserEffectiveCapabilitiesProps {
  user: UserProfile
  isOpen: boolean
  capabilities?: AdminUserEffectiveCapabilities | null
  isLoading?: boolean
  isError?: boolean
  onClose: () => void
}

const formatRoleLabel = (role?: string | null) =>
  role ? role.replace(/_/g, ' ') : 'Unknown'

/**
 * Read-only Effective_Capabilities panel for the user detail surface
 * (design §5.3, R3.7). This replaces the retired fake permission editor
 * (AUTH-04): it never mutates authority. It renders the backend-derived
 * capability set for the target user and points authorized operators at the
 * canonical role, membership, and access-grant commands that actually change
 * authority. The backend remains the security boundary — this is display-only.
 */
export function UserEffectiveCapabilities({
  user,
  isOpen,
  capabilities,
  isLoading,
  isError,
  onClose,
}: UserEffectiveCapabilitiesProps) {
  const isSuperAdmin = Boolean(capabilities?.is_super_admin)
  const platformCapabilities = capabilities?.capabilities ?? []
  const institutions = capabilities?.institutions ?? []
  const resolutionError = Boolean(capabilities?.resolution_error) || Boolean(isError)
  const hasNoAuthority =
    !isSuperAdmin && platformCapabilities.length === 0 && institutions.length === 0

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span>Effective access for {user.full_name || user.email}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-muted/60 p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Platform role</p>
                <p className="mt-1 text-lg font-semibold capitalize text-foreground">{formatRoleLabel(capabilities?.role ?? user.role)}</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground">
                <Lock className="h-4 w-4 text-foreground" aria-hidden="true" />
                <span>Read-only</span>
              </div>
            </div>
            <p className="mt-3 text-sm text-foreground">
              These are the capabilities the backend grants this account, derived from its platform role,
              institution memberships, and access grants. Access is changed only through those canonical
              commands. There is no permission editor.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-3 py-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : resolutionError ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 text-warning" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Effective access could not be resolved.</p>
                  <p className="text-sm text-foreground">
                    The account is treated as having no authority until this resolves. Try again shortly, or
                    review the account&apos;s memberships and access grants.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {isSuperAdmin && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="font-medium text-foreground">Platform administrator</p>
                  <p className="mt-1 text-sm text-foreground">
                    This account holds platform-wide authority across every tenant.
                  </p>
                </div>
              )}

              {platformCapabilities.length > 0 && (
                <section aria-labelledby="effective-platform-caps">
                  <h3 id="effective-platform-caps" className="text-sm font-semibold text-foreground">
                    Platform capabilities ({platformCapabilities.length})
                  </h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {platformCapabilities.map((capability) => (
                      <li
                        key={capability}
                        className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs text-foreground"
                      >
                        {capability}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {institutions.length > 0 && (
                <section aria-labelledby="effective-tenant-caps" className="space-y-3">
                  <h3 id="effective-tenant-caps" className="text-sm font-semibold text-foreground">
                    Institution access ({institutions.length})
                  </h3>
                  {institutions.map((institution) => (
                    <div key={institution.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-foreground" aria-hidden="true" />
                        <p className="font-medium text-foreground">
                          {institution.name || institution.code || institution.id}
                        </p>
                        {institution.code && (
                          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground">
                            {institution.code}
                          </span>
                        )}
                      </div>
                      {institution.capabilities.length > 0 ? (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {institution.capabilities.map((capability) => (
                            <li
                              key={capability}
                              className="rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-xs text-foreground"
                            >
                              {capability}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-foreground">No capabilities for this institution.</p>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {hasNoAuthority && (
                <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-center">
                  <p className="text-sm font-medium text-foreground">No administrative access</p>
                  <p className="mt-1 text-sm text-foreground">
                    This account has no platform capabilities and no institution memberships or grants.
                    Grant access through the account&apos;s platform role, an institution membership, or an
                    access grant.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium text-foreground">Changing this account&apos;s access</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                  <li>Edit the platform role from the user edit action.</li>
                  <li>Manage institution memberships and staff invitations from the tenant staff console.</li>
                  <li>Manage access grants from the tenant access-grants console.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="min-h-touch min-w-touch">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
