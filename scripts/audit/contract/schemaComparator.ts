/**
 * Schema Comparator
 * 
 * Compares request/response schemas between frontend and backend.
 * Uses regex-based parsing to extract Zod schemas and TypeScript interfaces.
 * 
 * Validates: Requirements 1.3, 1.4
 * 
 * @module scripts/audit/contract/schemaComparator
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { ContractMismatch } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a field in a normalized schema
 */
export interface SchemaField {
  /** Field name */
  name: string;
  /** Field type (normalized) */
  type: string;
  /** Whether the field is required */
  required: boolean;
  /** Whether the field is an array */
  isArray: boolean;
  /** Nested schema for object types */
  nestedSchema?: NormalizedSchema;
}

/**
 * Normalized schema representation that can be compared
 */
export interface NormalizedSchema {
  /** Name of the schema/interface */
  name: string;
  /** Source file path */
  filePath: string;
  /** Line number where defined */
  lineNumber?: number;
  /** Fields in the schema */
  fields: SchemaField[];
  /** Source type: 'zod' | 'interface' | 'type' */
  sourceType: 'zod' | 'interface' | 'type';
}

/**
 * Result of comparing two schemas
 */
export interface SchemaComparisonResult {
  /** Whether schemas match */
  matches: boolean;
  /** Fields missing in the second schema */
  missingFields: string[];
  /** Extra fields in the second schema */
  extraFields: string[];
  /** Fields with type mismatches */
  typeMismatches: Array<{
    field: string;
    expectedType: string;
    actualType: string;
  }>;
  /** Fields with required/optional mismatches */
  requiredMismatches: Array<{
    field: string;
    expectedRequired: boolean;
    actualRequired: boolean;
  }>;
}

/**
 * Schema mismatch item for contract audit
 */
export interface SchemaMismatchItem {
  /** Frontend schema info */
  frontendSchema?: NormalizedSchema;
  /** Backend schema info */
  backendSchema?: NormalizedSchema;
  /** Comparison result */
  comparison: SchemaComparisonResult;
  /** Evidence string */
  evidence: string;
}

// =============================================================================
// Regex Patterns
// =============================================================================

const PATTERNS = {
  // Zod object schema: export const SchemaName = z.object({ ... })
  zodSchema: /export\s+const\s+(\w+)\s*=\s*z\.object\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}\s*\)/gs,
  
  // Zod field: fieldName: z.string(), z.number(), z.boolean(), z.array(...), z.object(...)
  zodField: /(\w+)\s*:\s*z\.(\w+)\s*\(([^)]*)\)(\s*\.optional\s*\(\s*\))?/g,
  
  // TypeScript interface: export interface Name { ... }
  tsInterface: /export\s+interface\s+(\w+)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs,
  
  // TypeScript type: export type Name = { ... }
  tsType: /export\s+type\s+(\w+)\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs,
  
  // Interface/type field: fieldName: Type; or fieldName?: Type;
  tsField: /(\w+)(\?)?:\s*([^;,\n]+)/g,
  
  // Array type detection
  arrayType: /^Array<(.+)>$|^(.+)\[\]$/,
};

// =============================================================================
// Type Normalization
// =============================================================================

/**
 * Normalizes a Zod type to a common type string
 */
function normalizeZodType(zodType: string, args: string): string {
  const type = zodType.toLowerCase();
  
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'Date';
    case 'array':
      // Try to extract inner type from args
      const innerMatch = args.match(/z\.(\w+)/);
      if (innerMatch) {
        return `${normalizeZodType(innerMatch[1], '')}[]`;
      }
      return 'any[]';
    case 'object':
      return 'object';
    case 'enum':
      return 'enum';
    case 'union':
      return 'union';
    case 'literal':
      return 'literal';
    case 'any':
      return 'any';
    case 'unknown':
      return 'unknown';
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'void':
      return 'void';
    case 'never':
      return 'never';
    default:
      return type;
  }
}

/**
 * Normalizes a TypeScript type to a common type string
 */
function normalizeTypeScriptType(tsType: string): string {
  const trimmed = tsType.trim();
  
  // Handle array types
  const arrayMatch = trimmed.match(PATTERNS.arrayType);
  if (arrayMatch) {
    const innerType = arrayMatch[1] || arrayMatch[2];
    return `${normalizeTypeScriptType(innerType)}[]`;
  }
  
  // Handle common types
  const lower = trimmed.toLowerCase();
  switch (lower) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'Date';
    case 'any':
      return 'any';
    case 'unknown':
      return 'unknown';
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'void':
      return 'void';
    case 'never':
      return 'never';
    case 'object':
      return 'object';
    default:
      // Return as-is for custom types
      return trimmed;
  }
}

