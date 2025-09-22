// Security Headers Configuration - DISABLED FOR LOCAL DEVELOPMENT
export const SECURITY_HEADERS = {
  CSP: "",
  HSTS: "",
  REFERRER_POLICY: "",
  X_CONTENT_TYPE_OPTIONS: "",
  X_FRAME_OPTIONS: "",
  PERMISSIONS_POLICY: ""
};

// Apply security headers for client-side enforcement - DISABLED FOR LOCAL DEVELOPMENT
export const applyClientSecurityHeaders = () => {
  // Security headers disabled for local development
  console.log('Security headers disabled for local development');
};