export interface ApplicationData {
  application_number: string
  full_name: string
  email: string
  phone: string
  program: string
  intake: string
  institution: string
  status: string
  payment_status: string
  application_fee: number
  paid_amount: number
  submitted_at: string
  created_at: string
  grades_summary: string
  total_subjects: number
  average_grade: number
  age: number
  days_since_submission: number
}

type ApplicationDataSource =
  | ApplicationData[]
  | AsyncIterable<ApplicationData>
  | AsyncIterable<ApplicationData[]>

const HEADERS = [
  'Application Number',
  'Full Name',
  'Email',
  'Phone',
  'Program',
  'Intake',
  'Institution',
  'Status',
  'Payment Status',
  'Application Fee',
  'Paid Amount',
  'Submitted At',
  'Created At',
  'Grades Summary',
  'Total Subjects',
  'Average Grade',
  'Age',
  'Days Since Submission'
] as const

const YIELD_INTERVAL = 250

const delayForStreaming = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => {
  return value != null && typeof (value as any)[Symbol.asyncIterator] === 'function'
}

async function* iterateApplicationData(source: ApplicationDataSource): AsyncGenerator<ApplicationData> {
  if (Array.isArray(source)) {
    for (const record of source) {
      yield record
    }
    return
  }

  if (isAsyncIterable(source)) {
    for await (const chunk of source as AsyncIterable<ApplicationData | ApplicationData[]>) {
      if (Array.isArray(chunk)) {
        for (const record of chunk) {
          yield record
        }
      } else {
        yield chunk
      }
    }
    return
  }

  throw new Error('Unsupported data source provided for export')
}

const formatDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString()
}

const safeNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 0
  }
  return Number(value)
}

const safeText = (value: string | null | undefined) => value?.toString().trim() ?? ''

const toCsvValue = (value: string | number) => {
  const textValue = typeof value === 'number' ? String(value) : value
  return `"${textValue.replace(/"/g, '""')}"`
}

const mapToRowValues = (application: ApplicationData) => ({
  application_number: safeText(application.application_number),
  full_name: safeText(application.full_name),
  email: safeText(application.email),
  phone: safeText(application.phone),
  program: safeText(application.program),
  intake: safeText(application.intake),
  institution: safeText(application.institution),
  status: safeText(application.status),
  payment_status: safeText(application.payment_status),
  application_fee: safeNumber(application.application_fee),
  paid_amount: safeNumber(application.paid_amount),
  submitted_at: formatDate(application.submitted_at || application.created_at),
  created_at: formatDate(application.created_at),
  grades_summary: safeText(application.grades_summary),
  total_subjects: safeNumber(application.total_subjects),
  average_grade: safeNumber(application.average_grade),
  age: safeNumber(application.age),
  days_since_submission: safeNumber(application.days_since_submission)
})

export async function exportToCSV(
  source: ApplicationDataSource,
  filename: string = 'applications.csv'
) {
  const parts: string[] = []
  parts.push(HEADERS.join(','))

  let buffer: string[] = []
  let processed = 0

  for await (const record of iterateApplicationData(source)) {
    const row = mapToRowValues(record)
    buffer.push([
      toCsvValue(row.application_number),
      toCsvValue(row.full_name),
      toCsvValue(row.email),
      toCsvValue(row.phone),
      toCsvValue(row.program),
      toCsvValue(row.intake),
      toCsvValue(row.institution),
      toCsvValue(row.status),
      toCsvValue(row.payment_status),
      toCsvValue(row.application_fee),
      toCsvValue(row.paid_amount),
      toCsvValue(row.submitted_at),
      toCsvValue(row.created_at),
      toCsvValue(row.grades_summary),
      toCsvValue(row.total_subjects),
      toCsvValue(row.average_grade),
      toCsvValue(row.age),
      toCsvValue(row.days_since_submission)
    ].join(','))

    processed += 1

    if (buffer.length >= 500) {
      parts.push(buffer.join('\n'))
      buffer = []
    }

    if (processed % YIELD_INTERVAL === 0) {
      await delayForStreaming()
    }
  }

  if (buffer.length) {
    parts.push(buffer.join('\n'))
  }

  const csvContent = parts.join('\n')

  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;'
  })

  if (typeof document === 'undefined') return

  const link = document.createElement('a')

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