// =============================================================================
// Schema Extraction
// =============================================================================

/**
 * Extracts Zod schemas from file content
 */
function extractZodSchemas(content: string, filePath: string): NormalizedSchema[] {
  const schemas: NormalizedSchema[] = [];
  
  // Reset regex lastIndex
  PATTERNS.zodSchema.lastIndex = 0;
  
  let match: RegExpExecArray | null;
  while ((match = PATTERNS.zodSchema.exec(content)) !== null) {
    const schemaName = match[1];
    const fieldsStr = match[2];
    
    // Calculate line number
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    // Extract fields
    const fields: SchemaField[] = [];
    PATTERNS.zodField.lastIndex = 0;
    
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = PATTERNS.zodField.exec(fieldsStr)) !== null) {
      const fieldName = fieldMatch[1];
      const zodType = fieldMatch[2];
      const args = fieldMatch[3] || '';
      const isOptional = !!fieldMatch[4];
      
      const normalizedType = normalizeZodType(zodType, args);
      const isArray = normalizedType.endsWith('[]');
      
      fields.push({
        name: fieldName,
        type: normalizedType,
        required: !isOptional,
        isArray,
      });
    }
    
    schemas.push({
      name: schemaName,
      filePath,
      lineNumber,
      fields,
      sourceType: 'zod',
    });
  }
  
  return schemas;
}

/**
 * Extracts TypeScript interfaces from file content
 */
function extractTypeScriptInterfaces(content: string, filePath: string): NormalizedSchema[] {
  const schemas: NormalizedSchema[] = [];
  
  // Reset regex lastIndex
  PATTERNS.tsInterface.lastIndex = 0;
  
  let match: RegExpExecArray | null;
  while ((match = PATTERNS.tsInterface.exec(content)) !== null) {
    const interfaceName = match[1];
    const fieldsStr = match[2];
    
    // Calculate line number
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    // Extract fields
    const fields: SchemaField[] = [];
    PATTERNS.tsField.lastIndex = 0;
    
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = PATTERNS.tsField.exec(fieldsStr)) !== null) {
      const fieldName = fieldMatch[1];
      const isOptional = !!fieldMatch[2];
      const fieldType = fieldMatch[3].trim();
      
      // Skip if it looks like a method signature
      if (fieldType.includes('=>') || fieldType.includes('(')) {
        continue;
      }
      
      const normalizedType = normalizeTypeScriptType(fieldType);
      const isArray = normalizedType.endsWith('[]');
      
      fields.push({
        name: fieldName,
        type: normalizedType,
        required: !isOptional,
        isArray,
      });
    }
    
    schemas.push({
      name: interfaceName,
      filePath,
      lineNumber,
      fields,
      sourceType: 'interface',
    });
  }
  
  return schemas;
}

/**
 * Extracts TypeScript type aliases from file content
 */
function extractTypeScriptTypes(content: string, filePath: string): NormalizedSchema[] {
  const schemas: NormalizedSchema[] = [];
  
  // Reset regex lastIndex
  PATTERNS.tsType.lastIndex = 0;
  
  let match: RegExpExecArray | null;
  while ((match = PATTERNS.tsType.exec(content)) !== null) {
    const typeName = match[1];
    const fieldsStr = match[2];
    
    // Calculate line number
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    // Extract fields
    const fields: SchemaField[] = [];
    PATTERNS.tsField.lastIndex = 0;
    
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = PATTERNS.tsField.exec(fieldsStr)) !== null) {
      const fieldName = fieldMatch[1];
      const isOptional = !!fieldMatch[2];
      const fieldType = fieldMatch[3].trim();
      
      // Skip if it looks like a method signature
      if (fieldType.includes('=>') || fieldType.includes('(')) {
        continue;
      }
      
      const normalizedType = normalizeTypeScriptType(fieldType);
      const isArray = normalizedType.endsWith('[]');
      
      fields.push({
        name: fieldName,
        type: normalizedType,
        required: !isOptional,
        isArray,
      });
    }
    
    schemas.push({
      name: typeName,
      filePath,
      lineNumber,
      fields,
      sourceType: 'type',
    });
  }
  
  return schemas;
}

/**
 * Extracts all schemas (Zod and TypeScript) from a file
 * 
 * @param filePath - Path to the file to parse
 * @returns Array of normalized schemas found in the file
 */
