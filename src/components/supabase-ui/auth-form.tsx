/**
 * AuthForm Component - Supabase Auth UI wrapper with custom theming
 * Provides styled authentication forms using Supabase Auth UI
 * 
 * @requirements 8.3 - Supabase UI components for authentication
 */

import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase, getPasswordResetRedirectUrl } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type AuthView = 'sign_in' | 'sign_up' | 'forgotten_password' | 'update_password' | 'magic_link';

interface AuthFormProps {
  view?: AuthView;
  redirectTo?: string;
  onlyThirdPartyProviders?: boolean;
  providers?: ('google' | 'github' | 'facebook' | 'twitter' | 'apple' | 'azure' | 'discord')[];
  showLinks?: boolean;
  className?: string;
  appearance?: 'default' | 'minimal' | 'branded';
}

// Custom theme that matches the MIHAS design system
const customTheme = {
  default: {
    colors: {
      brand: 'hsl(221.2 83.2% 53.3%)', // primary color
      brandAccent: 'hsl(224.3 76.3% 48%)', // primary hover
      brandButtonText: 'white',
      defaultButtonBackground: 'hsl(210 40% 96.1%)', // secondary
      defaultButtonBackgroundHover: 'hsl(214.3 31.8% 91.4%)',
      defaultButtonBorder: 'hsl(214.3 31.8% 91.4%)',
      defaultButtonText: 'hsl(222.2 47.4% 11.2%)', // foreground
      dividerBackground: 'hsl(214.3 31.8% 91.4%)',
      inputBackground: 'white',
      inputBorder: 'hsl(214.3 31.8% 91.4%)',
      inputBorderHover: 'hsl(221.2 83.2% 53.3%)',
      inputBorderFocus: 'hsl(221.2 83.2% 53.3%)',
      inputText: 'hsl(222.2 47.4% 11.2%)',
      inputLabelText: 'hsl(215.4 16.3% 46.9%)',
      inputPlaceholder: 'hsl(215.4 16.3% 46.9%)',
      messageText: 'hsl(215.4 16.3% 46.9%)',
      messageTextDanger: 'hsl(0 84.2% 60.2%)', // destructive
      anchorTextColor: 'hsl(221.2 83.2% 53.3%)',
      anchorTextHoverColor: 'hsl(224.3 76.3% 48%)',
    },
    space: {
      spaceSmall: '4px',
      spaceMedium: '8px',
      spaceLarge: '16px',
      labelBottomMargin: '8px',
      anchorBottomMargin: '4px',
      emailInputSpacing: '4px',
      socialAuthSpacing: '4px',
      buttonPadding: '12px 16px',
      inputPadding: '12px 16px',
    },
    fontSizes: {
      baseBodySize: '14px',
      baseInputSize: '14px',
      baseLabelSize: '14px',
      baseButtonSize: '14px',
    },
    fonts: {
      bodyFontFamily: 'Inter, system-ui, sans-serif',
      buttonFontFamily: 'Inter, system-ui, sans-serif',
      inputFontFamily: 'Inter, system-ui, sans-serif',
      labelFontFamily: 'Inter, system-ui, sans-serif',
    },
    borderWidths: {
      buttonBorderWidth: '1px',
      inputBorderWidth: '1px',
    },
    radii: {
      borderRadiusButton: '8px',
      buttonBorderRadius: '8px',
      inputBorderRadius: '8px',
    },
  },
};

export function AuthForm({
  view = 'sign_in',
  redirectTo,
  onlyThirdPartyProviders = false,
  providers = [],
  showLinks = true,
  className,
  appearance = 'default',
}: AuthFormProps) {
  // Get the password reset redirect URL
  const passwordResetRedirect = getPasswordResetRedirectUrl();

  return (
    <div className={cn('w-full max-w-md', className)}>
      <Auth
        supabaseClient={supabase}
        view={view}
        appearance={{
          theme: ThemeSupa,
          variables: customTheme,
          className: {
            container: 'auth-container',
            button: cn(
              'auth-button',
              'transition-all duration-200',
              'hover:shadow-md',
              'focus:ring-2 focus:ring-primary focus:ring-offset-2'
            ),
            input: cn(
              'auth-input',
              'transition-all duration-200',
              'focus:ring-2 focus:ring-primary focus:ring-offset-2'
            ),
            label: 'auth-label font-medium',
            anchor: 'auth-anchor hover:underline',
            message: 'auth-message',
          },
          style: {
            button: {
              minHeight: '44px', // Touch target compliance
            },
            input: {
              minHeight: '44px', // Touch target compliance
            },
          },
        }}
        providers={providers}
        redirectTo={redirectTo}
        onlyThirdPartyProviders={onlyThirdPartyProviders}
        showLinks={showLinks}
        localization={{
          variables: {
            sign_in: {
              email_label: 'Email Address',
              password_label: 'Password',
              email_input_placeholder: 'Enter your email',
              password_input_placeholder: 'Enter your password',
              button_label: 'Sign In',
              loading_button_label: 'Signing in...',
              social_provider_text: 'Sign in with {{provider}}',
              link_text: "Don't have an account? Sign up",
            },
            sign_up: {
              email_label: 'Email Address',
              password_label: 'Password',
              email_input_placeholder: 'Enter your email',
              password_input_placeholder: 'Create a password',
              button_label: 'Create Account',
              loading_button_label: 'Creating account...',
              social_provider_text: 'Sign up with {{provider}}',
              link_text: 'Already have an account? Sign in',
              confirmation_text: 'Check your email for the confirmation link',
            },
            forgotten_password: {
              email_label: 'Email Address',
              email_input_placeholder: 'Enter your email',
              button_label: 'Send Reset Instructions',
              loading_button_label: 'Sending...',
              link_text: 'Remember your password? Sign in',
              confirmation_text: 'Check your email for the password reset link',
            },
            update_password: {
              password_label: 'New Password',
              password_input_placeholder: 'Enter your new password',
              button_label: 'Update Password',
              loading_button_label: 'Updating...',
              confirmation_text: 'Your password has been updated',
            },
          },
        }}
      />
    </div>
  );
}

// Simplified sign-in form
export function SignInForm({ 
  redirectTo,
  className,
}: Pick<AuthFormProps, 'redirectTo' | 'className'>) {
  return (
    <AuthForm 
      view="sign_in" 
      redirectTo={redirectTo}
      className={className}
    />
  );
}

// Simplified sign-up form
export function SignUpForm({ 
  redirectTo,
  className,
}: Pick<AuthFormProps, 'redirectTo' | 'className'>) {
  return (
    <AuthForm 
      view="sign_up" 
      redirectTo={redirectTo}
      className={className}
    />
  );
}

// Simplified forgot password form
export function ForgotPasswordForm({ 
  className,
}: Pick<AuthFormProps, 'className'>) {
  return (
    <AuthForm 
      view="forgotten_password" 
      className={className}
    />
  );
}

// Simplified update password form
export function UpdatePasswordForm({ 
  className,
}: Pick<AuthFormProps, 'className'>) {
  return (
    <AuthForm 
      view="update_password" 
      className={className}
    />
  );
}

export default AuthForm;
