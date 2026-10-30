/*
 * Admin session for the prototype. The session lives in localStorage; signing in
 * looks the login ID up in the operations database (lib/ops) so each demo account
 * carries its real role and locations. Unknown login IDs are created as system
 * administrators so the prototype can always be opened.
 * Replace `signIn`, `verifySession` and `signOut` with real API calls when a backend exists.
 */

import type { Role } from '@/lib/ops/types';
import { ROLE_LABELS } from '@/lib/ops/types';
import { commit, loadDB } from '@/lib/ops/store';

export const ADMIN_SESSION_KEY = 'gt_admin_session';
export const ADMIN_SESSION_EVENT = 'gt-admin-session-refresh';

export type AdminRole = Role;

/** One entry per sidebar module. Add a module here, in ROLE_PERMISSIONS, ADMIN_PERMISSION_ROUTES and the Sidebar. */
export type AdminPermission =
  | 'dashboard'
  | 'vessels'
  | 'containers'
  | 'gate'
  | 'transfers'
  | 'transport'
  | 'inventory'
  | 'warehouse'
  | 'tasks'
  | 'customers'
  | 'documents'
  | 'finance'
  | 'notifications'
  | 'reports'
  | 'audit'
  | 'sync'
  | 'network'
  | 'auth'
  | 'design';

export type AdminSession = {
  employeeId: string;
  username: string;
  name?: string;
  role?: AdminRole;
  permissions: AdminPermission[];
  canCreate: boolean;
  canDelete: boolean;
  loggedInAt: number;
};

const ALL_PERMISSIONS: AdminPermission[] = ['dashboard', 'vessels', 'containers', 'gate', 'transfers', 'transport', 'inventory', 'warehouse', 'tasks', 'customers', 'documents', 'finance', 'notifications', 'reports', 'audit', 'sync', 'network', 'auth', 'design'];

/** Which modules each role can open (SRS §3, mapped to Gulftainer's terminal, logistics and finance teams). */
export const ROLE_PERMISSIONS: Record<Role, AdminPermission[]> = {
  system_admin: ALL_PERMISSIONS,
  terminal_ops: ['dashboard', 'vessels', 'containers', 'gate', 'transfers', 'tasks', 'documents', 'notifications', 'reports', 'sync'],
  planner: ['dashboard', 'vessels', 'containers', 'tasks', 'documents', 'notifications', 'reports'],
  gate_officer: ['dashboard', 'gate', 'containers', 'transfers', 'tasks', 'notifications', 'sync'],
  customer_service: ['dashboard', 'vessels', 'containers', 'gate', 'customers', 'documents', 'finance', 'notifications', 'reports', 'sync'],
  warehouse_worker: ['dashboard', 'warehouse', 'inventory', 'tasks', 'notifications', 'sync'],
  warehouse_supervisor: ['dashboard', 'warehouse', 'inventory', 'transfers', 'transport', 'tasks', 'documents', 'notifications', 'reports'],
  inventory_manager: ['dashboard', 'inventory', 'warehouse', 'customers', 'documents', 'notifications', 'reports'],
  transport_manager: ['dashboard', 'transport', 'transfers', 'containers', 'warehouse', 'tasks', 'customers', 'documents', 'notifications', 'reports'],
  finance_manager: ['dashboard', 'finance', 'customers', 'containers', 'documents', 'notifications', 'reports'],
  auditor: ['dashboard', 'audit', 'containers', 'inventory', 'documents', 'finance', 'reports'],
};

export const ADMIN_PERMISSION_ROUTES: Record<AdminPermission, string> = {
  dashboard: '/admin/dashboard',
  vessels: '/admin/vessels',
  containers: '/admin/containers',
  gate: '/admin/gate',
  transfers: '/admin/transfers',
  transport: '/admin/transport',
  inventory: '/admin/inventory',
  warehouse: '/admin/warehouse',
  tasks: '/admin/tasks',
  customers: '/admin/customers',
  documents: '/admin/documents',
  finance: '/admin/finance',
  notifications: '/admin/notifications',
  reports: '/admin/reports',
  audit: '/admin/audit',
  sync: '/admin/sync',
  network: '/admin/network',
  auth: '/admin/auth',
  design: '/admin/design-system',
};

