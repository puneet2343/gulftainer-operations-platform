# Design system

This is the design language of the SSI Events frontend, extracted so the Gulftainer prototype looks, moves and behaves identically. Every value below is already implemented in `app/globals.css` and `components/ui/*`; this file explains the rules behind them so new screens stay on-brand.

Open `/admin/design-system` in the running app to see all of it rendered live.

## 1. Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss`; tokens in `globals.css` `@theme inline` |
| Motion | framer-motion |
| Icons | Inline 24×24 stroke SVGs (sidebar, admin primitives); `lucide-react` in forms; `@phosphor-icons/react` regular weight on the public site |
| Fonts | Figtree 400/500/600 via `next/font/google` (app-wide); Sora Regular (local) on the login screen only |
| Charts | recharts (when needed) |

Conventions carried over: `output: 'standalone'`, `agentRules: false`, no custom server, `@/*` path alias, `'use client'` pages that fetch on mount.

## 2. Colour

Indigo is the **single accent**. Teal and green are never used alone; they appear only together with indigo inside the insignia gradient.

| Token | Hex | Use |
| --- | --- | --- |
| `--color-primary` | `#283F8F` | Links, active nav, primary actions, icon tiles (at 6–8 % tint) |
| `--color-primary-dark` | `#1F3273` | Hover on indigo text/buttons |
| `--color-primary-light` | `#EEF1F8` | Selected row tint |
| `--ssi-teal` | `#23879A` | Gradient stop only |
| `--ssi-green` | `#34BD98` | Gradient stop only |
| `--color-secondary` (ink) | `#0F1729` | Headings, primary text, dark backdrops |
| Ink 2 / `gray-700` | `#3A4456` | Body copy |
| Night / `--color-secondary-dark` | `#0B1120` | Footer band |
| `gray-500` | `#5B6576` | Secondary text |
| `gray-400` | `#8A93A3` | Labels, placeholders, inactive icons |
| `gray-300` | `#C5CCD5` | Hover borders |
| `gray-200` (line) | `#DDE2E7` | All borders |
| `gray-100` (mist 2) | `#ECEFF3` | Skeletons, soft dividers |
| `gray-50` (mist) | `#F4F6F8` | Admin canvas, public feature tiles, hover rows |
| Success | `#1F8F6E` on `rgba(52,189,152,.10)` | |
| Warning | `#B7791F` on `rgba(214,158,46,.12)` | |
| Danger | `#C0352B` on `#FDF1EF` | Destructive buttons use Tailwind `red-500/600` |

Tailwind's `gray-*` scale is remapped to these neutrals in `@theme inline`, so any `text-gray-500` already follows the brand.

**Gradients**

- `--ssi-gradient-45`: `linear-gradient(45deg, #283F8F 0%, #23879A 55%, #34BD98 100%)` → `.btn-primary`, `.btn-secondary` outline
- `--ssi-gradient-90`: same stops at 90° → `.ssi-rule`, `.ssi-highlight` text, active nav underline, footer hairline, bottom-nav marker
- `--ssi-gradient-dark`: lighter stops for dark surfaces
- Never a large gradient fill. Thin rules, one highlighted phrase per heading, small markers.

**Tints**: `bg-primary/[0.05–0.08]` for icon tiles and active nav; `border-primary/10–25` with them. Backdrops are `bg-secondary/25` + `backdrop-blur-[4px]`.

## 3. Typography

Figtree. `--font-weight-bold` is remapped to **600**, so `font-bold` never renders heavier than semibold.

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Public h1 | 32 → 44px | 600 | −0.01em |
| Admin page h1 | 23 → 26 → 28px | bold (600) | −0.035em |
| Login hero | 48px | bold | −0.05em, gradient text |
| Section h2 (public) | 22 → 28px | 600 | −0.02em |
| Stat number | 27 → 31 → 34px | bold | −0.045em |
| Compact stat | 22px | bold | −0.03em |
| Panel title | 14px | 600 | |
| Nav item | 14px | 500 (600 active child) | |
| Body (admin) | 13–14px | 400 | gray-500 |
| Body (public) | 16 → 18px, line-height 1.6 | 400 | gray-600 |
| Eyebrow / stat label | 12px | 600–700 uppercase | +0.04–0.06em, gray-400 |
| Login field label | 13px | 700 uppercase | +0.12em, ink/65 |
| Badge | 12px | 600 | |
| Minimum | 12px (admin body 14px+) | | |

`h1–h6` default to 600, line-height 1.15, `text-wrap: balance`. `p` defaults to gray-500.

## 4. Shape

