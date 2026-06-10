import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye, FileText, GitCompare, ScrollText } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SectionCard, StatusBadge } from '@/components/ui'
import { toast } from '@/hooks/useToast'
import { tenantAdminService, type TenantTemplate } from '@/services/admin/tenants'
import { tenantErrorMessage } from './errors'
import { ResourceList, TENANT_SELECT_CLASS } from './primitives'

const DOCUMENT_TYPES = [
  { value: 'application_slip', label: 'Application slip' },
  { value: 'acceptance_letter', label: 'Acceptance letter' },
  { value: 'conditional_offer', label: 'Conditional offer' },
  { value: 'finance_receipt', label: 'Finance receipt' },
  { value: 'payment_receipt', label: 'Payment receipt' },
]

const ALLOWED_TOKENS = [
  'student_name',
  'program_name',
  'institution_name',
  'intake_name',
  'application_code',
  'decision_date',
]

function templateBody(template: TenantTemplate | null): string {
  if (!template?.sections) return ''
  const sections = template.sections as Record<string, unknown>
  const body = sections.body
  return typeof body === 'string' ? body : ''
}

/** Render preview tokens against sample data for the official-document preview. */
function renderPreview(body: string): string {
  const sample: Record<string, string> = {
    student_name: 'Jane M. Banda',
    program_name: 'Diploma in Clinical Medicine',
    institution_name: 'Beanola Partner School',
    intake_name: 'January 2026',
    application_code: 'APP-20260115-ABCD1234',
    decision_date: '15 January 2026',
  }
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, token: string) => {
    const key = token.toLowerCase()
    if (key in sample) return sample[key]!
    return `[unknown token: ${token}]`
  })
}

interface TemplatesPanelProps {
  institutionId: string
  templates: TenantTemplate[]
  onChanged: () => void
}

/**
 * Document template management with version diff/clone and an official-document
 * preview (R11.7). Templates use safe sections + allowlisted tokens — never raw
 * merge documents — matching the backend `AdminDocumentTemplateSerializer`.
 */
export function TemplatesPanel({ institutionId, templates, onChanged }: TemplatesPanelProps) {
  const queryClient = useQueryClient()
  const [documentType, setDocumentType] = useState('acceptance_letter')
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [diffLeftId, setDiffLeftId] = useState<string>('')
  const [diffRightId, setDiffRightId] = useState<string>('')
  const [previewId, setPreviewId] = useState<string>('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tenants', 'detail'] })
    onChanged()
  }

  const createMutation = useMutation({
    mutationFn: (payload: { document_type: string; name: string; body: string }) =>
      tenantAdminService.createTemplate(institutionId, {
        document_type: payload.document_type,
        name: payload.name,
        sections: { body: payload.body },
        is_active: true,
      }),
    onSuccess: () => {
      toast.success('Template saved')
      setName('')
      setBody('')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Template was not saved')),
  })

  const deactivateMutation = useMutation({
    mutationFn: (templateId: string) => tenantAdminService.updateTemplate(institutionId, templateId, { is_active: false }),
    onSuccess: () => {
      toast.success('Template deactivated')
      invalidate()
    },
    onError: (error) => toast.error(tenantErrorMessage(error, 'Template was not deactivated')),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !body.trim()) {
      toast.error('Template name and body are required')
      return
    }
    createMutation.mutate({ document_type: documentType, name: name.trim(), body: body.trim() })
  }

  const cloneTemplate = (template: TenantTemplate) => {
    setDocumentType(template.document_type)
    setName(`${template.name} (copy)`)
    setBody(templateBody(template))
    toast.success('Template loaded into the editor — save to create a new version')
  }

  const diffLeft = useMemo(() => templates.find(item => item.id === diffLeftId) || null, [templates, diffLeftId])
  const diffRight = useMemo(() => templates.find(item => item.id === diffRightId) || null, [templates, diffRightId])
  const previewTemplate = useMemo(() => templates.find(item => item.id === previewId) || null, [templates, previewId])

  return (
    <SectionCard
      title="Document templates"
      description="Safe template sections for official backend-generated documents. Use allowlisted tokens only."
      icon={<ScrollText className="h-5 w-5" />}
    >
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            value={documentType}
            onChange={event => setDocumentType(event.target.value)}
            className={TENANT_SELECT_CLASS}
            aria-label="Template document type"
          >
            {DOCUMENT_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <Input value={name} onChange={event => setName(event.target.value)} placeholder="Template name" aria-label="Template name" />
        </div>
        <Textarea
          value={body}
          onChange={event => setBody(event.target.value)}
          placeholder="Body with safe tokens, e.g. Dear {{student_name}}, welcome to {{program_name}}."
          aria-label="Template body"
          rows={5}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Allowed tokens:</span>
          {ALLOWED_TOKENS.map(token => (
            <button
              key={token}
              type="button"
              onClick={() => setBody(prev => `${prev}{{${token}}}`)}
              className="min-h-touch rounded-md border border-border/60 bg-muted px-2 py-1 text-xs font-medium text-foreground hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {`{{${token}}}`}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={createMutation.isPending}>
            <ScrollText className="h-4 w-4" aria-hidden="true" /> Save template
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Versions</p>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates configured.</p>
        ) : (
          templates.map(template => (
            <div key={template.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words text-sm font-medium text-foreground">{template.name}</p>
                    <StatusBadge tone="info" label={`v${template.version}`} />
                    {template.is_active === false && <StatusBadge tone="muted" label="Inactive" />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{template.document_type}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="xs" variant="outline" onClick={() => cloneTemplate(template)}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Clone
                  </Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => setPreviewId(template.id)}>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Preview
                  </Button>
                  {template.is_active !== false && (
                    <Button type="button" size="xs" variant="outline" onClick={() => deactivateMutation.mutate(template.id)}>
                      Deactivate
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {templates.length >= 2 && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <GitCompare className="h-4 w-4" aria-hidden="true" /> Compare versions
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={diffLeftId} onChange={event => setDiffLeftId(event.target.value)} className={TENANT_SELECT_CLASS} aria-label="Compare from version">
              <option value="">Select version…</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>
              ))}
            </select>
            <select value={diffRightId} onChange={event => setDiffRightId(event.target.value)} className={TENANT_SELECT_CLASS} aria-label="Compare to version">
              <option value="">Select version…</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>
              ))}
            </select>
          </div>
          {diffLeft && diffRight && (
            <div className="grid gap-3 sm:grid-cols-2">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-3 text-xs text-foreground">{templateBody(diffLeft) || '(empty)'}</pre>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-3 text-xs text-foreground">{templateBody(diffRight) || '(empty)'}</pre>
            </div>
          )}
        </div>
      )}

      {previewTemplate && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FileText className="h-4 w-4" aria-hidden="true" /> Official-document preview · {previewTemplate.name}
            </p>
            <Button type="button" size="xs" variant="outline" onClick={() => setPreviewId('')}>Close</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Preview only — official documents are generated by the backend with provenance. Tokens are filled with sample data.
          </p>
          <div className="whitespace-pre-wrap break-words rounded-md border border-border bg-background p-4 text-sm text-foreground">
            {renderPreview(templateBody(previewTemplate)) || '(empty template body)'}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
