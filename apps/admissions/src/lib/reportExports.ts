// Dynamic imports for heavy libraries
export type { ReportFormat, ProgramBreakdownStats, ReportExportData } from './reportExports.types'
import type { ReportFormat, ReportExportData } from './reportExports.types'
import { formatTimestamp } from '@/lib/dateFormat'

// jspdf-autotable adds lastAutoTable to the jsPDF instance at runtime
interface JsPDFWithAutoTable {
  lastAutoTable?: { finalY: number }
}

const formatMetricName = (metric: string) =>
  ({
    pendingApplications: 'Decision Queue',
    paymentPendingReview: 'Awaiting Payment Review',
    paymentNotPaid: 'Awaiting Payment',
    paymentRejected: 'Payment Rejected',
    paymentVerified: 'Verified Payments',
  } as Record<string, string>)[metric] ||
  metric
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (str) => str.toUpperCase())

const sanitizeFileName = (fileName: string) =>
  fileName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')

const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const pushCsvBreakdown = (
  rows: string[],
  title: string,
  breakdown: Record<string, string | number> | undefined
) => {
  if (!breakdown || Object.keys(breakdown).length === 0) {
    return
  }

  const pushRow = (values: Array<string | number | null | undefined>) => {
    rows.push(values.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
  }

  pushRow([title, 'Value'])
  Object.entries(breakdown).forEach(([label, value]) => {
    pushRow([label, value])
  })
  pushRow([])
}

export const exportReportAsJson = (reportData: ReportExportData, fileName: string) => {
  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `${sanitizeFileName(fileName)}.json`)
}

