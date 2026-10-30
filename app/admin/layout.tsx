'use client';

/*
 * Admin shell: fixed 248px white sidebar from lg up, a 64px blurred header with a
 * drawer on phones and tablets, and a soft-grey canvas for the page content.
 * Session handling is the prototype's localStorage session (lib/admin-session.ts).
 */

import type { ReactNode } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import Sidebar from '@/components/admin/Sidebar';
import { AdminSessionContext } from '@/components/admin/AdminSessionContext';
import { ToastProvider } from '@/components/ui/Toast';
import OpsRuntime from '@/components/admin/OpsRuntime';
import { useDialog } from '@/lib/use-dialog';
import { BRAND } from '@/lib/brand';
import {
  ADMIN_PERMISSION_ROUTES,
  ADMIN_SESSION_EVENT,
  clearAdminSession,
  firstAdminRoute,
  canAdminCreate,
  hasAdminPermission,
  verifySession,
  type AdminSession,
  type AdminPermission,
} from '@/lib/admin-session';

function getRequiredPermissionForPath(path: string): AdminPermission | null {
  if (path === '/admin/dashboard') return 'dashboard';
  const match = (Object.entries(ADMIN_PERMISSION_ROUTES) as [AdminPermission, string][])
    .filter(([permission]) => permission !== 'dashboard')
    .find(([, route]) => path === route || path.startsWith(`${route}/`));
  return match ? match[0] : null;
}

