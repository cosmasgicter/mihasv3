export interface UploadedApplicationDocument {
  id: string
  document_type: string
  uploaded_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function selectLatestDocumentByType(
  documents: UploadedApplicationDocument[],
  documentType: string,
): UploadedApplicationDocument | null {
  const matches = documents.filter((document) => document.document_type === documentType)

  if (matches.length === 0) {
    return null
  }

  return [...matches].sort((left, right) => {
    const leftTime = Math.max(
      toTimestamp(left.uploaded_at),
      toTimestamp(left.updated_at),
      toTimestamp(left.created_at),
    )
    const rightTime = Math.max(
      toTimestamp(right.uploaded_at),
      toTimestamp(right.updated_at),
      toTimestamp(right.created_at),
    )

    return rightTime - leftTime
  })[0] ?? null
}
