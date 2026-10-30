import { UserBottomNav, UserFooter, UserHeader } from '@/components/user/UserChrome';

/** Public-site frame: sticky blurred header, page, dark footer band, phone bottom nav. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    // On phones, a page's full-screen height must exclude the shared header and nav, or every page scrolls a little.
    <div className="[--user-nav-h:calc(60px+env(safe-area-inset-bottom))] max-md:[&>main]:min-h-[calc(100dvh-53px-env(safe-area-inset-top)-var(--user-nav-h))]">
      <UserHeader />
      {children}
      <UserFooter />
      {/* Keeps page content clear of the fixed bottom nav on mobile */}
      <div aria-hidden="true" className="h-[var(--user-nav-h)] md:hidden" />
      <UserBottomNav />
    </div>
  );
}
