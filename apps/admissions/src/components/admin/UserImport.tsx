/**
 * Previewed, tenant-bound user import (Admissions V2, task 9.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.3.
 * Requirement: **R6.4** · Finding: **ADM-04**.
 *
 * What this replaces. The dialog used to parse the CSV, validate it *in the
 * browser* against its own hardcoded list of acceptable roles, show the first
 * five rows as a courtesy, and then post a bare array. So:
 *
 * - the "preview" was a display of five rows, not a statement about the file;
 * - the role list was a third copy of a vocabulary the backend owns;
 * - nothing bound the accounts to a school, so an imported `admin` had a role
 *   string and zero tenant access;
 * - a failure was a row of prose in a dialog the operator then closed.
 *
 * Now: this component parses the file into rows and does nothing else. The
 * **server** splits names, normalises roles, applies the actor's ceiling per row,
 * finds duplicates within the batch and against existing accounts, and answers
 * with `would_commit` plus a row-addressed error list. Commit sends the same
 * rows, declares its atomicity mode, and carries an idempotency key.
 */
import React, { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import {
  useUserImportCommit,
  useUserImportPreview,
} from '@/hooks/admin/useUserDirectory'
import {
  downloadImportErrors,
  type UserImportMode,
  type UserImportPreview,
  type UserImportResult,
  type UserImportRowInput,
} from '@/services/admin/userDirectory'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { AlertTriangle, CheckCircle, Download, FileText, Upload, XCircle } from 'lucide-react'
import { sanitizeForLog, sanitizeText, sanitizeEmail } from '@/lib/sanitize'
import { toast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'

interface UserImportProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

/** The columns the import understands. Mirrors `IMPORT_ROW_FIELDS`. */
const REQUIRED_HEADERS = ['email', 'role'] as const

/**
 * RFC-4180-correct CSV row parser. Handles:
 * - Quoted fields containing commas, newlines, and apostrophes
 * - Escaped double-quotes ("") inside quoted fields
 * - Unquoted plain fields
 */
export function parseCSVRow(row: string): string[] {
  const fields: string[] = []
  let i = 0
  while (i <= row.length) {
    if (i === row.length) { fields.push(''); break }
    if (row[i] === '"') {
      let value = ''
      i++ // skip opening quote
      while (i < row.length) {
        if (row[i] === '"') {
          if (i + 1 < row.length && row[i + 1] === '"') {
            value += '"'
            i += 2
          } else {
            i++ // skip closing quote
            break
          }
        } else {
          value += row[i]
          i++
        }
      }
      fields.push(value)
      if (i < row.length && row[i] === ',') i++ // skip delimiter
    } else {
      const nextComma = row.indexOf(',', i)
      if (nextComma === -1) {
        fields.push(row.slice(i))
        break
      }
      fields.push(row.slice(i, nextComma))
      i = nextComma + 1
    }
  }
  return fields
}

/**
 * Split CSV text into logical rows, handling quoted fields that contain newlines.
 */
export function splitCSVRows(text: string): string[] {
  const rows: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') {
      inQuotes = !inQuotes
      current += ch
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++ // skip \r\n
      if (current.trim()) rows.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) rows.push(current)
  return rows
}

/**
 * Turn CSV text into import rows, verbatim.
 *
 * Deliberately *not* validation. Every judgement — is this role allowed, may
 * this actor assign it, is this address already taken, is this a duplicate of
 * row 12 — belongs to the server, because those are the only judgements that can
 * be true at commit time. This maps columns to fields and stops.
 */
export function csvToImportRows(text: string): {
  rows: UserImportRowInput[]
  missingHeaders: string[]
} {
  const lines = splitCSVRows(text)
  if (lines.length < 2) return { rows: [], missingHeaders: [...REQUIRED_HEADERS] }

  const headers = parseCSVRow(lines[0]!).map((header) => header.trim().toLowerCase())
  const missingHeaders = REQUIRED_HEADERS.filter(
    (required) => !headers.some((header) => header.includes(required)),
  )
  if (missingHeaders.length > 0) return { rows: [], missingHeaders }

  const rows: UserImportRowInput[] = []
  for (let index = 1; index < lines.length; index++) {
    const values = parseCSVRow(lines[index]!).map((value) => value.trim())
    const row: Partial<UserImportRowInput> = {}
    headers.forEach((header, column) => {
      const raw = values[column] ?? ''
      if (header.includes('email')) row.email = sanitizeEmail(raw)
      else if (header.includes('first')) row.first_name = sanitizeText(raw)
      else if (header.includes('last')) row.last_name = sanitizeText(raw)
      else if (header.includes('name')) row.full_name = sanitizeText(raw)
      else if (header.includes('phone')) row.phone = sanitizeText(raw)
      else if (header.includes('role')) row.role = sanitizeText(raw)
      else if (header.includes('password')) row.password = raw
    })
    rows.push({
      email: row.email ?? '',
      role: row.role ?? '',
      ...(row.full_name ? { full_name: row.full_name } : {}),
      ...(row.first_name ? { first_name: row.first_name } : {}),
      ...(row.last_name ? { last_name: row.last_name } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.password ? { password: row.password } : {}),
    })
  }
  return { rows, missingHeaders: [] }
}

export function UserImport({ isOpen, onClose, onImportComplete }: UserImportProps) {
  const { institutions } = useCapabilities()
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<UserImportRowInput[]>([])
  const [institutionId, setInstitutionId] = useState('')
  const [mode, setMode] = useState<UserImportMode>('all_or_nothing')
  const [preview, setPreview] = useState<UserImportPreview | null>(null)
  const [result, setResult] = useState<UserImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const previewMutation = useUserImportPreview()
  const commitMutation = useUserImportCommit()

  const scopedInstitutions = useMemo(() => institutions ?? [], [institutions])

  const reset = () => {
    setFile(null)
    setRows([])
    setPreview(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (!selected) return
    if (!(selected.type === 'text/csv' || selected.name.endsWith('.csv'))) {
      toast.error('Not a CSV', 'Choose a .csv file to import.')
      return
    }
    setFile(selected)
    setPreview(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (loaded) => {
      const text = (loaded.target?.result as string) || ''
      const parsed = csvToImportRows(text)
      if (parsed.missingHeaders.length > 0) {
        toast.error('Missing columns', parsed.missingHeaders.join(', '))
        reset()
        return
      }
      if (parsed.rows.length === 0) {
        toast.error('Nothing to import', 'The file has a header row and no data rows.')
        reset()
        return
      }
      setRows(parsed.rows)
    }
    reader.readAsText(selected)
  }

  const runPreview = async () => {
    if (!institutionId || rows.length === 0) return
    try {
      const answer = await previewMutation.mutateAsync({
        institution_id: institutionId,
        mode,
        rows,
      })
      setPreview(answer)
    } catch (error) {
      logger.error('Import preview failed:', sanitizeForLog(error))
      toast.error(
        'Preview failed',
        error instanceof Error ? error.message : 'Please try again.',
      )
    }
  }

  const runCommit = async () => {
    if (!preview || rows.length === 0) return
    try {
      const answer = await commitMutation.mutateAsync({
        institution_id: institutionId,
        mode,
        rows,
      })
      setResult(answer)
      if (answer.committed) onImportComplete()
    } catch (error) {
      logger.error('Import failed:', sanitizeForLog(error))
      toast.error(
        'Import failed',
        error instanceof Error ? error.message : 'Please try again.',
      )
    }
  }

  const downloadTemplate = () => {
    const template = [
      'full_name,email,phone,role,password',
      'John Doe,john.doe@example.com,+260970000001,student,',
      'Jane Smith,jane.smith@example.com,+260970000002,reviewer,',
    ].join('\n')
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'user_import_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const errors = result?.errors ?? preview?.errors ?? []

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>Import users</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!result && (
            <>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <h3 className="mb-2 font-medium text-foreground">How this import works</h3>
                <ul className="space-y-1 text-sm text-foreground">
                  <li>Required columns: email, role. Optional: full_name (or first/last), phone, password.</li>
                  <li>Every imported account is created into the school you choose, with an active membership, so it has access on first sign-in.</li>
                  <li>The server validates the whole file before anything is created, and tells you which rows would fail.</li>
                  <li>A row with no password gets a generated one; the platform never shows it here.</li>
                </ul>
              </div>

              <div className="flex justify-center">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Download template
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="import-institution" className="mb-1.5 block text-sm font-medium text-foreground">
                    School
                  </label>
                  <select
                    id="import-institution"
                    value={institutionId}
                    onChange={(event) => { setInstitutionId(event.target.value); setPreview(null) }}
                    className="min-h-touch h-12 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Choose a school…</option>
                    {scopedInstitutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.name || institution.code}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-sm text-foreground">
                    Required. Imported accounts belong to a school.
                  </p>
                </div>
                <div>
                  <label htmlFor="import-mode" className="mb-1.5 block text-sm font-medium text-foreground">
                    If a row fails
                  </label>
                  <select
                    id="import-mode"
                    value={mode}
                    onChange={(event) => { setMode(event.target.value as UserImportMode); setPreview(null) }}
                    className="min-h-touch h-12 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="all_or_nothing">Import nothing (recommended)</option>
                    <option value="per_row">Import the rows that worked</option>
                  </select>
                  <p className="mt-1.5 text-sm text-foreground">
                    A partly-imported intake is harder to reconcile than a rejected one.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border-2 border-dashed border-input p-8 text-center transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-label="Choose a CSV file to import"
                />
                <FileText className="mx-auto mb-4 h-12 w-12 text-foreground" aria-hidden="true" />
                <h3 className="mb-2 text-lg font-medium text-foreground">
                  {file ? file.name : 'Select a CSV file'}
                </h3>
                <p className="mb-4 text-foreground">
                  {rows.length > 0
                    ? `${rows.length} row${rows.length === 1 ? '' : 's'} read from the file.`
                    : 'Choose a CSV file to import users.'}
                </p>
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="mr-2">
                  <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                  {file ? 'Change file' : 'Select file'}
                </Button>
                {file && (
                  <Button onClick={reset} variant="outline">Clear</Button>
                )}
              </div>

              {preview && (
                <div
                  className={`rounded-lg border p-4 ${
                    preview.would_commit
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-destructive/30 bg-destructive/5'
                  }`}
                  role="status"
                >
                  <p className="text-sm font-medium text-foreground">
                    {preview.would_commit
                      ? `Ready to import ${preview.valid_count} of ${preview.submitted_count} rows.`
                      : mode === 'all_or_nothing'
                        ? `${preview.error_count} row${preview.error_count === 1 ? '' : 's'} would fail, so nothing would be imported.`
                        : 'No row in this file can be imported.'}
                  </p>
                  {preview.rows.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full divide-y divide-border" aria-label="Rows that would be created">
                        <thead className="bg-accent">
                          <tr>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase text-foreground">Row</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase text-foreground">Name</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase text-foreground">Email</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase text-foreground">Role</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase text-foreground">Password</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-card">
                          {preview.rows.slice(0, 10).map((row) => (
                            <tr key={row.index}>
                              <td className="px-3 py-2 text-sm text-foreground">{row.index}</td>
                              <td className="px-3 py-2 text-sm text-foreground">{row.full_name}</td>
                              <td className="px-3 py-2 text-sm text-foreground">{row.email}</td>
                              <td className="px-3 py-2 text-sm text-foreground">{row.role}</td>
                              <td className="px-3 py-2 text-sm text-foreground">
                                {row.will_receive_generated_password ? 'Generated' : 'From file'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {preview.rows.length > 10 && (
                        <p className="mt-2 text-sm text-foreground">
                          …and {preview.rows.length - 10} more valid row{preview.rows.length - 10 === 1 ? '' : 's'}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                    <CheckCircle className="h-6 w-6 text-accent" aria-hidden="true" />
                  </div>
                  <p className="text-2xl font-bold text-foreground" data-testid="import-created-count">
                    {result.created}
                  </p>
                  <p className="text-sm text-foreground">Created</p>
                </div>
                <div className="text-center">
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                    <XCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
                  </div>
                  <p className="text-2xl font-bold text-destructive" data-testid="import-failed-count">
                    {result.failed}
                  </p>
                  <p className="text-sm text-foreground">Failed</p>
                </div>
              </div>
              {!result.committed && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="status">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
                    <div className="text-sm text-foreground">
                      <p className="font-medium">Nothing was imported.</p>
                      <p>
                        Fix the rows below and upload the file again. No account was created,
                        so re-uploading the corrected file is safe.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-medium text-foreground">
                  {errors.length} row{errors.length === 1 ? '' : 's'} need attention
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadImportErrors(errors)}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Download failures
                </Button>
              </div>
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {errors.map((error, index) => (
                  <div
                    key={`${error.index ?? 'row'}-${index}`}
                    className="rounded border bg-card p-2 text-sm text-foreground"
                  >
                    <p className="font-medium">
                      Row {error.index ?? '—'}: {error.message}
                    </p>
                    <p className="mt-1 text-xs text-foreground">
                      {error.code}
                      {error.field ? ` · ${error.field}` : ''}
                      {error.email ? ` · ${error.email}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={reset}>Import another file</Button>
              <Button onClick={onClose}>Close</Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={previewMutation.isPending || commitMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={runPreview}
                loading={previewMutation.isPending}
                disabled={!institutionId || rows.length === 0}
              >
                Check the file
              </Button>
              <Button
                onClick={runCommit}
                loading={commitMutation.isPending}
                // A commit is offered only once the server has said the batch
                // would commit. Offering it before that is what made the old
                // "preview" decorative.
                disabled={!preview?.would_commit}
              >
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                Import {preview?.valid_count ?? 0} users
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
