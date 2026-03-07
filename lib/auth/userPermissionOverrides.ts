import { query } from '../db'
import { getPermissionsForRole, ROLE_PERMISSIONS, type Permission, type UserRole } from './permissions'

export type PermissionSource = 'role' | 'override'

function toDatabaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }

  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

export function isPermissionOverrideTableMissing(error: unknown): boolean {
  return toDatabaseErrorCode(error) === '42P01'
}

export function getAllKnownPermissions(): Permission[] {
  const permissions = new Set<Permission>()

  for (const rolePermissions of Object.values(ROLE_PERMISSIONS)) {
    for (const permission of rolePermissions) {
      permissions.add(permission)
    }
  }

  return Array.from(permissions).sort()
}

const KNOWN_PERMISSION_SET = new Set(getAllKnownPermissions())

export function validatePermissionList(permissions: string[]): {
  normalized: Permission[]
  invalid: string[]
} {
  const invalid = new Set<string>()
  const normalized = new Set<Permission>()

  for (const rawPermission of permissions) {
    const permission = rawPermission.trim()
    if (!permission) {
      continue
    }

    if (!KNOWN_PERMISSION_SET.has(permission)) {
      invalid.add(permission)
      continue
    }

    normalized.add(permission)
  }

  return {
    normalized: Array.from(normalized).sort(),
    invalid: Array.from(invalid).sort(),
  }
}

export async function getPermissionOverrideForUser(userId: string): Promise<Permission[] | null> {
  try {
    const result = await query<{ permissions: string[] | null }>(
      'SELECT permissions FROM user_permission_overrides WHERE user_id = $1 LIMIT 1',
      [userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return validatePermissionList(result.rows[0].permissions || []).normalized
  } catch (error) {
    if (isPermissionOverrideTableMissing(error)) {
      return null
    }

    throw error
  }
}

export async function getEffectivePermissionsForUser(userId: string, role: UserRole): Promise<{
  permissions: Permission[]
  source: PermissionSource
}> {
  const overridePermissions = await getPermissionOverrideForUser(userId)

  if (overridePermissions !== null) {
    return {
      permissions: overridePermissions,
      source: 'override',
    }
  }

  return {
    permissions: getPermissionsForRole(role),
    source: 'role',
  }
}
