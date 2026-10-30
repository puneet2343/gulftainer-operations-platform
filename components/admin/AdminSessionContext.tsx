'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { hasAdminPermission, canAdminCreate, canAdminDelete, type AdminSession, type AdminPermission } from '@/lib/admin-session';

export const AdminSessionContext = createContext<AdminSession | null>(null);
export function useAdminSession() { return useContext(AdminSessionContext); }

/** Renders its children only when the signed-in admin has the module (and, optionally, the action). */
export function AdminAccess({ permission, action = 'read', children }: {
  permission: AdminPermission; action?: 'read' | 'write' | 'delete'; children: ReactNode;
}) {
  const user = useAdminSession();
  if (!hasAdminPermission(user, permission)) return null;
  if (action === 'write' && !canAdminCreate(user) || action === 'delete' && !canAdminDelete(user)) return null;
  return children;
}
