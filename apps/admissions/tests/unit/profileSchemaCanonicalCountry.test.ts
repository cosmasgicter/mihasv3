import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('profiles schema canonical country field', () => {
  it('tracks country as the canonical residence-country column in forensic schema metadata', () => {
    const data = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../migrations/forensic/core_tables.json'), 'utf8'),
    ) as {
      core_tables: Array<{ name: string; columns?: Array<{ name: string }> }>
    }

    const profiles = data.core_tables.find(table => table.name === 'profiles')
    const columns = profiles?.columns?.map(column => column.name) ?? []

    expect(columns).toContain('country')
    expect(columns).not.toContain('residence_country')
  })
})
