/**
 * Test helper — render-tree shape extraction.
 *
 * Walks a React element tree (not a DOM tree) and produces a compact
 * indented string describing which components are used, in what order,
 * and with key props. Used for snapshot tests on PDF document components
 * so we catch structural drift without having to embed full ReactPDF
 * internals into the snapshot.
 *
 * Example output:
 *
 *   Document
 *     PageFrame[documentType=APPLICATION SLIP]
 *       Text
 *       MetadataStrip
 *       View
 *         SectionHeading
 *         FieldGrid
 *           LabeledField[label=Application Number]
 *           LabeledField[label=Tracking Code]
 */

import type { ReactElement, ReactNode } from 'react'
import { Children, isValidElement } from 'react'

const KEY_PROPS = ['label', 'documentType', 'variant', 'children'] as const

function componentName(type: unknown): string {
  if (typeof type === 'string') return type
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string }
    return fn.displayName || fn.name || 'Anonymous'
  }
  return 'Unknown'
}

function keyPropsSummary(props: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof props.label === 'string') parts.push(`label=${props.label}`)
  if (typeof props.documentType === 'string') parts.push(`documentType=${props.documentType}`)
  if (typeof props.variant === 'string') parts.push(`variant=${props.variant}`)
  if (typeof props.accent === 'boolean' && props.accent) parts.push(`accent`)
  if (typeof props.columns === 'number') parts.push(`columns=${props.columns}`)
  if (typeof props.mono === 'boolean' && props.mono) parts.push(`mono`)
  if (typeof props.strong === 'boolean' && props.strong) parts.push(`strong`)
  return parts.length ? `[${parts.join(',')}]` : ''
}

function walkTree(
  node: ReactNode,
  depth: number,
  lines: string[],
): void {
  if (node === null || node === undefined || node === false) return
  if (typeof node === 'string' || typeof node === 'number') return

  if (Array.isArray(node)) {
    for (const child of node) walkTree(child, depth, lines)
    return
  }

  if (isValidElement(node)) {
    const element = node as ReactElement<Record<string, unknown>>
    const name = componentName(element.type)
    const summary = keyPropsSummary(element.props ?? {})
    lines.push(`${'  '.repeat(depth)}${name}${summary}`)

    // For function components, invoke them to get their rendered output so
    // the shape test sees the full tree, not just the outer wrapper.
    // We avoid inlining @react-pdf's primitives (Document/Page/View/Text/
    // Image) because they've already been mocked to identity elements.
    if (typeof element.type === 'function' && !isMockedPrimitive(name)) {
      try {
        const rendered = (element.type as (p: unknown) => ReactNode)(
          element.props ?? {},
        )
        walkTree(rendered, depth + 1, lines)
        return
      } catch {
        // Some components rely on hooks or React context; if invocation
        // throws, fall back to walking the props.children as-is.
      }
    }

    const children = (element.props as { children?: ReactNode })?.children
    if (children !== undefined) walkTree(children, depth + 1, lines)
  }
}

const MOCKED_PRIMITIVES = new Set([
  'Document',
  'Page',
  'View',
  'Text',
  'Image',
])

function isMockedPrimitive(name: string): boolean {
  return MOCKED_PRIMITIVES.has(name)
}

/**
 * Turn a React element tree into a stable multi-line string summary.
 * Suitable for `toMatchSnapshot()` or direct equality checks.
 */
export function treeShape(element: ReactElement): string {
  const lines: string[] = []
  walkTree(element, 0, lines)
  return lines.join('\n')
}
