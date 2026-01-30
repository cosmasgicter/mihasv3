/**
 * Property Test: Settings CRUD Round-Trip
 * Feature: admin-system-health-fixes
 * Property 2: Settings CRUD Round-Trip
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 * - 2.1: WHEN a GET request is sent to /api/admin?action=settings, THE API_Endpoint SHALL return JSON data containing system settings
 * - 2.2: WHEN a POST request is sent to /api/admin?action=settings with valid setting data, THE API_Endpoint SHALL create a new setting
 * - 2.3: WHEN a PUT request is sent to /api/admin?action=settings with valid update data, THE API_Endpoint SHALL update the existing setting
 * - 2.4: WHEN a DELETE request is sent to /api/admin?action=settings with a setting ID, THE API_Endpoint SHALL delete the setting
 * 
 * For any valid system setting with a unique key, creating the setting via POST, reading it via GET, 
 * updating it via PUT, and deleting it via DELETE SHALL each succeed and maintain data consistency throughout the lifecycle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * System setting interface matching database schema
 */
interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  setting_type: string;
  description: string | null;
  is_public: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * In-memory store for mocking database operations
 */
let mockSettingsStore: Map<string, SystemSetting>;
let settingIdCounter: number;

/**
 * Generate a valid setting key (alphanumeric with underscores, no leading/trailing spaces)
 */
const settingKeyArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,50}$/).filter(key => 
  key.length >= 3 && key.length <= 50 && !key.includes('__')
);

/**
 * Generate a valid setting value (non-empty string)
 */
const settingValueArb = fc.string({ minLength: 1, maxLength: 500 }).filter(v => v.trim().length > 0);

/**
 * Generate a valid setting type
 */
const settingTypeArb = fc.constantFrom('string', 'number', 'boolean', 'json');

/**
 * Generate a valid setting object for creation
 */
const newSettingArb = fc.record({
  setting_key: settingKeyArb,
  setting_value: settingValueArb,
  setting_type: settingTypeArb,
  description: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null }),
  is_public: fc.boolean(),
});

/**
 * Create a mock VercelRequest object
 */
function createMockRequest(
  method: string,
  query: Record<string, string> = {},
  body: unknown = {},
  headers: Record<string, string> = {}
): VercelRequest {
  return {
    method,
    headers: {
      origin: '***REMOVED***',
      authorization: 'Bearer valid-admin-token',
      ...headers,
    },
    query: { action: 'settings', ...query },
    body,
  } as unknown as VercelRequest;
}

/**
 * Create a mock VercelResponse object with tracking
 */
function createMockResponse(): VercelResponse & {
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
  _ended: boolean;
} {
  const res = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, string>,
    _ended: false,
    
    status(code: number) {
      this._status = code;
      return this;
    },
    
    json(data: unknown) {
      this._json = data;
      return this;
    },
    
    setHeader(key: string, value: string) {
      this._headers[key] = value;
      return this;
    },
    
    end() {
      this._ended = true;
      return this;
    },
  };
  
  return res as unknown as VercelResponse & {
    _status: number;
    _json: unknown;
    _headers: Record<string, string>;
    _ended: boolean;
  };
}

/**
 * Generate a UUID for mock data
 */