| Radius | Where |
| --- | --- |
| 6px `rounded-md` | Icon buttons, pagination buttons |
| 8px `rounded-lg` | Inputs, toolbar buttons, chips, icon squares in nav |
| 12px `rounded-xl` | Cards, nav items, icon tiles, mobile list cards, `.form-input` |
| 15–16px | Dashboard stat cards and panels |
| 18px | Images, `.card`, login fields and login button |
| 20px | Modals |
| 22px → 28px (md) | Public feature tiles and category panels |
| 46px | Login glass card |
| 999px | `.btn` pills, badges, avatars, filter tags |

Borders are 1px `gray-200`. Hairline dividers inside panels are `gray-100`.

## 5. Elevation

Shadows always carry ink or indigo, never pure black.

```
card      0 3px 12px rgba(15,23,41,0.025)
panel     0 6px 24px rgba(15,23,41,0.045)
stat      0 5px 20px rgba(15,23,41,0.035)  → hover 0 10px 28px rgba(15,23,41,0.07)
button    0 3px 12px rgba(15,23,41,0.04)
modal     0 22px 70px rgba(15,23,41,0.18)
drawer    18px 0 45px rgba(15,23,41,0.16)
primary   0 10px 28px rgba(40,63,143,0.28) on hover
header    0 1px 8px rgba(15,23,41,0.035)
```

## 6. Motion

One easing: `cubic-bezier(.16, 1, .3, 1)` (`--ease-ssi`, `EASE` in `lib/motion.ts`).

- Page: fade 0.35s. Header section: rise 10px, 0.45s.
- Panels: rise 14px, 0.5s, delay 0.05–0.15s.
- Cards: rise 8–12px, 0.4–0.45s, stagger `0.12s + i × 0.045–0.05s`.
- Hover: stats lift −3px; buttons −1px; icon tiles scale 1.06–1.08 with ±2° rotate; arrows slide +2px.
- Tap: scale 0.97–0.98. Active nav/brand: 0.98–0.99.
- Drawer: spring stiffness 380, damping 36, mass 0.9, from x −100%.
- Modal: spring 380 / 30, from y 20, scale 0.97; backdrop fades 0.18s.
- Login: card 1s blur-in; panels 0.85–0.95s; fields stagger 0.07s; glows drift on 22–28s loops; shimmer sweeps the button every 5s.
- `.ssi-rise`: 700ms rise for public sections. Everything is off under `prefers-reduced-motion`.

## 7. Layout

**Admin shell** (`app/admin/layout.tsx`)
- Sidebar fixed, white, 248px (256px ≥ xl), 1px right border, from `lg`.
- Below `lg`: 64px fixed header (white/95, blur, hairline, 1px shadow) with brand on the left and a 40px menu button; drawer `min(86vw, 310px)`.
- Canvas `bg-gray-50`. Content `max-w-[1600px]`, padding 12 → 16 → 20 → 24 → 28 → 36 → 40px by breakpoint.
- Sidebar: brand row → hairline → nav (`space-y-1.5`, 12px radius items, 3px indigo active bar on the left, 32px icon squares) → "Open Application" external link → user card (`bg-gray-50`, initials circle in indigo) → red-tinted logout.
- Sidebar groups fold with `grid-template-rows` 0fr/1fr; children indent 27–29px with a guide line.

**Public shell** (`app/(site)/layout.tsx`)
- Sticky header, white/90 + blur, 56px on phones / 72px desktop, content `max-w-[1200px]`.
- Desktop nav: 44px pills, medium weight, active page gets a 2px gradient underline 13px below.
- Phone: back arrow when not on a root page, brand, round 44px action buttons; 2-tab bottom bar 60px + safe-area, active tab has a 40px gradient marker on top.
- Footer: Night band with 2px gradient hairline on top, white logo + hairline + product word, teal `#8FD8C4` link, grey `#8C95A8` copyright.
- Phone-first: 44px tap targets, safe-area insets, no horizontal scroll at 360px.

**Login** (`app/admin/login/layout.tsx`)
- Full-screen ink; 135° gradient indigo → ink 2 → night; three radial highlights; two drifting blurred glows; 18px dot grid at 3.5 %.
- Glass card 980 × 590–610px, 46px radius, white/10 + blur 42px + saturate 150, inner 1px white/12 ring, top highlight line.
- Left 45 %: logo tile 54px/17px radius, "Welcome to" + 48px gradient heading, uppercase tracking pill.
- Right 55 %: white/93 panel, 44/46px radii, 56px fields (18px radius, `#F6F8FB` → white on focus, 4px indigo ring at 8 %), 56px teal gradient button `135deg #168F82 → #146E8A` turning `#16A36A` on success.

## 8. Components (`components/ui`)