export async function exportToExcel(
  source: ApplicationDataSource,
  filename: string = 'applications.xlsx'
) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([HEADERS])

  let batch: Array<Array<string | number>> = []
  let processed = 0

  for await (const record of iterateApplicationData(source)) {
    const row = mapToRowValues(record)
    batch.push([
      row.application_number,
      row.full_name,
      row.email,
      row.phone,
      row.program,
      row.intake,
      row.institution,
      row.status,
      row.payment_status,
      row.application_fee,
      row.paid_amount,
      row.submitted_at,
      row.created_at,
      row.grades_summary,
      row.total_subjects,
      row.average_grade,
      row.age,
      row.days_since_submission
    ])

    processed += 1

    if (batch.length >= 200) {
      XLSX.utils.sheet_add_aoa(worksheet, batch, { origin: -1 })
      batch = []
    }

    if (processed % YIELD_INTERVAL === 0) {
      await delayForStreaming()
    }
  }

  if (batch.length) {
    XLSX.utils.sheet_add_aoa(worksheet, batch, { origin: -1 })
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Applications')
  XLSX.writeFileXLSX(workbook, filename, { compression: true })
}

export async function exportToPDF(
  source: ApplicationDataSource,
  filename: string = 'applications.pdf'
) {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ])

  const autoTable = autoTableModule.default || autoTableModule

  const doc = new jsPDF({ orientation: 'landscape' })
  const rows: string[][] = []
  let processed = 0

  for await (const record of iterateApplicationData(source)) {
    const row = mapToRowValues(record)
    rows.push([
      row.application_number,
      row.full_name,
      row.email,
      row.phone,
      row.program,
      row.intake,
      row.institution,
      row.status,
      row.payment_status,
      row.application_fee.toString(),
      row.paid_amount.toString(),
      row.submitted_at,
      row.created_at,
      row.grades_summary,
      row.total_subjects.toString(),
      row.average_grade.toString(),
      row.age.toString(),
      row.days_since_submission.toString()
    ])

    processed += 1

    if (processed % YIELD_INTERVAL === 0) {
      await delayForStreaming()
    }
  }

  const exportTimestamp = new Date().toLocaleString()

  autoTable(doc, {
    head: [Array.from(HEADERS)],
    body: rows,
    startY: 20,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    margin: { top: 20, bottom: 20, left: 10, right: 10 },
    didDrawPage: (data) => {
      doc.setFontSize(14)
      doc.text('Applications Export', data.settings.margin.left, 12)
      doc.setFontSize(10)
      doc.text(`Generated: ${exportTimestamp}`, data.settings.margin.left, 17)
    }
  })

  doc.save(filename)
}

export interface UserPDFFieldDefinition<TRecord extends Record<string, unknown> = Record<string, unknown>> {
  id: keyof TRecord & string
  label: string
  formatter?: (value: TRecord[keyof TRecord], record: TRecord) => string
}

export interface ExportUsersPDFOptions {
  filename?: string
  title?: string
  generatedAt?: Date
  metadata?: string[]
  orientation?: 'portrait' | 'landscape'
  download?: boolean
}

export interface ExportUsersPDFResult {
  bytes: Uint8Array
  blob: Blob
  filename: string
  pageCount: number
  columnLabels: string[]
  rowCount: number
}

const sanitizeUserPdfText = (value: string) => {
  const normalized = value.replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (normalized.length <= 200) {
    return normalized
  }
  return `${normalized.slice(0, 197)}…`
}

const inferDateLikeValue = (rawValue: unknown, fieldId: string) => {
  if (!rawValue) return ''

  if (rawValue instanceof Date) {
    return rawValue.toLocaleDateString()
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim()
    if (!trimmed) return ''
    if (/date/i.test(fieldId) || /_at$/.test(fieldId)) {
      const parsed = new Date(trimmed)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString()
      }
    }
  }

  return ''
}

