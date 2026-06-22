/**
 * TenantBrandingPanel (enterprise-tenant-authority, task 13.2).
 *
 * Manages a school's versioned branding assets (logos, signatures, seals) used
 * by white-label portals and backend-generated official documents.
 *
 * Capability gating (R12.6) — the backend re-enforces every read and write:
 *   - **Read** when the actor is a Super_Admin or holds `tenant.profile.read`
 *     for the institution.
 *   - **Manage** (upload / register / deactivate) only when the actor holds the
 *     platform `platform.asset.manage` capability. Branding is a platform-scoped
 *     concern, so a Tenant_Admin gets a read-only view (mutation controls are
 *     removed, not just disabled).
 *
 * On a backend 403 the panel renders a precise authorization message and no
 * tenant data (R12.7).
 */
import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Image as ImageIcon, UploadCloud } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { toast } from '@/hooks/useToast'
import { tenantAdminService, type TenantAsset } from '@/services/admin/tenants'

import { tenantErrorMessage } from './errors'
import { PanelNoAccess, PanelStateError } from './panelStates'
import { ResourceList, TENANT_SELECT_CLASS } from './primitives'

interface AssetFormState {
  asset_type: string
  storage_key: string
  public_url: string
  mime_type: string
  checksum_sha256: string
  file: File | null
}

const emptyAssetForm: AssetFormState = {
  asset_type: 'logo',
  storage_key: '',
  public_url: '',
  mime_type: 'image/png',
  checksum_sha256: '',
  file: null,
}

type AssetUploadState = { status: 'idle' | 'success' | 'error'; message: string }

