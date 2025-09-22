import { PDFDocument, StandardFonts } from 'pdf-lib'

export type DocumentTemplateId =
  | 'offerLetter'
  | 'interviewInvitation'
  | 'rejectionFeedback'
  | 'paymentBalanceStatement'

export interface DocumentTemplateToken {
  token: string
  label: string
  required?: boolean
}

export interface DocumentTemplateSection {
  heading?: string
  paragraphs?: string[]
  bullets?: string[]
  bulletTokens?: Array<{
    token: string
    itemTemplate?: string
  }>
}

export interface DocumentTemplateDefinition {
  id: DocumentTemplateId
  name: string
  description: string
  tokens: DocumentTemplateToken[]
  sections: DocumentTemplateSection[]
}

export interface DocumentTemplateContext {
  student?: {
    fullName?: string
    preferredName?: string
    email?: string
    phone?: string
    program?: string
    studentId?: string
  }
  application?: {
    programName?: string
    intake?: string
    startDate?: string | Date
    responseDeadline?: string | Date
    orientationDate?: string | Date
    interviewDate?: string | Date
    interviewTime?: string
    interviewLocation?: string
    interviewMode?: string
    interviewers?: string[]
    decisionDate?: string | Date
    referenceNumber?: string
    status?: string
  }
  staff?: {
    fullName?: string
    title?: string
    department?: string
    email?: string
    phone?: string
  }
  feedback?: {
    summary?: string
    strengths?: string[]
    improvements?: string[]
    recommendation?: string
  }
  payment?: {
    amountDue?: number
    amountPaid?: number
    balance?: number
    dueDate?: string | Date
    reference?: string
    lastPaymentDate?: string | Date
    breakdown?: Array<{ label: string; amount: number }>
  }
}

export interface RenderedDocumentTemplate {
  template: DocumentTemplateDefinition
  html: string
  text: string
  tokens: Record<string, string>
  pdf: {
    bytes: Uint8Array
    blob: Blob | null
    fileName: string
  }
}

export interface RenderDocumentTemplateOptions {
  fileName?: string
  titleOverride?: string
}

const TOKEN_REGEX = /{{\s*([^}]+)\s*}}/g

const CURRENCY_TOKEN_SET = new Set([
  'payment.amountDue',
  'payment.amountPaid',
  'payment.balance'
])

const DATE_LIKE_TOKEN_SET = new Set([
  'application.startDate',
  'application.responseDeadline',
  'application.orientationDate',
  'application.interviewDate',
  'application.decisionDate',
  'payment.dueDate',
  'payment.lastPaymentDate'
])

const PAGE_SIZE: [number, number] = [595.28, 841.89]
const PAGE_MARGIN = 56
const BODY_FONT_SIZE = 11
const HEADING_FONT_SIZE = 14
const LINE_HEIGHT = 16

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const isIsoLikeDateString = (value: string): boolean => {
  if (!value) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed)
}

const getValueAtPath = (source: unknown, path: string): unknown => {
  if (!source || typeof source !== 'object') return undefined
  const segments = path.split('.')
  let current: any = source
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment as keyof typeof current]
    } else {
      return undefined
    }
  }
  return current
}

const hasTokenValue = (context: DocumentTemplateContext, token: string): boolean => {
  const value = getValueAtPath(context, token)
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return true
}

const formatNumber = (value: number, token: string) => {
  if (CURRENCY_TOKEN_SET.has(token)) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }
  return value.toLocaleString()
}

const formatDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : ''
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const formatTokenValue = (token: string, rawValue: unknown): string => {
  if (rawValue === null || rawValue === undefined) {
    return ''
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .map(item => formatTokenValue(token, item))
      .filter(Boolean)
      .join(', ')
  }

  if (rawValue instanceof Date) {
    return formatDate(rawValue)
  }

  if (typeof rawValue === 'number') {
    return formatNumber(rawValue, token)
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim()
    if (!trimmed) return ''
    if (DATE_LIKE_TOKEN_SET.has(token) || isIsoLikeDateString(trimmed)) {
      return formatDate(trimmed)
    }
    return trimmed
  }

  return String(rawValue)
}