| File | Exports | Pattern |
| --- | --- | --- |
| `PageHeader.tsx` | `PageHeader`, `RefreshButton`, `ToolbarButton` | Eyebrow + title + subtitle + right-aligned action |
| `Panel.tsx` | `Panel`, `SectionHeader`, `SectionHeading` | 16px white panel; 14px title row with "View all" link |
| `StatCard.tsx` | `DashboardStat`, `StatCard`, `StatSkeleton` | Big stat with icon tile; compact stat for list pages |
| `QuickActionCard.tsx` | default | Tile for a `grid divide-x divide-y divide-gray-100` strip |
| `Filters.tsx` | `SearchBar`, `FilterChoice`, `FilterTag`, `FilterLabel`, `FilterSelect` | Toolbar pieces |
| `Pagination.tsx` | default, `PaginationButton`, `visiblePageNumbers` | "Showing a–b of n" + buttons |
| `Controls.tsx` | `IconButton`, `StatusBadge`, `Avatar`, `BulkBar`, `Field` | Row actions, pills, initials, selection bar, labelled field |
| `EmptyState.tsx` | default, `LoadError` | Centered empty + inline retry |
| `Skeletons.tsx` | `TableSkeleton`, `CardSkeleton`, `MobileCardSkeleton`, `LineSkeleton` | Pulsing placeholders |
| `ConfirmDialog.tsx` | default | Bottom-sheet-on-phone confirm with danger variant |
| `Icons.tsx` | small stroke icons | |

`components/user/Cards.tsx` has `FeatureCard` (category tile) and `ItemCard` (list card). `components/user/UserChrome.tsx` has the header, footer and bottom nav. `components/admin/Sidebar.tsx` is the navigation; add modules in `ALL_NAV_ITEMS`, `lib/admin-session.ts` and `getRequiredPermissionForPath` in the admin layout.

CSS primitives in `globals.css`: `.btn .btn-primary .btn-secondary`, `.form-group .form-label .form-input .form-select .form-textarea`, `.card`, `.badge .badge--*`, `.data-table`, `.ssi-rule .ssi-highlight .ssi-panel .ssi-rise`, `.report-page` print rules.

## 9. Page patterns

- **Dashboard**: header + refresh → quick-actions panel (4 tiles) → 4 stats (`grid-cols-2 xl:grid-cols-4`) → 2/3 table + 1/3 list.
- **List page**: header with eyebrow and toolbar buttons → 4 compact stats → panel with search/filter toolbar, chips, active tags, bulk bar, desktop table (`hidden md:block`), mobile cards (`md:hidden`), pagination → confirm dialog.
- **Category page (public)**: back link → 32/44px h1 → 62ch intro → mist panel or card grid.
- **Loading**: route `loading.tsx` with pulsing blocks; in-page skeletons never shift layout.

## 10. Copy and accessibility

- Formal "we", sentence case. No slogans, exclamation marks or eyebrow marketing labels on the public site.
- Buttons name the action ("Refresh Data", "Clear Filters", "Log out").
- Every icon-only button has `aria-label`; dialogs use `useDialog` (focus trap, Escape, restore focus); nav marks `aria-current="page"`; `role="alert"` for errors, `role="status"` for confirmations.
- Focus ring: 2px indigo, 2px offset (`:focus-visible`), or `focus-visible:ring-2 ring-primary/30` on pills.

## 11. Operations primitives (added for the cargo platform)

| File | Exports | Pattern |
| --- | --- | --- |
| `Table.tsx` | `TableWrap`, `THead`, `Th`, `Tr`, `Td`, `RefCell`, `CardList`, `Card`, `INPUT`, `SELECT`, `TEXTAREA` | Desktop table shell (`hidden md:block`) and the phone card list; input class strings on the global `.form-*` styles at 44px |
| `ListToolbar.tsx` | default | Search with filter toggle, result count, folding chip groups, active tags and "Clear all"; paired with `lib/use-list.ts` |
| `Tabs.tsx` | default | 44px tab strip with counts and the 2px indigo underline |
| `KeyValue.tsx` | `KeyValueList`, `Progress`, `CheckItem` | Facts grid (12px uppercase label over 14px value), 6px progress bar, checklist row with a green tick or grey dot |
| `Timeline.tsx` | default | Vertical history: 9px dot on a hairline, 13px title, 12px meta |
| `FormDialog.tsx` | default | 560/760px modal form with scrolling body, footer note and the service error line; bottom sheet on phones |
| `Toast.tsx` | `ToastProvider`, `useToast` | Status and error toasts at the bottom, `role="status"` / `role="alert"` |
| `components/admin/Shared.tsx` | status badges per domain state, `ContainerLink`, `ContainerFlags`, `ClearanceChips`, `PanelButton`, `PanelBody`, `ActionError` | Domain-specific wrappers over `StatusBadge` and the 36px panel button |

Domain colour mapping: vessel working = success, on berth = info, expected = neutral; container on hold = danger, in yard = info, gated out = warning, delivered = success; invoice overdue = danger, partially paid = warning. Charts (recharts) use indigo `#283F8F` for magnitude, `#9AA8D6` for a second indigo step, and the status palette for state; never a categorical rainbow.
