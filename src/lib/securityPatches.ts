/**
 * Security patches to address code injection vulnerabilities
 * This file contains fixes for CWE-94 (Code Injection) vulnerabilities
 */

import { SecuritySanitizer } from './securityConfig'

type TemplatePrimitive = string | number | boolean | null | undefined
type TemplateVariables = Record<string, TemplatePrimitive>
type ConditionPrimitive = string | number | boolean
type ConditionOperand = ConditionPrimitive | ConditionPrimitive[]
type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'contains'
type EventHandler = (...args: unknown[]) => unknown

/**
 * Secure replacement for dynamic code execution
 * Replaces Function() constructor usage with safe alternatives
 */
export class SecureCodeExecution {
  private static allowedOperations = new Set([
    'add', 'subtract', 'multiply', 'divide', 'modulo',
    'equals', 'notEquals', 'greaterThan', 'lessThan',
    'and', 'or', 'not'
  ])

  /**
   * Secure mathematical expression evaluator
   * Replaces eval() and Function() constructor for math operations
   */
  static evaluateMathExpression(expression: string): number {
    // Sanitize input
    const sanitized = expression.replace(/\s/g, '').toLowerCase()
    
    // Only allow numbers, operators, and parentheses
    if (!/^[0-9+\-*/().]+$/.test(sanitized)) {
      throw new Error('Invalid characters in mathematical expression')
    }
    
    // Parse and evaluate safely without Function() constructor
    return this.parseExpression(sanitized)
  }

  /**
   * Safe expression parser that doesn't use eval or Function constructor
   */
  private static parseExpression(expr: string): number {
    // Simple recursive descent parser for basic math
    let index = 0
    
    const parseNumber = (): number => {
      let num = ''
      while (index < expr.length && /[0-9.]/.test(expr[index])) {
        num += expr[index++]
      }
      const result = parseFloat(num)
      if (isNaN(result)) throw new Error('Invalid number')
      return result
    }
    
    const parseFactor = (): number => {
      if (expr[index] === '(') {
        index++ // skip '('
        const result = parseExpression()
        if (expr[index] !== ')') throw new Error('Missing closing parenthesis')
        index++ // skip ')'
        return result
      }
      return parseNumber()
    }
    
    const parseTerm = (): number => {
      let result = parseFactor()
      while (index < expr.length && /[*/]/.test(expr[index])) {
        const op = expr[index++]
        const right = parseFactor()
        if (op === '*') result *= right
        else if (op === '/') {
          if (right === 0) throw new Error('Division by zero')
          result /= right
        }
      }
      return result
    }
    
    const parseExpression = (): number => {
      let result = parseTerm()
      while (index < expr.length && /[+-]/.test(expr[index])) {
        const op = expr[index++]
        const right = parseTerm()
        if (op === '+') result += right
        else if (op === '-') result -= right
      }
      return result
    }
    
    const result = parseExpression()
    if (!isFinite(result)) throw new Error('Result is not a finite number')
    return result
  }

  /**
   * Secure template processor that doesn't use Function constructor
   */
  static processTemplate(template: string, variables: TemplateVariables): string {
    let result = SecuritySanitizer.sanitizeInput(template)
    
    // Replace variables using safe string replacement
    for (const [key, value] of Object.entries(variables)) {
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '')
      const sanitizedValue = SecuritySanitizer.sanitizeInput(String(value))
      
      // Use simple string replacement instead of template literals
      const pattern = new RegExp(`\\{\\{\\s*${sanitizedKey}\\s*\\}\\}`, 'g')
      result = result.replace(pattern, sanitizedValue)
    }
    
    return result
  }

  /**
   * Secure condition evaluator for workflow rules
   */
  static evaluateCondition(left: ConditionOperand, operator: ConditionOperator, right: ConditionOperand): boolean {
    const allowedOperators: ConditionOperator[] = ['==', '!=', '>', '<', '>=', '<=', 'in', 'contains']
    
    if (!allowedOperators.includes(operator)) {
      throw new Error(`Operator '${operator}' is not allowed`)
    }
    
    switch (operator) {
      case '==': return left === right
      case '!=': return left !== right
      case '>': return Number(left) > Number(right)
      case '<': return Number(left) < Number(right)
      case '>=': return Number(left) >= Number(right)
      case '<=': return Number(left) <= Number(right)
      case 'in':
        return Array.isArray(right)
          ? (right as ConditionPrimitive[]).includes(left as ConditionPrimitive)
          : false
      case 'contains': return String(left).toLowerCase().includes(String(right).toLowerCase())
      default: return false
    }
  }
}

