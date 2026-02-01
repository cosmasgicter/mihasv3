/**
 * Supabase UI Components Index
 * 
 * NOTE: Auth components have been removed.
 * Authentication is now handled by custom JWT auth via /api/auth endpoints.
 * 
 * Supabase client is retained ONLY for:
 * - Supabase Storage (file uploads)
 * - Direct database queries
 * 
 * For authentication, use:
 * - src/contexts/AuthContext.tsx
 * - src/hooks/auth/useSessionListener.ts
 * - src/lib/api/authApi.ts
 */

// No exports - auth components removed
// Realtime components removed in Vercel migration
// Use useAdminDashboardPolling and useStudentDashboardPolling hooks instead
