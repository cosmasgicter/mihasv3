/**
 * TenantDocumentsPanel (enterprise-tenant-authority, task 13.2).
 *
 * Lists the documents a school requests from applicants and (for authorized
 * actors) lets new required documents be configured or deactivated.
 *
 * Capability gating (R12.6) — the backend re-enforces every read and write:
 *   - **Read** when the actor is a Super_Admin or holds `tenant.document.read`.
 *   - **Manage** (add / deactivate) only when the actor holds the platform
 *     `platform.document.manage` capability. A Tenant_Admin gets a read-only
 *     view (mutation controls are removed, not just disabled).
 *
 * On a backend 403 the panel renders a precise authorization message and no
 * tenant data (R12.7).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, FileText, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { toast } from '@/hooks/useToast'
import { tenantAdminService } from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { PanelNoAccess, PanelReadOnlyNotice, PanelStateError } from './panelStates'
import { ResourceList, TENANT_SELECT_CLASS } from './primitives'

interface RequiredDocumentFormState {
  document_type: string
  label: string
  program_id: string
  canonical_program_id: string
}

const emptyForm: RequiredDocumentFormState = {
  document_type: 'identity_document',
  label: '',
  program_id: '',
  canonical_program_id: '',
}

function optionalString(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

export function TenantDocumentsPanel({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient()
  const { isSuperAdmin, can, canForInstitution } = useCapabilities()

  const canRead = isSuperAdmin || canForInstitution(institutionId, 'tenant.document.read')
  const canManage = isSuperAdmin && can('platform.document.manage')

  const [form, setForm] = useState<RequiredDocumentFormState>(emptyForm)

  const documentsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'required-documents', institutionId],
    queryFn: () => tenantAdminService.listRequiredDocuments(institutionId),
    enabled: Boolean(institutionId) && canRead,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      tenantAdminService.createRequiredDocument(institutionId, {
        document_type: form.document_type,
        label: form.label.trim(),
        program_id: optionalString(form.program_id),
        canonical_program_id: optionalString(form.canonical_program_id),
        is_required: true,
        is_active: true,
      }),
    onSuccess: () => {
      toast.success('Required document added')
      setForm(emptyForm)
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Required document was not added')),
  })

  const deactivateMutation = useMutation({
    mutationFn: (documentId: string) =>
      tenantAdminService.updateRequiredDocument(institutionId, documentId, { is_active: false }),
    onSuccess: () => {
      toast.success('Required document deactivated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Required document was not deactivated')),
  })

  if (!canRead) {
    return (
      <SectionCard title="Required documents" description="Documents requested from applicants." icon={<ShieldCheck className="h-5 w-5" />}>
        <PanelNoAccess />
      </SectionCard>
    )
  }

  const documents = documentsQuery.data || []

  return (
    <SectionCard
      title="Required documents"
      description="Documents requested from applicants to this school."
      icon={<ShieldCheck className="h-5 w-5" />}
    >
      {documentsQuery.isError ? (
        <PanelStateError
          error={documentsQuery.error}
          onRetry={() => documentsQuery.refetch()}
          fallback="Could not load this school's required documents."
        />
      ) : canManage ? (
        <>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!form.label.trim()) {
                toast.error('Document label is required')
                return
              }
              createMutation.mutate()
            }}
          >
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Document type</span>
              <select
                value={form.document_type}
                onChange={(event) => setForm((prev) => ({ ...prev, document_type: event.target.value }))}
                className={TENANT_SELECT_CLASS}
                aria-label="Required document type"
              >
                <option value="identity_document">Identity document</option>
                <option value="academic_transcript">Academic transcript</option>
                <option value="passport_photo">Passport photo</option>
                <option value="proof_of_payment">Proof of payment</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Displayed label</span>
              <Input
                value={form.label}
                onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                placeholder="e.g. Grade 12 certificate"
                aria-label="Required document label"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Offering ID</span>
              <Input
                value={form.program_id}
                onChange={(event) => setForm((prev) => ({ ...prev, program_id: event.target.value }))}
                placeholder="Optional UUID"
                aria-label="Program offering ID"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Canonical program ID</span>
              <Input
                value={form.canonical_program_id}
                onChange={(event) => setForm((prev) => ({ ...prev, canonical_program_id: event.target.value }))}
                placeholder="Optional UUID"
                aria-label="Canonical program ID"
              />
            </label>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" loading={createMutation.isPending} className="w-full sm:w-auto">
                <FilePlus2 className="h-4 w-4" aria-hidden="true" /> Add document
              </Button>
            </div>
          </form>
          <ResourceList
            empty="No required documents configured."
            deactivatingId={deactivateMutation.isPending ? deactivateMutation.variables ?? null : null}
            onDeactivate={(id) => deactivateMutation.mutate(id)}
            items={documents.map((item) => ({
              id: item.id,
              title: item.label,
              meta: `${item.document_type} · ${item.is_required === false ? 'Optional' : 'Required'}`,
              active: item.is_active !== false,
            }))}
          />
        </>
      ) : documents.length === 0 ? (
        <div className="space-y-3">
          <PanelReadOnlyNotice description="Required document changes are managed by your platform administrator. This view is read-only." />
          <p className="text-sm text-muted-foreground">No required documents configured.</p>
        </div>
      ) : (
        // Read-only view for a tenant-admin without manage capability.
        <div className="space-y-3">
          <PanelReadOnlyNotice description="Required document changes are managed by your platform administrator. This view is read-only." />
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">{doc.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.document_type} · {doc.is_required === false ? 'Optional' : 'Required'}
                    {doc.is_active === false ? ' · inactive' : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