function optionalString(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

export function TenantBrandingPanel({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient()
  const { isSuperAdmin, can, canForInstitution } = useCapabilities()

  const canRead = isSuperAdmin || canForInstitution(institutionId, 'tenant.profile.read')
  const canManage = isSuperAdmin && can('platform.asset.manage')

  const [assetForm, setAssetForm] = useState<AssetFormState>(emptyAssetForm)
  const [assetUpload, setAssetUpload] = useState<AssetUploadState>({ status: 'idle', message: '' })

  const assetsQuery = useQuery({
    queryKey: ['admin', 'tenants', 'assets', institutionId],
    queryFn: () => tenantAdminService.listAssets(institutionId),
    enabled: Boolean(institutionId) && canRead,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] })
  }

  const assetMutation = useMutation({
    mutationFn: () => {
      if (assetForm.file) {
        return tenantAdminService.uploadAsset(institutionId, {
          asset_type: assetForm.asset_type,
          file: assetForm.file,
        })
      }
      return tenantAdminService.createAsset(institutionId, {
        asset_type: assetForm.asset_type,
        storage_key: assetForm.storage_key.trim(),
        public_url: optionalString(assetForm.public_url),
        mime_type: assetForm.mime_type,
        checksum_sha256: assetForm.checksum_sha256.trim(),
        is_active: true,
      })
    },
    onSuccess: () => {
      setAssetUpload({ status: 'success', message: 'Asset registered and validated.' })
      toast.success('Asset registered')
      setAssetForm(emptyAssetForm)
      invalidate()
    },
    onError: (error) => {
      const message = tenantErrorMessage(error, 'Asset failed validation and was not stored.')
      setAssetUpload({ status: 'error', message })
      toast.error(message)
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (assetId: string) => tenantAdminService.updateAsset(institutionId, assetId, { is_active: false }),
    onSuccess: () => {
      toast.success('Asset deactivated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Asset was not deactivated')),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!assetForm.file && (!assetForm.storage_key.trim() || !assetForm.checksum_sha256.trim())) {
      toast.error('Upload a file or provide storage key and checksum')
      return
    }
    setAssetUpload({ status: 'idle', message: '' })
    assetMutation.mutate()
  }

  // R13.4: SVG assets cannot be rasterised into backend-generated official PDFs.
  const assetFileIsSvg =
    assetForm.file != null &&
    (assetForm.file.type === 'image/svg+xml' || assetForm.file.name.toLowerCase().endsWith('.svg'))
  const assetIsSvg = assetForm.mime_type === 'image/svg+xml' || assetFileIsSvg

  if (!canRead) {
    return (
      <SectionCard title="Branding assets" description="Logos, signatures, and seals." icon={<ImageIcon className="h-5 w-5" />}>
        <PanelNoAccess />
      </SectionCard>
    )
  }

  const assets = assetsQuery.data || []

  return (
    <SectionCard
      title="Branding assets"
      description={
        canManage
          ? 'Upload versioned logos, signatures, and seals. New versions never alter assets on already-generated documents.'
          : 'Logos, signatures, and seals configured for your school. Branding is managed by your platform administrator.'
      }
      icon={<ImageIcon className="h-5 w-5" />}
    >
      {assetsQuery.isError ? (
        <PanelStateError
          error={assetsQuery.error}
          onRetry={() => assetsQuery.refetch()}
          fallback="Could not load this school's branding assets."
        />
      ) : (
        <>
          {canManage && (
            <>
              {assetUpload.status !== 'idle' && (
                <div
                  role="status"
                  className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                    assetUpload.status === 'success'
                      ? 'border-success/25 bg-success/10 text-success'
                      : 'border-destructive/25 bg-destructive/10 text-destructive'
                  }`}
                >
                  {assetUpload.status === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <UploadCloud className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{assetUpload.message}</span>
                </div>
              )}
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
                <select
                  value={assetForm.asset_type}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, asset_type: event.target.value }))}
                  className={TENANT_SELECT_CLASS}
                  aria-label="Asset type"
                >
                  <option value="logo">Logo</option>
                  <option value="signature">Signature</option>
                  <option value="seal">Seal</option>
                </select>
                <select
                  value={assetForm.mime_type}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, mime_type: event.target.value }))}
                  className={TENANT_SELECT_CLASS}
                  aria-label="Asset MIME type"
                >
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/webp">WebP</option>
                  <option value="image/svg+xml">SVG</option>
                </select>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))}
                  aria-label="Asset file"
                  className="sm:col-span-2"
                />
                {assetIsSvg && (
                  <div
                    role="alert"
                    className="sm:col-span-2 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"
                  >
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-foreground">Warning — SVG will not render in official PDFs</p>
                      <p className="text-muted-foreground">
                        Backend-generated PDF documents (acceptance letters, receipts, application slips) cannot
                        rasterise SVG logos or signatures. The renderer records an
                        <span className="font-medium text-foreground"> unsupported</span> status and skips the asset,
                        so it will be missing from official documents. Upload a raster version (PNG, JPEG, or WebP) for
                        logos and signatures used in PDFs.
                      </p>
                    </div>
                  </div>
                )}
                <Input
                  value={assetForm.storage_key}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, storage_key: event.target.value }))}
                  placeholder="R2/storage key (manual registration)"
                  aria-label="Asset storage key"
                />
                <Input
                  value={assetForm.public_url}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, public_url: event.target.value }))}
                  placeholder="Public URL, optional"
                  aria-label="Asset public URL"
                />
                <Input
                  value={assetForm.checksum_sha256}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, checksum_sha256: event.target.value }))}
                  placeholder="SHA-256 checksum (manual registration)"
                  aria-label="Asset checksum"
                  className="sm:col-span-2"
                />
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" loading={assetMutation.isPending}>
                    <UploadCloud className="h-4 w-4" aria-hidden="true" /> {assetForm.file ? 'Upload asset' : 'Register asset'}
                  </Button>
                </div>
              </form>
            </>
          )}

          <ResourceList
            empty="No branding assets registered."
            onDeactivate={canManage ? (id) => deactivateMutation.mutate(id) : undefined}
            items={(assets as TenantAsset[]).map((item) => ({
              id: item.id,
              title: `${item.asset_type} v${item.version ?? 1}`,
              meta: `${item.mime_type} · ${item.storage_key}`,
              active: item.is_active !== false,
            }))}
          />
        </>
      )}
    </SectionCard>
  )
}
