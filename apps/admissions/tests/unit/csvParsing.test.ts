import { describe, it, expect } from 'vitest'
import { parseCSVRow, splitCSVRows } from '@/components/admin/UserImport'

describe('parseCSVRow — RFC 4180', () => {
  it('parses simple unquoted fields', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('handles comma inside quoted field (e.g. "Doe, John")', () => {
    expect(parseCSVRow('"Doe, John",john@example.com,student')).toEqual([
      'Doe, John',
      'john@example.com',
      'student',
    ])
  })

  it('handles apostrophe in unquoted field (O\'Brien)', () => {
    expect(parseCSVRow("O'Brien,ob@test.com,admin")).toEqual([
      "O'Brien",
      'ob@test.com',
      'admin',
    ])
  })

  it('handles apostrophe inside quoted field', () => {
    expect(parseCSVRow('"O\'Brien",ob@test.com,admin')).toEqual([
      "O'Brien",
      'ob@test.com',
      'admin',
    ])
  })

  it('handles escaped double-quotes inside quoted field', () => {
    expect(parseCSVRow('"say ""hello""",b,c')).toEqual(['say "hello"', 'b', 'c'])
  })

  it('handles empty fields', () => {
    expect(parseCSVRow('a,,c')).toEqual(['a', '', 'c'])
  })

  it('handles trailing comma (empty last field)', () => {
    expect(parseCSVRow('a,b,')).toEqual(['a', 'b', ''])
  })
})

describe('splitCSVRows — embedded newlines', () => {
  it('splits normal rows on newline', () => {
    expect(splitCSVRows('a,b\nc,d')).toEqual(['a,b', 'c,d'])
  })

  it('keeps embedded newline inside quoted field together', () => {
    const csv = 'full_name,email,role\n"Doe,\nJohn",j@x.com,student\nJane,jane@x.com,admin'
    const rows = splitCSVRows(csv)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toBe('full_name,email,role')
    expect(rows[1]).toBe('"Doe,\nJohn",j@x.com,student')
    expect(rows[2]).toBe('Jane,jane@x.com,admin')
  })

  it('handles CRLF line endings', () => {
    expect(splitCSVRows('a,b\r\nc,d\r\n')).toEqual(['a,b', 'c,d'])
  })
})
