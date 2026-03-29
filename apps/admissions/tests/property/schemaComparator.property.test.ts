/**
 * Property-Based Tests: Schema Comparator
 * Feature: frontend-backend-forensic-audit
 * Task: 2.7 Write property test for schema comparison
 * 
 * **Property 3: Schema Comparison Correctness**
 * 
 * *For any* pair of request or response schemas from frontend and backend,
 * the schema comparator SHALL correctly identify whether they match, and if not,
 * specify the exact differences.
 * 
 * **Validates: Requirements 1.3, 1.4**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  compareSchemas,
  type NormalizedSchema,
  type SchemaField,
} from '../../scripts/audit/contract/schemaComparator';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Number of runs for property tests.
 * Schema comparison is fast, so we can run more iterations.
 */
const NUM_RUNS = 10;

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Valid field types that can appear in schemas
 */
const fieldTypeArb = fc.constantFrom(
  'string',
  'number',
  'boolean',
  'Date',
  'any',
  'unknown',
  'null',
  'undefined',
  'object',
  'string[]',
  'number[]',
  'boolean[]'
);


/**
 * Realistic field name arbitrary
 */
const realisticFieldNameArb = fc.constantFrom(
  'id',
  'name',
  'email',
  'password',
  'createdAt',
  'updatedAt',
  'userId',
  'status',
  'type',
  'data',
  'items',
  'count',
  'total',
  'isActive',
  'isDeleted',
  'firstName',
  'lastName',
  'phoneNumber',
  'address',
  'description'
);

/**
 * Schema field arbitrary
 */
const schemaFieldArb: fc.Arbitrary<SchemaField> = fc.record({
  name: realisticFieldNameArb,
  type: fieldTypeArb,
  required: fc.boolean(),
  isArray: fc.boolean(),
});

/**
 * Generate a unique set of schema fields (no duplicate names)
 */
const uniqueSchemaFieldsArb = (minLength: number, maxLength: number): fc.Arbitrary<SchemaField[]> =>
  fc.array(schemaFieldArb, { minLength, maxLength })
    .map(fields => {
      const seen = new Set<string>();
      return fields.filter(f => {
        if (seen.has(f.name)) return false;
        seen.add(f.name);
        return true;
      });
    })
    .filter(fields => fields.length >= minLength);

/**
 * Valid schema name arbitrary
 */
const schemaNameArb = fc.constantFrom(
  'UserSchema',
  'LoginRequest',
  'LoginResponse',
  'ApplicationData',
  'ProfileInfo',
  'PaymentRequest',
  'DocumentUpload',
  'NotificationPrefs',
  'SessionData',
  'AdminSettings'
);

/**
 * Valid file path arbitrary
 */
const filePathArb = fc.constantFrom(
  'src/types/user.ts',
  'src/schemas/auth.ts',
  'api-src/auth.ts',
  'lib/types.ts',
  'src/services/api.ts'
);

/**
 * Source type arbitrary
 */
const sourceTypeArb = fc.constantFrom<'zod' | 'interface' | 'type'>('zod', 'interface', 'type');

/**
 * Normalized schema arbitrary
 */
const normalizedSchemaArb: fc.Arbitrary<NormalizedSchema> = fc.record({
  name: schemaNameArb,
  filePath: filePathArb,
  lineNumber: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
  fields: uniqueSchemaFieldsArb(1, 10),
  sourceType: sourceTypeArb,
});

/**
 * Generate a pair of identical schemas (for testing matches)
 */
const identicalSchemasPairArb: fc.Arbitrary<[NormalizedSchema, NormalizedSchema]> =
  normalizedSchemaArb.map(schema => {
    const schema1: NormalizedSchema = {
      ...schema,
      name: schema.name + '1',
      filePath: 'src/frontend/' + schema.filePath,
    };
    const schema2: NormalizedSchema = {
      ...schema,
      name: schema.name + '2',
      filePath: 'api-src/' + schema.filePath,
      fields: [...schema.fields], // Same fields
    };
    return [schema1, schema2];
  });


/**
 * Generate schemas with missing fields (schema2 missing some fields from schema1)
 */
