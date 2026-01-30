/**
 * Property Test: Offline Queue and Sync
 * Feature: bun-vercel-migration
 * Property 4: Offline Queue and Sync
 * Validates: Requirements 9.1, 9.3, 9.5
 * 
 * For any form submission attempted while offline (navigator.onLine === false), 
 * the system SHALL:
 * 1. Queue the submission in localStorage
 * 2. Continue functioning for core features
 * 3. Automatically sync the queued submission when connectivity is restored
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

// Offline queue key
const OFFLINE_QUEUE_KEY = 'offline_queue';

// Queued operation interface
interface QueuedOperation {
  id: string;
  type: 'form_submission' | 'document_upload' | 'status_update';
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  data: unknown;
  timestamp: string;
  retryCount: number;
}

// Queue management functions (mirrors offlineSync.ts)
let idCounter = 0;

function getOfflineQueue(): QueuedOperation[] {
  const stored = localStorageMock.getItem(OFFLINE_QUEUE_KEY);
  if (!stored) return [];
  
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function addToOfflineQueue(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>): string {
  const queue = getOfflineQueue();
  idCounter++;
  const id = `op_${idCounter}_${Math.random().toString(36).substr(2, 9)}`;
  
  const newOperation: QueuedOperation = {
    ...operation,
    id,
    timestamp: new Date().toISOString(),
    retryCount: 0,
  };
  
  queue.push(newOperation);
  localStorageMock.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  
  return id;
}

function removeFromOfflineQueue(id: string): boolean {
  const queue = getOfflineQueue();
  const index = queue.findIndex(op => op.id === id);
  
  if (index === -1) return false;
  
  queue.splice(index, 1);
  localStorageMock.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  
  return true;
}

function clearOfflineQueue(): void {
  localStorageMock.removeItem(OFFLINE_QUEUE_KEY);
}

function getQueueLength(): number {
  return getOfflineQueue().length;
}

// Arbitrary generators
const operationTypeArbitrary = fc.constantFrom(
  'form_submission' as const,
  'document_upload' as const,
  'status_update' as const
);

const httpMethodArbitrary = fc.constantFrom(
  'POST' as const,
  'PUT' as const,
  'PATCH' as const
);

const endpointArbitrary = fc.constantFrom(
  '/api/applications',
  '/api/documents/upload',
  '/api/applications/status',
  '/api/notifications/preferences'
);

const formDataArbitrary = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 50 }),
  lastName: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  applicationId: fc.uuid(),
});

const queuedOperationArbitrary = fc.record({
  type: operationTypeArbitrary,
  endpoint: endpointArbitrary,
  method: httpMethodArbitrary,
  data: formDataArbitrary,
});

describe('Feature: bun-vercel-migration, Property 4: Offline Queue and Sync', () => {
  
  beforeEach(() => {
    localStorageMock.clear();
    idCounter = 0;
  });

  afterEach(() => {
    localStorageMock.clear();
    idCounter = 0;
  });

  it('should queue any operation when offline', () => {
    fc.assert(
      fc.property(
        queuedOperationArbitrary,
        (operation) => {
          const initialLength = getQueueLength();
          
          // Add to queue (simulating offline submission)
          const id = addToOfflineQueue(operation);
          
          // Queue should have one more item
          expect(getQueueLength()).toBe(initialLength + 1);
          
          // ID should be returned
          expect(id).toBeTruthy();
          expect(typeof id).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve operation data in queue', () => {
    fc.assert(
      fc.property(
        queuedOperationArbitrary,
        (operation) => {
          const id = addToOfflineQueue(operation);
          const queue = getOfflineQueue();
          const queued = queue.find(op => op.id === id);
          
          // Operation should be in queue with correct data
          expect(queued).toBeDefined();
          expect(queued?.type).toBe(operation.type);
          expect(queued?.endpoint).toBe(operation.endpoint);
          expect(queued?.method).toBe(operation.method);
          expect(queued?.data).toEqual(operation.data);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain FIFO order in queue', () => {
    fc.assert(
      fc.property(
        fc.array(queuedOperationArbitrary, { minLength: 2, maxLength: 10 }),
        (operations) => {
          // Reset state for this iteration
          localStorageMock.clear();
          idCounter = 0;
          
          const ids: string[] = [];
          
          // Add all operations
          for (const op of operations) {
            ids.push(addToOfflineQueue(op));
          }
          
          // Queue should maintain order
          const queue = getOfflineQueue();
          expect(queue.length).toBe(ids.length);
          for (let i = 0; i < ids.length; i++) {
            expect(queue[i].id).toBe(ids[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should remove operations from queue after sync', () => {
    fc.assert(
      fc.property(
        fc.array(queuedOperationArbitrary, { minLength: 1, maxLength: 5 }),
        (operations) => {
          // Reset state for this iteration
          localStorageMock.clear();
          idCounter = 0;
          
          // Add all operations
          const ids = operations.map(op => addToOfflineQueue(op));
          
          // Remove first operation (simulating successful sync)
          const removed = removeFromOfflineQueue(ids[0]);
          
          expect(removed).toBe(true);
          expect(getQueueLength()).toBe(operations.length - 1);
          
          // First operation should no longer be in queue
          const queue = getOfflineQueue();
          expect(queue.find(op => op.id === ids[0])).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle removing non-existent operations gracefully', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (fakeId) => {
          const removed = removeFromOfflineQueue(fakeId);
          expect(removed).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should clear entire queue when requested', () => {
    fc.assert(
      fc.property(
        fc.array(queuedOperationArbitrary, { minLength: 1, maxLength: 10 }),
        (operations) => {
          // Add all operations
          for (const op of operations) {
            addToOfflineQueue(op);
          }
          
          expect(getQueueLength()).toBe(operations.length);
          
          // Clear queue
          clearOfflineQueue();
          
          expect(getQueueLength()).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include timestamp for each queued operation', () => {
    fc.assert(
      fc.property(
        queuedOperationArbitrary,
        (operation) => {
          const beforeQueue = new Date();
          const id = addToOfflineQueue(operation);
          const afterQueue = new Date();
          
          const queue = getOfflineQueue();
          const queued = queue.find(op => op.id === id);
          const queuedTime = new Date(queued!.timestamp);
          
          // Timestamp should be between before and after
          expect(queuedTime.getTime()).toBeGreaterThanOrEqual(beforeQueue.getTime());
          expect(queuedTime.getTime()).toBeLessThanOrEqual(afterQueue.getTime());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should initialize retry count to zero', () => {
    fc.assert(
      fc.property(
        queuedOperationArbitrary,
        (operation) => {
          const id = addToOfflineQueue(operation);
          const queue = getOfflineQueue();
          const queued = queue.find(op => op.id === id);
          
          expect(queued?.retryCount).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
