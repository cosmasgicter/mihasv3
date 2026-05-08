export const PDF_MARGIN = 20
export const PDF_FOOTER_SPACE = 58
export const PDF_FOOTER_Y_OFFSET = 14
export const PDF_QR_SIZE = 28

type PdfTextOptions = {
  align?: 'left' | 'center' | 'right' | 'justify'
}

type PdfPageSize = {
  getWidth: () => number
  getHeight: () => number
}

export type PdfDocument = {
  internal: {
    pageSize: PdfPageSize
    getNumberOfPages?: () => number
  }
  addImage: (imageData: string, format: string, x: number, y: number, width: number, height: number) => void
  addPage: () => void
  line: (x1: number, y1: number, x2: number, y2: number) => void
  output: (type: 'blob') => Blob
  rect: (x: number, y: number, width: number, height: number, style?: string) => void
  roundedRect: (
    x: number,
    y: number,
    width: number,
    height: number,
    rx: number,
    ry: number,
    style?: string,
  ) => void
  setDrawColor: (r: number, g: number, b: number) => void
  setFillColor: (r: number, g: number, b: number) => void
  setFont: (fontName: string, fontStyle?: string) => void
  setFontSize: (size: number) => void
  setLineWidth: (width: number) => void
  setPage: (pageNumber: number) => void
  setTextColor: (r: number, g: number, b: number) => void
  splitTextToSize: (text: string, maxWidth: number) => string[]
  text: (text: string | string[], x: number, y: number, options?: PdfTextOptions) => void
}

export interface PdfBrandColor {
  r: number
  g: number
  b: number
}

export function getPageSize(doc: PdfDocument) {
  return {
    width: doc.internal.pageSize.getWidth(),
    height: doc.internal.pageSize.getHeight(),
  }
}

export function fillPageBackground(doc: PdfDocument, color: PdfBrandColor) {
  const { width, height } = getPageSize(doc)
  doc.setFillColor(color.r, color.g, color.b)
  doc.rect(0, 0, width, height, 'F')
}

export function ensurePdfSpace(
  doc: PdfDocument,
  currentY: number,
  requiredHeight: number,
  options: {
    background: PdfBrandColor
    topY?: number
    footerSpace?: number
  },
) {
  const { height } = getPageSize(doc)
  const footerSpace = options.footerSpace ?? PDF_FOOTER_SPACE
  if (currentY + requiredHeight <= height - footerSpace) {
    return currentY
  }

  doc.addPage()
  fillPageBackground(doc, options.background)
  return options.topY ?? PDF_MARGIN + 4
}

export function drawPdfQrCode(
  doc: PdfDocument,
  qrDataUrl: string,
  currentY: number,
  options: {
    background: PdfBrandColor
    labelColor: PdfBrandColor
    minGap?: number
  },
) {
  const { width } = getPageSize(doc)
  const qrBlockHeight = PDF_QR_SIZE + 8
  const minGap = options.minGap ?? 10
  const y = ensurePdfSpace(doc, currentY + minGap, qrBlockHeight, {
    background: options.background,
  })
  const qrX = width - PDF_MARGIN - PDF_QR_SIZE

  doc.addImage(qrDataUrl, 'PNG', qrX, y, PDF_QR_SIZE, PDF_QR_SIZE)
  doc.setFontSize(7)
  doc.setTextColor(options.labelColor.r, options.labelColor.g, options.labelColor.b)
  doc.text('Scan to verify', qrX + PDF_QR_SIZE / 2, y + PDF_QR_SIZE + 3, { align: 'center' })

  return y + qrBlockHeight
}

export function drawPdfFooters(
  doc: PdfDocument,
  options: {
    borderColor: PdfBrandColor
    textColor: PdfBrandColor
    generatedLabel: string
  },
) {
  const pageCount = doc.internal.getNumberOfPages?.() ?? 1

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    const { width, height } = getPageSize(doc)
    const footerY = height - PDF_FOOTER_Y_OFFSET

    doc.setDrawColor(options.borderColor.r, options.borderColor.g, options.borderColor.b)
    doc.setLineWidth(0.3)
    doc.line(PDF_MARGIN, footerY - 4, width - PDF_MARGIN, footerY - 4)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(options.textColor.r, options.textColor.g, options.textColor.b)
    doc.text('This is a computer-generated document. No signature is required.', PDF_MARGIN, footerY)
    doc.text(options.generatedLabel, width / 2, footerY, { align: 'center' })
    doc.text(`Page ${page} of ${pageCount}`, width - PDF_MARGIN, footerY, { align: 'right' })
  }
}
