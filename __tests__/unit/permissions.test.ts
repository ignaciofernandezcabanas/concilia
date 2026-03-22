import { describe, it, expect } from 'vitest';
import { hasPermission, checkPermission, PERMISSIONS, type Permission } from '@/lib/auth/permissions';

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

describe('hasPermission', () => {
  describe('ADMIN', () => {
    it('tiene los 14 permisos', () => {
      for (const perm of ALL_PERMISSIONS) {
        expect(hasPermission('ADMIN', perm)).toBe(true);
      }
    });
  });

  describe('EDITOR', () => {
    const canDo: Permission[] = [
      'read:dashboard', 'read:invoices', 'read:transactions', 'read:reports', 'read:notifications',
      'export:data', 'resolve:reconciliation', 'classify:transaction',
    ];
    const cantDo: Permission[] = [
      'delete:invoice', 'delete:transaction',
      'manage:integrations', 'manage:users', 'manage:settings', 'manage:rules',
    ];

    it.each(canDo)('puede %s', (perm) => {
      expect(hasPermission('EDITOR', perm)).toBe(true);
    });

    it.each(cantDo)('NO puede %s', (perm) => {
      expect(hasPermission('EDITOR', perm)).toBe(false);
    });
  });

  describe('READER', () => {
    const canDo: Permission[] = [
      'read:dashboard', 'read:invoices', 'read:transactions', 'read:reports', 'read:notifications',
      'export:data',
    ];
    const cantDo: Permission[] = [
      'resolve:reconciliation', 'classify:transaction',
      'delete:invoice', 'delete:transaction',
      'manage:integrations', 'manage:users', 'manage:settings', 'manage:rules',
    ];

    it.each(canDo)('puede %s', (perm) => {
      expect(hasPermission('READER', perm)).toBe(true);
    });

    it.each(cantDo)('NO puede %s', (perm) => {
      expect(hasPermission('READER', perm)).toBe(false);
    });
  });
});

describe('checkPermission', () => {
  it('no lanza error si el rol tiene el permiso', () => {
    expect(() => checkPermission('ADMIN', 'manage:users')).not.toThrow();
  });

  it('lanza error si el rol no tiene el permiso', () => {
    expect(() => checkPermission('READER', 'manage:users')).toThrow(/does not have permission/);
  });
});
