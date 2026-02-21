#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const textExtensions = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.scss', '.html', '.yml', '.yaml', '.txt', '.sh'
])
const suspiciousPatterns = [
  'Ãƒ',
  'Ã¢â‚¬',
  'â‚¬',
  'â€™',
  'â€œ',
  'Â©',
  'Â®',
  'Â·',
  'Â ' 
]

// Files to exclude from mojibake scanning (they contain patterns intentionally)
const excludeFiles = new Set([
  'scripts/check-mojibake.js',
])

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((file) => {
    if (excludeFiles.has(file.replace(/\\/g, '/'))) return false
    const dot = file.lastIndexOf('.')
    const ext = dot >= 0 ? file.slice(dot) : ''
    return textExtensions.has(ext)
  })

const matches = []

for (const file of files) {
  if (!existsSync(file)) continue
  const content = readFileSync(file, 'utf8')
  const lines = content.split('\n')
  lines.forEach((line, index) => {
    const found = suspiciousPatterns.filter((pattern) => line.includes(pattern))
    if (found.length > 0) {
      matches.push({ file, line: index + 1, found: [...new Set(found)], text: line.trim() })
    }
  })
}

if (matches.length > 0) {
  console.error('Mojibake-like text detected. Please replace with clean UTF-8 text:')
  matches.forEach(({ file, line, found, text }) => {
    console.error(`- ${file}:${line} [${found.join(', ')}] ${text}`)
  })
  process.exit(1)
}

console.log('No mojibake patterns found.')
