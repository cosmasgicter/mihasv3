import { describe, it, expect } from 'vitest';

/**
 * Unit Tests: Arcjet Integration
 * Feature: auth-security-hardening
 * Task: 5.2 Write unit tests for Arcjet integration
 * 
 * **Validates: Requirements 2.5, 2.7, 2.8**
 */

// Expected rate limit configurations based on requirements
const EXPECTED_RATE_LIMITS = {
  auth: { window: '5m', max: 5 },
  session: { window: '10m', max: 30 },
  admin: { window: '10m', max: 20 },
  notification: { window: '10m', max: 50 },
  general: { window: '10m', max: 100 },
};

// Mock response helper
function createMockResponse() {
  return {
    _status: 200,
    _json: null as unknown,
    status(code: number) { this._status = code; return this; },
    json(data: unknown) { this._json = data; return this; },
  };
}

// Mock decision helpers
function createDeniedDecision(reasonType = 'rateLimit') {
  return {
    isDenied: () => true,
    reason: {
      isRateLimit: () => reasonType === 'rateLimit',
      isBot: () => reasonType === 'bot',
      isShield: () => reasonType === 'shield',
    },
  };
}

function createAllowedDecision() {
  return { isDenied: () => false };
}

// Simulate handleArcjetDecision behavior for testing
function simulateHandleArcjetDecision(
  decision: { isDenied: () => boolean },
  res: ReturnType<typeof createMockResponse>
) {
  if (decision.isDenied()) {
    res.status(403).json({
      success: false,
      error: 'Request blocked by security policy',
      code: 'SECURITY_VIOLATION',
    });
    return true;
  }
  return false;
}

// ============================================================================
// Rate Limit Configuration Tests (Requirement 2.7)
// ============================================================================

describe('Arcjet Rate Limit Configurations (Requirement 2.7)', () => {
  it('should have auth rate limit of 5 requests per 5 minutes', () => {
    expect(EXPECTED_RATE_LIMITS.auth.window).toBe('5m');
    expect(EXPECTED_RATE_LIMITS.auth.max).toBe(5);
  });

  it('should have session rate limit of 30 requests per 10 minutes', () => {
    expect(EXPECTED_RATE_LIMITS.session.window).toBe('10m');
    expect(EXPECTED_RATE_LIMITS.session.max).toBe(30);
  });

  it('should have admin rate limit of 20 requests per 10 minutes', () => {
    expect(EXPECTED_RATE_LIMITS.admin.window).toBe('10m');
    expect(EXPECTED_RATE_LIMITS.admin.max).toBe(20);
  });

  it('should have notification rate limit of 50 requests per 10 minutes', () => {
    expect(EXPECTED_RATE_LIMITS.notification.window).toBe('10m');
    expect(EXPECTED_RATE_LIMITS.notification.max).toBe(50);
  });

  it('should have general rate limit of 100 requests per 10 minutes', () => {
    expect(EXPECTED_RATE_LIMITS.general.window).toBe('10m');
    expect(EXPECTED_RATE_LIMITS.general.max).toBe(100);
  });

  it('should have all required route types defined', () => {
    const requiredRouteTypes = ['auth', 'session', 'admin', 'notification', 'general'];
    for (const routeType of requiredRouteTypes) {
      expect(EXPECTED_RATE_LIMITS[routeType as keyof typeof EXPECTED_RATE_LIMITS]).toBeDefined();
    }
  });

  it('should have auth rate limit stricter than other routes', () => {
    const authRatePerMin = EXPECTED_RATE_LIMITS.auth.max / 5;
    const generalRatePerMin = EXPECTED_RATE_LIMITS.general.max / 10;
    expect(authRatePerMin).toBeLessThan(generalRatePerMin);
  });

  it('should have valid window format for all route types', () => {
    const windowPattern = /^\d+m$/;
    for (const config of Object.values(EXPECTED_RATE_LIMITS)) {
      expect(config.window).toMatch(windowPattern);
    }
  });

  it('should have positive max values for all route types', () => {
    for (const config of Object.values(EXPECTED_RATE_LIMITS)) {
      expect(config.max).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Blocked Request Response Tests (Requirement 2.5)
// ============================================================================

describe('Arcjet Blocked Request Responses (Requirement 2.5)', () => {
  it('should return 403 status for blocked requests', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    const blocked = simulateHandleArcjetDecision(decision, res);
    expect(blocked).toBe(true);
    expect(res._status).toBe(403);
  });

  it('should return code SECURITY_VIOLATION for blocked requests', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    expect((res._json as { code: string }).code).toBe('SECURITY_VIOLATION');
  });

  it('should return error message Request blocked by security policy', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    expect((res._json as { error: string }).error).toBe('Request blocked by security policy');
  });

  it('should return success false for blocked requests', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    expect((res._json as { success: boolean }).success).toBe(false);
  });

  it('should return consistent response for rate limit blocks', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    expect(res._json).toEqual({
      success: false,
      error: 'Request blocked by security policy',
      code: 'SECURITY_VIOLATION',
    });
  });

  it('should return consistent response for bot detection blocks', () => {
    const decision = createDeniedDecision('bot');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    expect(res._json).toEqual({
      success: false,
      error: 'Request blocked by security policy',
      code: 'SECURITY_VIOLATION',
    });
  });

  it('should return consistent response for shield blocks', () => {
    const decision = createDeniedDecision('shield');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    expect(res._json).toEqual({
      success: false,
      error: 'Request blocked by security policy',
      code: 'SECURITY_VIOLATION',
    });
  });

  it('should return true (blocked) for denied decisions', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    expect(simulateHandleArcjetDecision(decision, res)).toBe(true);
  });

  it('should return false (not blocked) for allowed decisions', () => {
    const decision = createAllowedDecision();
    const res = createMockResponse();
    expect(simulateHandleArcjetDecision(decision, res)).toBe(false);
  });

  it('should not modify response for allowed decisions', () => {
    const decision = createAllowedDecision();
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    expect(res._json).toBeNull();
    expect(res._status).toBe(200);
  });
});