const schemasWithMissingFieldsArb: fc.Arbitrary<{
  schema1: NormalizedSchema;
  schema2: NormalizedSchema;
  missingFieldNames: string[];
}> = uniqueSchemaFieldsArb(3, 10).chain(fields => {
  // Split fields: some go to both, some only to schema1
  const splitIndex = Math.max(1, Math.floor(fields.length / 2));
  const commonFields = fields.slice(0, splitIndex);
  const missingFields = fields.slice(splitIndex);
  
  return fc.tuple(schemaNameArb, filePathArb, sourceTypeArb).map(([name, filePath, sourceType]) => ({
    schema1: {
      name: name + 'Frontend',
      filePath: 'src/' + filePath,
      fields: [...fields],
      sourceType,
    },
    schema2: {
      name: name + 'Backend',
      filePath: 'api-src/' + filePath,
      fields: [...commonFields],
      sourceType,
    },
    missingFieldNames: missingFields.map(f => f.name),
  }));
});

/**
 * Generate schemas with extra fields (schema2 has extra fields not in schema1)
 */
const schemasWithExtraFieldsArb: fc.Arbitrary<{
  schema1: NormalizedSchema;
  schema2: NormalizedSchema;
  extraFieldNames: string[];
}> = fc.tuple(
  uniqueSchemaFieldsArb(2, 5),
  uniqueSchemaFieldsArb(1, 3),
  schemaNameArb,
  filePathArb,
  sourceTypeArb
).map(([commonFields, extraFields, name, filePath, sourceType]) => {
  // Ensure extra fields have unique names
  const commonNames = new Set(commonFields.map(f => f.name));
  let uniqueExtraFields = extraFields.filter(f => !commonNames.has(f.name));
  
  // If no unique extra fields, add a guaranteed unique one
  if (uniqueExtraFields.length === 0) {
    uniqueExtraFields = [{ name: 'extraUniqueField', type: 'string', required: true, isArray: false }];
  }
  
  return {
    schema1: {
      name: name + 'Frontend',
      filePath: 'src/' + filePath,
      fields: [...commonFields],
      sourceType,
    },
    schema2: {
      name: name + 'Backend',
      filePath: 'api-src/' + filePath,
      fields: [...commonFields, ...uniqueExtraFields],
      sourceType,
    },
    extraFieldNames: uniqueExtraFields.map(f => f.name),
  };
});


/**
 * Generate schemas with type mismatches
 */
const schemasWithTypeMismatchesArb: fc.Arbitrary<{
  schema1: NormalizedSchema;
  schema2: NormalizedSchema;
  mismatchedFields: Array<{ field: string; type1: string; type2: string }>;
}> = uniqueSchemaFieldsArb(2, 6).chain(fields => {
  // Pick some fields to have type mismatches
  const mismatchCount = Math.max(1, Math.floor(fields.length / 2));
  const fieldsToMismatch = fields.slice(0, mismatchCount);
  
  // Generate different types for mismatched fields
  return fc.array(fieldTypeArb, { minLength: mismatchCount, maxLength: mismatchCount })
    .filter(newTypes => {
      // Ensure at least one type is actually different
      return fieldsToMismatch.some((f, i) => f.type !== newTypes[i]);
    })
    .chain(newTypes => {
      const schema2Fields = fields.map((f, i) => {
        if (i < mismatchCount && f.type !== newTypes[i]) {
          return { ...f, type: newTypes[i] };
        }
        return { ...f };
      });
      
      const mismatches = fieldsToMismatch
        .map((f, i) => ({
          field: f.name,
          type1: f.type,
          type2: newTypes[i],
        }))
        .filter(m => m.type1 !== m.type2);
      
      return fc.tuple(schemaNameArb, filePathArb, sourceTypeArb).map(([name, filePath, sourceType]) => ({
        schema1: {
          name: name + 'Frontend',
          filePath: 'src/' + filePath,
          fields: [...fields],
          sourceType,
        },
        schema2: {
          name: name + 'Backend',
          filePath: 'api-src/' + filePath,
          fields: schema2Fields,
          sourceType,
        },
        mismatchedFields: mismatches,
      }));
    });
});