/* ============================================================
   LAYOUT
============================================================ */

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [verified, setVerified] = useState<{ path: string; user: AdminSession | null; error: string } | null>(null);
  const [retry, setRetry] = useState(0);
  // Keep the verified session across navigation; the effect below re-checks it in the background.
  const currentUser = verified?.user ?? null;
  const authChecked = !!currentUser;

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const navigationDialog = useDialog(mobileSidebarOpen, () => setMobileSidebarOpen(false), 'Admin navigation');

  /* ========================================================== AUTH & PERMISSION CHECK */

  useEffect(() => {
    if (pathname === '/admin' || pathname === '/admin/login') return;
    let stopped = false;
    async function checkSession() {
      try {
        const user = await verifySession();
        if (stopped) return;
        if (!user) {
          clearAdminSession();
          setVerified({ path: pathname, user: null, error: '' });
          router.replace('/admin/login');
          return;
        }
        const permission = getRequiredPermissionForPath(pathname);
        if (permission && !hasAdminPermission(user, permission)) {
          const route = firstAdminRoute(user);
          if (route) { router.replace(route); return; }
        }
        setVerified({ path: pathname, user, error: '' });
      } catch (error) {
        if (!stopped) setVerified({ path: pathname, user: null,
          error: error instanceof Error ? error.message : 'Unable to check your session. Please retry.' });
      }
    }
    const refresh = () => { if (!document.hidden) void checkSession(); };
    void checkSession();
    const interval = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener(ADMIN_SESSION_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      stopped = true; window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener(ADMIN_SESSION_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [pathname, router, retry]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMobileSidebarOpen(false);
      if (pathname === '/admin' || pathname === '/admin/login') setVerified(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  /* ========================================================== LOCK BODY */

  useEffect(() => {
    if (!mobileSidebarOpen) { document.body.style.overflow = ''; return; }
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [mobileSidebarOpen]);

  /* ========================================================== CLOSE DRAWER WHEN DESKTOP IS REACHED */

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    function handleChange(event: MediaQueryListEvent) { if (event.matches) setMobileSidebarOpen(false); }
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  /* ========================================================== LOGIN */

  if (pathname === '/admin' || pathname === '/admin/login') {
    return children;
  }

  /* ========================================================== AUTH LOADER */

  const requiredPermission = getRequiredPermissionForPath(pathname);
  const moduleDenied = currentUser && requiredPermission && !hasAdminPermission(currentUser, requiredPermission);
  const writePage = pathname.endsWith('/new') || pathname.endsWith('/edit');
  const actionDenied = currentUser && writePage && !canAdminCreate(currentUser);
  if (verified?.path === pathname && verified.error || moduleDenied || actionDenied) {
    return <div className="grid min-h-dvh place-items-center bg-gray-50 p-6">
      <div className="max-w-md text-center">
        <p role="alert">{verified?.error || (actionDenied ? 'You have view-only access to this module.' : 'No admin modules are assigned to this account. Contact your administrator.')}</p>
        {verified?.error && <button className="btn btn-primary mt-4" onClick={() => setRetry(value => value + 1)}>Retry session check</button>}
        <button className="btn btn-secondary mt-4" onClick={() => router.push(actionDenied ? '/admin/dashboard' : '/admin/login')}>{actionDenied ? 'Back to dashboard' : 'Go to login'}</button>
      </div>
    </div>;
  }

  if (!authChecked) {
    return (
      <div className="grid min-h-dvh place-items-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-3">
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/15 border-t-primary" />
          <p className="text-sm font-medium text-gray-500">Checking admin session...</p>
        </div>
      </div>
    );
  }

  /* ========================================================== APP */

  return (
    <AdminSessionContext.Provider value={currentUser}>
      <ToastProvider>
      <OpsRuntime />
      <div className="min-h-dvh w-full bg-gray-50">
        {/* ====================================================== DESKTOP SIDEBAR (permanent from lg upward) */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-gray-200 bg-white lg:block xl:w-[256px]">
          <Sidebar />
        </aside>

        {/* ====================================================== MOBILE / TABLET HEADER */}
        <header className="fixed inset-x-0 top-0 z-50 flex h-[64px] items-center justify-between border-b border-gray-200 bg-white/95 px-3 shadow-[0_1px_8px_rgba(15,23,41,0.035)] backdrop-blur-xl min-[390px]:px-4 sm:px-5 lg:hidden">
          {/* BRAND */}
          <button
            type="button"
            onClick={() => router.push(currentUser ? firstAdminRoute(currentUser) || '/admin/login' : '/admin/login')}
            className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg active:scale-[0.98]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/15 bg-primary/[0.05]">
              <Image src={BRAND.mark} alt={BRAND.shortName} width={25} height={25} priority className="h-[25px] w-[25px] object-contain" />
            </span>
            <div className="min-w-0 text-left">
              <p className="truncate font-heading text-[14px] font-bold tracking-[-0.02em] text-secondary">{BRAND.product}</p>
              <p className="hidden text-[12px] font-medium text-gray-400 min-[430px]:block">{BRAND.portal}</p>
            </div>
          </button>

          {/* MENU */}
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileSidebarOpen}
            onClick={() => setMobileSidebarOpen(true)}
            className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white text-secondary shadow-sm transition-all hover:border-primary/30 hover:bg-primary/[0.04] active:scale-95"
          >
            <MenuIcon />
          </button>
        </header>

        {/* ====================================================== MOBILE / TABLET DRAWER */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <>
              {/* BACKDROP */}
              <motion.button
                type="button"
                aria-label="Close navigation"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => setMobileSidebarOpen(false)}
                className="fixed inset-0 z-[70] cursor-default bg-secondary/25 backdrop-blur-[2px] lg:hidden"
              />

              {/* DRAWER */}
              <motion.aside {...navigationDialog}
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }}
                className="fixed inset-y-0 left-0 z-[80] w-[min(86vw,310px)] overflow-hidden border-r border-gray-200 bg-white shadow-[18px_0_45px_rgba(15,23,41,0.16)] lg:hidden"
              >
                {/* CLOSE */}
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setMobileSidebarOpen(false)}
                  className="absolute right-3 top-3 z-[90] grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:bg-gray-50 hover:text-secondary active:scale-95"
                >
                  <CloseIcon />
                </button>

                <Sidebar mobile onNavigate={() => setMobileSidebarOpen(false)} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ====================================================== MAIN */}
        <main className="min-h-dvh min-w-0 pt-[64px] lg:ml-[248px] lg:pt-0 xl:ml-[256px]">
          <div className="mx-auto w-full max-w-[1600px] px-3 py-4 min-[390px]:px-4 sm:px-5 sm:py-5 md:px-6 md:py-6 lg:px-7 lg:py-7 xl:px-9 xl:py-8 2xl:px-10">
            {children}
          </div>
        </main>
      </div>
      </ToastProvider>
    </AdminSessionContext.Provider>
  );
}

/* ============================================================
   ICONS
============================================================ */

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