export async function exportUsersToPDF<TRecord extends Record<string, unknown>>(
  records: TRecord[],
  selectedFieldIds: Array<UserPDFFieldDefinition<TRecord>['id']>,
  fieldDefinitions: Array<UserPDFFieldDefinition<TRecord>>,
  options: ExportUsersPDFOptions = {}
): Promise<ExportUsersPDFResult> {
  if (!selectedFieldIds.length) {
    throw new Error('At least one field must be selected to export users to PDF')
  }

  const pdfLib = await import('pdf-lib')
  const { PDFDocument, StandardFonts, rgb } = pdfLib

  const pdfDoc = await PDFDocument.create()
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const orientation = options.orientation ?? 'landscape'
  const pageSize: [number, number] =
    orientation === 'portrait'
      ? [595.28, 841.89]
      : [841.89, 595.28]

  const margins = { top: 56, right: 40, bottom: 50, left: 40 }
  const headerFontSize = 11
  const bodyFontSize = 9
  const bodyLineHeight = bodyFontSize + 4
  const cellPadding = 4
  const headerHeight = 24
  const maxLinesPerCell = 4

  const selectedFields = selectedFieldIds.map(fieldId => {
    const definition = fieldDefinitions.find(field => field.id === fieldId)
    if (!definition) {
      throw new Error(`Field definition for "${fieldId}" was not provided`)
    }
    return definition
  })

  const columnLabels = selectedFields.map(field => field.label || String(field.id))

  const formatFieldValue = (field: UserPDFFieldDefinition<TRecord>, record: TRecord) => {
    const rawValue = record[field.id]

    if (field.formatter) {
      try {
        const formatted = field.formatter(rawValue, record)
        return sanitizeUserPdfText(String(formatted ?? ''))
      } catch (error) {
        console.warn(`Formatter for field "${String(field.id)}" failed`, error)
      }
    }

    if (rawValue === null || rawValue === undefined) {
      return ''
    }

    const inferredDate = inferDateLikeValue(rawValue, String(field.id))
    if (inferredDate) {
      return inferredDate
    }

    if (typeof rawValue === 'number') {
      return rawValue.toLocaleString()
    }

    if (rawValue instanceof Date) {
      return rawValue.toLocaleDateString()
    }

    return sanitizeUserPdfText(String(rawValue))
  }

  const wrapCellText = (
    text: string,
    font: typeof regularFont,
    fontSize: number,
    maxWidth: number
  ) => {
    if (maxWidth <= 0) {
      return [text]
    }

    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let currentLine = ''

    const pushCurrentLine = () => {
      if (currentLine) {
        lines.push(currentLine)
        currentLine = ''
      }
    }

    if (!words.length) {
      return ['']
    }

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word
      const candidateWidth = font.widthOfTextAtSize(candidate, fontSize)

      if (candidateWidth <= maxWidth) {
        currentLine = candidate
        continue
      }

      if (currentLine) {
        pushCurrentLine()
      }

      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        currentLine = word
        continue
      }

      let chunk = ''
      for (const char of word) {
        const tentative = chunk + char
        if (font.widthOfTextAtSize(tentative, fontSize) <= maxWidth) {
          chunk = tentative
        } else {
          if (chunk) {
            lines.push(chunk)
            chunk = char
          } else {
            lines.push(char)
          }
        }
      }

      currentLine = chunk
    }

    pushCurrentLine()

    if (!lines.length) {
      return ['']
    }

    if (lines.length > maxLinesPerCell) {
      const truncated = lines.slice(0, maxLinesPerCell)
      const last = truncated[maxLinesPerCell - 1]
      truncated[maxLinesPerCell - 1] = last.length >= 1 ? `${last.replace(/\.?$/, '')}…` : '…'
      return truncated
    }

    return lines
  }

  const drawTableHeader = (page: import('pdf-lib').PDFPage, startY: number) => {
    const { width } = page.getSize()
    const tableWidth = width - margins.left - margins.right
    const headerTop = startY
    const headerBottom = startY - headerHeight
    const borderColor = rgb(226 / 255, 232 / 255, 240 / 255)

    page.drawRectangle({
      x: margins.left,
      y: headerBottom,
      width: tableWidth,
      height: headerHeight,
      color: rgb(37 / 255, 99 / 255, 235 / 255)
    })

    page.drawLine({
      start: { x: margins.left, y: headerTop },
      end: { x: margins.left + tableWidth, y: headerTop },
      thickness: 0.5,
      color: borderColor
    })

    page.drawLine({
      start: { x: margins.left, y: headerBottom },
      end: { x: margins.left + tableWidth, y: headerBottom },
      thickness: 0.5,
      color: borderColor
    })

    page.drawLine({
      start: { x: margins.left, y: headerTop },
      end: { x: margins.left, y: headerBottom },
      thickness: 0.5,
      color: borderColor
    })

    const columnWidth = tableWidth / selectedFields.length

    let columnX = margins.left
    selectedFields.forEach((field, index) => {
      const textX = columnX + cellPadding
      const textY = headerBottom + (headerHeight - headerFontSize) / 2

      page.drawText(columnLabels[index], {
        x: textX,
        y: textY,
        size: headerFontSize,
        font: boldFont,
        color: rgb(1, 1, 1)
      })

      if (index < selectedFields.length - 1) {
        const nextX = columnX + columnWidth
        page.drawLine({
          start: { x: nextX, y: headerTop },
          end: { x: nextX, y: headerBottom },
          thickness: 0.5,
          color: borderColor
        })
      } else {
        page.drawLine({
          start: { x: margins.left + tableWidth, y: headerTop },
          end: { x: margins.left + tableWidth, y: headerBottom },
          thickness: 0.5,
          color: borderColor
        })
      }

      columnX += columnWidth
    })

    return headerBottom
  }

  const renderPage = (isFirstPage: boolean) => {
    const page = pdfDoc.addPage(pageSize)
    const { width, height } = page.getSize()
    let cursorY = height - margins.top
    const tableWidth = width - margins.left - margins.right

    const title = options.title ?? 'Users Export'
    const generatedAt = (options.generatedAt ?? new Date()).toLocaleString()
    const metadataLines = (options.metadata ?? []).filter(Boolean)

    page.drawText(title, {
      x: margins.left,
      y: cursorY,
      size: 16,
      font: boldFont,
      color: rgb(30 / 255, 41 / 255, 59 / 255)
    })

    cursorY -= 18

    page.drawText(`Generated: ${generatedAt}`, {
      x: margins.left,
      y: cursorY,
      size: 10,
      font: regularFont,
      color: rgb(71 / 255, 85 / 255, 105 / 255)
    })

    cursorY -= 16

    if (isFirstPage && metadataLines.length > 0) {
      metadataLines.forEach(line => {
        page.drawText(line, {
          x: margins.left,
          y: cursorY,
          size: 9,
          font: regularFont,
          color: rgb(71 / 255, 85 / 255, 105 / 255)
        })
        cursorY -= 14
      })
    }

    cursorY -= 6

    const headerBottom = drawTableHeader(page, cursorY)
    cursorY = headerBottom

    const columnWidth = tableWidth / selectedFields.length

    const drawRow = (record: TRecord, rowIndex: number, startY: number) => {
      const values = selectedFields.map(field => formatFieldValue(field, record))
      const wrapped = values.map(value => wrapCellText(value, regularFont, bodyFontSize, columnWidth - cellPadding * 2))
      const maxLines = Math.max(...wrapped.map(lines => lines.length))
      const rowHeight = maxLines * bodyLineHeight + cellPadding * 2

      if (startY - rowHeight <= margins.bottom) {
        return null
      }

      const rowTop = startY
      const rowBottom = startY - rowHeight
      const borderColor = rgb(226 / 255, 232 / 255, 240 / 255)

      if (rowIndex % 2 === 1) {
        page.drawRectangle({
          x: margins.left,
          y: rowBottom,
          width: tableWidth,
          height: rowHeight,
          color: rgb(248 / 255, 250 / 255, 252 / 255)
        })
      }

      page.drawLine({
        start: { x: margins.left, y: rowTop },
        end: { x: margins.left + tableWidth, y: rowTop },
        thickness: 0.5,
        color: borderColor
      })

      page.drawLine({
        start: { x: margins.left, y: rowBottom },
        end: { x: margins.left + tableWidth, y: rowBottom },
        thickness: 0.5,
        color: borderColor
      })

      page.drawLine({
        start: { x: margins.left, y: rowTop },
        end: { x: margins.left, y: rowBottom },
        thickness: 0.5,
        color: borderColor
      })

      let cellX = margins.left
      wrapped.forEach((lines, index) => {
        if (index > 0) {
          page.drawLine({
            start: { x: cellX, y: rowTop },
            end: { x: cellX, y: rowBottom },
            thickness: 0.5,
            color: borderColor
          })
        }

        let textY = rowTop - cellPadding - bodyFontSize
        lines.forEach(line => {
          page.drawText(line, {
            x: cellX + cellPadding,
            y: textY,
            size: bodyFontSize,
            font: regularFont,
            color: rgb(30 / 255, 41 / 255, 59 / 255)
          })
          textY -= bodyLineHeight
        })

        cellX += columnWidth
      })

      page.drawLine({
        start: { x: margins.left + tableWidth, y: rowTop },
        end: { x: margins.left + tableWidth, y: rowBottom },
        thickness: 0.5,
        color: borderColor
      })

      return rowBottom
    }

    return { page, cursorY, columnWidth, drawRow }
  }

  let currentPage = renderPage(true)
  let currentRow = 0

  for (const record of records) {
    const nextCursor = currentPage.drawRow(record, currentRow, currentPage.cursorY)

    if (nextCursor === null) {
      currentPage = renderPage(false)
      const retryCursor = currentPage.drawRow(record, currentRow, currentPage.cursorY)
      if (retryCursor === null) {
        throw new Error('Unable to render row due to insufficient space on the page')
      }
      currentPage.cursorY = retryCursor
    } else {
      currentPage.cursorY = nextCursor
    }

    currentRow += 1
  }

  const pages = pdfDoc.getPages()
  const totalPages = pages.length

  pages.forEach((page, index) => {
    const { width } = page.getSize()
    const footerText = `Page ${index + 1} of ${totalPages}`
    const textWidth = regularFont.widthOfTextAtSize(footerText, 9)
    page.drawText(footerText, {
      x: (width - textWidth) / 2,
      y: margins.bottom / 2,
      size: 9,
      font: regularFont,
      color: rgb(100 / 255, 116 / 255, 139 / 255)
    })
  })

  const pdfBytes = await pdfDoc.save()
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const filename = options.filename ?? 'users-export.pdf'

  if (typeof document !== 'undefined' && options.download !== false) {
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = filename
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return {
    bytes: pdfBytes,
    blob,
    filename,
    pageCount: totalPages,
    columnLabels,
    rowCount: records.length
  }
}
