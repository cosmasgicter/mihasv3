import type { WizardProgram } from '../../../types'

export function sanitizeInput(value: any): any {
  if (typeof value === 'string') {
    return value.trim().replace(/<script[^>]*>.*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
  }
  return value
}

export function findProgramId(
  value?: string | null,
  institutionHint?: string | null,
  programs: WizardProgram[] = []
): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  const byId = programs.find(p => p.id === trimmed)
  if (byId) return byId.id

  const normalized = trimmed.toLowerCase()
  const exactMatches = programs.filter(p => p.name?.trim().toLowerCase() === normalized)
  
  if (exactMatches.length === 1) return exactMatches[0].id
  if (exactMatches.length > 1 && institutionHint) {
    const hint = institutionHint.trim().toLowerCase()
    const byInst = exactMatches.find(p => {
      const instName = p.institutions?.full_name || p.institutions?.name || ''
      const norm = instName.trim().toLowerCase()
      return norm === hint || norm.includes(hint) || hint.includes(norm)
    })
    if (byInst) return byInst.id
    return exactMatches[0].id
  }

  const partialMatches = programs.filter(p => {
    const name = p.name?.trim().toLowerCase() || ''
    return name.includes(normalized) || normalized.includes(name)
  })
  
  if (partialMatches.length === 1) return partialMatches[0].id
  if (partialMatches.length > 1 && institutionHint) {
    const hint = institutionHint.trim().toLowerCase()
    const byInst = partialMatches.find(p => {
      const instName = p.institutions?.full_name || p.institutions?.name || ''
      const norm = instName.trim().toLowerCase()
      return norm === hint || norm.includes(hint)
    })
    if (byInst) return byInst.id
  }

  return ''
}

export function deriveInstitutionLabel(institution?: WizardProgram['institutions']): string {
  if (!institution) return ''
  return institution.full_name?.trim() || institution.name?.trim() || ''
}

export function resolveInstitutionCode(institutionLabel: string): string {
  const normalized = institutionLabel.trim().toLowerCase()
  if (normalized.includes('kalulushi') || normalized.includes('katc')) {
    return 'KATC'
  }
  return 'MIHAS'
}
