import { Role } from '@prisma/client';

export const Permission = {
  CREATE_PROJECT: 'CREATE_PROJECT',
  UPDATE_PROJECT: 'UPDATE_PROJECT',
  DELETE_PROJECT: 'DELETE_PROJECT',
  VIEW_PROJECT: 'VIEW_PROJECT',
  MAKE_CONTRIBUTION: 'MAKE_CONTRIBUTION',
  VIEW_CONTRIBUTION: 'VIEW_CONTRIBUTION',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_ROLES: 'MANAGE_ROLES',
  VIEW_SENSITIVE_DATA: 'VIEW_SENSITIVE_DATA',
  MANAGE_SYSTEM: 'MANAGE_SYSTEM',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const RolePermissions: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: [
    Permission.CREATE_PROJECT,
    Permission.UPDATE_PROJECT,
    Permission.DELETE_PROJECT,
    Permission.VIEW_PROJECT,
    Permission.MAKE_CONTRIBUTION,
    Permission.VIEW_CONTRIBUTION,
    Permission.MANAGE_USERS,
    Permission.MANAGE_ROLES,
    Permission.VIEW_SENSITIVE_DATA,
    Permission.MANAGE_SYSTEM,
  ],
  [Role.TENANT_ADMIN]: [
    Permission.CREATE_PROJECT,
    Permission.UPDATE_PROJECT,
    Permission.VIEW_PROJECT,
    Permission.MAKE_CONTRIBUTION,
    Permission.VIEW_CONTRIBUTION,
    Permission.MANAGE_USERS,
    Permission.VIEW_SENSITIVE_DATA,
  ],
  [Role.USER]: [
    Permission.CREATE_PROJECT,
    Permission.UPDATE_PROJECT,
    Permission.VIEW_PROJECT,
    Permission.MAKE_CONTRIBUTION,
    Permission.VIEW_CONTRIBUTION,
  ],
  [Role.VIEWER]: [
    Permission.VIEW_PROJECT,
    Permission.VIEW_CONTRIBUTION,
  ],
};
