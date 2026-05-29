/**
 * Core HTTP client utilities — low-level fetch helpers that do not depend
 * on auth or CSRF logic.
 *
 * Provides: base URL configuration, JSON parsing, header normalization,
 * base headers, envelope unwrapping, and the shared request options type.
 *
 * @module httpClient
 */

import { getApiBaseUrl } from '@/lib/apiConfig';
import { toError } from '@/lib/toError'

/** Base URL for all API requests, resolved from environment config. */
export const API_BASE = getApiBaseUrl();

/**
 * Options for API requests, extending the standard RequestInit with
 * timeout and retry configuration.
 */
export interface ApiRequestOptions extends Omit<RequestInit, 'cache'> {
  /** Request timeout in milliseconds. Defaults to 30s (10s for health/session). */
  timeout?: number;
  /** Max retry attempts for network/5xx errors. Defaults to 3. Set 0 to disable. */
  retries?: number;
}

/**
 * Safely parse a JSON response body, handling empty bodies and non-JSON
 * content types gracefully.
 *
 * Returns `null` for 204/205 responses, zero-length bodies, and empty
 * trimmed bodies. Attempts JSON parse when content-type is application/json
 * or the body starts with `{` or `[`.
 */
export async function parseJsonSafely<TResponse>(
  response: Response,
  service: string,
  endpoint: string
): Promise<TResponse | null> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength === 0) {
      return null;
    }
  }

  const bodyText = await response.text();
  const trimmedBody = bodyText.trim();

  if (!trimmedBody) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const shouldParseJson =
    contentType.includes('application/json') ||
    trimmedBody.startsWith('{') ||
    trimmedBody.startsWith('[');

  if (!shouldParseJson) {
    return bodyText as TResponse;
  }

  try {
    return JSON.parse(bodyText) as TResponse;
  } catch (error) {
    const message = toError(error).message;
    throw new Error(`Failed to parse JSON response from ${endpoint}: ${message}`);
  }
}

/**
 * Normalize various HeadersInit formats into a plain Record<string, string>.
 * Handles Headers instances, [key, value] tuples, and plain objects.
 */
export function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return headers.reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
  }

  return headers;
}

/**
 * Get base headers for API requests.
 * NO Authorization header — we use HTTP-only cookies.
 */
export function getBaseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Unwrap the { success, data } envelope returned by API endpoints.
 * All API endpoints return { success: true, data: T } via the response envelope.
 * This method extracts the inner `data` so callers get the payload directly.
 *
 * Non-JSON responses (file downloads, CSV exports, SSE streams) are returned
 * as-is since they won't have the envelope structure. When a Content-Type is
 * provided and it is not application/json, the response is returned without
 * attempting envelope unwrapping.
 *
 * Requirements: 8.3, 8.4
 */
export function unwrapApiResponse<TResponse>(response: TResponse | null, contentType?: string): TResponse | null {
  if (response === null || response === undefined) return null;

  // If Content-Type is known and not JSON, skip envelope unwrapping entirely
  if (contentType && !contentType.includes('application/json')) {
    return response;
  }

  // Non-JSON responses (strings, buffers) pass through without unwrapping
  if (typeof response !== 'object' || Array.isArray(response)) {
    return response;
  }
  const obj = response as Record<string, unknown>;
  if ('success' in obj && 'data' in obj && obj.success === true) {
    return (obj.data ?? null) as TResponse | null;
  }
  // Error envelope or non-envelope object — return as-is
  return response;
}
