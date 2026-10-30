'use client';

import { useDialog } from '@/lib/use-dialog';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';

import { useAdminSession } from './AdminSessionContext';
import { BRAND } from '@/lib/brand';
import { firstAdminRoute, hasAdminPermission, roleLabel, signOut, type AdminPermission } from '@/lib/admin-session';
import { useOpsDB } from '@/lib/ops/store';
import { notificationsFor } from '@/lib/ops/ops';

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

type NavChild = { name: string; href: string; permission: AdminPermission; icon: string };

/**
 * Sidebar modules. Icons are 24x24 stroke paths (Heroicons outline style), drawn at 18px.
 * A module with `children` renders as a collapsible group that opens the first child the admin may use.
 */
const ALL_NAV_ITEMS: {
  name: string;
  href: string;
  permission: AdminPermission;
  children?: NavChild[];
  icon: string;
}[] = [
  {
    name: 'Dashboard',
    href: '/admin/dashboard',
    permission: 'dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001 1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    name: 'Terminal',
    href: '/admin/vessels',
    permission: 'vessels',
    icon: 'M3 17l1.5 3h15L21 17M4 17l-1-4 9-3 9 3-1 4M6 13V9h12v4M10 9V5h4v4',
    children: [
      { name: 'Vessel calls', href: '/admin/vessels', permission: 'vessels', icon: 'M3 17l1.5 3h15L21 17M4 17l-1-4 9-3 9 3-1 4M6 13V9h12v4M10 9V5h4v4' },
      { name: 'Containers', href: '/admin/containers', permission: 'containers', icon: 'M4 7h16v10H4zM4 7l2-3h12l2 3M8 7v10M12 7v10M16 7v10' },
      { name: 'Gate and e-tokens', href: '/admin/gate', permission: 'gate', icon: 'M4 21V5a1 1 0 011-1h3v17M16 21V4h3a1 1 0 011 1v16M8 9h8M8 13h8M8 17h8' },
      { name: 'Inland transfers', href: '/admin/transfers', permission: 'transfers', icon: 'M3 16V8a1 1 0 011-1h10v9M14 10h4l3 3v3h-7M5 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z' },
    ],
  },
  {
    name: 'Logistics',
    href: '/admin/transport',
    permission: 'transport',
    icon: 'M4 6L2 7M10 6h4M22 7l-2-1M6 3h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2zM4 11h16M8 15h.01M16 15h.01M6 19v2M18 21v-2',
    children: [
      { name: 'Transport jobs', href: '/admin/transport', permission: 'transport', icon: 'M3 16V8a1 1 0 011-1h10v9M14 10h4l3 3v3h-7M5 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z' },
      { name: 'Warehouse orders', href: '/admin/warehouse', permission: 'warehouse', icon: 'M3 21V9l9-5 9 5v12M9 21v-6h6v6M3 13h18' },
      { name: 'Inventory', href: '/admin/inventory', permission: 'inventory', icon: 'M4 7h7v5H4zM13 7h7v5h-7zM4 14h7v5H4zM13 14h7v5h-7z' },
      { name: 'Tasks', href: '/admin/tasks', permission: 'tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    ],
  },
  {
    name: 'Customers',
    href: '/admin/customers',
    permission: 'customers',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    children: [
      { name: 'Customers and parties', href: '/admin/customers', permission: 'customers', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      { name: 'Documents', href: '/admin/documents', permission: 'documents', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    ],
  },
  {
    name: 'Finance',
    href: '/admin/finance',
    permission: 'finance',
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    name: 'Control',
    href: '/admin/notifications',
    permission: 'notifications',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    children: [
      { name: 'Notifications', href: '/admin/notifications', permission: 'notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
      { name: 'Reports', href: '/admin/reports', permission: 'reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { name: 'Audit log', href: '/admin/audit', permission: 'audit', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
      { name: 'Sync and integrations', href: '/admin/sync', permission: 'sync', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
    ],
  },
  {
    name: 'Administration',
    href: '/admin/network',
    permission: 'network',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
    children: [
      { name: 'Network and locations', href: '/admin/network', permission: 'network', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { name: 'Users and roles', href: '/admin/auth', permission: 'auth', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
      { name: 'Design system', href: '/admin/design-system', permission: 'design', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
    ],
  },
];

function formatUsername(username: string) {
  if (!username) return '';
  return username.charAt(0).toUpperCase() + username.slice(1);
}

function getInitials(username: string) {
  if (!username) return '';
  return username.slice(0, 2).toUpperCase();
}

export default function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useAdminSession();
  const db = useOpsDB();
  const unread = useMemo(() => {
    if (!db || !currentUser) return 0;
    const actor = db.employees.find(employee => employee.id === currentUser.employeeId);
    if (!actor) return 0;
    return notificationsFor(db, actor).filter(notification => !notification.readBy.includes(actor.id)).length;
  }, [db, currentUser]);
  const [logoutError, setLogoutError] = useState('');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const displayName = useMemo(() => {
    if (!currentUser) return '';
    return currentUser.name || formatUsername(currentUser.username);
  }, [currentUser]);

  const initials = useMemo(() => {
    if (!currentUser) return '';
    return getInitials(currentUser.name || currentUser.username);
  }, [currentUser]);

  const visibleNavItems = useMemo(() => {
    if (!currentUser) return [];
    return ALL_NAV_ITEMS.flatMap((item) => {
      if (!item.children) return hasAdminPermission(currentUser, item.permission) ? [item] : [];
      const children = item.children.filter((child) => hasAdminPermission(currentUser, child.permission));
      return children.length ? [{ ...item, href: children[0].href, children }] : [];
    });
  }, [currentUser]);

  function isActiveRoute(href: string) {
    if (href === '/admin/dashboard') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function handleNavigation() {
    onNavigate?.();
  }

  const logoutDialog = useDialog(showLogoutModal, () => { if (!loggingOut) setShowLogoutModal(false); }, 'Log out');

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await signOut();
      setShowLogoutModal(false);
      onNavigate?.();
      router.replace('/admin/login');
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to sign out. Please retry.');
    } finally { setLoggingOut(false); }
  }

  return (
    <>
      <aside className={`flex h-full min-h-0 w-full flex-col bg-white ${mobile ? '' : 'sticky top-0 h-screen'}`}>
        {/* ===================================================== BRAND */}
        <div className={`shrink-0 px-4 pb-4 ${mobile ? 'pt-4 pr-14' : 'pt-5 lg:px-5 lg:pt-6'}`}>
          <Link
            href={currentUser ? firstAdminRoute(currentUser) || '/admin/login' : '/admin/login'}
            onClick={handleNavigation}
            className="group flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-200 hover:bg-gray-50 active:scale-[0.99]"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.05] transition-colors group-hover:border-primary/25 group-hover:bg-primary/[0.08]">
              <Image src={BRAND.mark} alt={BRAND.shortName} width={28} height={28} priority className="h-7 w-7 object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-[14px] font-bold tracking-[-0.02em] text-secondary">{BRAND.product}</p>
            </div>
          </Link>
        </div>

        <div className="mx-4 h-px shrink-0 bg-gray-100 lg:mx-5" />

        {/* ===================================================== NAVIGATION */}
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-width:thin] lg:px-4 lg:py-5">
          <div className="space-y-1 lg:space-y-1.5">
            {visibleNavItems.map((item) => {
              if (item.children) {
                return (
                  <NavGroup key={item.name} name={item.name} icon={item.icon} items={item.children} pathname={pathname} onNavigate={handleNavigation} badges={{ '/admin/notifications': unread }} />
                );
              }

              const active = isActiveRoute(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={handleNavigation}
                  className={`group relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all duration-200 lg:gap-3 lg:px-3.5 lg:py-3 lg:text-sm ${
                    active ? 'bg-primary/[0.07] text-primary' : 'text-gray-500 hover:bg-gray-50 hover:text-secondary'
                  }`}
                >
                  {/* ACTIVE LINE */}
                  <span className={`absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-primary transition-all duration-200 ${active ? 'scale-y-100 opacity-100' : 'scale-y-50 opacity-0'}`} />

                  {/* ICON */}
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${active ? 'text-primary' : 'text-gray-400 group-hover:text-secondary'}`}>
                    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                  </span>

                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                </Link>
              );
            })}

            {/* The public site, kept open beside the admin panel */}
            <a
              href="/e-services"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleNavigation}
              className="group relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-[14px] font-medium text-gray-500 transition-all duration-200 hover:bg-gray-50 hover:text-secondary lg:gap-3 lg:px-3.5 lg:py-3 lg:text-sm"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors duration-200 group-hover:text-secondary">
                <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 truncate">Open Application</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </nav>

        {/* ===================================================== USER + LOGOUT */}
        <div className="shrink-0 border-t border-gray-100 bg-white p-3 lg:p-4">
          {currentUser && (
            <div className="mb-2.5 flex min-w-0 items-center gap-3 rounded-xl bg-gray-50 p-2.5 lg:mb-3 lg:p-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-white lg:h-10 lg:w-10 lg:text-sm">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-secondary lg:text-sm">{displayName}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium text-gray-400">@{currentUser.username}</span>
                  <span className="min-w-0 truncate rounded bg-primary/10 px-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                    {roleLabel(currentUser.role)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className="group flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-medium text-gray-500 transition-colors duration-200 hover:bg-red-50 hover:text-red-600 lg:gap-3 lg:text-sm"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg">
              <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </span>
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* ===================================================== LOGOUT MODAL */}
      <AnimatePresence>
        {showLogoutModal && (
          <motion.div {...logoutDialog}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !loggingOut) setShowLogoutModal(false);
            }}
            className="fixed inset-0 z-[200] flex items-end justify-center bg-secondary/25 px-3 pb-3 backdrop-blur-[4px] sm:items-center sm:px-4 sm:pb-0"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="w-full max-w-[370px] rounded-[20px] border border-gray-200 bg-white p-5 shadow-[0_22px_70px_rgba(15,23,41,0.18)] sm:p-6"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-500">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>

              <h2 className="mt-4 font-heading text-lg font-bold text-secondary">Log out?</h2>
              <p className="mt-1.5 text-sm leading-6 text-gray-500">
                Are you sure you want to log out{displayName ? ` ${displayName}?` : '?'}
              </p>

              {logoutError && <p role="alert" className="mt-3 text-sm text-red-600">{logoutError}</p>}

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={() => setShowLogoutModal(false)}
                  className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-secondary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loggingOut ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span className="hidden min-[360px]:inline">Logging out</span>
                    </>
                  ) : 'Log out'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Sidebar group with sub-buttons. Opens by itself on its own pages; the chevron folds it away. */
function NavGroup({ name, icon, items, pathname, onNavigate, badges = {} }: {
  name: string;
  icon: string;
  items: NavChild[];
  pathname: string;
  onNavigate: () => void;
  badges?: Record<string, number>;
}) {
  const groupActive = items.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? groupActive;
  const listId = `nav-group-${name.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setToggled(!open)}
        className={`group relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium transition-all duration-200 lg:gap-3 lg:px-3.5 lg:py-3 lg:text-sm ${groupActive ? 'text-secondary' : 'text-gray-500 hover:bg-gray-50 hover:text-secondary'}`}
      >
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${groupActive ? 'text-primary' : 'text-gray-400 group-hover:text-secondary'}`}>
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          {/* The guide line sits under the centre of the group icon. */}
          <ul id={listId} className="ml-[27px] mt-0.5 space-y-0.5 border-l border-gray-200 py-0.5 pl-2.5 lg:ml-[29px]">
            {items.map((child) => {
              const active = pathname === child.href || pathname.startsWith(`${child.href}/`);
              return (
                <li key={child.href} className="relative">
                  {active && <span aria-hidden="true" className="absolute -left-[11.5px] bottom-1.5 top-1.5 w-[2px] rounded-full bg-primary" />}
                  <Link
                    href={child.href}
                    onClick={onNavigate}
                    tabIndex={open ? undefined : -1}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors duration-200 lg:text-[13.5px] ${active ? 'bg-primary/[0.07] font-semibold text-primary' : 'font-medium text-gray-500 hover:bg-gray-50 hover:text-secondary'}`}
                  >
                    <svg
                      className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-gray-400 group-hover:text-secondary'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={child.icon} />
                    </svg>
                    <span className="min-w-0 flex-1 truncate">{child.name}</span>
                    {badges[child.href] ? <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">{badges[child.href]}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
