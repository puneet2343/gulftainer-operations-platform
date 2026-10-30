'use client';

/*
 * Living style guide. Everything on this page is rendered from the real tokens and
 * components, so if it looks right here it looks right in the app.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

import PageHeader, { RefreshButton, ToolbarButton } from '@/components/ui/PageHeader';
import { Panel, SectionHeader, SectionHeading } from '@/components/ui/Panel';
import { DashboardStat, StatCard } from '@/components/ui/StatCard';
import QuickActionCard from '@/components/ui/QuickActionCard';
import { SearchBar, FilterChoice, FilterTag, FilterSelect } from '@/components/ui/Filters';
import Pagination from '@/components/ui/Pagination';
import { IconButton, StatusBadge, Avatar, Field } from '@/components/ui/Controls';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/Skeletons';
import Tabs from '@/components/ui/Tabs';
import FormDialog from '@/components/ui/FormDialog';
import Timeline from '@/components/ui/Timeline';
import { KeyValueList, Progress, CheckItem } from '@/components/ui/KeyValue';
import { useToast } from '@/components/ui/Toast';
import { VesselStatusBadge, TokenStatusBadge, InvoiceStatusBadge, ContainerFlags, PanelButton } from '@/components/admin/Shared';
import { CalendarIcon, EyeIcon, EditIcon, TrashIcon, PlusIcon, DownloadIcon, SearchIcon } from '@/components/ui/Icons';

const COLOURS = [
  { name: 'Indigo (primary)', token: '--color-primary', hex: '#283F8F', note: 'The single accent' },
  { name: 'Indigo dark', token: '--color-primary-dark', hex: '#1F3273', note: 'Hover on indigo' },
  { name: 'Tint', token: '--color-primary-light', hex: '#EEF1F8', note: 'Selected rows, icon tiles' },
  { name: 'Teal', token: '--ssi-teal', hex: '#23879A', note: 'Gradient only' },
  { name: 'Green', token: '--ssi-green', hex: '#34BD98', note: 'Gradient only' },
  { name: 'Ink (secondary)', token: '--color-secondary', hex: '#0F1729', note: 'Headings, primary text' },
  { name: 'Ink 2', token: '--color-gray-700', hex: '#3A4456', note: 'Body copy' },
  { name: 'Night', token: '--color-secondary-dark', hex: '#0B1120', note: 'Footer band' },
  { name: 'Grey', token: '--color-gray-500', hex: '#5B6576', note: 'Secondary text' },
  { name: 'Grey 2', token: '--color-gray-400', hex: '#8A93A3', note: 'Labels, placeholders' },
  { name: 'Line', token: '--color-gray-200', hex: '#DDE2E7', note: 'Borders' },
  { name: 'Mist 2', token: '--color-gray-100', hex: '#ECEFF3', note: 'Skeletons, dividers' },
  { name: 'Mist', token: '--color-gray-50', hex: '#F4F6F8', note: 'Canvas behind panels' },
  { name: 'Success', token: '--color-success', hex: '#1F8F6E', note: '' },
  { name: 'Warning', token: '--color-warning', hex: '#B7791F', note: '' },
  { name: 'Danger', token: '--color-danger', hex: '#C0352B', note: '' },
];

const RADII = [
  ['6px', 'rounded-md', 'Icon buttons, pagination'],
  ['8px', 'rounded-lg', 'Inputs, small buttons, chips'],
  ['12px', 'rounded-xl', 'Cards, nav items, icon tiles'],
  ['15–16px', 'rounded-[16px]', 'Dashboard panels and stats'],
  ['18px', 'rounded-[18px]', 'Images, login fields'],
  ['20px', 'rounded-[20px]', 'Modals'],
  ['22 / 28px', 'rounded-[22px] md:rounded-[28px]', 'Public feature tiles'],
  ['46px', 'rounded-[46px]', 'Login glass card'],
  ['999px', 'rounded-full', 'Pill buttons, badges, avatars'],
];

export default function DesignSystemPage() {
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState('All');
  const [select, setSelect] = useState('a');
  const [page, setPage] = useState(2);
  const [confirm, setConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'history' | 'charges' | 'documents'>('history');
  const [form, setForm] = useState(false);
  const toast = useToast();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-6 sm:space-y-8">
      <PageHeader
        eyebrow="Reference"
        title="Design System"
        subtitle="Every token and primitive in one place. Compare against the source project side by side; the two should be indistinguishable."
        action={<RefreshButton refreshing={refreshing} onClick={() => { setRefreshing(true); window.setTimeout(() => setRefreshing(false), 900); }} />}
      />

      {/* COLOUR */}
      <Panel>
        <SectionHeader title="Colour" description="Indigo is the only accent. Teal and green appear together with it only as the gradient." />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {COLOURS.map(colour => (
            <div key={colour.token} className="min-w-0">
              <div className="h-14 rounded-xl border border-gray-200" style={{ background: colour.hex }} />
              <p className="mt-2 truncate !text-[13px] !font-semibold !text-secondary">{colour.name}</p>
              <p className="truncate font-mono !text-[11px] !text-gray-400">{colour.hex} · {colour.token}</p>
              {colour.note && <p className="!text-[11px] !text-gray-500">{colour.note}</p>}
            </div>
          ))}
        </div>
        <div className="grid gap-3 border-t border-gray-100 p-4 sm:grid-cols-3">
          <div>
            <div className="h-14 rounded-xl" style={{ backgroundImage: 'var(--ssi-gradient-45)' }} />
            <p className="mt-2 !text-[13px] !font-semibold !text-secondary">Insignia gradient 45°</p>
            <p className="font-mono !text-[11px] !text-gray-400">--ssi-gradient-45 · .btn-primary</p>
          </div>
          <div>
            <div className="h-14 rounded-xl" style={{ backgroundImage: 'var(--ssi-gradient-90)' }} />
            <p className="mt-2 !text-[13px] !font-semibold !text-secondary">Insignia gradient 90°</p>
            <p className="font-mono !text-[11px] !text-gray-400">--ssi-gradient-90 · .ssi-rule, nav underline, footer hairline</p>
          </div>
          <div>
            <div className="h-14 rounded-xl bg-[#0B1120] p-3"><div className="h-full rounded-lg" style={{ backgroundImage: 'var(--ssi-gradient-dark)' }} /></div>
            <p className="mt-2 !text-[13px] !font-semibold !text-secondary">Gradient on dark</p>
            <p className="font-mono !text-[11px] !text-gray-400">--ssi-gradient-dark</p>
          </div>
        </div>
      </Panel>

      {/* TYPE */}
      <Panel>
        <SectionHeader title="Typography" description="Figtree 400 / 500 / 600. 'Bold' renders as 600; heavy weights are off-brand. Minimum 12px." />
        <div className="space-y-5 p-4 sm:p-6">
          <div><p className="mb-1 font-mono !text-[11px] !text-gray-400">Public h1 · 32/44px · 600 · -0.01em</p><p className="text-[32px] font-semibold leading-tight tracking-[-0.01em] text-secondary md:text-[44px]">Terminal <span className="ssi-highlight">operations</span></p></div>
          <div><p className="mb-1 font-mono !text-[11px] !text-gray-400">Admin h1 · 23/26/28px · bold(600) · -0.035em</p><p className="font-heading text-[23px] font-bold tracking-[-0.035em] text-secondary sm:text-[26px] lg:text-[28px]">Dashboard</p></div>
          <div><p className="mb-1 font-mono !text-[11px] !text-gray-400">Section h2 · 22/28px · 600 · -0.02em</p><p className="font-heading text-[22px] font-semibold tracking-[-0.02em] text-secondary md:text-[28px]">Upcoming vessel calls</p></div>
          <div><p className="mb-1 font-mono !text-[11px] !text-gray-400">Stat number · 27/31/34px · bold · -0.045em</p><p className="font-heading text-[27px] font-bold tracking-[-0.045em] text-secondary sm:text-[31px] lg:text-[34px]">1,284</p></div>
          <div><p className="mb-1 font-mono !text-[11px] !text-gray-400">Panel title · 14px 600 · Body · 13–14px · Grey 500</p><p className="text-[14px] font-semibold text-secondary">Recent activity</p><p className="text-[14px] text-gray-500">Latest movements across all terminals, soonest first.</p></div>
          <div><p className="mb-1 font-mono !text-[11px] !text-gray-400">Eyebrow · 12px 600–700 · uppercase · +0.04–0.06em · Grey 400</p><p className="text-[12px] font-bold uppercase tracking-[0.06em] text-gray-400">Gate moves today</p></div>
          <div><p className="mb-1 font-mono !text-[11px] !text-gray-400">Login label · 13px 700 · uppercase · +0.12em · ink/65</p><p className="text-[13px] font-bold uppercase tracking-[0.12em] text-secondary/65">Login ID or email</p></div>
        </div>
      </Panel>

      {/* SHAPE & ELEVATION */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHeader title="Radius" description="Soft panels, pill buttons" />
          <ul className="divide-y divide-gray-100">
            {RADII.map(([px, cls, use]) => (
              <li key={cls} className="flex items-center gap-4 px-4 py-3">
                <span className="h-10 w-14 shrink-0 border-2 border-primary/40 bg-primary/[0.06]" style={{ borderRadius: px.includes('/') ? '22px' : px.replace('–16', '').replace('15', '16') }} />
                <div className="min-w-0 flex-1">
                  <p className="!text-[13px] !font-semibold !text-secondary">{px} <span className="ml-1 font-mono font-normal text-gray-400">{cls}</span></p>
                  <p className="!text-[12px] !text-gray-500">{use}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <SectionHeader title="Elevation" description="Shadows carry a hint of indigo or ink; never pure black" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {[
              ['Card', 'shadow-[0_3px_12px_rgba(15,23,41,0.025)]', '--shadow-sm'],
              ['Panel', 'shadow-[0_6px_24px_rgba(15,23,41,0.045)]', 'Dashboard sections'],
              ['Stat hover', 'shadow-[0_10px_28px_rgba(15,23,41,0.07)]', 'Lift 3px'],
              ['Modal', 'shadow-[0_22px_70px_rgba(15,23,41,0.18)]', 'Over blurred ink/25'],
              ['Primary button hover', 'shadow-[0_10px_28px_rgba(40,63,143,0.28)]', 'Indigo glow'],
              ['Drawer', 'shadow-[18px_0_45px_rgba(15,23,41,0.16)]', 'Mobile sidebar'],
            ].map(([name, cls, note]) => (
              <div key={name} className={`rounded-[16px] border border-gray-200 bg-white p-4 ${cls}`}>
                <p className="!text-[13px] !font-semibold !text-secondary">{name}</p>
                <p className="mt-1 break-all font-mono !text-[11px] !text-gray-400">{cls}</p>
                <p className="!text-[12px] !text-gray-500">{note}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* BUTTONS */}
      <Panel>
        <SectionHeader title="Buttons" description="Pill .btn for the public site and dialogs; 10px-radius toolbar buttons inside admin pages" />
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
          <button className="btn btn-primary">Primary pill</button>
          <button className="btn btn-secondary">Secondary pill</button>
          <button className="btn btn-primary" disabled>Disabled</button>
          <ToolbarButton><PlusIcon />Toolbar primary</ToolbarButton>
          <ToolbarButton variant="secondary"><DownloadIcon />Toolbar secondary</ToolbarButton>
          <ToolbarButton variant="danger"><TrashIcon />Danger</ToolbarButton>
          <button type="button" onClick={() => setConfirm(true)} className="inline-flex h-10 items-center justify-center rounded-lg bg-red-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-600 active:scale-[0.98]">Open confirm dialog</button>
          <div className="flex gap-1.5">
            <IconButton title="View" onClick={() => {}}><EyeIcon /></IconButton>
            <IconButton title="Edit" onClick={() => {}}><EditIcon /></IconButton>
            <IconButton title="Delete" danger onClick={() => {}}><TrashIcon /></IconButton>
          </div>
        </div>
      </Panel>

      {/* FORMS & FILTERS */}
      <Panel>
        <SectionHeader title="Forms and filters" description="Inputs: hairline border, 12px radius, indigo focus ring at 20%" />
        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
          <div>
            <Field label="Container number" hint="Four letters and seven digits" id="ds-input"><input id="ds-input" className="form-input" placeholder="MSKU 8842109" /></Field>
            <Field label="Terminal" id="ds-select">
              <select id="ds-select" className="form-select" defaultValue=""><option value="" disabled>Choose a terminal</option><option>Khorfakkan Terminal</option><option>Sharjah Container Terminal</option></select>
            </Field>
            <Field label="Notes" error="Keep notes under 500 characters." id="ds-textarea"><textarea id="ds-textarea" className="form-textarea" rows={3} placeholder="Optional" /></Field>
            <FilterSelect label="Filter select" value={select} onChange={setSelect}><option value="a">All statuses</option><option value="b">Active</option></FilterSelect>
          </div>
          <div className="space-y-4">
            <SearchBar value={search} onChange={setSearch} placeholder="Search records..." showFilters={false} onToggleFilters={() => {}} hasActiveFilters={!!search} />
            <div className="flex flex-wrap gap-2">
              {['All', 'Active', 'Pending', 'Closed', 'Flagged'].map(c => <FilterChoice key={c} label={c} selected={chip === c} onClick={() => setChip(c)} />)}
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterTag label="Status: Active" onRemove={() => {}} />
              <FilterTag label="Terminal: Khorfakkan" onRemove={() => {}} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge variant="success" dot>Completed</StatusBadge>
              <StatusBadge variant="info" dot>In progress</StatusBadge>
              <StatusBadge variant="warning" dot>Pending</StatusBadge>
              <StatusBadge variant="danger" dot>Flagged</StatusBadge>
              <StatusBadge variant="neutral">Closed</StatusBadge>
              <span className="badge badge--info">CSS badge</span>
            </div>
            <div className="flex items-center gap-3">
              <Avatar name="Ayesha Rahman" /><Avatar name="Omar Al Suwaidi" large /><span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-bold text-white">AR</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* CARDS */}
      <section className="space-y-4">
        <SectionHeading title="Cards and panels" subtitle="Stats, quick actions, list rows and empty states" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <DashboardStat index={0} label="Highlighted" value={1284} description="+6% on yesterday" icon={<CalendarIcon />} highlight />
          <DashboardStat index={1} label="Default" value="78%" description="Capacity 24,000 TEU" icon={<CalendarIcon />} />
          <DashboardStat index={2} label="Loading" value={0} description="" loading icon={<CalendarIcon />} />
          <StatCard icon={<CalendarIcon />} label="Compact stat" value={47} description="all time" />
        </div>
        <Panel>
          <div className="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x lg:grid-cols-3 lg:divide-y-0">
            <QuickActionCard index={0} href="#" title="Quick action" description="Tinted icon tile, arrow slides on hover" icon={<PlusIcon />} />
            <QuickActionCard index={1} href="#" title="Second action" description="Tiles divide with hairlines" icon={<SearchIcon />} />
            <QuickActionCard index={2} href="#" title="Third action" description="Min height 92–105px" icon={<DownloadIcon />} />
          </div>
        </Panel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <SectionHeader title="Table skeleton" description="Rows pulse in Mist 2" href="#" linkText="View all" />
            <table className="w-full"><tbody><TableSkeleton rows={4} columns={4} /></tbody></table>
            <Pagination page={page} totalPages={8} total={76} pageSize={10} onChange={setPage} />
          </Panel>
          <Panel>
            <SectionHeader title="Empty state" description="Grey tile, one line of help, optional action" />
            <EmptyState title="No records found" description="No records match the current search and filters." action={<button className="btn btn-secondary">Clear Filters</button>} />
          </Panel>
        </div>
      </section>

      {/* MOTION */}
      <Panel>
        <SectionHeader title="Motion" description="One easing everywhere: cubic-bezier(.16, 1, .3, 1). Sections rise 8–14px; items stagger 35–50ms; springs for drawers and modals." />
        <div className="grid gap-3 p-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
          {[
            ['Page fade', '0.35s opacity'],
            ['Section rise', 'y 10–14px · 0.45–0.5s · EASE'],
            ['Card stagger', 'delay 0.12s + i × 0.045s'],
            ['Hover lift', 'y -3px (stats), -1px (buttons)'],
            ['Tap', 'scale 0.97–0.98'],
            ['Drawer', 'spring 380 / 36 / mass 0.9'],
            ['Modal', 'spring 380 / 30, from y 20 scale 0.97'],
            ['Backdrop', '0.18s fade, ink/25, blur 4px'],
          ].map(([name, spec]) => (
            <div key={name} className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
              <p className="!text-[13px] !font-semibold !text-secondary">{name}</p>
              <p className="mt-0.5 font-mono !text-[11px] !text-gray-500">{spec}</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* OPERATIONS PRIMITIVES */}
      <Panel>
        <SectionHeader title="Operations primitives" description="Added for the cargo platform: tabs, facts grid, progress, checklist, timeline, domain badges, form dialog and toasts. All built from the tokens above." />
        <Tabs tabs={[{ id: 'history', label: 'History' }, { id: 'charges', label: 'Charges' }, { id: 'documents', label: 'Documents' }]} value={tab} onChange={setTab} counts={{ history: 12, charges: 4, documents: 2 }} />
        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
          <div className="space-y-5">
            <KeyValueList columns={2} items={[{ label: 'Shipping line', value: 'MSC Mediterranean Shipping Company' }, { label: 'Seal', value: 'MSC482210', mono: true }, { label: 'Yard position', value: 'C04-07-2', mono: true }, { label: 'Discharged', value: '29 Oct 2026 · 08:20' }]} />
            <Progress value={312} max={420} label="Discharged 312 of 420" tone="success" />
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 px-3">
              <CheckItem done label="Customs: cleared" detail="SHJ-IMP-90120" />
              <CheckItem done={false} label="Delivery order not received" detail="Record it from the container record" />
            </ul>
            <div className="flex flex-wrap gap-2"><VesselStatusBadge status="working" /><TokenStatusBadge status="at_marshalling_yard" /><InvoiceStatusBadge status="partially_paid" /><ContainerFlags container={{ dg: { imoClass: '8', unNumber: 'UN1824' }, reefer: { setpointC: -18, plugged: true }, oog: true, full: true }} /></div>
            <div className="flex flex-wrap gap-2"><PanelButton primary onClick={() => setForm(true)}>Open form dialog</PanelButton><PanelButton onClick={() => toast.success('Saved. This is the status toast.')}>Show toast</PanelButton><PanelButton danger onClick={() => toast.error('The service rejected the change. This is the error toast.')}>Show error toast</PanelButton></div>
          </div>
          <Timeline items={[{ id: '1', title: <><span className="font-semibold">E-token generated</span> — ET-000412 for Al Sahraa Transport, slot 14:00–16:00</>, meta: 'Customer portal · 30 Oct 2026 · 09:12 UTC', tone: 'primary' }, { id: '2', title: <><span className="font-semibold">Charges settled</span> — INV-2026-00031</>, meta: 'Fatima Hassan · 30 Oct 2026 · 08:40 UTC', tone: 'success' }, { id: '3', title: <><span className="font-semibold">Hold placed</span> — Customs hold: selected for inspection</>, meta: 'Sharjah Customs · 28 Oct 2026 · 11:05 UTC', tone: 'danger' }, { id: '4', title: <><span className="font-semibold">Discharged from vessel</span> — MSC AURORA MSAU442W to C04-07-2</>, meta: 'Omar Al Suwaidi · 27 Oct 2026 · 08:20 UTC', tone: 'neutral' }]} />
        </div>
      </Panel>

      <FormDialog open={form} title="Form dialog" description="Wider sibling of the confirm dialog with a scrolling body and the service error line in the footer." submitLabel="Save" onSubmit={() => setForm(false)} onClose={() => setForm(false)} footer="Footer note">
        <Field label="Yard position" id="ds-position"><input id="ds-position" className="form-input !h-11 !rounded-lg !px-3 !text-[14px] font-mono uppercase" placeholder="C04-07-2" /></Field>
        <Field label="Reason" id="ds-reason"><textarea id="ds-reason" className="form-textarea !rounded-lg !px-3 !py-2.5 !text-[14px] min-h-[88px]" /></Field>
      </FormDialog>

      <ConfirmDialog
        open={confirm}
        danger
        title="Delete record?"
        description="This is the shared confirm pattern. On phones it docks to the bottom; from 640px it centres."
        confirmLabel="Delete"
        onConfirm={() => setConfirm(false)}
        onClose={() => setConfirm(false)}
      />
    </motion.div>
  );
}
