/**
 * One optional-field marker (platform-simplification task 24.4, Requirement 16.5):
 * "(optional)" in the shared label, no asterisk anywhere, and `required` /
 * `aria-required` still on the control.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { AnimatedInput } from '@/components/smoothui/animated-input'

describe('optional field marker', () => {
  it('Input marks an optional field in words and a required field not at all', () => {
    const { container, rerender } = render(<Input label="Nickname" optional />)
    expect(screen.getByText('(optional)')).toBeTruthy()
    rerender(<Input label="Full name" required />)
    expect(container.textContent).not.toContain('*')
    expect(container.textContent).not.toContain('(optional)')
    expect(screen.getByLabelText(/full name/i).getAttribute('aria-required')).toBe('true')
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).required).toBe(true)
  })

  it('Textarea, PasswordInput and AnimatedInput share the same marker', () => {
    render(
      <>
        <Textarea label="Notes" optional />
        <PasswordInput label="Old password" optional />
        <AnimatedInput label="Middle name" optional />
      </>,
    )
    expect(screen.getAllByText('(optional)')).toHaveLength(3)
  })

  it('never shows both: a required field ignores optional', () => {
    const { container } = render(<Input label="Email" required optional />)
    expect(container.textContent).not.toContain('(optional)')
  })

  it('no source file renders an asterisk as a required marker', () => {
    const root = join(__dirname, '..', '..', 'src')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.tsx$/.test(entry)) {
          const lines = readFileSync(full, 'utf8').split('\n')
          lines.forEach((line, i) => {
            if (/<span[^>]*>\*<\/span>|label=("[^"]*\*"|\{`[^`]*\*`\})/.test(line)) offenders.push(`${full}:${i + 1}`)
          })
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
