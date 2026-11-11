/**
 * The subject select's options (extracted from `EducationStep`, task 25.7).
 *
 * Pure so the option values can be asserted without opening a select. A category
 * header's value carries its group (`__cat_<group>_<category>`): ECZ and A-Level
 * share category names, and two header options with one value repeat a key in one
 * list (C-18).
 */
import type { Grade12Subject } from '../types'

export interface SubjectOption {
  value: string
  label: string
  disabled?: boolean
}

export function buildSubjectOptions(
  subjects: Grade12Subject[],
  usedSubjects: string[],
  currentSubjectId: string,
): SubjectOption[] {

  // Group subjects by level, then by category within each level
  const grade12 = subjects.filter(s => !s.level || s.level === 'grade12')
  const alevel = subjects.filter(s => s.level === 'alevel')

  const categoryOrder = ['core', 'sciences', 'commercial', 'humanities', 'technology', 'practical', 'languages']
  // Plain-text category labels. Emoji are not used as structural icons
  // (DESIGN.md §5 / R7.5); these are option-group headings inside a native
  // select where Lucide JSX cannot render, so plain text is the canonical fix.
  const categoryLabels: Record<string, string> = {
    core: 'Core Subjects',
    sciences: 'Sciences',
    commercial: 'Commercial',
    humanities: 'Humanities',
    technology: 'Technology & Technical',
    practical: 'Practical & Creative',
    languages: 'Languages',
  }

  const buildGroupedOptions = (list: typeof subjects, group: 'grade12' | 'alevel') => {
    const grouped = new Map<string, typeof subjects>()
    for (const s of list) {
      const cat = s.category || 'other'
      if (!grouped.has(cat)) grouped.set(cat, [])
      grouped.get(cat)!.push(s)
    }

    const options: Array<{ value: string; label: string; disabled?: boolean }> = []
    // R11.5: every server subject must be reachable. Known categories keep their
    // curated order; anything else (a tenant category, a new ECZ grouping) lands
    // in a trailing group rather than disappearing from the selector.
    const orderedCategories = [
      ...categoryOrder.filter(cat => grouped.has(cat)),
      ...Array.from(grouped.keys()).filter(cat => !categoryOrder.includes(cat)).sort(),
    ]
    for (const cat of orderedCategories) {
      const items = grouped.get(cat)
      if (!items || items.length === 0) continue
      options.push({
        // The group is part of the value: ECZ and A-Level share category names, and
        // two header options with one value repeat a key in one list (task 25.7, C-18).
        value: `__cat_${group}_${cat}`,
        label: categoryLabels[cat] || 'Other Subjects',
        disabled: true,
      })
      for (const subject of items.sort((a, b) => a.name.localeCompare(b.name))) {
        const isUsed = usedSubjects.includes(subject.id) && currentSubjectId !== subject.id
        options.push({
          value: subject.id,
          label: `  ${subject.name}${isUsed ? ' (Already selected)' : ''}`,
          disabled: isUsed,
        })
      }
    }
    return options
  }

  const options: Array<{ value: string; label: string; disabled?: boolean }> = []

  if (grade12.length > 0) {
    options.push({ value: '__header_grade12', label: '━━ Grade 12 (ECZ) ━━', disabled: true })
    options.push(...buildGroupedOptions(grade12, 'grade12'))
  }
  if (alevel.length > 0) {
    options.push({ value: '__header_alevel', label: '━━ A-Level (GCE Advanced) ━━', disabled: true })
    options.push(...buildGroupedOptions(alevel, 'alevel'))
  }

  return options
}
