/**
 * "Go to field" for the Still needed list (task 25.2).
 *
 * A readiness item names a form field (`full_name`, `nrc_number`) or a group with no
 * single control (`grades`, `result_slip`, `payment`). The first kind is found by its
 * `name` or `id`; anything else falls back to the first control inside the step's form
 * region, so the link always moves the student to the step's own work.
 */
const escape = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function findWizardField(field: string, root: ParentNode = document): HTMLElement | null {
  const key = escape(field)
  const direct =
    root.querySelector<HTMLElement>(`[name="${key}"]`) ??
    root.querySelector<HTMLElement>(`#${key}`) ??
    root.querySelector<HTMLElement>(`[data-wizard-field="${key}"]`)
  if (direct) return direct
  const region = root.querySelector<HTMLElement>('[data-wizard-form-region]')
  return region?.querySelector<HTMLElement>(FOCUSABLE) ?? region ?? null
}

/** Scroll to the field and focus it. Returns false when nothing could be focused. */
export function focusWizardField(field: string, root: ParentNode = document): boolean {
  const target = findWizardField(field, root)
  if (!target) return false
  target.scrollIntoView?.({ block: 'center' })
  target.focus({ preventScroll: true })
  return true
}