export async function extractSchemaFromFile(filePath: string): Promise<NormalizedSchema[]> {
  if (!existsSync(filePath)) {
    return [];
  }
  
  try {
    const content = await readFile(filePath, 'utf-8');
    const schemas: NormalizedSchema[] = [];
    
    // Extract Zod schemas
    schemas.push(...extractZodSchemas(content, filePath));
    
    // Extract TypeScript interfaces
    schemas.push(...extractTypeScriptInterfaces(content, filePath));
    
    // Extract TypeScript type aliases
    schemas.push(...extractTypeScriptTypes(content, filePath));
    
    return schemas;
  } catch (error) {
    console.warn(`Warning: Could not parse file ${filePath}:`, error);
    return [];
  }
}

// =============================================================================
// Schema Comparison
// =============================================================================

/**
 * Compares two schemas and returns the differences
 * 
 * @param schema1 - First schema (expected/frontend)
 * @param schema2 - Second schema (actual/backend)
 * @returns Comparison result with differences
 */
export function compareSchemas(
  schema1: NormalizedSchema,
  schema2: NormalizedSchema
): SchemaComparisonResult {
  const result: SchemaComparisonResult = {
    matches: true,
    missingFields: [],
    extraFields: [],
    typeMismatches: [],
    requiredMismatches: [],
  };
  
  // Create maps for efficient lookup
  const schema1Fields = new Map(schema1.fields.map(f => [f.name, f]));
  const schema2Fields = new Map(schema2.fields.map(f => [f.name, f]));
  
  // Check for missing fields (in schema1 but not in schema2)
  for (const [fieldName, field1] of schema1Fields) {
    const field2 = schema2Fields.get(fieldName);
    
    if (!field2) {
      result.missingFields.push(fieldName);
      result.matches = false;
      continue;
    }
    
    // Check type mismatch
    if (field1.type !== field2.type) {
      result.typeMismatches.push({
        field: fieldName,
        expectedType: field1.type,
        actualType: field2.type,
      });
      result.matches = false;
    }
    
    // Check required/optional mismatch
    if (field1.required !== field2.required) {
      result.requiredMismatches.push({
        field: fieldName,
        expectedRequired: field1.required,
        actualRequired: field2.required,
      });
      result.matches = false;
    }
  }
  
  // Check for extra fields (in schema2 but not in schema1)
  for (const fieldName of schema2Fields.keys()) {
    if (!schema1Fields.has(fieldName)) {
      result.extraFields.push(fieldName);
      result.matches = false;
    }
  }
  
  return result;
}

/**
 * Generates evidence string for a schema comparison result
 */
function generateSchemaComparisonEvidence(
  frontendSchema: NormalizedSchema | undefined,
  backendSchema: NormalizedSchema | undefined,
  comparison: SchemaComparisonResult
): string {
  const parts: string[] = [];
  
  if (frontendSchema && backendSchema) {
    parts.push(`Schema mismatch between ${frontendSchema.name} (${frontendSchema.filePath}) and ${backendSchema.name} (${backendSchema.filePath})`);
  } else if (frontendSchema) {
    parts.push(`Frontend schema ${frontendSchema.name} (${frontendSchema.filePath}) has no matching backend schema`);
  } else if (backendSchema) {
    parts.push(`Backend schema ${backendSchema.name} (${backendSchema.filePath}) has no matching frontend schema`);
  }
  
  if (comparison.missingFields.length > 0) {
    parts.push(`Missing fields: ${comparison.missingFields.join(', ')}`);
  }
  
  if (comparison.extraFields.length > 0) {
    parts.push(`Extra fields: ${comparison.extraFields.join(', ')}`);
  }
  
  if (comparison.typeMismatches.length > 0) {
    const typeDetails = comparison.typeMismatches
      .map(m => `${m.field} (expected: ${m.expectedType}, actual: ${m.actualType})`)
      .join('; ');
    parts.push(`Type mismatches: ${typeDetails}`);
  }
  
  if (comparison.requiredMismatches.length > 0) {
    const reqDetails = comparison.requiredMismatches
      .map(m => `${m.field} (expected: ${m.expectedRequired ? 'required' : 'optional'}, actual: ${m.actualRequired ? 'required' : 'optional'})`)
      .join('; ');
    parts.push(`Required/optional mismatches: ${reqDetails}`);
  }
  
  return parts.join('. ');
}

/**
 * Finds schema mismatches between frontend and backend files
 * 
 * @param frontendFilePath - Path to frontend file
 * @param backendFilePath - Path to backend file
 * @returns Array of schema mismatch items
 */