export function roleLabel(role?: Role) {
  return role ? ROLE_LABELS[role] : 'User';
}

export function saveAdminSession(session: AdminSession): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session)); } catch { /* Storage may be disabled. */ }
  window.dispatchEvent(new Event(ADMIN_SESSION_EVENT));
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AdminSession;
    return session && typeof session.username === 'string' && Array.isArray(session.permissions) ? session : null;
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* Storage may be disabled. */ }
  window.dispatchEvent(new Event(ADMIN_SESSION_EVENT));
}

export function hasAdminPermission(session: AdminSession | null, permission: AdminPermission): boolean {
  if (!session) return false;
  if (permission === 'auth' || permission === 'network') return session.role === 'system_admin';
  if (session.role === 'system_admin') return true;
  return session.permissions.includes(permission);
}

export function canAdminCreate(session: AdminSession | null): boolean {
  if (!session) return false;
  return session.role !== 'auditor';
}

export function canAdminDelete(session: AdminSession | null): boolean {
  if (!session) return false;
  return session.role === 'system_admin';
}

export function isViewOnlyAdmin(session: AdminSession | null): boolean {
  if (!session) return true;
  return session.role === 'auditor';
}

export function firstAdminRoute(session: AdminSession) {
  return Object.entries(ADMIN_PERMISSION_ROUTES)
    .find(([permission]) => hasAdminPermission(session, permission as AdminPermission))?.[1] || null;
}

/* ------------------------------------------------------------
   Prototype auth. Swap these three for fetch('/api/admin/...').
------------------------------------------------------------ */

const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

/** The single prototype account. It is prefilled on the login screen. */
export const PROTOTYPE_LOGIN = { username: 'operations', password: 'gulftainer2026' } as const;

/** Signs in the prototype account only; every other login ID or password is rejected. */
export async function signIn(username: string, password: string): Promise<AdminSession> {
  await delay(700);
  if (!username || !password) throw new Error('Enter your login ID and password.');
  const login = username.trim().toLowerCase().split('@')[0];
  if (login !== PROTOTYPE_LOGIN.username || password !== PROTOTYPE_LOGIN.password) throw new Error('Invalid login ID or password.');
  const db = loadDB();
  let employee = db.employees.find(entry => entry.username === login);
  if (!employee) {
    employee = commit(draft => {
      const created = { id: 'emp-operations', username: login, name: 'Operations Administrator', email: 'operations@gulftainer.com', role: 'system_admin' as const, orgId: 'org-gt', locationIds: [], active: true, createdAt: new Date().toISOString() };
      draft.employees.push(created);
      return created;
    });
  }
  const session: AdminSession = {
    employeeId: employee.id,
    username: employee.username,
    name: employee.name,
    role: employee.role,
    permissions: ROLE_PERMISSIONS[employee.role],
    canCreate: employee.role !== 'auditor',
    canDelete: employee.role === 'system_admin',
    loggedInAt: Date.now(),
  };
  saveAdminSession(session);
  return session;
}

/** Returns the stored session (refreshed from the employee record) or null when signed out. */
export async function verifySession(): Promise<AdminSession | null> {
  await delay(150);
  const session = getAdminSession();
  if (!session) return null;
  const employee = loadDB().employees.find(entry => entry.id === session.employeeId);
  if (!employee || !employee.active) { clearAdminSession(); return null; }
  const refreshed: AdminSession = { ...session, name: employee.name, role: employee.role, permissions: ROLE_PERMISSIONS[employee.role], canCreate: employee.role !== 'auditor', canDelete: employee.role === 'system_admin' };
  if (JSON.stringify(refreshed) !== JSON.stringify(session)) {
    try { window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(refreshed)); } catch { /* ignore */ }
  }
  return refreshed;
}

export async function signOut(): Promise<void> {
  await delay(300);
  clearAdminSession();
}
