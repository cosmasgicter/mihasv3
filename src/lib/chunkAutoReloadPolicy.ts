export interface ChunkReloadPolicyInput {
  now: number
  lastReloadAt: number
  reloadCount: number
  maxPerSession: number
  cooldownMs: number
  route: string
  lastActivityAt: number
  idleProtectedRoutePatterns?: RegExp[]
}

export interface ChunkReloadPolicyDecision {
  allow: boolean
  cause?:
    | 'session-limit'
    | 'cooldown-active'
    | 'idle-route-protection'
  context?: Record<string, unknown>
}

const DEFAULT_IDLE_PROTECTED_ROUTES = [
  /^\/$/,
  /^\/dashboard$/,
  /^\/student\/dashboard$/,
  /^\/admin\/dashboard$/,
] as const

export function evaluateChunkAutoReloadPolicy(input: ChunkReloadPolicyInput): ChunkReloadPolicyDecision {
  const {
    now,
    lastReloadAt,
    reloadCount,
    maxPerSession,
    cooldownMs,
    route,
    lastActivityAt,
    idleProtectedRoutePatterns = DEFAULT_IDLE_PROTECTED_ROUTES,
  } = input

  const sinceLastReloadMs = lastReloadAt > 0 ? now - lastReloadAt : Number.POSITIVE_INFINITY

  if (reloadCount >= maxPerSession) {
    return {
      allow: false,
      cause: 'session-limit',
      context: { reloadCount, maxPerSession },
    }
  }

  if (sinceLastReloadMs < cooldownMs) {
    return {
      allow: false,
      cause: 'cooldown-active',
      context: { sinceLastReloadMs, cooldownMs },
    }
  }

  const idleMs = now - lastActivityAt
  const isIdleProtectedRoute = idleProtectedRoutePatterns.some((pattern) => pattern.test(route))
  if (isIdleProtectedRoute && idleMs >= cooldownMs) {
    return {
      allow: false,
      cause: 'idle-route-protection',
      context: { idleMs, cooldownMs, route },
    }
  }

  return { allow: true }
}