export async function findSchemaMismatches(
  frontendFilePath: string,
  backendFilePath: string
): Promise<SchemaMismatchItem[]> {
  const mismatches: SchemaMismatchItem[] = [];
  
  // Extract schemas from both files
  const frontendSchemas = await extractSchemaFromFile(frontendFilePath);
  const backendSchemas = await extractSchemaFromFile(backendFilePath);
  
  // Create a map of backend schemas by name for lookup
  const backendSchemaMap = new Map(backendSchemas.map(s => [s.name, s]));
  
  // Compare each frontend schema with its backend counterpart
  for (const frontendSchema of frontendSchemas) {
    // Try to find a matching backend schema by name
    // Common naming patterns: FooRequest, FooResponse, FooData, FooSchema
    const possibleNames = [
      frontendSchema.name,
      frontendSchema.name.replace(/Schema$/, ''),
      frontendSchema.name.replace(/Data$/, ''),
      frontendSchema.name + 'Schema',
    ];
    
    let backendSchema: NormalizedSchema | undefined;
    for (const name of possibleNames) {
      backendSchema = backendSchemaMap.get(name);
      if (backendSchema) break;
    }
    
    if (backendSchema) {
      const comparison = compareSchemas(frontendSchema, backendSchema);
      
      if (!comparison.matches) {
        mismatches.push({
          frontendSchema,
          backendSchema,
          comparison,
          evidence: generateSchemaComparisonEvidence(frontendSchema, backendSchema, comparison),
        });
      }
    }
  }
  
  return mismatches;
}

/**
 * Converts schema mismatches to ContractMismatch format for integration with contract auditor
 */
export function toContractMismatches(schemaMismatches: SchemaMismatchItem[]): ContractMismatch[] {
  return schemaMismatches.map(mismatch => ({
    type: 'SCHEMA_MISMATCH' as const,
    evidence: mismatch.evidence,
  }));
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Gets a summary of schemas found in a file
 */
export function getSchemaSummary(schemas: NormalizedSchema[]): {
  totalSchemas: number;
  byType: Record<string, number>;
  schemaNames: string[];
} {
  const byType: Record<string, number> = {
    zod: 0,
    interface: 0,
    type: 0,
  };
  
  for (const schema of schemas) {
    byType[schema.sourceType]++;
  }
  
  return {
    totalSchemas: schemas.length,
    byType,
    schemaNames: schemas.map(s => s.name),
  };
}

/**
 * Formats a schema for display
 */
export function formatSchema(schema: NormalizedSchema): string {
  const lines: string[] = [];
  
  lines.push(`${schema.sourceType} ${schema.name} (${schema.filePath}:${schema.lineNumber || '?'})`);
  lines.push('Fields:');
  
  for (const field of schema.fields) {
    const requiredMarker = field.required ? '' : '?';
    lines.push(`  ${field.name}${requiredMarker}: ${field.type}`);
  }
  
  return lines.join('\n');
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: bun run scripts/audit/contract/schemaComparator.ts <file1> [file2]');
    console.log('');
    console.log('If one file is provided, extracts and displays schemas from that file.');
    console.log('If two files are provided, compares schemas between them.');
    process.exit(0);
  }
  
  const file1 = args[0];
  const file2 = args[1];
  
  if (file2) {
    // Compare schemas between two files
    console.log(`🔍 Comparing schemas between ${file1} and ${file2}...\n`);
    
    const mismatches = await findSchemaMismatches(file1, file2);
    
    if (mismatches.length === 0) {
      console.log('✅ No schema mismatches found!');
    } else {
      console.log(`❌ Found ${mismatches.length} schema mismatch(es):\n`);
      
      for (const mismatch of mismatches) {
        console.log(`📋 ${mismatch.evidence}\n`);
        
        if (mismatch.frontendSchema) {
          console.log('Frontend schema:');
          console.log(formatSchema(mismatch.frontendSchema));
          console.log('');
        }
        
        if (mismatch.backendSchema) {
          console.log('Backend schema:');
          console.log(formatSchema(mismatch.backendSchema));
          console.log('');
        }
      }
    }
  } else {
    // Extract and display schemas from a single file
    console.log(`🔍 Extracting schemas from ${file1}...\n`);
    
    const schemas = await extractSchemaFromFile(file1);
    const summary = getSchemaSummary(schemas);
    
    console.log('📊 Summary:');
    console.log(`   Total schemas: ${summary.totalSchemas}`);
    console.log(`   Zod schemas: ${summary.byType.zod}`);
    console.log(`   Interfaces: ${summary.byType.interface}`);
    console.log(`   Type aliases: ${summary.byType.type}`);
    
    if (schemas.length > 0) {
      console.log('\n📋 Schemas found:\n');
      
      for (const schema of schemas) {
        console.log(formatSchema(schema));
        console.log('');
      }
    }
  }
}