function generateUUID(): string {
  return `${settingIdCounter++}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

describe('Feature: admin-system-health-fixes, Property 2: Settings CRUD Round-Trip', () => {
  
  beforeEach(() => {
    // Reset mock store before each test
    mockSettingsStore = new Map();
    settingIdCounter = 1;
    
    // Mock Supabase client
    vi.mock('../../../api/_lib/supabaseClient', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table !== 'system_settings') {
            return {
              select: () => ({ data: [], error: null }),
              insert: () => ({ data: null, error: { message: 'Unknown table' } }),
              update: () => ({ data: null, error: { message: 'Unknown table' } }),
              delete: () => ({ error: { message: 'Unknown table' } }),
            };
          }
          
          return {
            select: (columns?: string) => ({
              order: (column: string, options?: { ascending: boolean }) => ({
                data: Array.from(mockSettingsStore.values()),
                error: null,
              }),
              single: () => {
                const values = Array.from(mockSettingsStore.values());
                return {
                  data: values.length > 0 ? values[0] : null,
                  error: values.length === 0 ? { code: 'PGRST116', message: 'Not found' } : null,
                };
              },
              eq: (column: string, value: string) => ({
                single: () => {
                  let found: SystemSetting | undefined;
                  if (column === 'id') {
                    found = mockSettingsStore.get(value);
                  } else if (column === 'setting_key') {
                    found = Array.from(mockSettingsStore.values()).find(s => s.setting_key === value);
                  }
                  return {
                    data: found || null,
                    error: found ? null : { code: 'PGRST116', message: 'Not found' },
                  };
                },
              }),
            }),
            insert: (data: Partial<SystemSetting>) => ({
              select: () => ({
                single: () => {
                  // Check for duplicate key
                  const existing = Array.from(mockSettingsStore.values()).find(
                    s => s.setting_key === data.setting_key
                  );
                  if (existing) {
                    return {
                      data: null,
                      error: { code: '23505', message: 'Duplicate key' },
                    };
                  }
                  
                  const newSetting: SystemSetting = {
                    id: generateUUID(),
                    setting_key: data.setting_key!,
                    setting_value: data.setting_value!,
                    setting_type: data.setting_type || 'string',
                    description: data.description || null,
                    is_public: data.is_public ?? false,
                    updated_by: data.updated_by || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  mockSettingsStore.set(newSetting.id, newSetting);
                  return { data: newSetting, error: null };
                },
              }),
            }),
            update: (data: Partial<SystemSetting>) => ({
              eq: (column: string, value: string) => ({
                select: () => ({
                  single: () => {
                    let found: SystemSetting | undefined;
                    if (column === 'id') {
                      found = mockSettingsStore.get(value);
                    } else if (column === 'setting_key') {
                      found = Array.from(mockSettingsStore.values()).find(s => s.setting_key === value);
                    }
                    
                    if (!found) {
                      return {
                        data: null,
                        error: { code: 'PGRST116', message: 'Not found' },
                      };
                    }
                    
                    const updated: SystemSetting = {
                      ...found,
                      ...data,
                      updated_at: new Date().toISOString(),
                    };
                    mockSettingsStore.set(found.id, updated);
                    return { data: updated, error: null };
                  },
                }),
              }),
            }),
            delete: () => ({
              eq: (column: string, value: string) => {
                let found: SystemSetting | undefined;
                if (column === 'id') {
                  found = mockSettingsStore.get(value);
                  if (found) mockSettingsStore.delete(value);
                } else if (column === 'setting_key') {
                  found = Array.from(mockSettingsStore.values()).find(s => s.setting_key === value);
                  if (found) mockSettingsStore.delete(found.id);
                }
                return { error: null, count: found ? 1 : 0 };
              },
            }),
          };
        },
      },
      getUserFromRequest: () => Promise.resolve({
        user: { id: 'admin-user-id', email: 'admin@test.com', role: 'admin' },
        roles: ['admin'],
        isAdmin: true,
      }),
      AuthContext: {},
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Property: POST creates settings with valid data (Requirement 2.2)', () => {
    
    it('should create a setting with any valid setting data', async () => {
      await fc.assert(
        fc.asyncProperty(
          newSettingArb,
          async (settingData) => {
            // Clear store for each iteration to ensure unique keys
            mockSettingsStore.clear();
            
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            const req = createMockRequest('POST', {}, settingData);
            const res = createMockResponse();
            
            await handler(req, res);
            
            // Should return 201 Created
            expect(res._status).toBe(201);
            
            // Response should have success: true
            const response = res._json as { success: boolean; data: { setting: SystemSetting } };
            expect(response.success).toBe(true);
            
            // Created setting should have the same key and value
            expect(response.data.setting.setting_key).toBe(settingData.setting_key);
            expect(response.data.setting.setting_value).toBe(settingData.setting_value);
            expect(response.data.setting.setting_type).toBe(settingData.setting_type);
            
            // Setting should have an ID
            expect(response.data.setting.id).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject duplicate setting keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          newSettingArb,
          async (settingData) => {
            mockSettingsStore.clear();
            
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            // Create first setting
            const req1 = createMockRequest('POST', {}, settingData);
            const res1 = createMockResponse();
            await handler(req1, res1);
            
            expect(res1._status).toBe(201);
            
            // Try to create duplicate
            const req2 = createMockRequest('POST', {}, settingData);
            const res2 = createMockResponse();
            await handler(req2, res2);
            
            // Should return 409 Conflict
            expect(res2._status).toBe(409);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: GET returns all settings (Requirement 2.1)', () => {
    
    it('should return all created settings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(newSettingArb, { minLength: 1, maxLength: 5 }).map(settings => {
            // Ensure unique keys
            const uniqueSettings = settings.reduce((acc, s, i) => {
              acc.push({ ...s, setting_key: `${s.setting_key}_${i}` });
              return acc;
            }, [] as typeof settings);
            return uniqueSettings;
          }),
          async (settingsToCreate) => {
            mockSettingsStore.clear();
            
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            // Create all settings
            for (const settingData of settingsToCreate) {
              const req = createMockRequest('POST', {}, settingData);
              const res = createMockResponse();
              await handler(req, res);
              expect(res._status).toBe(201);
            }
            
            // GET all settings
            const getReq = createMockRequest('GET');
            const getRes = createMockResponse();
            await handler(getReq, getRes);
            
            // Should return 200
            expect(getRes._status).toBe(200);
            
            // Response should contain all created settings
            const response = getRes._json as { success: boolean; data: { settings: SystemSetting[] } };
            expect(response.success).toBe(true);
            expect(response.data.settings.length).toBe(settingsToCreate.length);
            
            // All created keys should be present
            const returnedKeys = response.data.settings.map(s => s.setting_key);
            for (const setting of settingsToCreate) {
              expect(returnedKeys).toContain(setting.setting_key);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: PUT updates settings correctly (Requirement 2.3)', () => {
    
    it('should update setting value while preserving key', async () => {
      await fc.assert(
        fc.asyncProperty(
          newSettingArb,
          settingValueArb,
          async (originalSetting, newValue) => {
            mockSettingsStore.clear();
            
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            // Create setting
            const createReq = createMockRequest('POST', {}, originalSetting);
            const createRes = createMockResponse();
            await handler(createReq, createRes);
            
            expect(createRes._status).toBe(201);
            const created = (createRes._json as { data: { setting: SystemSetting } }).data.setting;
            
            // Update setting
            const updateReq = createMockRequest('PUT', {}, {
              id: created.id,
              setting_value: newValue,
            });
            const updateRes = createMockResponse();
            await handler(updateReq, updateRes);
            
            // Should return 200
            expect(updateRes._status).toBe(200);
            
            // Updated setting should have new value but same key
            const response = updateRes._json as { success: boolean; data: { setting: SystemSetting } };
            expect(response.success).toBe(true);
            expect(response.data.setting.setting_key).toBe(originalSetting.setting_key);
            expect(response.data.setting.setting_value).toBe(newValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should update setting by setting_key', async () => {
      await fc.assert(
        fc.asyncProperty(
          newSettingArb,
          settingValueArb,
          async (originalSetting, newValue) => {
            mockSettingsStore.clear();
            
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            // Create setting
            const createReq = createMockRequest('POST', {}, originalSetting);
            const createRes = createMockResponse();
            await handler(createReq, createRes);
            
            expect(createRes._status).toBe(201);
            
            // Update by setting_key
            const updateReq = createMockRequest('PUT', {}, {
              setting_key: originalSetting.setting_key,
              setting_value: newValue,
            });
            const updateRes = createMockResponse();
            await handler(updateReq, updateRes);
            
            // Should return 200
            expect(updateRes._status).toBe(200);
            
            const response = updateRes._json as { success: boolean; data: { setting: SystemSetting } };
            expect(response.success).toBe(true);
            expect(response.data.setting.setting_value).toBe(newValue);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: DELETE removes settings (Requirement 2.4)', () => {
    
    it('should delete setting by id', async () => {
      await fc.assert(
        fc.asyncProperty(
          newSettingArb,
          async (settingData) => {
            mockSettingsStore.clear();
            
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            // Create setting
            const createReq = createMockRequest('POST', {}, settingData);
            const createRes = createMockResponse();
            await handler(createReq, createRes);
            
            expect(createRes._status).toBe(201);
            const created = (createRes._json as { data: { setting: SystemSetting } }).data.setting;
            
            // Delete setting
            const deleteReq = createMockRequest('DELETE', {}, { id: created.id });
            const deleteRes = createMockResponse();
            await handler(deleteReq, deleteRes);
            
            // Should return 200
            expect(deleteRes._status).toBe(200);
            
            const response = deleteRes._json as { success: boolean; data: { deleted: boolean } };
            expect(response.success).toBe(true);
            expect(response.data.deleted).toBe(true);
            
            // Setting should no longer exist in store
            expect(mockSettingsStore.has(created.id)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should delete setting by setting_key', async () => {
      await fc.assert(
        fc.asyncProperty(
          newSettingArb,
          async (settingData) => {
            mockSettingsStore.clear();
            
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            // Create setting
            const createReq = createMockRequest('POST', {}, settingData);
            const createRes = createMockResponse();
            await handler(createReq, createRes);
            
            expect(createRes._status).toBe(201);
            
            // Delete by setting_key
            const deleteReq = createMockRequest('DELETE', {}, { setting_key: settingData.setting_key });
            const deleteRes = createMockResponse();
            await handler(deleteReq, deleteRes);
            
            // Should return 200
            expect(deleteRes._status).toBe(200);
            
            const response = deleteRes._json as { success: boolean; data: { deleted: boolean } };
            expect(response.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Full CRUD round-trip maintains consistency', () => {
    
    it('should complete full CRUD lifecycle for any valid setting', async () => {
      await fc.assert(
        fc.asyncProperty(
          newSettingArb,
          settingValueArb,
          async (settingData, updatedValue) => {
            mockSettingsStore.clear();
            
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            // 1. CREATE
            const createReq = createMockRequest('POST', {}, settingData);
            const createRes = createMockResponse();
            await handler(createReq, createRes);
            
            expect(createRes._status).toBe(201);
            const created = (createRes._json as { data: { setting: SystemSetting } }).data.setting;
            expect(created.setting_key).toBe(settingData.setting_key);
            
            // 2. READ
            const readReq = createMockRequest('GET');
            const readRes = createMockResponse();
            await handler(readReq, readRes);
            
            expect(readRes._status).toBe(200);
            const readResponse = readRes._json as { data: { settings: SystemSetting[] } };
            const foundSetting = readResponse.data.settings.find(s => s.id === created.id);
            expect(foundSetting).toBeDefined();
            expect(foundSetting!.setting_value).toBe(settingData.setting_value);
            
            // 3. UPDATE
            const updateReq = createMockRequest('PUT', {}, {
              id: created.id,
              setting_value: updatedValue,
            });
            const updateRes = createMockResponse();
            await handler(updateReq, updateRes);
            
            expect(updateRes._status).toBe(200);
            const updated = (updateRes._json as { data: { setting: SystemSetting } }).data.setting;
            expect(updated.setting_value).toBe(updatedValue);
            expect(updated.setting_key).toBe(settingData.setting_key); // Key unchanged
            
            // 4. DELETE
            const deleteReq = createMockRequest('DELETE', {}, { id: created.id });
            const deleteRes = createMockResponse();
            await handler(deleteReq, deleteRes);
            
            expect(deleteRes._status).toBe(200);
            
            // 5. Verify deletion
            const verifyReq = createMockRequest('GET');
            const verifyRes = createMockResponse();
            await handler(verifyReq, verifyRes);
            
            expect(verifyRes._status).toBe(200);
            const verifyResponse = verifyRes._json as { data: { settings: SystemSetting[] } };
            const deletedSetting = verifyResponse.data.settings.find(s => s.id === created.id);
            expect(deletedSetting).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
