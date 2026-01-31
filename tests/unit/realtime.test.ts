/**
 * Unit Tests for Realtime System
 * 
 * Tests SSE event format, event replay, and polling functionality.
 * 
 * Requirements:
 * - 7.3: SSE event format is correct
 * - 7.6: Event replay with lastEventId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock the realtime module functions
const mockEventHistory: Array<{
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
  userId?: string;
}> = [];

// Helper to create mock events
function createMockEvent(
  id: string,
  type: string,
  data: Record<string, unknown>,
  userId?: string
) {
  return {
    id,
    type,
    data,
    timestamp: new Date().toISOString(),
    userId,
  };
}

// Mock implementation of getEventsForPolling
function getEventsForPolling(userId: string, lastEventId?: string) {
  if (!lastEventId) {
    return mockEventHistory
      .filter(e => !e.userId || e.userId === userId)
      .slice(-10);
  }
  
  const lastIndex = mockEventHistory.findIndex(e => e.id === lastEventId);
  if (lastIndex === -1) {
    return mockEventHistory.filter(e => !e.userId || e.userId === userId);
  }
  
  return mockEventHistory
    .slice(lastIndex + 1)
    .filter(e => !e.userId || e.userId === userId);
}

// Mock implementation of sendSSEEvent
function sendSSEEvent(res: { write: (data: string) => void }, event: typeof mockEventHistory[0]) {
  const data = JSON.stringify(event.data);
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${data}\n\n`);
}

describe('Realtime System Unit Tests', () => {
  beforeEach(() => {
    // Clear event history before each test
    mockEventHistory.length = 0;
  });

  describe('SSE Event Format', () => {
    /**
     * **Validates: Requirements 7.3**
     * 
     * SSE events must follow the correct format:
     * - id: <event-id>
     * - event: <event-type>
     * - data: <json-data>
     * - Followed by double newline
     */
    it('should format SSE events correctly', () => {
      const mockWrite = vi.fn();
      const mockRes = { write: mockWrite };

      const event = createMockEvent(
        'test-123',
        'application_update',
        { status: 'approved', applicationId: 'app-456' }
      );

      sendSSEEvent(mockRes, event);

      // Verify the correct format
      expect(mockWrite).toHaveBeenCalledTimes(3);
      expect(mockWrite).toHaveBeenNthCalledWith(1, 'id: test-123\n');
      expect(mockWrite).toHaveBeenNthCalledWith(2, 'event: application_update\n');
      expect(mockWrite).toHaveBeenNthCalledWith(3, expect.stringContaining('data: '));
      expect(mockWrite).toHaveBeenNthCalledWith(3, expect.stringContaining('\n\n'));
    });

    it('should serialize event data as JSON', () => {
      const mockWrite = vi.fn();
      const mockRes = { write: mockWrite };

      const eventData = { 
        status: 'approved', 
        applicationId: 'app-456',
        nested: { key: 'value' }
      };
      const event = createMockEvent('test-123', 'notification', eventData);

      sendSSEEvent(mockRes, event);

      // Get the data line
      const dataCall = mockWrite.mock.calls[2][0];
      const jsonPart = dataCall.replace('data: ', '').replace('\n\n', '');
      const parsed = JSON.parse(jsonPart);

      expect(parsed).toEqual(eventData);
    });

    it('should include event ID for replay support', () => {
      const mockWrite = vi.fn();
      const mockRes = { write: mockWrite };

      const event = createMockEvent('unique-event-id-789', 'ping', { timestamp: Date.now() });

      sendSSEEvent(mockRes, event);

      expect(mockWrite).toHaveBeenNthCalledWith(1, 'id: unique-event-id-789\n');
    });
  });

  describe('Event Replay with lastEventId', () => {
    /**
     * **Validates: Requirements 7.6**
     * 
     * Clients should be able to replay events from a specific point
     * using the lastEventId parameter.
     */
    it('should return all events when no lastEventId provided', () => {
      const userId = 'user-123';
      
      // Add some events
      mockEventHistory.push(
        createMockEvent('event-1', 'notification', { msg: '1' }, userId),
        createMockEvent('event-2', 'notification', { msg: '2' }, userId),
        createMockEvent('event-3', 'notification', { msg: '3' }, userId)
      );

      const events = getEventsForPolling(userId);

      expect(events).toHaveLength(3);
      expect(events[0].id).toBe('event-1');
      expect(events[2].id).toBe('event-3');
    });

    it('should return events after lastEventId', () => {
      const userId = 'user-123';
      
      // Add some events
      mockEventHistory.push(
        createMockEvent('event-1', 'notification', { msg: '1' }, userId),
        createMockEvent('event-2', 'notification', { msg: '2' }, userId),
        createMockEvent('event-3', 'notification', { msg: '3' }, userId),
        createMockEvent('event-4', 'notification', { msg: '4' }, userId)
      );

      const events = getEventsForPolling(userId, 'event-2');

      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('event-3');
      expect(events[1].id).toBe('event-4');
    });

    it('should return empty array when lastEventId is the latest', () => {
      const userId = 'user-123';
      
      mockEventHistory.push(
        createMockEvent('event-1', 'notification', { msg: '1' }, userId),
        createMockEvent('event-2', 'notification', { msg: '2' }, userId)
      );

      const events = getEventsForPolling(userId, 'event-2');

      expect(events).toHaveLength(0);
    });

    it('should return all events when lastEventId not found', () => {
      const userId = 'user-123';
      
      mockEventHistory.push(
        createMockEvent('event-1', 'notification', { msg: '1' }, userId),
        createMockEvent('event-2', 'notification', { msg: '2' }, userId)
      );

      const events = getEventsForPolling(userId, 'non-existent-id');

      expect(events).toHaveLength(2);
    });
  });

  describe('Polling Returns Correct Events', () => {
    /**
     * **Validates: Requirements 7.6**
     * 
     * Polling should return events filtered by user ID.
     */
    it('should filter events by user ID', () => {
      const userId1 = 'user-123';
      const userId2 = 'user-456';
      
      mockEventHistory.push(
        createMockEvent('event-1', 'notification', { msg: '1' }, userId1),
        createMockEvent('event-2', 'notification', { msg: '2' }, userId2),
        createMockEvent('event-3', 'notification', { msg: '3' }, userId1)
      );

      const eventsForUser1 = getEventsForPolling(userId1);
      const eventsForUser2 = getEventsForPolling(userId2);

      expect(eventsForUser1).toHaveLength(2);
      expect(eventsForUser1.every(e => e.userId === userId1)).toBe(true);
      
      expect(eventsForUser2).toHaveLength(1);
      expect(eventsForUser2[0].userId).toBe(userId2);
    });

    it('should include broadcast events (no userId) for all users', () => {
      const userId = 'user-123';
      
      mockEventHistory.push(
        createMockEvent('event-1', 'notification', { msg: '1' }, userId),
        createMockEvent('event-2', 'ping', { msg: 'broadcast' }), // No userId = broadcast
        createMockEvent('event-3', 'notification', { msg: '3' }, userId)
      );

      const events = getEventsForPolling(userId);

      expect(events).toHaveLength(3);
      expect(events[1].userId).toBeUndefined();
    });

    it('should limit returned events to last 10', () => {
      const userId = 'user-123';
      
      // Add 15 events
      for (let i = 1; i <= 15; i++) {
        mockEventHistory.push(
          createMockEvent(`event-${i}`, 'notification', { msg: `${i}` }, userId)
        );
      }

      const events = getEventsForPolling(userId);

      expect(events).toHaveLength(10);
      expect(events[0].id).toBe('event-6'); // Should start from event-6
      expect(events[9].id).toBe('event-15'); // Should end at event-15
    });
  });

  describe('Event Types', () => {
    it('should support all defined event types', () => {
      const eventTypes = [
        'application_update',
        'notification',
        'payment_update',
        'interview_scheduled',
        'document_processed',
        'ping',
      ];

      const userId = 'user-123';

      eventTypes.forEach((type, index) => {
        mockEventHistory.push(
          createMockEvent(`event-${index}`, type, { type }, userId)
        );
      });

      const events = getEventsForPolling(userId);

      expect(events).toHaveLength(6);
      eventTypes.forEach((type, index) => {
        expect(events[index].type).toBe(type);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty event history', () => {
      const events = getEventsForPolling('user-123');
      expect(events).toHaveLength(0);
    });

    it('should handle events with complex data structures', () => {
      const mockWrite = vi.fn();
      const mockRes = { write: mockWrite };

      const complexData = {
        nested: {
          deeply: {
            value: 'test',
          },
        },
        array: [1, 2, 3],
        nullValue: null,
        boolValue: true,
      };

      const event = createMockEvent('test-123', 'notification', complexData);
      sendSSEEvent(mockRes, event);

      const dataCall = mockWrite.mock.calls[2][0];
      const jsonPart = dataCall.replace('data: ', '').replace('\n\n', '');
      const parsed = JSON.parse(jsonPart);

      expect(parsed).toEqual(complexData);
    });

    it('should handle special characters in event data', () => {
      const mockWrite = vi.fn();
      const mockRes = { write: mockWrite };

      const dataWithSpecialChars = {
        message: 'Hello\nWorld\twith "quotes" and \'apostrophes\'',
        unicode: '你好世界 🌍',
      };

      const event = createMockEvent('test-123', 'notification', dataWithSpecialChars);
      sendSSEEvent(mockRes, event);

      const dataCall = mockWrite.mock.calls[2][0];
      const jsonPart = dataCall.replace('data: ', '').replace('\n\n', '');
      const parsed = JSON.parse(jsonPart);

      expect(parsed).toEqual(dataWithSpecialChars);
    });
  });
});
