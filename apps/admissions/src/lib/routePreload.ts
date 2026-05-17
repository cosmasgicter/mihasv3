type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions
  ) => number
  cancelIdleCallback?: (handle: number) => void
}

type NetworkInformationLike = {
  effectiveType?: string
  saveData?: boolean
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike
  mozConnection?: NetworkInformationLike
  webkitConnection?: NetworkInformationLike
}

let authRoutesPreload: Promise<void> | null = null
let studentWorkspacePreload: Promise<void> | null = null
let adminWorkspacePreload: Promise<void> | null = null

function getConnection() {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as NavigatorWithConnection
  return nav.connection || nav.mozConnection || nav.webkitConnection || null
}

function canPreloadLikelyNextRoutes() {
  if (typeof window === 'undefined') return false

  const connection = getConnection()
  if (!connection) return true
  if (connection.saveData) return false
  return !['slow-2g', '2g'].includes(connection.effectiveType || '')
}

export function preloadAuthRoutes(reason = 'interaction'): Promise<void> {
  void reason

  if (!canPreloadLikelyNextRoutes()) {
    return Promise.resolve()
  }

  authRoutesPreload ??= Promise.allSettled([
    import('@/components/AuthenticatedRouteShell'),
    import('@/components/auth/AuthShell'),
    import('@/pages/auth/SignInPage'),
    import('@/pages/auth/SignUpPage'),
  ]).then(() => undefined)

  return authRoutesPreload
}

export function preloadStudentWorkspaceRoute(reason = 'post-auth'): Promise<void> {
  void reason

  if (!canPreloadLikelyNextRoutes()) {
    return Promise.resolve()
  }

  studentWorkspacePreload ??= Promise.allSettled([
    import('@/components/navigation/AppLayout'),
    import('@/pages/student/Dashboard'),
  ]).then(() => undefined)

  return studentWorkspacePreload
}

export function preloadAdminWorkspaceRoute(reason = 'post-auth'): Promise<void> {
  void reason

  if (!canPreloadLikelyNextRoutes()) {
    return Promise.resolve()
  }

  adminWorkspacePreload ??= Promise.allSettled([
    import('@/components/navigation/AppLayout'),
    import('@/pages/admin/Dashboard'),
  ]).then(() => undefined)

  return adminWorkspacePreload
}

export function preloadPostAuthWorkspace(isAdmin = false): Promise<void> {
  return isAdmin ? preloadAdminWorkspaceRoute() : preloadStudentWorkspaceRoute()
}

export function scheduleLikelyAuthRoutePreload(delayMs = 900): () => void {
  if (typeof window === 'undefined' || !canPreloadLikelyNextRoutes()) {
    return () => {}
  }

  const idleWindow = window as IdleWindow
  let idleHandle: number | null = null

  const timeoutHandle = window.setTimeout(() => {
    const run = () => {
      void preloadAuthRoutes('landing-idle')
    }

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(run, { timeout: 2500 })
      return
    }

    idleHandle = window.setTimeout(run, 300)
  }, delayMs)

  return () => {
    window.clearTimeout(timeoutHandle)
    if (idleHandle === null) return

    if (idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(idleHandle)
      return
    }

    window.clearTimeout(idleHandle)
  }
}
