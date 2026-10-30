'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { BRAND } from '@/lib/brand';
import { AppFeedbackDialog } from '@/components/user/AppFeedback';

/*
 * One header and (on phones) bottom nav for every public page,
 * so the frame never changes while moving through a flow.
 * Pages render only their own content below the header.
 */

/** Pages that have no back arrow. */
const ROOT_PAGES = ['/e-services', '/vessel-schedule', '/container-enquiry', '/e-token'];

/** Top-level tabs: desktop pills and the phone bottom bar share this list. */
export const PUBLIC_TABS = [
  { href: '/e-services', label: 'Home', match: (path: string) => path === '/e-services' },
  { href: '/vessel-schedule', label: 'Vessel schedule', match: (path: string) => path.startsWith('/vessel-schedule') },
  { href: '/container-enquiry', label: 'Container enquiry', match: (path: string) => path.startsWith('/container-enquiry') },
  { href: '/e-token', label: 'E-token portal', match: (path: string) => path.startsWith('/e-token') },
];

// Desktop navigation: medium-weight links; the active page carries the insignia-gradient underline.
const NAV = 'relative inline-flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';
const NAV_IDLE = 'text-gray-600 hover:bg-gray-50 hover:text-secondary';
const NAV_ACTIVE = 'text-secondary after:absolute after:inset-x-4 after:-bottom-[13px] after:h-[2px] after:rounded-full after:bg-[image:var(--ssi-gradient-90)]';
const ROUND = 'grid shrink-0 place-items-center rounded-full text-secondary transition active:scale-95';

function useChrome() {
  const pathname = usePathname();
  const router = useRouter();
  return {
    pathname,
    showBack: !ROOT_PAGES.includes(pathname),
    goBack() {
      if (window.history.length > 1) router.back();
      else router.push('/e-services');
    },
  };
}

function useShare() {
  const [shared, setShared] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      // User cancelled the share sheet.
    }
  }
  return { shared, share };
}

export function UserHeader({ shareable = false }: { shareable?: boolean }) {
  const chrome = useChrome();
  const { shared, share } = useShare();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const shareLabel = shared ? 'Link copied' : 'Share this page';

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:pt-0">
        {/* Phones */}
        <div className="mx-auto flex h-14 max-w-[560px] items-center gap-2 px-4 md:hidden">
          {chrome.showBack && (
            <button type="button" onClick={chrome.goBack} aria-label="Go back" className={`-ml-2 h-11 w-11 active:bg-gray-100 ${ROUND}`}>
              <BackIcon />
            </button>
          )}
          <Brand compact />
          <div className="ml-auto flex items-center gap-1">
            {shareable && (
              <button type="button" onClick={() => void share()} aria-label={shareLabel} className={`h-11 w-11 active:bg-gray-100 ${ROUND}`}>
                <ShareIcon done={shared} />
              </button>
            )}
            <button type="button" onClick={() => setFeedbackOpen(true)} aria-label="Feedback" className={`-mr-2 h-11 w-11 active:bg-gray-100 ${ROUND}`}>
              <FeedbackIcon />
            </button>
          </div>
        </div>

        {/* Tablets and desktops */}
        <div className="mx-auto hidden h-[72px] w-full max-w-[1200px] items-center justify-between gap-6 px-6 md:flex">
          <div className="flex items-center gap-3">
            {chrome.showBack && (
              <button type="button" onClick={chrome.goBack} aria-label="Go back" className={`group h-11 w-11 bg-gray-50 hover:bg-gray-100 ${ROUND}`}>
                <BackIcon />
              </button>
            )}
            <Brand />
          </div>
          <nav aria-label="Main" className="flex items-center gap-1">
            {shareable && (
              <button type="button" onClick={() => void share()} className={`${NAV} ${NAV_IDLE}`}>
                <ShareIcon done={shared} />
                {shared ? 'Link copied' : 'Share'}
              </button>
            )}
            {PUBLIC_TABS.map(tab => {
              const active = tab.match(chrome.pathname);
              return (
                <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined} className={`${NAV} ${active ? NAV_ACTIVE : NAV_IDLE}`}>
                  {tab.label}
                </Link>
              );
            })}
            <button type="button" onClick={() => setFeedbackOpen(true)} className={`${NAV} ${NAV_IDLE}`}>
              Feedback
            </button>
          </nav>
        </div>
      </header>
      {feedbackOpen && <AppFeedbackDialog onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}

