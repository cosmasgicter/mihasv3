/**
 * Multipart upload transport (student-journey-repair task 3.6, design R2-a).
 *
 * `fetch` cannot observe request-body progress and the unified client gives it a
 * 30 s total timeout, which aborts a healthy but slow phone upload and resends the
 * whole file. This transport uses `XMLHttpRequest` so that:
 *
 * - there is no total timeout: only an inactivity timer, re-armed by every
 *   upload progress event, and a response timer once the body has been sent;
 * - byte progress is reported while the request body leaves the device;
 * - the same cookie-auth, CSRF and 401-refresh contracts as `apiClient.request`
 *   hold (the replay after a refresh is safe because the caller sends an
 *   `Idempotency-Key`).
 *
 * Callers reach it only through `apiClient.upload`, so `apiClient` stays the one
 * API surface.
 *
 * @module uploadTransport
 */
import { getCsrfToken, setCsrfToken } from '@/lib/csrfToken';
import { shouldDispatchAuthFailure } from '@/lib/sessionHardening';

import { API_BASE, unwrapApiResponse } from './httpClient';
import { AuthenticationError, attemptRefresh, getOnAuthFailure, isAuthExcludedEndpoint } from './authInterceptor';
import { refreshCsrfToken } from './csrf';

/** No bytes left the device for this long: the connection is stalled. */
export const UPLOAD_INACTIVITY_TIMEOUT_MS = 30_000;
/** The body is sent; the server has this long to answer. */
export const UPLOAD_RESPONSE_TIMEOUT_MS = 60_000;

const MAX_RETRY_AFTER_SECONDS = 3600;
const CSRF_CODES = new Set(['CSRF_INVALID', 'CSRF_MISSING', 'CSRF_VALIDATION_FAILED']);

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface SendMultipartOptions {
  /** Endpoint already normalised with `toApiV1Path`. */
  endpoint: string;
  formData: FormData;
  idempotencyKey: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * A failed upload. `code` is either a server stable code or one of the
 * frontend-only transport codes `UPLOAD_STALLED`, `NETWORK_ERROR`, `ABORTED`.
 */
export class UploadTransportError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;
  readonly data?: Record<string, unknown>;

  constructor(
    message: string,
    init: {
      status: number | null;
      code: string;
      retryable: boolean;
      retryAfterSeconds?: number | null;
      data?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = 'UploadTransportError';
    this.status = init.status;
    this.code = init.code;
    this.retryable = init.retryable;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.data = init.data;
  }
}

interface RawResponse {
  status: number;
  body: Record<string, unknown> | null;
  retryAfterHeader: string | null;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds)) return null;
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(0, seconds));
}

/** One XHR round trip. Resolves with the response or rejects with a transport error. */
function sendOnce(options: SendMultipartOptions): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    const { endpoint, formData, idempotencyKey, onProgress, signal } = options;

    if (signal?.aborted) {
      reject(new UploadTransportError('The upload was cancelled.', { status: null, code: 'ABORTED', retryable: false }));
      return;
    }

    const xhr = new XMLHttpRequest();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stalled = false;
    let settled = false;

    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const arm = (ms: number) => {
      clearTimer();
      timer = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, ms);
    };
    const onSignalAbort = () => xhr.abort();
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimer();
      signal?.removeEventListener('abort', onSignalAbort);
      action();
    };

    xhr.open('POST', `${API_BASE}${endpoint}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Idempotency-Key', idempotencyKey);
    const csrfToken = getCsrfToken();
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);

    xhr.upload.addEventListener('progress', (event) => {
      arm(UPLOAD_INACTIVITY_TIMEOUT_MS);
      const progress = event as ProgressEvent;
      if (progress.lengthComputable && progress.total > 0) {
        onProgress?.({ loaded: progress.loaded, total: progress.total });
      }
    });
    xhr.upload.addEventListener('load', () => arm(UPLOAD_RESPONSE_TIMEOUT_MS));

    xhr.addEventListener('load', () => {
      finish(() => {
        let body: Record<string, unknown> | null = null;
        try {
          const parsed: unknown = JSON.parse(xhr.responseText || 'null');
          body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
        } catch {
          body = null;
        }
        const responseCsrf = xhr.getResponseHeader('X-CSRF-Token');
        if (responseCsrf) setCsrfToken(responseCsrf);
        resolve({ status: xhr.status, body, retryAfterHeader: xhr.getResponseHeader('Retry-After') });
      });
    });
    xhr.addEventListener('error', () => {
      finish(() =>
        reject(
          new UploadTransportError('We could not reach the server. Check your connection and try again.', {
            status: null,
            code: 'NETWORK_ERROR',
            retryable: true,
          }),
        ),
      );
    });
    xhr.addEventListener('abort', () => {
      finish(() =>
        reject(
          stalled
            ? new UploadTransportError('The upload stopped. Check your connection and try again.', {
                status: null,
                code: 'UPLOAD_STALLED',
                retryable: true,
              })
            : new UploadTransportError('The upload was cancelled.', { status: null, code: 'ABORTED', retryable: false }),
        ),
      );
    });

    signal?.addEventListener('abort', onSignalAbort, { once: true });
    arm(UPLOAD_INACTIVITY_TIMEOUT_MS);
    xhr.send(formData);
  });
}

function toFailure(response: RawResponse): UploadTransportError {
  const body = response.body ?? {};
  const code = typeof body.code === 'string' ? body.code : 'UPLOAD_FAILED';
  const message =
    (typeof body.error === 'string' && body.error) ||
    (typeof body.message === 'string' && body.message) ||
    'Upload failed. Please try again.';
  const retryAfterSeconds = parseRetryAfter(response.retryAfterHeader);

  if (response.status === 429) {
    return new UploadTransportError(message, {
      status: 429,
      code: 'RATE_LIMITED',
      retryable: false,
      retryAfterSeconds,
      data: body,
    });
  }
  const retryable =
    response.status >= 500 ||
    (response.status === 409 && code === 'DOCUMENT_UPLOAD_IN_PROGRESS') ||
    body.retryable === true;
  return new UploadTransportError(message, { status: response.status, code, retryable, retryAfterSeconds, data: body });
}

/**
 * POST a multipart body and resolve with the envelope's `data`.
 *
 * Recovery, each at most once: a 401 on a non-auth endpoint is refreshed and the
 * same request (same key) resent; a CSRF-coded 403 re-reads the token through
 * `?refresh_csrf=1` and resends. Everything else is reported to the caller, which
 * owns the one automatic retry.
 */
export async function sendMultipart<TResponse = unknown>(
  options: SendMultipartOptions,
): Promise<TResponse | null> {
  let refreshedSession = false;
  let refreshedCsrf = false;

  for (;;) {
    const response = await sendOnce(options);

    if (response.status >= 200 && response.status < 300) {
      return unwrapApiResponse<TResponse>(response.body as TResponse | null, 'application/json');
    }

    if (response.status === 401 && !isAuthExcludedEndpoint(options.endpoint)) {
      if (!refreshedSession && (await attemptRefresh())) {
        refreshedSession = true;
        continue;
      }
      const authFailure = getOnAuthFailure();
      if (authFailure && shouldDispatchAuthFailure()) authFailure();
      throw new AuthenticationError();
    }

    const code = typeof response.body?.code === 'string' ? response.body.code : '';
    if (response.status === 403 && CSRF_CODES.has(code) && !refreshedCsrf) {
      refreshedCsrf = true;
      try {
        await refreshCsrfToken(options.signal);
      } catch {
        throw toFailure(response);
      }
      continue;
    }

    throw toFailure(response);
  }
}