/**
 * Generate schemas with required/optional mismatches
 */
const schemasWithRequiredMismatchesArb: fc.Arbitrary<{
  schema1: NormalizedSchema;
  schema2: NormalizedSchema;
  mismatchedFields: Array<{ field: string; required1: boolean; required2: boolean }>;
}> = uniqueSchemaFieldsArb(2, 6).chain(fields => {
  // Pick some fields to have required mismatches
  const mismatchCount = Math.max(1, Math.floor(fields.length / 2));
  
  const schema2Fields = fields.map((f, i) => {
    if (i < mismatchCount) {
      return { ...f, required: !f.required }; // Flip required
    }
    return { ...f };
  });
  
  const mismatches = fields.slice(0, mismatchCount).map((f) => ({
    field: f.name,
    required1: f.required,
    required2: !f.required,
  }));
  
  return fc.tuple(schemaNameArb, filePathArb, sourceTypeArb).map(([name, filePath, sourceType]) => ({
    schema1: {
      name: name + 'Frontend',
      filePath: 'src/' + filePath,
      fields: [...fields],
      sourceType,
    },
    schema2: {
      name: name + 'Backend',
      filePath: 'api-src/' + filePath,
      fields: schema2Fields,
      sourceType,
    },
    mismatchedFields: mismatches,
  }));
});


// ============================================================================
// Property Tests
// ============================================================================

