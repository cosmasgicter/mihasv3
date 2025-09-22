/**
 * Secure execution utilities to prevent code injection vulnerabilities
 * Replaces dangerous Function() constructor usage with safe alternatives
 */

// Whitelist of allowed function names for secure execution
const ALLOWED_FUNCTIONS = [
  'calculateGrade',
  'validateInput',
  'formatDate',
  'sanitizeString',
  'parseNumber',
  'validateEmail',
  'formatCurrency'
] as const

type AllowedFunction = typeof ALLOWED_FUNCTIONS[number]

/**
 * Secure function registry - maps function names to actual implementations
 */
const FUNCTION_REGISTRY: Record<AllowedFunction, Function> = {
  calculateGrade: (score: number, total: number) => Math.round((score / total) * 100),
  validateInput: (input: string) => typeof input === 'string' && input.trim().length > 0,
  formatDate: (date: Date) => date.toISOString().split('T')[0],
  sanitizeString: (str: string) => str.replace(/[<>\"'&]/g, ''),
  parseNumber: (str: string) => {
    const num = parseFloat(str)
    return isNaN(num) ? 0 : num
  },
  validateEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  formatCurrency: (amount: number) => `$${amount.toFixed(2)}`
}

/**
 * Secure alternative to Function() constructor
 * Only allows execution of whitelisted functions
 */
export function secureExecute(functionName: string, ...args: any[]): any {
  // Validate function name against whitelist
  if (!ALLOWED_FUNCTIONS.includes(functionName as AllowedFunction)) {
    throw new Error(`Function '${functionName}' is not allowed`)
  }

  const func = FUNCTION_REGISTRY[functionName as AllowedFunction]
  if (!func) {
    throw new Error(`Function '${functionName}' not found in registry`)
  }

  try {
    return func(...args)
  } catch (error) {
    throw new Error(`Error executing function '${functionName}': ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Secure expression evaluator for simple mathematical expressions
 * Uses safe parser without eval() or Function()
 */
export function secureEvaluateExpression(expression: string): number {
  const cleanExpression = expression.replace(/\s/g, '')
  
  if (!/^[0-9+\-*/().]+$/.test(cleanExpression)) {
    throw new Error('Invalid characters in expression')
  }

  if (/[a-zA-Z_$]/.test(cleanExpression)) {
    throw new Error('Function calls not allowed in expressions')
  }

  try {
    const result = parseSimpleMathExpression(cleanExpression)
    
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Expression must evaluate to a finite number')
    }
    
    return result
  } catch (error) {
    throw new Error(`Invalid expression: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Safe mathematical expression parser without eval() or Function()
 */
function parseSimpleMathExpression(expr: string): number {
  // Simple recursive descent parser for basic math
  let pos = 0
  
  function parseNumber(): number {
    let num = ''
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) {
      num += expr[pos++]
    }
    return parseFloat(num)
  }
  
  function parseFactor(): number {
    if (expr[pos] === '(') {
      pos++ // skip '('
      const result = parseExpression()
      pos++ // skip ')'
      return result
    }
    return parseNumber()
  }
  
  function parseTerm(): number {
    let result = parseFactor()
    while (pos < expr.length && (expr[pos] === '*' || expr[pos] === '/')) {
      const op = expr[pos++]
      const right = parseFactor()
      result = op === '*' ? result * right : result / right
    }
    return result
  }
  
  function parseExpression(): number {
    let result = parseTerm()
    while (pos < expr.length && (expr[pos] === '+' || expr[pos] === '-')) {
      const op = expr[pos++]
      const right = parseTerm()
      result = op === '+' ? result + right : result - right
    }
    return result
  }
  
  return parseExpression()
}

/**
 * Secure template string processor
 * Replaces dangerous template literal usage
 */
export function secureTemplate(template: string, variables: Record<string, any>): string {
  // Sanitize template to prevent code injection
  const sanitizedTemplate = template.replace(/[<>\"'`\\]/g, '')
  
  // Replace variables using safe string replacement
  let result = sanitizedTemplate
  
  for (const [key, value] of Object.entries(variables)) {
    // Sanitize variable names and values
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '')
    const sanitizedValue = String(value).replace(/[<>\"'`\\]/g, '')
    
    // Use simple string replacement instead of template literals
    const placeholder = `{{${sanitizedKey}}}`
    result = result.replace(new RegExp(placeholder, 'g'), sanitizedValue)
  }
  
  return result
}

/**
 * Secure JSON parser with validation
 */
export function secureParseJSON(jsonString: string): any {
  try {
    // Basic validation before parsing
    if (typeof jsonString !== 'string') {
      throw new Error('Input must be a string')
    }
    
    // Check for potentially dangerous patterns
    if (jsonString.includes('__proto__') || jsonString.includes('constructor')) {
      throw new Error('Potentially dangerous JSON content detected')
    }
    
    const parsed = JSON.parse(jsonString)
    
    // Additional validation of parsed object
    if (parsed && typeof parsed === 'object') {
      // Remove any dangerous properties
      delete parsed.__proto__
      delete parsed.constructor
    }
    
    return parsed
  } catch (error) {
    throw new Error(`JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Secure configuration validator
 * Ensures configuration objects don't contain dangerous properties
 */
export function validateSecureConfig(config: any): boolean {
  if (!config || typeof config !== 'object') {
    return false
  }
  
  // Check for dangerous properties
  const dangerousProps = ['__proto__', 'constructor', 'prototype', 'eval', 'Function']
  
  for (const prop of dangerousProps) {
    if (prop in config) {
      return false
    }
  }
  
  // Recursively check nested objects
  for (const value of Object.values(config)) {
    if (value && typeof value === 'object') {
      if (!validateSecureConfig(value)) {
        return false
      }
    }
  }
  
  return true
}

/**
 * Safe alternative to setTimeout with validation
 */
export function secureTimeout(callback: () => void, delay: number): NodeJS.Timeout {
  // Validate delay
  if (typeof delay !== 'number' || delay < 0 || delay > 300000) { // Max 5 minutes
    throw new Error('Invalid timeout delay')
  }
  
  // Validate callback
  if (typeof callback !== 'function') {
    throw new Error('Callback must be a function')
  }
  
  return setTimeout(callback, delay)
}

/**
 * Secure URL validator and sanitizer
 */
export function secureURL(url: string): string {
  try {
    const urlObj = new URL(url)
    
    // Only allow safe protocols
    const allowedProtocols = ['http:', 'https:', 'mailto:']
    if (!allowedProtocols.includes(urlObj.protocol)) {
      throw new Error('Protocol not allowed')
    }
    
    // Sanitize and return
    return urlObj.toString()
  } catch (error) {
    throw new Error(`Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}