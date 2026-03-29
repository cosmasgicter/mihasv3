export function px(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value
}

export function cssVar(name: string) {
  if (name.startsWith('--')) return `var(${name})`
  return `var(--${name})`
}

export const layout = {
  sidebarCollapsed: 'var(--sidebar-collapsed)',
  sidebarExpanded: 'var(--sidebar-expanded)',
  headerHeight: 'var(--header-height)'
}

export default { px, cssVar, layout }