describe('Property 3: Schema Comparison Correctness', () => {
  /**
   * **Validates: Requirements 1.3, 1.4**
   */

  describe('Identical schemas always match', () => {
    it('PROPERTY: compareSchemas returns matches=true for identical schemas', () => {
      fc.assert(
        fc.property(
          identicalSchemasPairArb,
          ([schema1, schema2]) => {
            const result = compareSchemas(schema1, schema2);
            
            expect(result.matches).toBe(true);
            expect(result.missingFields).toEqual([]);
            expect(result.extraFields).toEqual([]);
            expect(result.typeMismatches).toEqual([]);
            expect(result.requiredMismatches).toEqual([]);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Schema compared with itself always matches', () => {
      fc.assert(
        fc.property(
          normalizedSchemaArb,
          (schema) => {
            const result = compareSchemas(schema, schema);
            
            expect(result.matches).toBe(true);
            expect(result.missingFields).toHaveLength(0);
            expect(result.extraFields).toHaveLength(0);
            expect(result.typeMismatches).toHaveLength(0);
            expect(result.requiredMismatches).toHaveLength(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Schemas with same fields in different order still match', () => {
      fc.assert(
        fc.property(
          normalizedSchemaArb,
          (schema) => {
            // Create schema2 with shuffled fields
            const shuffledFields = [...schema.fields].sort(() => Math.random() - 0.5);
            const schema2: NormalizedSchema = {
              ...schema,
              name: schema.name + 'Shuffled',
              fields: shuffledFields,
            };
            
            const result = compareSchemas(schema, schema2);
            
            expect(result.matches).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Missing fields are correctly detected', () => {
    it('PROPERTY: Missing fields are identified when schema2 lacks fields from schema1', () => {
      fc.assert(
        fc.property(
          schemasWithMissingFieldsArb,
          ({ schema1, schema2, missingFieldNames }) => {
            fc.pre(missingFieldNames.length > 0);
            
            const result = compareSchemas(schema1, schema2);
            
            expect(result.matches).toBe(false);
            expect(result.missingFields.length).toBeGreaterThan(0);
            
            // All missing field names should be in the result
            for (const fieldName of missingFieldNames) {
              expect(result.missingFields).toContain(fieldName);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Number of missing fields matches expected count', () => {
      fc.assert(
        fc.property(
          schemasWithMissingFieldsArb,
          ({ schema1, schema2, missingFieldNames }) => {
            fc.pre(missingFieldNames.length > 0);
            
            const result = compareSchemas(schema1, schema2);
            
            expect(result.missingFields.length).toBe(missingFieldNames.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Extra fields are correctly detected', () => {
    it('PROPERTY: Extra fields are identified when schema2 has fields not in schema1', () => {
      fc.assert(
        fc.property(
          schemasWithExtraFieldsArb,
          ({ schema1, schema2, extraFieldNames }) => {
            fc.pre(extraFieldNames.length > 0);
            
            const result = compareSchemas(schema1, schema2);
            
            expect(result.matches).toBe(false);
            expect(result.extraFields.length).toBeGreaterThan(0);
            
            // All extra field names should be in the result
            for (const fieldName of extraFieldNames) {
              expect(result.extraFields).toContain(fieldName);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Number of extra fields matches expected count', () => {
      fc.assert(
        fc.property(
          schemasWithExtraFieldsArb,
          ({ schema1, schema2, extraFieldNames }) => {
            fc.pre(extraFieldNames.length > 0);
            
            const result = compareSchemas(schema1, schema2);
            
            expect(result.extraFields.length).toBe(extraFieldNames.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Type mismatches are correctly identified', () => {
    it('PROPERTY: Type mismatches are detected when fields have different types', () => {
      fc.assert(
        fc.property(
          schemasWithTypeMismatchesArb,
          ({ schema1, schema2, mismatchedFields }) => {
            fc.pre(mismatchedFields.length > 0);
            
            const result = compareSchemas(schema1, schema2);
            
            expect(result.matches).toBe(false);
            expect(result.typeMismatches.length).toBeGreaterThan(0);
            
            // Each mismatched field should be reported
            for (const mismatch of mismatchedFields) {
              const found = result.typeMismatches.find(tm => tm.field === mismatch.field);
              expect(found).toBeDefined();
              expect(found?.expectedType).toBe(mismatch.type1);
              expect(found?.actualType).toBe(mismatch.type2);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Type mismatch includes expected and actual types', () => {
      fc.assert(
        fc.property(
          schemasWithTypeMismatchesArb,
          ({ schema1, schema2 }) => {
            const result = compareSchemas(schema1, schema2);
            
            for (const mismatch of result.typeMismatches) {
              expect(mismatch.field).toBeDefined();
              expect(typeof mismatch.field).toBe('string');
              expect(mismatch.expectedType).toBeDefined();
              expect(typeof mismatch.expectedType).toBe('string');
              expect(mismatch.actualType).toBeDefined();
              expect(typeof mismatch.actualType).toBe('string');
              // Expected and actual should be different
              expect(mismatch.expectedType).not.toBe(mismatch.actualType);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Required/optional mismatches are correctly detected', () => {
    it('PROPERTY: Required mismatches are detected when fields differ in required status', () => {
      fc.assert(
        fc.property(
          schemasWithRequiredMismatchesArb,
          ({ schema1, schema2, mismatchedFields }) => {
            fc.pre(mismatchedFields.length > 0);
            
            const result = compareSchemas(schema1, schema2);
            
            expect(result.matches).toBe(false);
            expect(result.requiredMismatches.length).toBeGreaterThan(0);
            
            // Each mismatched field should be reported
            for (const mismatch of mismatchedFields) {
              const found = result.requiredMismatches.find(rm => rm.field === mismatch.field);
              expect(found).toBeDefined();
              expect(found?.expectedRequired).toBe(mismatch.required1);
              expect(found?.actualRequired).toBe(mismatch.required2);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Required mismatch includes expected and actual required status', () => {
      fc.assert(
        fc.property(
          schemasWithRequiredMismatchesArb,
          ({ schema1, schema2 }) => {
            const result = compareSchemas(schema1, schema2);
            
            for (const mismatch of result.requiredMismatches) {
              expect(mismatch.field).toBeDefined();
              expect(typeof mismatch.field).toBe('string');
              expect(typeof mismatch.expectedRequired).toBe('boolean');
              expect(typeof mismatch.actualRequired).toBe('boolean');
              // Expected and actual should be different
              expect(mismatch.expectedRequired).not.toBe(mismatch.actualRequired);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Result structure is always valid', () => {
    it('PROPERTY: compareSchemas always returns a valid SchemaComparisonResult', () => {
      fc.assert(
        fc.property(
          normalizedSchemaArb,
          normalizedSchemaArb,
          (schema1, schema2) => {
            const result = compareSchemas(schema1, schema2);
            
            // Result should have all required fields
            expect(typeof result.matches).toBe('boolean');
            expect(Array.isArray(result.missingFields)).toBe(true);
            expect(Array.isArray(result.extraFields)).toBe(true);
            expect(Array.isArray(result.typeMismatches)).toBe(true);
            expect(Array.isArray(result.requiredMismatches)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: matches=true implies all difference arrays are empty', () => {
      fc.assert(
        fc.property(
          normalizedSchemaArb,
          normalizedSchemaArb,
          (schema1, schema2) => {
            const result = compareSchemas(schema1, schema2);
            
            if (result.matches) {
              expect(result.missingFields).toHaveLength(0);
              expect(result.extraFields).toHaveLength(0);
              expect(result.typeMismatches).toHaveLength(0);
              expect(result.requiredMismatches).toHaveLength(0);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: matches=false implies at least one difference array is non-empty', () => {
      fc.assert(
        fc.property(
          normalizedSchemaArb,
          normalizedSchemaArb,
          (schema1, schema2) => {
            const result = compareSchemas(schema1, schema2);
            
            if (!result.matches) {
              const hasDifferences = 
                result.missingFields.length > 0 ||
                result.extraFields.length > 0 ||
                result.typeMismatches.length > 0 ||
                result.requiredMismatches.length > 0;
              
              expect(hasDifferences).toBe(true);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Symmetry and consistency properties', () => {
    it('PROPERTY: Missing fields in forward comparison are extra fields in reverse', () => {
      fc.assert(
        fc.property(
          schemasWithMissingFieldsArb,
          ({ schema1, schema2, missingFieldNames }) => {
            fc.pre(missingFieldNames.length > 0);
            
            const forwardResult = compareSchemas(schema1, schema2);
            const reverseResult = compareSchemas(schema2, schema1);
            
            // Missing fields in forward should be extra fields in reverse
            expect(forwardResult.missingFields.sort()).toEqual(reverseResult.extraFields.sort());
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Extra fields in forward comparison are missing fields in reverse', () => {
      fc.assert(
        fc.property(
          schemasWithExtraFieldsArb,
          ({ schema1, schema2, extraFieldNames }) => {
            fc.pre(extraFieldNames.length > 0);
            
            const forwardResult = compareSchemas(schema1, schema2);
            const reverseResult = compareSchemas(schema2, schema1);
            
            // Extra fields in forward should be missing fields in reverse
            expect(forwardResult.extraFields.sort()).toEqual(reverseResult.missingFields.sort());
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Type mismatches are symmetric (same fields, swapped types)', () => {
      fc.assert(
        fc.property(
          schemasWithTypeMismatchesArb,
          ({ schema1, schema2 }) => {
            const forwardResult = compareSchemas(schema1, schema2);
            const reverseResult = compareSchemas(schema2, schema1);
            
            // Same number of type mismatches
            expect(forwardResult.typeMismatches.length).toBe(reverseResult.typeMismatches.length);
            
            // Each mismatch should have swapped expected/actual
            for (const fwdMismatch of forwardResult.typeMismatches) {
              const revMismatch = reverseResult.typeMismatches.find(m => m.field === fwdMismatch.field);
              expect(revMismatch).toBeDefined();
              expect(revMismatch?.expectedType).toBe(fwdMismatch.actualType);
              expect(revMismatch?.actualType).toBe(fwdMismatch.expectedType);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Required mismatches are symmetric (same fields, swapped required)', () => {
      fc.assert(
        fc.property(
          schemasWithRequiredMismatchesArb,
          ({ schema1, schema2 }) => {
            const forwardResult = compareSchemas(schema1, schema2);
            const reverseResult = compareSchemas(schema2, schema1);
            
            // Same number of required mismatches
            expect(forwardResult.requiredMismatches.length).toBe(reverseResult.requiredMismatches.length);
            
            // Each mismatch should have swapped expected/actual
            for (const fwdMismatch of forwardResult.requiredMismatches) {
              const revMismatch = reverseResult.requiredMismatches.find(m => m.field === fwdMismatch.field);
              expect(revMismatch).toBeDefined();
              expect(revMismatch?.expectedRequired).toBe(fwdMismatch.actualRequired);
              expect(revMismatch?.actualRequired).toBe(fwdMismatch.expectedRequired);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });


  describe('Edge cases', () => {
    it('PROPERTY: Empty schemas match each other', () => {
      fc.assert(
        fc.property(
          fc.tuple(schemaNameArb, filePathArb, sourceTypeArb),
          fc.tuple(schemaNameArb, filePathArb, sourceTypeArb),
          ([name1, path1, type1], [name2, path2, type2]) => {
            const schema1: NormalizedSchema = {
              name: name1,
              filePath: path1,
              fields: [],
              sourceType: type1,
            };
            const schema2: NormalizedSchema = {
              name: name2,
              filePath: path2,
              fields: [],
              sourceType: type2,
            };
            
            const result = compareSchemas(schema1, schema2);
            
            expect(result.matches).toBe(true);
            expect(result.missingFields).toHaveLength(0);
            expect(result.extraFields).toHaveLength(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Schema with fields vs empty schema detects all as missing', () => {
      fc.assert(
        fc.property(
          normalizedSchemaArb,
          (schema) => {
            fc.pre(schema.fields.length > 0);
            
            const emptySchema: NormalizedSchema = {
              name: 'EmptySchema',
              filePath: 'empty.ts',
              fields: [],
              sourceType: 'interface',
            };
            
            const result = compareSchemas(schema, emptySchema);
            
            expect(result.matches).toBe(false);
            expect(result.missingFields.length).toBe(schema.fields.length);
            expect(result.extraFields).toHaveLength(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Empty schema vs schema with fields detects all as extra', () => {
      fc.assert(
        fc.property(
          normalizedSchemaArb,
          (schema) => {
            fc.pre(schema.fields.length > 0);
            
            const emptySchema: NormalizedSchema = {
              name: 'EmptySchema',
              filePath: 'empty.ts',
              fields: [],
              sourceType: 'interface',
            };
            
            const result = compareSchemas(emptySchema, schema);
            
            expect(result.matches).toBe(false);
            expect(result.missingFields).toHaveLength(0);
            expect(result.extraFields.length).toBe(schema.fields.length);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Single field schema comparison works correctly', () => {
      fc.assert(
        fc.property(
          schemaFieldArb,
          schemaFieldArb,
          (field1, field2) => {
            const schema1: NormalizedSchema = {
              name: 'Schema1',
              filePath: 'test1.ts',
              fields: [field1],
              sourceType: 'interface',
            };
            const schema2: NormalizedSchema = {
              name: 'Schema2',
              filePath: 'test2.ts',
              fields: [field2],
              sourceType: 'interface',
            };
            
            const result = compareSchemas(schema1, schema2);
            
            // If same name, check type and required
            if (field1.name === field2.name) {
              if (field1.type === field2.type && field1.required === field2.required) {
                expect(result.matches).toBe(true);
              } else {
                expect(result.matches).toBe(false);
              }
            } else {
              // Different names means missing and extra
              expect(result.matches).toBe(false);
              expect(result.missingFields).toContain(field1.name);
              expect(result.extraFields).toContain(field2.name);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Schema metadata (name, filePath, sourceType) does not affect comparison', () => {
      fc.assert(
        fc.property(
          uniqueSchemaFieldsArb(1, 5),
          schemaNameArb,
          schemaNameArb,
          filePathArb,
          filePathArb,
          sourceTypeArb,
          sourceTypeArb,
          (fields, name1, name2, path1, path2, type1, type2) => {
            const schema1: NormalizedSchema = {
              name: name1,
              filePath: path1,
              fields: [...fields],
              sourceType: type1,
            };
            const schema2: NormalizedSchema = {
              name: name2,
              filePath: path2,
              fields: [...fields],
              sourceType: type2,
            };
            
            const result = compareSchemas(schema1, schema2);
            
            // Same fields should match regardless of metadata
            expect(result.matches).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