export const exportReportAsCsv = (reportData: ReportExportData, fileName: string) => {
  const rows: string[] = []
  const pushRow = (values: Array<string | number | null | undefined>) => {
    rows.push(values.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
  }

  pushRow(['Report Title', reportData.metadata?.reportTitle || 'Analytics Report'])
  pushRow(['Reporting Period', reportData.period || ''])
  pushRow(['Generated', reportData.generatedAt ? formatTimestamp(reportData.generatedAt) : ''])
  pushRow([])

  if (reportData.statistics && Object.keys(reportData.statistics).length > 0) {
    pushRow(['Metric', 'Value'])
    Object.entries(reportData.statistics).forEach(([metric, value]) => {
      pushRow([formatMetricName(metric), typeof value === 'number' ? value.toLocaleString() : value])
    })
    pushRow([])
  }

  if (reportData.programBreakdown && Object.keys(reportData.programBreakdown).length > 0) {
    pushRow(['Program', 'Total', 'Approved', 'Rejected', 'Decision Queue'])
    Object.entries(reportData.programBreakdown).forEach(([program, breakdown]) => {
      pushRow([program, breakdown.total, breakdown.approved, breakdown.rejected, breakdown.pending])
    })
    pushRow([])
  }

  pushCsvBreakdown(rows, 'Payment Breakdown', reportData.metadata?.paymentBreakdown)
  pushCsvBreakdown(rows, 'Institution Breakdown', reportData.metadata?.institutionBreakdown)
  pushCsvBreakdown(rows, 'Applied Filters', reportData.metadata?.appliedFilters)

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${sanitizeFileName(fileName)}.csv`)
}

export const exportReportAsPdf = async (reportData: ReportExportData, fileName: string) => {
  const jsPDF = (await import('jspdf')).default
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF() as InstanceType<typeof jsPDF> & JsPDFWithAutoTable
  const marginLeft = 14
  let currentY = 20

  doc.setFontSize(18)
  doc.text(reportData.metadata?.reportTitle || 'Analytics Report', marginLeft, currentY)
  currentY += 8

  doc.setFontSize(12)
  if (reportData.period) {
    doc.text(`Reporting Period: ${reportData.period}`, marginLeft, currentY)
    currentY += 6
  }

  if (reportData.generatedAt) {
    doc.text(`Generated: ${formatTimestamp(reportData.generatedAt)}`, marginLeft, currentY)
    currentY += 10
  }

  if (reportData.statistics) {
    doc.setFont('helvetica', 'bold')
    doc.text('Key Metrics', marginLeft, currentY)
    doc.setFont('helvetica', 'normal')
    currentY += 4

    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      head: [['Metric', 'Value']],
      body: Object.entries(reportData.statistics).map(([metric, value]) => [
        formatMetricName(metric),
        typeof value === 'number' ? value.toLocaleString() : value
      ]),
      styles: {
        fontSize: 10
      },
      headStyles: {
        fillColor: [37, 99, 235]
      }
    })

    currentY = (doc.lastAutoTable?.finalY || currentY) + 10
  }

  if (reportData.programBreakdown && Object.keys(reportData.programBreakdown).length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Program Breakdown', marginLeft, currentY)
    doc.setFont('helvetica', 'normal')
    currentY += 4

    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      head: [['Program', 'Total', 'Approved', 'Rejected', 'Decision Queue']],
      body: Object.entries(reportData.programBreakdown).map(([program, breakdown]) => [
        program,
        breakdown.total,
        breakdown.approved,
        breakdown.rejected,
        breakdown.pending
      ]),
      styles: {
        fontSize: 10
      },
      headStyles: {
        fillColor: [14, 165, 233]
      }
    })

    currentY = (doc.lastAutoTable?.finalY || currentY) + 10
  }

  if (reportData.metadata?.paymentBreakdown && Object.keys(reportData.metadata.paymentBreakdown).length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Payment Breakdown', marginLeft, currentY)
    doc.setFont('helvetica', 'normal')
    currentY += 4

    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      head: [['Payment State', 'Count']],
      body: Object.entries(reportData.metadata.paymentBreakdown).map(([label, value]) => [label, value]),
      styles: {
        fontSize: 10
      },
      headStyles: {
        fillColor: [14, 165, 233]
      }
    })

    currentY = (doc.lastAutoTable?.finalY || currentY) + 10
  }

  if (reportData.metadata?.institutionBreakdown && Object.keys(reportData.metadata.institutionBreakdown).length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Institution Breakdown', marginLeft, currentY)
    doc.setFont('helvetica', 'normal')
    currentY += 4

    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      head: [['Institution', 'Applications']],
      body: Object.entries(reportData.metadata.institutionBreakdown).map(([label, value]) => [label, value]),
      styles: {
        fontSize: 10
      },
      headStyles: {
        fillColor: [15, 118, 110]
      }
    })
  }

  if (reportData.metadata?.appliedFilters && Object.keys(reportData.metadata.appliedFilters).length > 0) {
    const nextY = (doc.lastAutoTable?.finalY || currentY) + 10
    doc.setFont('helvetica', 'bold')
    doc.text('Applied Filters', marginLeft, nextY)
    doc.setFont('helvetica', 'normal')

    autoTable(doc, {
      startY: nextY + 4,
      theme: 'grid',
      head: [['Filter', 'Value']],
      body: Object.entries(reportData.metadata.appliedFilters).map(([label, value]) => [label, value]),
      styles: {
        fontSize: 10
      },
      headStyles: {
        fillColor: [55, 65, 81]
      }
    })
  }

  const safeFileName = `${sanitizeFileName(fileName)}.pdf`
  doc.save(safeFileName)
}

export const exportReportAsExcel = async (reportData: ReportExportData, fileName: string) => {
  // @ts-ignore -- exceljs is an optional peer dependency, may not have type declarations in CI
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date()
  workbook.modified = new Date()

  const summarySheet = workbook.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 1 }] })
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 32 },
    { header: 'Value', key: 'value', width: 20 }
  ]

  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '2563EBFF' }
  }

  if (reportData.period) {
    summarySheet.addRow({ metric: 'Reporting Period', value: reportData.period })
  }

  if (reportData.generatedAt) {
    summarySheet.addRow({ metric: 'Generated', value: formatTimestamp(reportData.generatedAt) })
  }

  if (reportData.approvalRate !== undefined) {
    summarySheet.addRow({ metric: 'Approval Rate', value: `${reportData.approvalRate}%` })
  }

  if (reportData.statistics) {
    Object.entries(reportData.statistics).forEach(([metric, value]) => {
      summarySheet.addRow({
        metric: formatMetricName(metric),
        value: typeof value === 'number' ? value : `${value}`
      })
    })
  }

  summarySheet.eachRow((row: { border: unknown }, rowNumber: number) => {
    if (rowNumber !== 1) {
      row.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      }
    }
  })

  const programEntries = reportData.programBreakdown ? Object.entries(reportData.programBreakdown) : []
  if (programEntries.length > 0) {
    const programSheet = workbook.addWorksheet('Programs', { views: [{ state: 'frozen', ySplit: 1 }] })
    programSheet.columns = [
      { header: 'Program', key: 'program', width: 32 },
      { header: 'Total', key: 'total', width: 12 },
      { header: 'Approved', key: 'approved', width: 12 },
      { header: 'Rejected', key: 'rejected', width: 12 },
      { header: 'Decision Queue', key: 'pending', width: 18 }
    ]

    programSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    programSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '0EA5E9FF' }
    }

    programEntries.forEach(([program, breakdown]) => {
      programSheet.addRow({
        program,
        total: breakdown.total,
        approved: breakdown.approved,
        rejected: breakdown.rejected,
        pending: breakdown.pending
      })
    })

    programSheet.eachRow((row: { border: unknown }, rowNumber: number) => {
      if (rowNumber !== 1) {
        row.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        }
      }
    })
  }

  const paymentEntries = reportData.metadata?.paymentBreakdown ? Object.entries(reportData.metadata.paymentBreakdown) : []
  if (paymentEntries.length > 0) {
    const paymentSheet = workbook.addWorksheet('Payments', { views: [{ state: 'frozen', ySplit: 1 }] })
    paymentSheet.columns = [
      { header: 'Payment State', key: 'label', width: 28 },
      { header: 'Count', key: 'value', width: 14 }
    ]

    paymentSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    paymentSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '0F766EFF' }
    }

    paymentEntries.forEach(([label, value]) => {
      paymentSheet.addRow({ label, value })
    })
  }

  const institutionEntries = reportData.metadata?.institutionBreakdown ? Object.entries(reportData.metadata.institutionBreakdown) : []
  if (institutionEntries.length > 0) {
    const institutionSheet = workbook.addWorksheet('Institutions', { views: [{ state: 'frozen', ySplit: 1 }] })
    institutionSheet.columns = [
      { header: 'Institution', key: 'label', width: 32 },
      { header: 'Applications', key: 'value', width: 14 }
    ]

    institutionSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    institutionSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '334155FF' }
    }

    institutionEntries.forEach(([label, value]) => {
      institutionSheet.addRow({ label, value })
    })
  }

  const appliedFilters = reportData.metadata?.appliedFilters ? Object.entries(reportData.metadata.appliedFilters) : []
  if (appliedFilters.length > 0) {
    const filtersSheet = workbook.addWorksheet('Filters', { views: [{ state: 'frozen', ySplit: 1 }] })
    filtersSheet.columns = [
      { header: 'Filter', key: 'label', width: 24 },
      { header: 'Value', key: 'value', width: 40 }
    ]

    filtersSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    filtersSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '475569FF' }
    }

    appliedFilters.forEach(([label, value]) => {
      filtersSheet.addRow({ label, value })
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  triggerDownload(blob, `${sanitizeFileName(fileName)}.xlsx`)
}

export const exportReport = async (
  reportData: ReportExportData,
  format: ReportFormat,
  fileName: string
) => {
  if (format === 'csv') {
    exportReportAsCsv(reportData, fileName)
    return
  }

  if (format === 'pdf') {
    await exportReportAsPdf(reportData, fileName)
    return
  }

  if (format === 'excel') {
    await exportReportAsExcel(reportData, fileName)
    return
  }

  exportReportAsJson(reportData, fileName)
}