const fillTemplateString = (
  template: string,
  context: DocumentTemplateContext,
  formatToken?: (token: string, value: unknown) => string
) =>
  template.replace(TOKEN_REGEX, (_, rawToken: string) => {
    const token = rawToken.trim()
    const value = getValueAtPath(context, token)
    const formatted = formatToken ? formatToken(token, value) : formatTokenValue(token, value)
    return formatted
  })

const collectTokens = (template: DocumentTemplateDefinition, context: DocumentTemplateContext) =>
  template.tokens.reduce<Record<string, string>>((acc, token) => {
    const raw = getValueAtPath(context, token.token)
    acc[token.token] = formatTokenValue(token.token, raw)
    return acc
  }, {})

const ensureRequiredTokens = (template: DocumentTemplateDefinition, context: DocumentTemplateContext) => {
  const missing = template.tokens
    .filter(token => token.required !== false)
    .filter(token => !hasTokenValue(context, token.token))
    .map(token => token.token)

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`)
  }
}

const sanitizeFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document'

const computeDefaultFileName = (
  template: DocumentTemplateDefinition,
  context: DocumentTemplateContext
) => {
  const studentName = formatTokenValue('student.fullName', getValueAtPath(context, 'student.fullName'))
  const base = studentName ? `${template.id}-${studentName}` : template.id
  return `${sanitizeFileName(base)}.pdf`
}

const buildSectionText = (
  template: DocumentTemplateDefinition,
  context: DocumentTemplateContext
) => {
  const textLines: string[] = []

  template.sections.forEach((section, index) => {
    if (section.heading) {
      textLines.push(fillTemplateString(section.heading, context))
    }

    section.paragraphs?.forEach(paragraph => {
      textLines.push(fillTemplateString(paragraph, context))
    })

    const bulletLines: string[] = []
    section.bullets?.forEach(bullet => {
      const filled = fillTemplateString(bullet, context)
      if (filled.trim()) {
        bulletLines.push(filled)
      }
    })

    section.bulletTokens?.forEach(definition => {
      const rawValue = getValueAtPath(context, definition.token)
      if (!rawValue) return

      const values = Array.isArray(rawValue) ? rawValue : [rawValue]
      const itemTemplate = definition.itemTemplate ?? '{{item}}'
      values.forEach(item => {
        const rendered = itemTemplate.replace(/{{\s*item(\.[^}]*)?\s*}}/g, (_, path: string) => {
          if (!path) {
            return formatTokenValue(definition.token, item)
          }
          const trimmedPath = path.slice(1)
          const nested = getValueAtPath(item, trimmedPath)
          return formatTokenValue(trimmedPath, nested)
        })
        const normalized = fillTemplateString(rendered, context)
        if (normalized.trim()) {
          bulletLines.push(normalized)
        }
      })
    })

    bulletLines.forEach(line => {
      textLines.push(`• ${line}`)
    })

    if (index < template.sections.length - 1) {
      textLines.push('')
    }
  })

  return textLines
}

const buildSectionHtml = (
  template: DocumentTemplateDefinition,
  context: DocumentTemplateContext
) => {
  const parts: string[] = ['<article class="document-template">']

  template.sections.forEach(section => {
    parts.push('<section>')
    if (section.heading) {
      const heading = escapeHtml(fillTemplateString(section.heading, context))
      parts.push(`<h2>${heading}</h2>`)
    }

    section.paragraphs?.forEach(paragraph => {
      const htmlParagraph = escapeHtml(fillTemplateString(paragraph, context))
      parts.push(`<p>${htmlParagraph}</p>`)
    })

    const bulletItems: string[] = []

    section.bullets?.forEach(bullet => {
      const filled = fillTemplateString(bullet, context)
      if (filled.trim()) {
        bulletItems.push(escapeHtml(filled))
      }
    })

    section.bulletTokens?.forEach(definition => {
      const rawValue = getValueAtPath(context, definition.token)
      if (!rawValue) return
      const values = Array.isArray(rawValue) ? rawValue : [rawValue]
      const itemTemplate = definition.itemTemplate ?? '{{item}}'
      values.forEach(item => {
        const rendered = itemTemplate.replace(/{{\s*item(\.[^}]*)?\s*}}/g, (_, path: string) => {
          if (!path) {
            return formatTokenValue(definition.token, item)
          }
          const trimmedPath = path.slice(1)
          const nested = getValueAtPath(item, trimmedPath)
          return formatTokenValue(trimmedPath, nested)
        })
        const normalized = fillTemplateString(rendered, context)
        if (normalized.trim()) {
          bulletItems.push(escapeHtml(normalized))
        }
      })
    })

    if (bulletItems.length > 0) {
      parts.push('<ul>')
      bulletItems.forEach(item => {
        parts.push(`<li>${item}</li>`)
      })
      parts.push('</ul>')
    }

    parts.push('</section>')
  })

  parts.push('</article>')
  return parts.join('\n')
}

const wrapTextForPdf = (
  text: string,
  font: import('pdf-lib').PDFFont,
  fontSize: number,
  maxWidth: number
): string[] => {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) {
    return ['']
  }

  const lines: string[] = []
  let currentLine = ''

  const pushCurrent = () => {
    if (currentLine) {
      lines.push(currentLine)
      currentLine = ''
    }
  }

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    const width = font.widthOfTextAtSize(candidate, fontSize)
    if (width <= maxWidth) {
      currentLine = candidate
      continue
    }

    if (currentLine) {
      pushCurrent()
    }

    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      currentLine = word
      continue
    }

    let chunk = ''
    for (const char of word) {
      const tentative = chunk ? `${chunk}${char}` : char
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

  pushCurrent()

  if (!lines.length) {
    lines.push('')
  }

  return lines
}

const generatePdfDocument = async (
  title: string,
  template: DocumentTemplateDefinition,
  context: DocumentTemplateContext
) => {
  const pdfDoc = await PDFDocument.create()
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const addPage = () => pdfDoc.addPage(PAGE_SIZE)
  let page = addPage()
  let cursorY = page.getHeight() - PAGE_MARGIN

  const ensureSpace = (height: number) => {
    if (cursorY - height < PAGE_MARGIN) {
      page = addPage()
      cursorY = page.getHeight() - PAGE_MARGIN
    }
  }

  const drawParagraph = (text: string, options: { bullet?: boolean; bold?: boolean } = {}) => {
    const font = options.bold ? boldFont : regularFont
    const maxWidth = page.getWidth() - PAGE_MARGIN * 2
    const prefix = options.bullet ? '• ' : ''
    const prefixWidth = options.bullet ? font.widthOfTextAtSize(prefix, BODY_FONT_SIZE) : 0
    const lines = wrapTextForPdf(text, font, BODY_FONT_SIZE, maxWidth - prefixWidth)

    lines.forEach((line, index) => {
      ensureSpace(LINE_HEIGHT)
      const isFirstLine = index === 0
      const xOffset = options.bullet && !isFirstLine ? prefixWidth : 0
      const textToDraw = options.bullet && isFirstLine ? `${prefix}${line}` : line
      page.drawText(textToDraw, {
        x: PAGE_MARGIN + xOffset,
        y: cursorY,
        size: BODY_FONT_SIZE,
        font
      })
      cursorY -= LINE_HEIGHT
    })

    cursorY -= 4
  }

  const drawHeading = (text: string) => {
    const maxWidth = page.getWidth() - PAGE_MARGIN * 2
    const lines = wrapTextForPdf(text, boldFont, HEADING_FONT_SIZE, maxWidth)
    lines.forEach(line => {
      ensureSpace(HEADING_FONT_SIZE + 4)
      page.drawText(line, {
        x: PAGE_MARGIN,
        y: cursorY,
        size: HEADING_FONT_SIZE,
        font: boldFont
      })
      cursorY -= HEADING_FONT_SIZE + 6
    })
    cursorY -= 6
  }

  if (title) {
    drawHeading(title)
  }

  template.sections.forEach(section => {
    if (section.heading) {
      drawHeading(fillTemplateString(section.heading, context))
    }

    section.paragraphs?.forEach(paragraph => {
      const text = fillTemplateString(paragraph, context)
      if (text.trim()) {
        drawParagraph(text)
      }
    })

    section.bullets?.forEach(bullet => {
      const text = fillTemplateString(bullet, context)
      if (text.trim()) {
        drawParagraph(text, { bullet: true })
      }
    })

    section.bulletTokens?.forEach(definition => {
      const rawValue = getValueAtPath(context, definition.token)
      if (!rawValue) return
      const values = Array.isArray(rawValue) ? rawValue : [rawValue]
      const itemTemplate = definition.itemTemplate ?? '{{item}}'
      values.forEach(item => {
        const rendered = itemTemplate.replace(/{{\s*item(\.[^}]*)?\s*}}/g, (_, path: string) => {
          if (!path) {
            return formatTokenValue(definition.token, item)
          }
          const trimmedPath = path.slice(1)
          const nested = getValueAtPath(item, trimmedPath)
          return formatTokenValue(trimmedPath, nested)
        })
        const text = fillTemplateString(rendered, context)
        if (text.trim()) {
          drawParagraph(text, { bullet: true })
        }
      })
    })

    cursorY -= 8
  })

  const bytes = await pdfDoc.save()
  const blob = typeof Blob !== 'undefined' ? new Blob([bytes], { type: 'application/pdf' }) : null

  return { bytes, blob }
}

const DOCUMENT_TEMPLATES: Record<DocumentTemplateId, DocumentTemplateDefinition> = {
  offerLetter: {
    id: 'offerLetter',
    name: 'Offer Letter',
    description: 'Formal admission offer letter including enrollment steps and response deadlines.',
    tokens: [
      { token: 'student.fullName', label: 'Student full name' },
      { token: 'application.programName', label: 'Program name' },
      { token: 'application.intake', label: 'Intake period', required: false },
      { token: 'application.startDate', label: 'Program start date' },
      { token: 'application.responseDeadline', label: 'Acceptance deadline' },
      { token: 'staff.fullName', label: 'Signatory name' },
      { token: 'staff.title', label: 'Signatory title' },
      { token: 'staff.email', label: 'Contact email', required: false },
      { token: 'staff.phone', label: 'Contact phone', required: false }
    ],
    sections: [
      {
        paragraphs: [
          'Dear {{student.fullName}},',
          'Congratulations! We are delighted to offer you admission to the {{application.programName}} programme at MIHAS.',
          'Your academic achievements and potential stood out during our review process.'
        ]
      },
      {
        heading: 'Enrollment Details',
        paragraphs: [
          'Programme: {{application.programName}}',
          'Intake: {{application.intake}}',
          'Start Date: {{application.startDate}}',
          'Acceptance Deadline: {{application.responseDeadline}}',
          'Student Reference: {{application.referenceNumber}}'
        ]
      },
      {
        heading: 'Next Steps',
        bullets: [
          'Log in to the admissions portal to confirm your acceptance by {{application.responseDeadline}}.',
          'Submit any outstanding documents highlighted in your application checklist.',
          'Prepare for orientation on {{application.orientationDate}} and review your welcome pack.'
        ]
      },
      {
        paragraphs: [
          'We are excited to support your academic journey and look forward to welcoming you to campus.',
          'Warm regards,',
          '{{staff.fullName}}',
          '{{staff.title}}',
          '{{staff.email}}',
          '{{staff.phone}}'
        ]
      }
    ]
  },
  interviewInvitation: {
    id: 'interviewInvitation',
    name: 'Interview Invitation',
    description: 'Structured invitation outlining interview logistics and preparation guidance.',
    tokens: [
      { token: 'student.fullName', label: 'Student full name' },
      { token: 'application.programName', label: 'Programme name' },
      { token: 'application.interviewDate', label: 'Interview date' },
      { token: 'application.interviewTime', label: 'Interview time' },
      { token: 'application.interviewMode', label: 'Interview mode' },
      { token: 'application.interviewLocation', label: 'Interview location' },
      { token: 'staff.fullName', label: 'Contact name' },
      { token: 'staff.title', label: 'Contact title' },
      { token: 'staff.email', label: 'Contact email' },
      { token: 'staff.phone', label: 'Contact phone', required: false }
    ],
    sections: [
      {
        paragraphs: [
          'Dear {{student.fullName}},',
          'Thank you for your application to the {{application.programName}} programme.',
          'We are pleased to invite you to the next stage of the selection process.'
        ]
      },
      {
        heading: 'Interview Schedule',
        paragraphs: [
          'Date: {{application.interviewDate}}',
          'Time: {{application.interviewTime}}',
          'Mode: {{application.interviewMode}}',
          'Location / Meeting Link: {{application.interviewLocation}}'
        ]
      },
      {
        heading: 'How to Prepare',
        bullets: [
          'Please log in 10 minutes before the scheduled start time.',
          'Have your identification and any supporting documents ready.',
          'Prepare to discuss your motivation for the {{application.programName}} programme.'
        ]
      },
      {
        paragraphs: [
          'Kindly confirm your availability by replying to this email.',
          'If you need to reschedule, contact {{staff.fullName}} at {{staff.email}} or {{staff.phone}}.',
          'We look forward to meeting with you.',
          'Best regards,',
          '{{staff.fullName}}',
          '{{staff.title}}'
        ]
      }
    ]
  },
  rejectionFeedback: {
    id: 'rejectionFeedback',
    name: 'Rejection Feedback Summary',
    description: 'Thoughtful summary highlighting strengths and recommended improvements.',
    tokens: [
      { token: 'student.fullName', label: 'Student full name' },
      { token: 'application.programName', label: 'Programme name' },
      { token: 'feedback.summary', label: 'Overall feedback summary' },
      { token: 'feedback.strengths', label: 'Identified strengths' },
      { token: 'feedback.improvements', label: 'Areas for development' },
      { token: 'staff.fullName', label: 'Reviewer name', required: false },
      { token: 'staff.title', label: 'Reviewer title', required: false }
    ],
    sections: [
      {
        paragraphs: [
          'Dear {{student.fullName}},',
          'Thank you for your interest in the {{application.programName}} programme.',
          'After careful consideration we are unable to offer you admission this cycle.'
        ]
      },
      {
        heading: 'Overall Feedback',
        paragraphs: ['{{feedback.summary}}']
      },
      {
        heading: 'Strengths Recognised',
        bulletTokens: [
          {
            token: 'feedback.strengths',
            itemTemplate: '{{item}}'
          }
        ]
      },
      {
        heading: 'Recommended Improvements',
        bulletTokens: [
          {
            token: 'feedback.improvements',
            itemTemplate: '{{item}}'
          }
        ],
        paragraphs: ['{{feedback.recommendation}}']
      },
      {
        paragraphs: [
          'We encourage you to continue pursuing your goals and to consider reapplying in the future.',
          'Kind regards,',
          '{{staff.fullName}}',
          '{{staff.title}}'
        ]
      }
    ]
  },
  paymentBalanceStatement: {
    id: 'paymentBalanceStatement',
    name: 'Payment Balance Statement',
    description: 'Finance summary with outstanding balance and itemised breakdown.',
    tokens: [
      { token: 'student.fullName', label: 'Student full name' },
      { token: 'application.programName', label: 'Programme name', required: false },
      { token: 'payment.amountDue', label: 'Total charges' },
      { token: 'payment.amountPaid', label: 'Payments received' },
      { token: 'payment.balance', label: 'Outstanding balance' },
      { token: 'payment.dueDate', label: 'Payment due date' },
      { token: 'payment.reference', label: 'Payment reference', required: false },
      { token: 'staff.fullName', label: 'Finance contact name' },
      { token: 'staff.title', label: 'Finance contact title' },
      { token: 'staff.email', label: 'Finance contact email', required: false },
      { token: 'staff.phone', label: 'Finance contact phone', required: false }
    ],
    sections: [
      {
        paragraphs: [
          'Dear {{student.fullName}},',
          'Please find below the latest balance summary for your {{application.programName}} student account.'
        ]
      },
      {
        heading: 'Account Summary',
        paragraphs: [
          'Total Charges: K{{payment.amountDue}}',
          'Payments Received: K{{payment.amountPaid}}',
          'Outstanding Balance: K{{payment.balance}}',
          'Payment Due Date: {{payment.dueDate}}',
          'Last Payment Recorded: {{payment.lastPaymentDate}}',
          'Reference: {{payment.reference}}'
        ]
      },
      {
        heading: 'Itemised Breakdown',
        bulletTokens: [
          {
            token: 'payment.breakdown',
            itemTemplate: '{{item.label}} — K{{item.amount}}'
          }
        ]
      },
      {
        paragraphs: [
          'Please settle the outstanding balance by the due date to avoid interruptions to your studies.',
          'If you have already made payment, kindly share the proof of payment with our finance office.'
        ]
      },
      {
        paragraphs: [
          'Finance Office Contact',
          '{{staff.fullName}}',
          '{{staff.title}}',
          '{{staff.email}}',
          '{{staff.phone}}'
        ]
      }
    ]
  }
}

export const DOCUMENT_TEMPLATE_DEFINITIONS = DOCUMENT_TEMPLATES

export const getDocumentTemplate = (id: DocumentTemplateId) => DOCUMENT_TEMPLATES[id]

export const renderDocumentTemplate = async (
  templateId: DocumentTemplateId,
  context: DocumentTemplateContext,
  options: RenderDocumentTemplateOptions = {}
): Promise<RenderedDocumentTemplate> => {
  const template = DOCUMENT_TEMPLATES[templateId]
  if (!template) {
    throw new Error(`Template ${templateId} is not defined`)
  }

  ensureRequiredTokens(template, context)

  const title = options.titleOverride ?? template.name
  const textLines = buildSectionText(template, context)
  const text = textLines.join('\n')
  const html = buildSectionHtml(template, context)
  const { bytes, blob } = await generatePdfDocument(title, template, context)
  const fileName = options.fileName ?? computeDefaultFileName(template, context)
  const tokens = collectTokens(template, context)

  return {
    template,
    html,
    text,
    tokens,
    pdf: {
      bytes,
      blob,
      fileName
    }
  }
}

export const renderOfferLetter = (
  context: DocumentTemplateContext,
  options?: RenderDocumentTemplateOptions
) => renderDocumentTemplate('offerLetter', context, options)

export const renderInterviewInvitation = (
  context: DocumentTemplateContext,
  options?: RenderDocumentTemplateOptions
) => renderDocumentTemplate('interviewInvitation', context, options)

export const renderRejectionFeedback = (
  context: DocumentTemplateContext,
  options?: RenderDocumentTemplateOptions
) => renderDocumentTemplate('rejectionFeedback', context, options)

export const renderPaymentBalanceStatement = (
  context: DocumentTemplateContext,
  options?: RenderDocumentTemplateOptions
) => renderDocumentTemplate('paymentBalanceStatement', context, options)

export const renderTemplateById = (
  templateId: DocumentTemplateId,
  context: DocumentTemplateContext,
  options?: RenderDocumentTemplateOptions
) => renderDocumentTemplate(templateId, context, options)