/**
 * Secure event handler that prevents code injection
 */
export class SecureEventHandler {
  private static handlers = new Map<string, EventHandler>()
  
  /**
   * Register a secure event handler
   */
  static register(eventName: string, handler: EventHandler): void {
    // Validate event name
    if (!/^[a-zA-Z0-9_-]+$/.test(eventName)) {
      throw new Error('Invalid event name')
    }

    this.handlers.set(eventName, handler)
  }
  
  /**
   * Execute a registered handler safely
   */
  static execute(eventName: string, ...args: unknown[]): unknown {
    const handler = this.handlers.get(eventName)
    if (!handler) {
      throw new Error(`No handler registered for event: ${eventName}`)
    }
    
    try {
      return handler(...args)
    } catch (error) {
      console.error(`Error executing handler for ${eventName}:`, error)
      throw error
    }
  }
}

/**
 * Secure configuration loader that prevents prototype pollution
 */
export class SecureConfigLoader {
  /**
   * Load configuration safely without prototype pollution
   */
  static loadConfig<TConfig extends Record<string, unknown> | null | undefined>(config: TConfig): Record<string, unknown> {
    if (!config || typeof config !== 'object') {
      return {}
    }
    
    // Create a clean object without prototype
    const safeConfig = Object.create(null)
    
    // Copy properties safely
    for (const [key, value] of Object.entries(config)) {
      // Skip dangerous properties
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue
      }
      
      // Recursively clean nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        safeConfig[key] = this.loadConfig(value as Record<string, unknown>)
      } else {
        safeConfig[key] = value
      }
    }

    return safeConfig
  }
}

/**
 * Secure URL builder that prevents injection
 */
export class SecureURLBuilder {
  /**
   * Build URL safely with parameter validation
   */
  static buildURL(base: string, params: Record<string, string | number | boolean>): string {
    try {
      const url = new URL(base)
      
      // Validate base URL protocol
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid URL protocol')
      }
      
      // Add parameters safely
      for (const [key, value] of Object.entries(params)) {
        const sanitizedKey = SecuritySanitizer.sanitizeInput(key)
        const sanitizedValue = SecuritySanitizer.sanitizeInput(String(value))
        url.searchParams.set(sanitizedKey, sanitizedValue)
      }
      
      return url.toString()
    } catch (error) {
      throw new Error(`Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

/**
 * Initialize security patches
 */
export function initializeSecurityPatches(): void {
  // Override dangerous global functions if they exist
  if (typeof window !== 'undefined') {
    // Prevent Function constructor usage
    if (window.Function) {
      window.Function = function(..._args: unknown[]) {
        // SECURE: Security patch to block Function constructor
        console.warn('Function constructor blocked by security patch')
        throw new Error('Function constructor usage is blocked for security')
      } as unknown as typeof window.Function
    }
    
    // Prevent eval usage
    if (window.eval) {
      window.eval = function(_code: string) {
        // SECURE: Security patch to block eval usage
        console.warn('eval() blocked by security patch')
        throw new Error('eval() usage is blocked for security')
      }
    }
  }
  
  console.log('Security patches initialized successfully')
}

/**
 * Validate that no dangerous code patterns exist
 */
export function validateCodeSecurity(code: string): boolean {
  const dangerousPatterns = [
    /Function\s*\(/,
    /eval\s*\(/,
    /setTimeout\s*\(\s*["'`]/,
    /setInterval\s*\(\s*["'`]/,
    /new\s+Function/,
    /window\s*\[\s*["'`]/,
    /document\s*\[\s*["'`]/,
    /__proto__/,
    /constructor\s*\[/,
    /prototype\s*\[/
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      console.warn('Dangerous code pattern detected:', pattern)
      return false
    }
  }
  
  return true
}