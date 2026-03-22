import type { Role } from "@prisma/client";

export const PERMISSIONS = {
  "read:dashboard": ["ADMIN", "EDITOR", "READER"],
  "read:invoices": ["ADMIN", "EDITOR", "READER"],
  "read:transactions": ["ADMIN", "EDITOR", "READER"],
  "read:reports": ["ADMIN", "EDITOR", "READER"],
  "read:notifications": ["ADMIN", "EDITOR", "READER"],
  "export:data": ["ADMIN", "EDITOR", "READER"],
  "resolve:reconciliation": ["ADMIN", "EDITOR"],
  "classify:transaction": ["ADMIN", "EDITOR"],
  "delete:invoice": ["ADMIN"],
  "delete:transaction": ["ADMIN"],
  "manage:integrations": ["ADMIN"],
  "manage:users": ["ADMIN"],
  "manage:settings": ["ADMIN"],
  "manage:rules": ["ADMIN"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Check whether a role has a specific permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return (allowedRoles as readonly string[]).includes(role);
}

/**
 * Assert that a role has a specific permission.
 * Throws an error if the role lacks the permission.
 */
export function checkPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(
      `Role "${role}" does not have permission "${permission}".`
    );
  }
}
