import type { AuditLogEntry, AuditLogFilters, AuditLogSummary } from '@/services/admin/audit'
import { formatTimestamp, toDateInputValue } from '@/lib/dateFormat'
import { autoTable, type HookData } from 'jspdf-autotable'

export type AuditExportFormat = 'csv' | 'json' | 'pdf'

interface AuditExportOptions {
  entries: AuditLogEntry[]
  filters?: AuditLogFilters
  summary?: AuditLogSummary
  filenameBase?: string
}

function sanitizeFileSegment(value: string) {
  return value.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase()
}

function buildFileName(filenameBase: string | undefined, extension: string) {
  const safeBase = sanitizeFileSegment(filenameBase || `audit-log-${toDateInputValue(new Date())}`)
  return `${safeBase || 'audit-log'}.${extension}`
}

function downloadBlob(blob: Blob, fileName: string) {
  if (typeof document === 'undefined') {
    return
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function escapeCsv(value: unknown) {
  const normalized = value == null ? '' : String(value)
  return `"${normalized.replace(/"/g, '""')}"`
}

function formatActor(entry: AuditLogEntry) {
  return entry.actorEmail || entry.actorName || 'System'
}

function formatEntity(entry: AuditLogEntry) {
  if (!entry.targetTable) {
    return ''
  }

  return entry.targetId ? `${entry.targetTable} (${entry.targetId})` : entry.targetTable
}

function formatFilters(filters?: AuditLogFilters) {
  if (!filters) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false
      }

      if (typeof value === 'string') {
        return value.trim().length > 0
      }

      return true
    })
  )
}

export function exportAuditEntriesToCsv({
  entries,
  filenameBase,
}: AuditExportOptions) {
  const rows = [
    [
      'Timestamp',
      'Category',
      'Action',
      'Actor',
      'Role',
      'Entity',
      'Request IP / IP Hash',
      'Request User Agent / User Agent Hash',
    ].join(','),
    ...entries.map((entry) =>
      [
        escapeCsv(entry.createdAt),
        escapeCsv(entry.category),
        escapeCsv(entry.action),
        escapeCsv(formatActor(entry)),
        escapeCsv(entry.actorRoles?.join(', ') || ''),
        escapeCsv(formatEntity(entry)),
        escapeCsv(entry.requestIp || entry.ipHash || ''),
        escapeCsv(entry.requestUserAgent || entry.userAgentHash || ''),
      ].join(',')
    ),
  ]

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, buildFileName(filenameBase, 'csv'))
}

export function exportAuditEntriesToJson({
  entries,
  filters,
  summary,
  filenameBase,
}: AuditExportOptions) {
  const payload = {
    exportedAt: new Date().toISOString(),
    filters: formatFilters(filters),
    summary: summary || null,
    totalEntries: entries.length,
    entries,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, buildFileName(filenameBase, 'json'))
}

export async function exportAuditEntriesToPdf({
  entries,
  filters,
  summary,
  filenameBase,
}: AuditExportOptions) {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'landscape' })
  const exportTime = formatTimestamp(new Date())
  let startY = 16

  doc.setFontSize(18)
  doc.text('Beanola Audit Trail Export', 14, startY)
  startY += 7

  doc.setFontSize(10)
  doc.text(`Generated: ${exportTime}`, 14, startY)
  startY += 6

  const activeFilters = formatFilters(filters)
  const filterText = Object.entries(activeFilters)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' | ')

  if (filterText) {
    doc.text(`Filters: ${filterText}`, 14, startY)
    startY += 6
  }

  if (summary) {
    const categorySummary = Object.entries(summary.categoryBreakdown)
      .map(([label, count]) => `${label}: ${count}`)
      .join(' | ')

    doc.text(`Unique actors: ${summary.uniqueActors}`, 14, startY)
    startY += 6

    if (categorySummary) {
      doc.text(`Categories: ${categorySummary}`, 14, startY)
      startY += 6
    }
  }

  autoTable(doc, {
    startY,
    head: [['Time', 'Category', 'Action', 'Actor', 'Role', 'Entity', 'IP / Hash']],
    body: entries.map((entry) => [
      entry.createdAt,
      entry.category,
      entry.action,
      formatActor(entry),
      entry.actorRoles?.join(', ') || '',
      formatEntity(entry),
      entry.requestIp || entry.ipHash || '',
    ]),
    theme: 'grid',
    styles: {
      fontSize: 8,
      overflow: 'linebreak',
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
    },
    margin: { left: 10, right: 10, top: 12, bottom: 14 },
    didDrawPage: (data: HookData) => {
      const pageCount = doc.internal.pages.length - 1
      const currentPage = doc.getCurrentPageInfo().pageNumber
      doc.setFontSize(8)
      doc.text(
        `Page ${currentPage} of ${pageCount}`,
        data.settings.margin.left,
        doc.internal.pageSize.height - 8
      )
    },
  })

  doc.save(buildFileName(filenameBase, 'pdf'))
}
