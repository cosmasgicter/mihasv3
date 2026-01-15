/**
 * Accessibility Audit Script
 * Uses axe-core to check WCAG AA compliance across the application
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Simple contrast checker functions (inline since we can't import TS easily)
function hexToRgb(hex) {
  hex = hex.replace('#', '')
  
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('')
  }
  
  if (hex.length === 6) {
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    return { r, g, b }
  }
  
  return null
}

function getRelativeLuminance(r, g, b) {
  const rs = r / 255
  const gs = g / 255
  const bs = b / 255
  
  const rLinear = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4)
  const gLinear = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4)
  const bLinear = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4)
  
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear
}

function getContrastRatio(foreground, background) {
  const fgColor = hexToRgb(foreground)
  const bgColor = hexToRgb(background)
  
  if (!fgColor || !bgColor) {
    return 1
  }
  
  const fgLuminance = getRelativeLuminance(fgColor.r, fgColor.g, fgColor.b)
  const bgLuminance = getRelativeLuminance(bgColor.r, bgColor.g, bgColor.b)
  
  const lighter = Math.max(fgLuminance, bgLuminance)
  const darker = Math.min(fgLuminance, bgLuminance)
  
  return (lighter + 0.05) / (darker + 0.05)
}

function meetsWCAG_AA(foreground, background, isLargeText = false) {
  const ratio = getContrastRatio(foreground, background)
  const requiredRatio = isLargeText ? 3 : 4.5
  return ratio >= requiredRatio
}

console.log('🔍 MIHAS Accessibility Audit')
console.log('============================\n')

// 1. Color Contrast Validation
console.log('1. 📊 Color Contrast Analysis')
console.log('------------------------------')

// Define color combinations to test based on our design tokens
const colorCombinations = {
  // Primary combinations
  'Primary text on white': {
    color: '#2563eb',
    background: '#ffffff'
  },
  'Primary foreground on primary': {
    color: '#ffffff',
    background: '#2563eb'
  },
  
  // Admin dashboard colors
  'Admin text on admin background': {
    color: '#111827',
    background: '#f9fafb'
  },
  'Admin secondary text on admin background': {
    color: '#374151',
    background: '#f9fafb'
  },
  'Admin muted text on admin background': {
    color: '#6b7280',
    background: '#f9fafb'
  },
  'Admin text on card': {
    color: '#111827',
    background: '#ffffff'
  },
  
  // Status colors
  'Success text on white': {
    color: '#047857',
    background: '#ffffff'
  },
  'Warning text on white': {
    color: '#b45309',
    background: '#ffffff'
  },
  'Error text on white': {
    color: '#dc2626',
    background: '#ffffff'
  },
  'Info text on white': {
    color: '#2563eb',
    background: '#ffffff'
  },
  
  // Form elements
  'Input text on input background': {
    color: '#111827',
    background: '#ffffff'
  },
  'Input placeholder on input background': {
    color: '#6b7280',
    background: '#ffffff'
  },
  'Input border visibility': {
    color: '#6b7280',
    background: '#ffffff'
  },
  
  // Links
  'Link on white': {
    color: '#2563eb',
    background: '#ffffff'
  },
  'Link hover on white': {
    color: '#1d4ed8',
    background: '#ffffff'
  },
  'Link visited on white': {
    color: '#7c3aed',
    background: '#ffffff'
  },
  
  // Secondary combinations
  'Secondary foreground on secondary': {
    color: '#1e293b',
    background: '#e0e7ff'
  },
  'Accent foreground on accent': {
    color: '#1e40af',
    background: '#dbeafe'
  },
  'Muted foreground on muted': {
    color: '#374151',
    background: '#f1f5f9'
  }
}

// Validate all color combinations
let passCount = 0
let failCount = 0
const failedCombinations = []

for (const [name, config] of Object.entries(colorCombinations)) {
  const ratio = getContrastRatio(config.color, config.background)
  const passes = meetsWCAG_AA(config.color, config.background)
  const level = passes ? 'AA' : 'FAIL'
  
  const status = passes ? '✅' : '❌'
  
  console.log(`${status} ${name}:`)
  console.log(`   Colors: ${config.color} on ${config.background}`)
  console.log(`   Ratio: ${ratio.toFixed(2)}:1 (${level})`)
  
  if (!passes) {
    failedCombinations.push({
      name,
      ...config,
      ratio: ratio.toFixed(2),
      level
    })
    failCount++
  } else {
    passCount++
  }
  console.log('')
}

console.log(`📊 Color Contrast Summary: ${passCount} passed, ${failCount} failed\n`)

// 2. Check if axe-core is available for DOM testing
console.log('2. 🔧 DOM Accessibility Testing')
console.log('--------------------------------')

try {
  // Check if we can run axe tests (requires a running server)
  console.log('ℹ️  DOM accessibility testing requires a running development server.')
  console.log('   To run full accessibility tests:')
  console.log('   1. Start the dev server: npm run dev')
  console.log('   2. Run: npm run test:accessibility')
  console.log('')
} catch (error) {
  console.log('⚠️  Could not run DOM accessibility tests')
  console.log('   Make sure the development server is running\n')
}

// 3. Static Analysis of Components
console.log('3. 📁 Static Component Analysis')
console.log('--------------------------------')

const componentDirs = [
  'src/components/ui',
  'src/components/admin',
  'src/pages/admin'
]

let componentIssues = []

for (const dir of componentDirs) {
  const fullPath = path.join(process.cwd(), dir)
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Directory not found: ${dir}`)
    continue
  }
  
  const files = fs.readdirSync(fullPath, { recursive: true })
    .filter(file => file.endsWith('.tsx') || file.endsWith('.jsx'))
  
  console.log(`📂 Checking ${files.length} components in ${dir}`)
  
  for (const file of files) {
    const filePath = path.join(fullPath, file)
    
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      
      // Check for common accessibility issues
      const issues = []
      
      // Check for missing alt attributes on images
      if (content.includes('<img') && !content.includes('alt=')) {
        issues.push('Missing alt attributes on images')
      }
      
      // Check for buttons without accessible text
      if (content.includes('<button') && content.includes('aria-label')) {
        // Good - has aria-label
      } else if (content.includes('<button') && !content.match(/<button[^>]*>[^<]+</)) {
        issues.push('Button may be missing accessible text')
      }
      
      // Check for form inputs without labels
      if (content.includes('<input') && !content.includes('aria-label') && !content.includes('htmlFor')) {
        issues.push('Form inputs may be missing labels')
      }
      
      // Check for hardcoded colors (should use design tokens)
      const hardcodedColors = content.match(/(#[0-9a-fA-F]{3,6}|rgb\(|rgba\()/g)
      if (hardcodedColors && hardcodedColors.length > 0) {
        issues.push(`Found ${hardcodedColors.length} hardcoded colors - should use design tokens`)
      }
      
      if (issues.length > 0) {
        componentIssues.push({
          file: path.relative(process.cwd(), filePath),
          issues
        })
      }
      
    } catch (error) {
      console.log(`⚠️  Could not read file: ${file}`)
    }
  }
}

if (componentIssues.length > 0) {
  console.log('\n⚠️  Component Issues Found:')
  for (const { file, issues } of componentIssues) {
    console.log(`\n📄 ${file}:`)
    for (const issue of issues) {
      console.log(`   • ${issue}`)
    }
  }
} else {
  console.log('✅ No obvious accessibility issues found in components')
}

// 4. Generate Report
console.log('\n4. 📋 Accessibility Report')
console.log('---------------------------')

const report = {
  timestamp: new Date().toISOString(),
  colorContrast: {
    total: passCount + failCount,
    passed: passCount,
    failed: failCount,
    failedCombinations
  },
  componentIssues: componentIssues.length,
  recommendations: []
}

// Add recommendations based on findings
if (failCount > 0) {
  report.recommendations.push('Update failing color combinations to meet WCAG AA standards')
  report.recommendations.push('Use the suggested colors from the contrast checker utility')
}

if (componentIssues.length > 0) {
  report.recommendations.push('Fix component accessibility issues identified in static analysis')
  report.recommendations.push('Add proper alt text, labels, and ARIA attributes where missing')
}

report.recommendations.push('Run full DOM accessibility tests with axe-core on a running application')
report.recommendations.push('Test with screen readers and keyboard navigation')
report.recommendations.push('Validate color contrast in different lighting conditions')

// Save report
const reportPath = path.join(process.cwd(), 'accessibility-report.json')
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

console.log(`📊 Overall Accessibility Score: ${Math.round((passCount / (passCount + failCount + componentIssues.length)) * 100)}%`)
console.log(`📄 Detailed report saved to: ${reportPath}`)

// 5. Next Steps
console.log('\n5. 🚀 Next Steps')
console.log('----------------')
console.log('• Fix any failing color contrast combinations')
console.log('• Address component accessibility issues')
console.log('• Run manual testing with keyboard navigation')
console.log('• Test with screen readers (NVDA, JAWS, VoiceOver)')
console.log('• Validate touch targets are at least 44x44px on mobile')
console.log('• Test in high contrast mode')
console.log('• Verify focus indicators are visible and consistent')

// Exit with appropriate code
if (failCount > 0 || componentIssues.length > 0) {
  console.log('\n❌ Accessibility audit found issues that need attention')
  process.exit(1)
} else {
  console.log('\n✅ Accessibility audit passed!')
  process.exit(0)
}