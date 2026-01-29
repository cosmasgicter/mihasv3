/**
 * Supabase UI Components Index
 * Re-exports all Supabase UI wrapper components
 * 
 * @requirements 8.3 - Supabase UI components for auth
 */

// Authentication forms
export { 
  AuthForm,
  SignInForm,
  SignUpForm,
  ForgotPasswordForm,
  UpdatePasswordForm,
} from './auth-form';

// Note: Realtime components removed in Vercel migration
// Use useAdminDashboardPolling and useStudentDashboardPolling hooks instead
