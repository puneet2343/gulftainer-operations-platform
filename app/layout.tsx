import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/brand";

// The brand typeface. Self-hosted by Next.js, so no request to Google at runtime.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND.product,
  description: `${BRAND.product} by ${BRAND.developer}.`,
  applicationName: BRAND.product,
  icons: { icon: BRAND.mark, apple: BRAND.mark },
  appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: "default" },
};

// Edge-to-edge on notched phones; the header and bottom bar pad themselves with safe-area insets.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
