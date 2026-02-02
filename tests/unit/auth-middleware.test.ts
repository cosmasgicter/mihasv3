/**
 * Auth Middleware Unit Tests
 * 
 * Tests for the authentication and authorization middleware.
 * 
 * VALIDATES:
 * - Requirement 8.5: requireAuth middleware throws if not authenticated
 * - Requirement 8.6: requireRole middleware throws if user lacks required role
 * - Requirement 4.8: Support both cookie-based and Bearer token authentication
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import type { VercelRequest } from "@vercel/node";
import {
  getAuthUser,
  requireAuth,
  requireRole,
  requirePermission,
  hasPermission,
  AuthenticationError,
  AuthorizationError,
  type AuthContext,
} from "../../lib/auth/middleware";

// Mock the JWT module
vi.mock("../../lib/auth/jwt", () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock the cookies module
vi.mock("../../lib/auth/cookies", () => ({
  extractBearerToken: vi.fn(),
  extractAccessTokenFromCookie: vi.fn(),
}));

import { verifyAccessToken } from "../../lib/auth/jwt";
import { extractBearerToken, extractAccessTokenFromCookie } from "../../lib/auth/cookies";

// Type the mocks - cast to Mock type for proper typing
const mockVerifyAccessToken = verifyAccessToken as Mock;
const mockExtractBearerToken = extractBearerToken as Mock;
const mockExtractAccessTokenFromCookie = extractAccessTokenFromCookie as Mock;

// Helper to create mock request
function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    headers: {},
    ...overrides,
  } as VercelRequest;
}

// Sample valid token payload
const validPayload = {
  sub: "user-123",
  email: "test@example.com",
  role: "admin" as const,
  permissions: ["users:read", "applications:write"],
  type: "access" as const,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
  iss: "mihas-auth",
  aud: "mihas-app",
};

describe("Auth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getAuthUser", () => {
    it("should return null when no token is present", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue(null);
      mockExtractBearerToken.mockReturnValue(null);

      const req = createMockRequest();
      const result = await getAuthUser(req);

      expect(result).toBeNull();
    });

    it("should return AuthContext when cookie token is valid", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("valid-cookie-token");
      mockVerifyAccessToken.mockResolvedValue(validPayload);

      const req = createMockRequest();
      const result = await getAuthUser(req);

      expect(result).toEqual({
        userId: "user-123",
        email: "test@example.com",
        role: "admin",
        permissions: ["users:read", "applications:write"],
      });
      expect(mockVerifyAccessToken).toHaveBeenCalledWith("valid-cookie-token");
    });

    it("should return AuthContext when Bearer token is valid", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue(null);
      mockExtractBearerToken.mockReturnValue("valid-bearer-token");
      mockVerifyAccessToken.mockResolvedValue(validPayload);

      const req = createMockRequest();
      const result = await getAuthUser(req);

      expect(result).toEqual({
        userId: "user-123",
        email: "test@example.com",
        role: "admin",
        permissions: ["users:read", "applications:write"],
      });
      expect(mockVerifyAccessToken).toHaveBeenCalledWith("valid-bearer-token");
    });

    it("should prefer cookie token over Bearer token (Requirement 4.8)", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("cookie-token");
      mockExtractBearerToken.mockReturnValue("bearer-token");
      mockVerifyAccessToken.mockResolvedValue(validPayload);

      const req = createMockRequest();
      await getAuthUser(req);

      // Should use cookie token, not bearer token
      expect(mockVerifyAccessToken).toHaveBeenCalledWith("cookie-token");
      expect(mockVerifyAccessToken).toHaveBeenCalledTimes(1);
    });

    it("should return null when token verification fails", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("invalid-token");
      mockVerifyAccessToken.mockRejectedValue(new Error("Invalid signature"));

      const req = createMockRequest();
      const result = await getAuthUser(req);

      expect(result).toBeNull();
    });

    it("should handle empty permissions array", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("valid-token");
      mockVerifyAccessToken.mockResolvedValue({
        ...validPayload,
        permissions: [],
      });

      const req = createMockRequest();
      const result = await getAuthUser(req);

      expect(result?.permissions).toEqual([]);
    });
  });

  describe("requireAuth (Requirement 8.5)", () => {
    it("should throw AuthenticationError when no token is present", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue(null);
      mockExtractBearerToken.mockReturnValue(null);

      const req = createMockRequest();

      await expect(requireAuth(req)).rejects.toThrow(AuthenticationError);
      await expect(requireAuth(req)).rejects.toMatchObject({
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
        statusCode: 401,
      });
    });

    it("should throw AuthenticationError with TOKEN_EXPIRED code when token is expired", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("expired-token");
      mockVerifyAccessToken.mockRejectedValue(new Error("Access token has expired"));

      const req = createMockRequest();

      await expect(requireAuth(req)).rejects.toMatchObject({
        code: "TOKEN_EXPIRED",
        statusCode: 401,
      });
    });

    it("should throw AuthenticationError with INVALID_TOKEN code when signature is invalid", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("tampered-token");
      mockVerifyAccessToken.mockRejectedValue(new Error("Invalid token signature"));

      const req = createMockRequest();

      await expect(requireAuth(req)).rejects.toMatchObject({
        code: "INVALID_TOKEN",
        statusCode: 401,
      });
    });

    it("should return AuthContext when token is valid", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("valid-token");
      mockVerifyAccessToken.mockResolvedValue(validPayload);

      const req = createMockRequest();
      const result = await requireAuth(req);

      expect(result).toEqual({
        userId: "user-123",
        email: "test@example.com",
        role: "admin",
        permissions: ["users:read", "applications:write"],
      });
    });

    it("should support Bearer token authentication (Requirement 4.8)", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue(null);
      mockExtractBearerToken.mockReturnValue("bearer-token");
      mockVerifyAccessToken.mockResolvedValue(validPayload);

      const req = createMockRequest();
      const result = await requireAuth(req);

      expect(result.userId).toBe("user-123");
      expect(mockVerifyAccessToken).toHaveBeenCalledWith("bearer-token");
    });
  });

  describe("requireRole (Requirement 8.6)", () => {
    it("should throw AuthenticationError when not authenticated", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue(null);
      mockExtractBearerToken.mockReturnValue(null);

      const req = createMockRequest();

      await expect(requireRole(req, ["admin"])).rejects.toThrow(AuthenticationError);
    });

    it("should throw AuthorizationError when user lacks required role", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("valid-token");
      mockVerifyAccessToken.mockResolvedValue({
        ...validPayload,
        role: "student",
      });

      const req = createMockRequest();

      await expect(requireRole(req, ["admin", "super_admin"])).rejects.toThrow(AuthorizationError);
      await expect(requireRole(req, ["admin", "super_admin"])).rejects.toMatchObject({
        message: "Insufficient permissions",
        code: "INSUFFICIENT_PERMISSIONS",
        statusCode: 403,
      });
    });

    it("should return AuthContext when user has required role", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("valid-token");
      mockVerifyAccessToken.mockResolvedValue(validPayload);

      const req = createMockRequest();
      const result = await requireRole(req, ["admin", "super_admin"]);

      expect(result.role).toBe("admin");
    });

    it("should accept any role from the allowed list", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("valid-token");
      mockVerifyAccessToken.mockResolvedValue({
        ...validPayload,
        role: "super_admin",
      });

      const req = createMockRequest();
      const result = await requireRole(req, ["admin", "super_admin"]);

      expect(result.role).toBe("super_admin");
    });

    it("should work with single role requirement", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("valid-token");
      mockVerifyAccessToken.mockResolvedValue({
        ...validPayload,
        role: "reviewer",
      });

      const req = createMockRequest();
      const result = await requireRole(req, ["reviewer"]);

      expect(result.role).toBe("reviewer");
    });
  });

  describe("requirePermission", () => {
    it("should throw AuthenticationError when not authenticated", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue(null);
      mockExtractBearerToken.mockReturnValue(null);

      const req = createMockRequest();

      await expect(requirePermission(req, "users:read")).rejects.toThrow(AuthenticationError);
    });

    it("should throw AuthorizationError when user lacks required permission", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("valid-token");
      mockVerifyAccessToken.mockResolvedValue({
        ...validPayload,
        permissions: ["applications:read"],
      });

      const req = createMockRequest();

      await expect(requirePermission(req, "users:delete")).rejects.toThrow(AuthorizationError);
    });

    it("should return AuthContext when user has required permission", async () => {
      mockExtractAccessTokenFromCookie.mockReturnValue("valid-token");
      mockVerifyAccessToken.mockResolvedValue(validPayload);

      const req = createMockRequest();
      const result = await requirePermission(req, "users:read");

      expect(result.permissions).toContain("users:read");
    });
  });

  describe("hasPermission", () => {
    it("should return true when user has the permission", () => {
      const user: AuthContext = {
        userId: "user-123",
        email: "test@example.com",
        role: "admin",
        permissions: ["users:read", "applications:write"],
      };

      expect(hasPermission(user, "users:read")).toBe(true);
      expect(hasPermission(user, "applications:write")).toBe(true);
    });

    it("should return false when user lacks the permission", () => {
      const user: AuthContext = {
        userId: "user-123",
        email: "test@example.com",
        role: "admin",
        permissions: ["users:read"],
      };

      expect(hasPermission(user, "users:delete")).toBe(false);
    });

    it("should return false for empty permissions array", () => {
      const user: AuthContext = {
        userId: "user-123",
        email: "test@example.com",
        role: "student",
        permissions: [],
      };

      expect(hasPermission(user, "users:read")).toBe(false);
    });
  });

  describe("Error classes", () => {
    it("AuthenticationError should have correct properties", () => {
      const error = new AuthenticationError("Test message", "TEST_CODE", 401);

      expect(error.name).toBe("AuthenticationError");
      expect(error.message).toBe("Test message");
      expect(error.code).toBe("TEST_CODE");
      expect(error.statusCode).toBe(401);
      expect(error instanceof Error).toBe(true);
    });

    it("AuthorizationError should have correct properties", () => {
      const error = new AuthorizationError("Test message", "TEST_CODE", 403);

      expect(error.name).toBe("AuthorizationError");
      expect(error.message).toBe("Test message");
      expect(error.code).toBe("TEST_CODE");
      expect(error.statusCode).toBe(403);
      expect(error instanceof Error).toBe(true);
    });

    it("AuthenticationError should have default values", () => {
      const error = new AuthenticationError("Test");

      expect(error.code).toBe("AUTHENTICATION_REQUIRED");
      expect(error.statusCode).toBe(401);
    });

    it("AuthorizationError should have default values", () => {
      const error = new AuthorizationError("Test");

      expect(error.code).toBe("INSUFFICIENT_PERMISSIONS");
      expect(error.statusCode).toBe(403);
    });
  });
});
