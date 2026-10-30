'use client';

/*
 * Reports: terminal, gate, logistics, finance and inventory views computed from
 * the operations database. Charts use the brand indigo for magnitude and the
 * status palette for state; every chart has a table beside it and a CSV export.
 */

import { useMemo, useState } from 'react';
import { useNow } from '@/lib/use-now';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend } from 'recharts';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import Tabs from '@/components/ui/Tabs';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { DownloadIcon } from '@/components/ui/Icons';
import { PanelBody } from '@/components/admin/Shared';
import { useOps } from '@/lib/ops/use-ops';
import { onHand, uncollectedContainers, activeHolds } from '@/lib/ops/ops';
import { formatMoney, downloadCsv, formatDate } from '@/lib/format';
import { SERVICE_LABELS, BUCKETS, BUCKET_LABELS, type ServiceCode } from '@/lib/ops/types';

type Tab = 'terminal' | 'gate' | 'finance' | 'inventory';
const INDIGO = '#283F8F';
const INDIGO_LIGHT = '#9AA8D6';
const STATUS = { available: '#283F8F', reserved: '#9AA8D6', damaged: '#C0352B', held: '#B7791F' } as const;
const DAY = 86400000;

export default function ReportsPage() {
  const { db, actor } = useOps();
  const [tab, setTab] = useState<Tab>('terminal');
  const [days, setDays] = useState(14);
  const now = useNow();

  const data = useMemo(() => {
    if (!db) return null;
    const terminals = db.locations.filter(l => l.type === 'terminal');
    const yard = terminals.map(t => { const boxes = db.containers.filter(c => c.locationId === t.id && c.status === 'in_yard'); return { code: t.code, name: t.name, teu: boxes.reduce((s, c) => s + (c.size === '20' ? 1 : 2), 0), capacity: t.yardCapacityTeu ?? 0, boxes: boxes.length, reefers: boxes.filter(c => c.reefer).length, holds: boxes.filter(c => activeHolds(c).length > 0).length }; });
    const calls = db.vesselCalls.filter(c => c.status === 'departed' || c.status === 'completed').map(c => { const hours = c.atb && c.opsCompletedAt ? (new Date(c.opsCompletedAt).getTime() - new Date(c.atb).getTime()) / 3600000 : 0; const moves = c.discharged + c.loaded + c.restows; return { vessel: c.vessel, voyage: c.voyage, terminal: db.locations.find(l => l.id === c.terminalId)?.code, moves, hours: Math.round(hours * 10) / 10, gmph: hours > 0 ? Math.round((moves / hours) * 10) / 10 : 0, completed: c.opsCompletedAt ?? '' }; }).sort((a, b) => b.completed.localeCompare(a.completed));
    const dwell = db.containers.filter(c => c.category === 'import' && c.dischargedAt && (c.gateOutAt || c.status === 'in_yard')).map(c => Math.max(1, Math.ceil(((c.gateOutAt ? new Date(c.gateOutAt).getTime() : now) - new Date(c.dischargedAt!).getTime()) / DAY)));
    const dwellBuckets = [['1–3 days', 1, 3], ['4–7 days', 4, 7], ['8–10 days', 8, 10], ['11–15 days', 11, 15], ['16+ days', 16, 9999]] as const;
    const dwellSeries = dwellBuckets.map(([label, from, to]) => ({ label, count: dwell.filter(d => d >= from && d <= to).length }));
    const gateDays = Array.from({ length: days }, (_, i) => { const day = new Date(now - (days - 1 - i) * DAY).toISOString().slice(0, 10); const tx = db.gateTransactions.filter(t => t.at.slice(0, 10) === day); return { day: day.slice(5), date: day, out: tx.filter(t => t.direction === 'out').length, in: tx.filter(t => t.direction === 'in').length, overtime: tx.filter(t => t.overtime).length }; });
    const tokens = db.tokens.filter(t => new Date(t.createdAt).getTime() > now - days * DAY);
    const tokenStats = { generated: tokens.length, completed: tokens.filter(t => t.status === 'completed').length, expired: tokens.filter(t => t.status === 'expired').length, cancelled: tokens.filter(t => t.status === 'cancelled').length, amendments: tokens.reduce((s, t) => s + t.amendments, 0) };
    const uncollected = uncollectedContainers(db, new Date(now).toISOString()).length;
    const since = now - days * DAY;
    const chargesInRange = db.charges.filter(c => new Date(c.createdAt).getTime() > since && c.amount > 0);
    const groups: Record<string, ServiceCode[]> = { Stevedoring: ['STEV_FULL', 'STEV_EMPTY', 'STEV_TS_FULL', 'STEV_TS_EMPTY', 'PRC_FULL', 'PRC_EMPTY', 'RESTOW'], Storage: ['STORAGE_IMPORT', 'STORAGE_EXPORT', 'STORAGE_EMPTY', 'STORAGE_TS'], 'Shifting and services': ['SHIFT_CFS', 'SHIFT_SCAN', 'SHIFT_OTHER', 'EMPTY_RELEASE', 'DG_SURCHARGE', 'REEFER_MONITOR', 'VGM', 'OVERTIME_GATE'], 'E-tokens': ['ETOKEN', 'ETOKEN_AMEND'], 'Inland and transport': ['INLAND_TRANSFER', 'TRANSPORT'], Warehousing: ['WH_HANDLING', 'WH_STORAGE'] };
    const revenue = Object.entries(groups).map(([group, codes]) => ({ group, amount: Math.round(chargesInRange.filter(c => codes.includes(c.serviceCode)).reduce((s, c) => s + c.amount, 0) * 100) / 100 })).filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);
    const byParty = db.parties.map(p => { const open = db.invoices.filter(i => i.partyId === p.id && ['issued', 'partially_paid', 'overdue'].includes(i.status)); return { party: p.name, invoices: open.length, outstanding: Math.round(open.reduce((s, i) => s + i.total - i.paid, 0) * 100) / 100, overdue: Math.round(open.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total - i.paid, 0) * 100) / 100 }; }).filter(r => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
    const receipts = db.invoices.flatMap(i => i.payments).filter(p => new Date(p.at).getTime() > since).reduce((s, p) => s + p.amount, 0);
    const warehouses = db.locations.filter(l => ['warehouse', 'logistics_centre', 'inland_depot'].includes(l.type)).map(w => { const bal = db.balances.filter(b => b.locationId === w.id); return { code: w.code, name: w.name, available: bal.reduce((s, b) => s + b.available, 0), reserved: bal.reduce((s, b) => s + b.reserved, 0), damaged: bal.reduce((s, b) => s + b.damaged, 0), held: bal.reduce((s, b) => s + b.held, 0), skus: new Set(bal.filter(b => onHand(b) > 0).map(b => b.skuId)).size }; }).filter(w => w.available + w.reserved + w.damaged + w.held > 0);
    const movementsInRange = db.movements.filter(m => new Date(m.timestamp).getTime() > since);
    const opsStats = { receipts: movementsInRange.filter(m => m.type === 'receipt').reduce((s, m) => s + m.quantity, 0), picks: movementsInRange.filter(m => m.type === 'pick').reduce((s, m) => s + m.quantity, 0), adjustments: movementsInRange.filter(m => m.type === 'adjustment' || m.type === 'reversal').length, damaged: movementsInRange.filter(m => m.type === 'damage').reduce((s, m) => s + m.quantity, 0), discrepancies: db.operations.filter(o => new Date(o.completedAt).getTime() > since && o.exceptions.length > 0).length };
    const transport = { jobs: db.transportJobs.filter(j => new Date(j.createdAt).getTime() > since).length, delivered: db.transportJobs.filter(j => j.deliveredAt && new Date(j.deliveredAt).getTime() > since).length, enRoute: db.transportJobs.filter(j => j.status === 'en_route').length };
    return { yard, calls, dwellSeries, dwell, gateDays, tokenStats, uncollected, revenue, byParty, receipts, warehouses, opsStats, transport, chargesTotal: chargesInRange.reduce((s, c) => s + c.amount, 0) };
  }, [db, days, now]);

  if (!db || !actor || !data) return <PageSkeleton />;
  const stamp = new Date(now).toISOString().slice(0, 10);
  const tooltipStyle = { contentStyle: { borderRadius: 12, border: '1px solid #DDE2E7', boxShadow: '0 6px 24px rgba(15,23,41,0.08)', fontSize: 12 }, labelStyle: { color: '#0F1729', fontWeight: 600 }, cursor: { fill: 'rgba(40,63,143,0.05)' } };
  const avgDwell = data.dwell.length ? (data.dwell.reduce((s, d) => s + d, 0) / data.dwell.length).toFixed(1) : '0';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Control" title="Reports" subtitle="Management view across terminals, gate, logistics, finance and inventory, computed from the same records the operations screens write. In production these queries run on a read replica." action={<div className="flex gap-2">{[7, 14, 30].map(d => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`h-10 rounded-lg border px-3 text-[12px] font-semibold transition-all sm:text-[13px] ${days === d ? 'border-primary/25 bg-primary/[0.07] text-primary' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>{d} days</button>)}</div>} />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Icon />} label="Gate moves" value={data.gateDays.reduce((s, d) => s + d.in + d.out, 0)} description={`last ${days} days`} />
        <StatCard icon={<Icon />} label="Average import dwell" value={`${avgDwell} d`} description={`${data.uncollected} beyond the collection window`} />
        <StatCard icon={<Icon />} label="Charges raised" value={formatMoney(data.chargesTotal)} description={`receipts ${formatMoney(data.receipts)}`} />
        <StatCard icon={<Icon />} label="Warehouse throughput" value={data.opsStats.receipts + data.opsStats.picks} description={`${data.opsStats.receipts} in, ${data.opsStats.picks} out`} />
      </section>
      <Panel delay={0.08}>
        <Tabs tabs={[{ id: 'terminal', label: 'Terminal and yard' }, { id: 'gate', label: 'Gate and e-tokens' }, { id: 'finance', label: 'Finance' }, { id: 'inventory', label: 'Inventory and logistics' }]} value={tab} onChange={setTab} />
        {tab === 'terminal' && (
          <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-gray-100">
            <div>
              <SectionHeader title="Yard utilisation" description="TEU in yard per terminal; red above 85% of design capacity" action={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`yard-${stamp}.csv`, ['Terminal', 'TEU', 'Capacity', 'Containers', 'Reefers', 'On hold'], data.yard.map(y => [y.name, y.teu, y.capacity, y.boxes, y.reefers, y.holds]))}><DownloadIcon />CSV</ToolbarButton>} />
              <PanelBody>
                <div className="h-56"><ResponsiveContainer><BarChart data={data.yard} barSize={22} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#ECEFF3" /><XAxis dataKey="code" tick={{ fontSize: 12, fill: '#8A93A3' }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#8A93A3' }} axisLine={false} tickLine={false} /><Tooltip {...tooltipStyle} formatter={(value, _name, item) => { const p = (item as { payload?: { capacity: number } }).payload; return [`${value} TEU of ${p?.capacity.toLocaleString()} (${p?.capacity ? Math.round((Number(value) / p.capacity) * 1000) / 10 : 0}%)`, 'In yard']; }} /><Bar dataKey="teu" radius={[4, 4, 0, 0]}>{data.yard.map(y => <Cell key={y.code} fill={y.capacity && y.teu / y.capacity > 0.85 ? '#C0352B' : INDIGO} />)}</Bar></BarChart></ResponsiveContainer></div>
                <table className="mt-3 w-full text-[12px]"><thead><tr className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="py-1.5 text-left">Terminal</th><th className="py-1.5 text-right">TEU</th><th className="py-1.5 text-right">Boxes</th><th className="py-1.5 text-right">Reefers</th><th className="py-1.5 text-right">Holds</th></tr></thead><tbody>{data.yard.map(y => <tr key={y.code} className="border-t border-gray-100"><td className="py-1.5 text-secondary">{y.name}</td><td className="py-1.5 text-right tabular-nums">{y.teu.toLocaleString()}</td><td className="py-1.5 text-right tabular-nums">{y.boxes}</td><td className="py-1.5 text-right tabular-nums">{y.reefers}</td><td className="py-1.5 text-right tabular-nums">{y.holds}</td></tr>)}</tbody></table>
              </PanelBody>
            </div>
            <div>
              <SectionHeader title="Vessel productivity" description="Gross moves per hour per completed call; benchmark 29" action={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`vessel-productivity-${stamp}.csv`, ['Vessel', 'Voyage', 'Terminal', 'Moves', 'Hours', 'GMPH', 'Completed'], data.calls.map(c => [c.vessel, c.voyage, c.terminal, c.moves, c.hours, c.gmph, c.completed]))}><DownloadIcon />CSV</ToolbarButton>} />
              <PanelBody>
                <table className="w-full text-[12px]"><thead><tr className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="py-1.5 text-left">Vessel</th><th className="py-1.5 text-right">Moves</th><th className="py-1.5 text-right">Hours</th><th className="py-1.5 text-right">GMPH</th></tr></thead><tbody>{data.calls.slice(0, 8).map(c => <tr key={c.voyage + c.terminal} className="border-t border-gray-100"><td className="py-1.5 text-secondary">{c.vessel}<span className="block font-mono text-[11px] text-gray-400">{c.voyage} · {c.terminal} · {formatDate(c.completed)}</span></td><td className="py-1.5 text-right tabular-nums">{c.moves}</td><td className="py-1.5 text-right tabular-nums">{c.hours}</td><td className={`py-1.5 text-right font-semibold tabular-nums ${c.gmph >= 29 ? 'text-[#1F8F6E]' : c.gmph > 0 ? 'text-[#B7791F]' : 'text-gray-400'}`}>{c.gmph || '—'}</td></tr>)}{data.calls.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">No completed calls yet.</td></tr>}</tbody></table>
                <p className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400">Import dwell time, days from discharge to gate-out</p>
                <div className="h-40"><ResponsiveContainer><BarChart data={data.dwellSeries} barSize={26} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}><CartesianGrid vertical={false} stroke="#ECEFF3" /><XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A93A3' }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8A93A3' }} axisLine={false} tickLine={false} /><Tooltip {...tooltipStyle} formatter={value => [String(value), 'Containers']} /><Bar dataKey="count" fill={INDIGO} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
              </PanelBody>
            </div>
          </div>
        )}
        {tab === 'gate' && (
          <div className="grid gap-0 lg:grid-cols-3 lg:divide-x lg:divide-gray-100">
            <div className="lg:col-span-2">
              <SectionHeader title="Gate transactions per day" description={`Gate-in and gate-out, last ${days} days`} action={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`gate-${stamp}.csv`, ['Date', 'Gate in', 'Gate out', 'Overtime'], data.gateDays.map(d => [d.date, d.in, d.out, d.overtime]))}><DownloadIcon />CSV</ToolbarButton>} />
              <PanelBody>
                <div className="h-64"><ResponsiveContainer><BarChart data={data.gateDays} barSize={days > 14 ? 10 : 18} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}><CartesianGrid vertical={false} stroke="#ECEFF3" /><XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8A93A3' }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8A93A3' }} axisLine={false} tickLine={false} /><Tooltip {...tooltipStyle} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="out" name="Gate out" stackId="a" fill={INDIGO} /><Bar dataKey="in" name="Gate in" stackId="a" fill={INDIGO_LIGHT} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
              </PanelBody>
            </div>
            <div>
              <SectionHeader title="E-token performance" description={`Last ${days} days`} />
              <ul className="divide-y divide-gray-100">
                {[['Tokens generated', data.tokenStats.generated], ['Completed at the gate', data.tokenStats.completed], ['Expired unused', data.tokenStats.expired], ['Cancelled', data.tokenStats.cancelled], ['Amendments', data.tokenStats.amendments], ['Overtime deliveries', data.gateDays.reduce((s, d) => s + d.overtime, 0)], ['Uncollected beyond window now', data.uncollected]].map(([label, value]) => <li key={label} className="flex items-center justify-between px-4 py-3"><span className="text-[13px] text-gray-600">{label}</span><span className="font-heading text-[18px] font-bold text-secondary">{value}</span></li>)}
              </ul>
            </div>
          </div>
        )}
        {tab === 'finance' && (
          <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-gray-100">
            <div>
              <SectionHeader title="Charges raised by service group" description={`Last ${days} days, before VAT`} action={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`charges-by-group-${stamp}.csv`, ['Group', 'Amount AED'], data.revenue.map(r => [r.group, r.amount]))}><DownloadIcon />CSV</ToolbarButton>} />
              <PanelBody>
                <div className="h-64"><ResponsiveContainer><BarChart data={data.revenue} layout="vertical" barSize={18} margin={{ top: 4, right: 24, left: 24, bottom: 0 }}><CartesianGrid horizontal={false} stroke="#ECEFF3" /><XAxis type="number" tick={{ fontSize: 11, fill: '#8A93A3' }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} /><YAxis type="category" dataKey="group" width={120} tick={{ fontSize: 12, fill: '#5B6576' }} axisLine={false} tickLine={false} /><Tooltip {...tooltipStyle} formatter={value => [formatMoney(Number(value)), 'Charges']} /><Bar dataKey="amount" fill={INDIGO} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
                <p className="mt-2 !text-[12px] !text-gray-400">{Object.keys(SERVICE_LABELS).length} service codes grouped; see Finance for line detail.</p>
              </PanelBody>
            </div>
            <div>
              <SectionHeader title="Outstanding by party" description="Open invoices" action={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`outstanding-${stamp}.csv`, ['Party', 'Open invoices', 'Outstanding', 'Overdue'], data.byParty.map(r => [r.party, r.invoices, r.outstanding, r.overdue]))}><DownloadIcon />CSV</ToolbarButton>} />
              <table className="w-full text-[12px]"><thead><tr className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="px-4 py-2 text-left">Party</th><th className="px-4 py-2 text-right">Invoices</th><th className="px-4 py-2 text-right">Outstanding</th><th className="px-4 py-2 text-right">Overdue</th></tr></thead><tbody>{data.byParty.map(r => <tr key={r.party} className="border-t border-gray-100"><td className="px-4 py-2 text-secondary">{r.party}</td><td className="px-4 py-2 text-right tabular-nums">{r.invoices}</td><td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.outstanding)}</td><td className={`px-4 py-2 text-right tabular-nums ${r.overdue ? 'font-semibold text-[#C0352B]' : 'text-gray-400'}`}>{r.overdue ? formatMoney(r.overdue) : '—'}</td></tr>)}{data.byParty.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">Nothing outstanding.</td></tr>}</tbody></table>
            </div>
          </div>
        )}
        {tab === 'inventory' && (
          <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-gray-100">
            <div>
              <SectionHeader title="Stock by warehouse" description="Units by bucket" action={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`stock-by-warehouse-${stamp}.csv`, ['Warehouse', ...BUCKETS.map(b => BUCKET_LABELS[b]), 'SKUs'], data.warehouses.map(w => [w.name, w.available, w.reserved, w.damaged, w.held, w.skus]))}><DownloadIcon />CSV</ToolbarButton>} />
              <PanelBody>
                <div className="h-56"><ResponsiveContainer><BarChart data={data.warehouses} barSize={28} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#ECEFF3" /><XAxis dataKey="code" tick={{ fontSize: 12, fill: '#8A93A3' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: '#8A93A3' }} axisLine={false} tickLine={false} /><Tooltip {...tooltipStyle} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />{BUCKETS.map((bucket, index) => <Bar key={bucket} dataKey={bucket} name={BUCKET_LABELS[bucket]} stackId="a" fill={STATUS[bucket]} radius={index === BUCKETS.length - 1 ? [4, 4, 0, 0] : undefined} />)}</BarChart></ResponsiveContainer></div>
                <table className="mt-3 w-full text-[12px]"><thead><tr className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="py-1.5 text-left">Warehouse</th><th className="py-1.5 text-right">Available</th><th className="py-1.5 text-right">Allocated</th><th className="py-1.5 text-right">Damaged</th><th className="py-1.5 text-right">Held</th><th className="py-1.5 text-right">SKUs</th></tr></thead><tbody>{data.warehouses.map(w => <tr key={w.code} className="border-t border-gray-100"><td className="py-1.5 text-secondary">{w.name}</td><td className="py-1.5 text-right tabular-nums">{w.available.toLocaleString()}</td><td className="py-1.5 text-right tabular-nums">{w.reserved.toLocaleString()}</td><td className="py-1.5 text-right tabular-nums">{w.damaged}</td><td className="py-1.5 text-right tabular-nums">{w.held}</td><td className="py-1.5 text-right tabular-nums">{w.skus}</td></tr>)}</tbody></table>
              </PanelBody>
            </div>
            <div>
              <SectionHeader title="Operations and transport" description={`Last ${days} days`} />
              <ul className="divide-y divide-gray-100">
                {[['Units received', data.opsStats.receipts], ['Units picked and dispatched', data.opsStats.picks], ['Units damaged on receipt', data.opsStats.damaged], ['Operations with discrepancies', data.opsStats.discrepancies], ['Adjustments and reversals posted', data.opsStats.adjustments], ['Transport jobs created', data.transport.jobs], ['Deliveries with proof of delivery', data.transport.delivered], ['Trucks en route now', data.transport.enRoute]].map(([label, value]) => <li key={label} className="flex items-center justify-between px-4 py-3"><span className="text-[13px] text-gray-600">{label}</span><span className="font-heading text-[18px] font-bold text-secondary">{value}</span></li>)}
              </ul>
            </div>
          </div>
        )}
      </Panel>
    </motion.div>
  );
}

function Icon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
}
