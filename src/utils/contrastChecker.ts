/**
 * WCAG AA Color Contrast Validation Utility
 * 
 * This utility provides functions to calculate color contrast ratios
 * and validate WCAG AA compliance for accessibility.
 */

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  hex = hex.replace('#', '')
  
  // Handle 3-digit hex
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('')
  }
  
  // Handle 6-digit hex
  if (hex.length === 6) {
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    return { r, g, b }
  }
  
  return null
}

/**
 * Convert RGB string to RGB values
 */
function rgbStringToRgb(rgb: string): { r: number; g: number; b: number } | null {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10)
    }
  }
  return null
}

/**
 * Parse color string to RGB values
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  // Handle hex colors
  if (color.startsWith('#')) {
    return hexToRgb(color)
  }
  
  // Handle rgb() colors
  if (color.startsWith('rgb(')) {
    return rgbStringToRgb(color)
  }
  
  // Handle named colors (basic set)
  const namedColors: Record<string, string> = {
    'white': '#ffffff',
    'black': '#000000',
    'red': '#ff0000',
    'green': '#008000',
    'blue': '#0000ff',
    'yellow': '#ffff00',
    'cyan': '#00ffff',
    'magenta': '#ff00ff',
    'gray': '#808080',
    'grey': '#808080'
  }
  
  if (namedColors[color.toLowerCase()]) {
    return hexToRgb(namedColors[color.toLowerCase()])
  }
  
  return null
}

/**
 * Calculate relative luminance of a color
 * Based on WCAG 2.1 specification
 */
function getRelativeLuminance(r: number, g: number, b: number): number {
  // Convert to 0-1 range
  const rs = r / 255
  const gs = g / 255
  const bs = b / 255
  
  // Apply gamma correction
  const rLinear = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4)
  const gLinear = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4)
  const bLinear = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4)
  
  // Calculate luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear
}

/**
 * Calculate contrast ratio between two colors
 * Returns a value between 1 and 21
 */
export function getContrastRatio(foreground: string, background: string): number {
  const fgColor = parseColor(foreground)
  const bgColor = parseColor(background)
  
  if (!fgColor || !bgColor) {
    console.warn('Invalid color format provided to getContrastRatio')
    return 1
  }
  
  const fgLuminance = getRelativeLuminance(fgColor.r, fgColor.g, fgColor.b)
  const bgLuminance = getRelativeLuminance(bgColor.r, bgColor.g, bgColor.b)
  
  // Ensure lighter color is in numerator
  const lighter = Math.max(fgLuminance, bgLuminance)
  const darker = Math.min(fgLuminance, bgLuminance)
  
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Check if color combination meets WCAG AA standards
 * @param foreground - Foreground color (text)
 * @param background - Background color
 * @param isLargeText - Whether text is large (18pt+ or 14pt+ bold)
 * @returns true if meets WCAG AA standards
 */
export function meetsWCAG_AA(
  foreground: string, 
  background: string, 
  isLargeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background)
  
  // WCAG AA requirements:
  // - Normal text: 4.5:1
  // - Large text: 3:1
  const requiredRatio = isLargeText ? 3 : 4.5
  
  return ratio >= requiredRatio
}

/**
 * Check if color combination meets WCAG AAA standards
 * @param foreground - Foreground color (text)
 * @param background - Background color
 * @param isLargeText - Whether text is large (18pt+ or 14pt+ bold)
 * @returns true if meets WCAG AAA standards
 */
export function meetsWCAG_AAA(
  foreground: string, 
  background: string, 
  isLargeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background)
  
  // WCAG AAA requirements:
  // - Normal text: 7:1
  // - Large text: 4.5:1
  const requiredRatio = isLargeText ? 4.5 : 7
  
  return ratio >= requiredRatio
}

/**
 * Get accessibility level for color combination
 */
export function getAccessibilityLevel(
  foreground: string, 
  background: string, 
  isLargeText: boolean = false
): 'AAA' | 'AA' | 'FAIL' {
  if (meetsWCAG_AAA(foreground, background, isLargeText)) {
    return 'AAA'
  } else if (meetsWCAG_AA(foreground, background, isLargeText)) {
    return 'AA'
  } else {
    return 'FAIL'
  }
}

/**
 * Suggest an accessible color based on a base color and background
 * This is a simplified implementation that adjusts lightness
 */
export function suggestAccessibleColor(
  baseColor: string,
  background: string,
  targetRatio: number = 4.5
): string {
  const bgColor = parseColor(background)
  if (!bgColor) return baseColor
  
  const bgLuminance = getRelativeLuminance(bgColor.r, bgColor.g, bgColor.b)
  
  // Determine if we need a lighter or darker color
  const needsLighter = bgLuminance < 0.5
  
  // Simple approach: adjust the base color's lightness
  const baseRgb = parseColor(baseColor)
  if (!baseRgb) return baseColor
  
  let { r, g, b } = baseRgb
  let attempts = 0
  const maxAttempts = 50
  
  while (attempts < maxAttempts) {
    const currentRatio = getContrastRatio(
      `rgb(${r}, ${g}, ${b})`,
      background
    )
    
    if (currentRatio >= targetRatio) {
      return `rgb(${r}, ${g}, ${b})`
    }
    
    // Adjust color values
    if (needsLighter) {
      r = Math.min(255, r + 5)
      g = Math.min(255, g + 5)
      b = Math.min(255, b + 5)
    } else {
      r = Math.max(0, r - 5)
      g = Math.max(0, g - 5)
      b = Math.max(0, b - 5)
    }
    
    attempts++
  }
  
  // If we can't find a good color, return high contrast fallback
  return needsLighter ? '#ffffff' : '#000000'
}

/**
 * Validate a color palette against WCAG AA standards
 */
export function validateColorPalette(palette: {
  [key: string]: {
    color: string
    background: string
    isLargeText?: boolean
  }
}): {
  [key: string]: {
    ratio: number
    level: 'AAA' | 'AA' | 'FAIL'
    passes: boolean
  }
} {
  const results: any = {}
  
  for (const [key, config] of Object.entries(palette)) {
    const ratio = getContrastRatio(config.color, config.background)
    const level = getAccessibilityLevel(config.color, config.background, config.isLargeText)
    const passes = level !== 'FAIL'
    
    results[key] = {
      ratio: Math.round(ratio * 100) / 100, // Round to 2 decimal places
      level,
      passes
    }
  }
  
  return results
}

/**
 * Development helper: Log contrast validation results
 */
export function logContrastValidation(
  name: string,
  foreground: string,
  background: string,
  isLargeText: boolean = false
): void {
  if (process.env.NODE_ENV !== 'development') return
  
  const ratio = getContrastRatio(foreground, background)
  const level = getAccessibilityLevel(foreground, background, isLargeText)
  const passes = level !== 'FAIL'
  
  const status = passes ? '✅' : '❌'
  const textSize = isLargeText ? 'Large' : 'Normal'
  
  console.log(
    `${status} ${name} (${textSize}): ${ratio.toFixed(2)}:1 (${level})`
  )
  
  if (!passes) {
    const suggested = suggestAccessibleColor(foreground, background)
    console.log(`   💡 Suggested: ${suggested}`)
  }
}