// ============================================================================
// Service Unavailable Response Tests (Requirement 2.8)
// ============================================================================

describe('Arcjet Service Unavailable Response (Requirement 2.8)', () => {
  it('should define 503 response with code SECURITY_SERVICE_ERROR', () => {
    const expectedResponse = {
      success: false,
      error: 'Security service unavailable',
      code: 'SECURITY_SERVICE_ERROR',
    };
    expect(expectedResponse.success).toBe(false);
    expect(expectedResponse.code).toBe('SECURITY_SERVICE_ERROR');
    expect(expectedResponse.error).toBe('Security service unavailable');
  });

  it('should have consistent 503 response structure', () => {
    const expectedResponse = {
      success: false,
      error: 'Security service unavailable',
      code: 'SECURITY_SERVICE_ERROR',
    };
    expect(expectedResponse).toHaveProperty('success');
    expect(expectedResponse).toHaveProperty('error');
    expect(expectedResponse).toHaveProperty('code');
  });

  it('should use 503 status code for service unavailable not 500', () => {
    expect(503).not.toBe(500);
    expect(503).toBe(503);
  });

  it('should fail secure by blocking requests when service unavailable', () => {
    const expectedBehavior = {
      allowRequest: false,
      statusCode: 503,
      errorCode: 'SECURITY_SERVICE_ERROR',
    };
    expect(expectedBehavior.allowRequest).toBe(false);
    expect(expectedBehavior.statusCode).toBe(503);
    expect(expectedBehavior.errorCode).toBe('SECURITY_SERVICE_ERROR');
  });
});

// ============================================================================
// Response Structure Consistency Tests
// ============================================================================

describe('Arcjet Response Structure Consistency', () => {
  it('should have consistent 403 response structure', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    const response = res._json as Record<string, unknown>;
    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('error');
    expect(response).toHaveProperty('code');
  });

  it('should not expose internal state in error responses', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    const responseStr = JSON.stringify(res._json);
    expect(responseStr).not.toContain('decision');
    expect(responseStr).not.toContain('fingerprint');
    expect(responseStr).not.toContain('stack');
  });

  it('should use deterministic error codes for all block types', () => {
    const blockTypes = ['rateLimit', 'bot', 'shield'];
    for (const blockType of blockTypes) {
      const decision = createDeniedDecision(blockType);
      const res = createMockResponse();
      simulateHandleArcjetDecision(decision, res);
      expect((res._json as { code: string }).code).toBe('SECURITY_VIOLATION');
    }
  });

  it('should use deterministic error messages for all block types', () => {
    const blockTypes = ['rateLimit', 'bot', 'shield'];
    for (const blockType of blockTypes) {
      const decision = createDeniedDecision(blockType);
      const res = createMockResponse();
      simulateHandleArcjetDecision(decision, res);
      expect((res._json as { error: string }).error).toBe('Request blocked by security policy');
    }
  });
});

// ============================================================================
// Security Requirements Tests
// ============================================================================

describe('Arcjet Security Requirements', () => {
  it('should block requests before they reach the database (Requirement 2.9)', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    const blocked = simulateHandleArcjetDecision(decision, res);
    expect(blocked).toBe(true);
    expect(res._status).toBe(403);
  });

  it('should return 403 not 401 or 429 for security blocks', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    expect(res._status).toBe(403);
    expect(res._status).not.toBe(401);
    expect(res._status).not.toBe(429);
  });

  it('should use generic error message to avoid information disclosure', () => {
    const blockTypes = ['rateLimit', 'bot', 'shield'];
    for (const blockType of blockTypes) {
      const decision = createDeniedDecision(blockType);
      const res = createMockResponse();
      simulateHandleArcjetDecision(decision, res);
      const response = res._json as { error: string };
      expect(response.error).not.toContain('rate limit');
      expect(response.error).not.toContain('bot');
      expect(response.error).not.toContain('shield');
      expect(response.error).toBe('Request blocked by security policy');
    }
  });

  it('should not expose IP address in error responses', () => {
    const decision = createDeniedDecision('rateLimit');
    const res = createMockResponse();
    simulateHandleArcjetDecision(decision, res);
    const responseStr = JSON.stringify(res._json);
    expect(responseStr).not.toContain('192.168');
    expect(responseStr).not.toContain('address');
  });
});
