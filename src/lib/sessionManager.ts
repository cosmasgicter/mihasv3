// Simplified session manager - let Supabase handle session management automatically
export class SessionManager {
  private static instance: SessionManager

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  // Simplified - no initialization needed
  async initializeSession() {
    return true
  }

  // Simplified cleanup
  cleanup() {
    // No cleanup needed
  }
}

export const sessionManager = SessionManager.getInstance()