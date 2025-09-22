import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'

export type ReportFormat = 'json' | 'pdf' | 'excel'

export interface ProgramBreakdownStats {
  total: number
  approved: number
  rejected: number
  pending: number
}

export interface ReportExportData {
  period?: string
  generatedAt?: string
  statistics?: Record<string, number | string>
  approvalRate?: string | number
  programBreakdown?: Record<string, ProgramBreakdownStats>
  metadata?: Record<string, any>
  [key: string]: any
}

const formatMetricName = (metric: string) =>
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

export const exportReportAsJson = (reportData: ReportExportData, fileName: string) => {
  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `${sanitizeFileName(fileName)}.json`)
}

export const exportReportAsPdf = (reportData: ReportExportData, fileName: string) => {
  const doc = new jsPDF()
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
    doc.text(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, marginLeft, currentY)
    currentY += 10
  }

  if (reportData.statistics) {
    doc.setFont(undefined, 'bold')
    doc.text('Key Metrics', marginLeft, currentY)
    doc.setFont(undefined, 'normal')
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

    currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 10
  }

  if (reportData.programBreakdown && Object.keys(reportData.programBreakdown).length > 0) {
    doc.setFont(undefined, 'bold')
    doc.text('Program Breakdown', marginLeft, currentY)
    doc.setFont(undefined, 'normal')
    currentY += 4

    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      head: [['Program', 'Total', 'Approved', 'Rejected', 'Pending']],
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
  }

  const safeFileName = `${sanitizeFileName(fileName)}.pdf`
  doc.save(safeFileName)
}

export const exportReportAsExcel = async (reportData: ReportExportData, fileName: string) => {
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
    summarySheet.addRow({ metric: 'Generated', value: new Date(reportData.generatedAt).toLocaleString() })
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

  summarySheet.eachRow((row, rowNumber) => {
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
      { header: 'Pending', key: 'pending', width: 12 }
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

    programSheet.eachRow((row, rowNumber) => {
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
  if (format === 'pdf') {
    exportReportAsPdf(reportData, fileName)
    return
  }

  if (format === 'excel') {
    await exportReportAsExcel(reportData, fileName)
    return
  }

  exportReportAsJson(reportData, fileName)
}