/** Every page closes on the dark band with the insignia hairline on top. */
export function UserFooter() {
  return (
    <footer className="relative mt-16 bg-[#0B1120] text-[#B8C0CF] before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-[image:var(--ssi-gradient-90)]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <Image src={BRAND.logoWhite} alt={BRAND.company} width={260} height={64} className="h-8 w-auto" />
          <span className="h-6 w-px bg-white/20" aria-hidden="true" />
          <span className="text-[17px] font-medium tracking-[-0.01em] text-white">{BRAND.siteSuffix}</span>
        </div>
        <div className="flex flex-col gap-1.5 text-[14px] md:items-end">
          <a href={BRAND.website} className="text-[#8FD8C4] transition-colors hover:text-white">{BRAND.websiteLabel}</a>
          <p className="text-[#8C95A8]">© {new Date().getFullYear()} {BRAND.company} · Developed by {BRAND.developer}</p>
        </div>
      </div>
    </footer>
  );
}

export function UserBottomNav() {
  const { pathname } = useChrome();

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid h-[var(--user-nav-h)] grid-cols-4 border-t border-gray-200 bg-white/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <NavItem href="/e-services" label="Home" active={PUBLIC_TABS[0].match(pathname)}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5" />
      </NavItem>
      <NavItem href="/vessel-schedule" label="Vessels" active={PUBLIC_TABS[1].match(pathname)}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l1.5 3h15L21 17M4 17l-1-4 9-3 9 3-1 4M6 13V9h12v4M10 9V5h4v4" />
      </NavItem>
      <NavItem href="/container-enquiry" label="Enquiry" active={PUBLIC_TABS[2].match(pathname)}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
      </NavItem>
      <NavItem href="/e-token" label="E-token" active={PUBLIC_TABS[3].match(pathname)}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16V8a1 1 0 011-1h10v9M14 10h4l3 3v3h-7M5 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z" />
      </NavItem>
    </nav>
  );
}

/** The logo followed by the product word, separated by a hairline. */
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/e-services" aria-label={`${BRAND.company} ${BRAND.siteSuffix}, home`} className="inline-flex min-w-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80">
      <Image src={BRAND.logo} alt={BRAND.company} width={260} height={64} priority className={`w-auto shrink-0 ${compact ? 'h-7' : 'h-8'}`} />
      <span className={`w-px shrink-0 bg-gray-200 ${compact ? 'h-5' : 'h-6'}`} aria-hidden="true" />
      <span className={`font-medium tracking-[-0.012em] text-secondary ${compact ? 'text-[17px]' : 'text-[19px]'}`}>{BRAND.siteSuffix}</span>
    </Link>
  );
}

function NavItem({ href, label, active, children }: { href: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors active:bg-gray-50 ${
        active ? 'text-primary before:absolute before:top-0 before:h-[2px] before:w-10 before:rounded-full before:bg-[image:var(--ssi-gradient-90)]' : 'text-gray-500'
      }`}
    >
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
        {children}
      </svg>
      {label}
    </Link>
  );
}

function BackIcon() {
  return (
    <svg className="h-[18px] w-[18px] transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ShareIcon({ done }: { done: boolean }) {
  return done ? (
    <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  ) : (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0-12 4 4m-4-4L8 7M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path strokeLinecap="round" d="M8 9h8M8 13h5" />
    </svg>
  );
}
