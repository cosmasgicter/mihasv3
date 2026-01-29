import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Vercel Edge Middleware
 * Applies security headers to API routes
 */

// Security headers for API responses
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function middleware(request: NextRequest) {
  // Only apply to API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const response = NextResponse.next();

    // Add security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
