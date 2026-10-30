'use client';

/*
 * Finance: charges raised by operations (stevedoring, storage, shifting, e-tokens,
 * handling, transport), invoices per party with VAT, online and bank payments,
 * and the tariff. Payments on a consignee's invoice settle the container for release.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import Tabs from '@/components/ui/Tabs';
import ListToolbar from '@/components/ui/ListToolbar';
import Pagination from '@/components/ui/Pagination';
import FormDialog from '@/components/ui/FormDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field, BulkBar } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT } from '@/components/ui/Table';
import { DownloadIcon, PlusIcon } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { InvoiceStatusBadge, PartyName, ContainerLink, PanelButton, PanelBody, ActionError } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { useList } from '@/lib/use-list';
import { formatMoney, formatDate, downloadCsv } from '@/lib/format';
import { INVOICE_STATUS_LABELS, SERVICE_LABELS, type Charge, type Invoice, type InvoiceStatus, type ServiceCode, type Tariff } from '@/lib/ops/types';

type Tab = 'invoices' | 'charges' | 'tariff';

export default function FinancePage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(() => (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('tab') as Tab)) || 'invoices');
  const [adding, setAdding] = useState(false);
  if (!db || !actor) return <PageSkeleton />;
  const open = db.invoices.filter(invoice => ['issued', 'partially_paid', 'overdue'].includes(invoice.status));
  const outstanding = open.reduce((sum, invoice) => sum + invoice.total - invoice.paid, 0);
  const overdue = db.invoices.filter(invoice => invoice.status === 'overdue').reduce((sum, invoice) => sum + invoice.total - invoice.paid, 0);
  const uninvoiced = db.charges.filter(charge => !charge.invoiceId && charge.amount > 0).reduce((sum, charge) => sum + charge.amount, 0);
  const month = new Date().toISOString().slice(0, 7);
  const receipts = db.invoices.flatMap(invoice => invoice.payments.filter(payment => payment.at.slice(0, 7) === month)).reduce((sum, payment) => sum + payment.amount, 0);
  const canFinance = ['finance_manager', 'system_admin'].includes(actor.role);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Finance" title="Charges and invoices" subtitle="Operations raise charges at the tariff rate as containers are discharged, stored, shifted and collected. Finance groups them into invoices per party; online card payment is the only accepted mode for cargo collection." action={canFinance || actor.role === 'customer_service' ? <ToolbarButton variant="secondary" onClick={() => setAdding(true)}><PlusIcon />Manual charge</ToolbarButton> : undefined} />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Icon />} label="Outstanding" value={formatMoney(outstanding)} description={`${open.length} open invoice${open.length === 1 ? '' : 's'}`} />
        <StatCard icon={<Icon />} label="Overdue" value={formatMoney(overdue)} description={`${db.invoices.filter(i => i.status === 'overdue').length} invoice${db.invoices.filter(i => i.status === 'overdue').length === 1 ? '' : 's'}`} />
        <StatCard icon={<Icon />} label="Uninvoiced charges" value={formatMoney(uninvoiced)} description={`${db.charges.filter(c => !c.invoiceId && c.amount > 0).length} lines`} />
        <StatCard icon={<Icon />} label="Received this month" value={formatMoney(receipts)} description="all payment methods" />
      </section>
      <Panel delay={0.08}>
        <Tabs tabs={[{ id: 'invoices', label: 'Invoices' }, { id: 'charges', label: 'Charges' }, { id: 'tariff', label: 'Tariff' }]} value={tab} onChange={setTab} counts={{ invoices: db.invoices.length, charges: db.charges.filter(c => !c.invoiceId && c.amount > 0).length }} />
        {tab === 'invoices' && <InvoicesTab />}
        {tab === 'charges' && <ChargesTab canFinance={canFinance} onInvoiced={reference => toast.success(`${reference} created`)} />}
        {tab === 'tariff' && <TariffTab canFinance={canFinance} />}
      </Panel>
      {adding && <ChargeDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast.success('Charge added'); }} />}
    </motion.div>
  );
}

function InvoicesTab() {
  const { db } = useOps();
  const invoices = useMemo(() => db ? [...db.invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [], [db]);
  const list = useList<Invoice, { status: string; party: string }>(invoices, {
    pageSize: 12,
    initialFilters: { status: 'All', party: typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('party') ?? 'All' : 'All' },
    search: (invoice, query) => [invoice.reference, db?.parties.find(p => p.id === invoice.partyId)?.name ?? '', ...invoice.payments.map(p => p.receiptNumber)].some(value => value.toLowerCase().includes(query)),
    filter: (invoice, filters) => (filters.status === 'All' || invoice.status === filters.status) && (filters.party === 'All' || invoice.partyId === filters.party),
  });
  if (!db) return null;
  return (
    <>
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search invoice, party or receipt number" label="Search invoices" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(o => !o)} filters={list.filters}
        groups={[{ key: 'status', label: 'Status', options: (Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map(s => ({ value: s, label: INVOICE_STATUS_LABELS[s] })) }, { key: 'party', label: 'Party', options: db.parties.filter(p => db.invoices.some(i => i.partyId === p.id)).map(p => ({ value: p.id, label: p.name })) }]}
        onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters}
        extra={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, ['Invoice', 'Party', 'Status', 'Issued', 'Due', 'Subtotal', 'VAT', 'Total', 'Paid', 'Currency'], list.filtered.map(i => [i.reference, db.parties.find(p => p.id === i.partyId)?.name, i.status, i.issuedAt ?? '', i.dueAt ?? '', i.subtotal, i.vat, i.total, i.paid, i.currency]))}><DownloadIcon />CSV</ToolbarButton>} />
      {list.pageItems.length === 0 ? <EmptyState title="No invoices" description="Group uninvoiced charges from the Charges tab." /> : (
        <>
          <TableWrap minWidth={900}>
            <THead><Th>Invoice</Th><Th>Party</Th><Th>Issued</Th><Th>Due</Th><Th align="right">Total</Th><Th align="right">Paid</Th><Th align="right">Balance</Th><Th>Status</Th></THead>
            <tbody>
              {list.pageItems.map(invoice => (
                <Tr key={invoice.id}>
                  <Td><Link href={`/admin/finance/${invoice.id}`} className="font-mono !text-[13px] !font-semibold text-primary">{invoice.reference}</Link><p className="!text-[12px] !text-gray-400">{invoice.chargeIds.length} line{invoice.chargeIds.length === 1 ? '' : 's'}</p></Td>
                  <Td><PartyName db={db} id={invoice.partyId} /></Td>
                  <Td className="tabular-nums">{invoice.issuedAt ? formatDate(invoice.issuedAt) : <span className="text-gray-400">Draft</span>}</Td>
                  <Td className="tabular-nums">{invoice.dueAt ? formatDate(invoice.dueAt) : '—'}</Td>
                  <Td align="right">{formatMoney(invoice.total, invoice.currency)}</Td>
                  <Td align="right">{formatMoney(invoice.paid, invoice.currency)}</Td>
                  <Td align="right" className={invoice.total - invoice.paid > 0 && invoice.status !== 'cancelled' ? 'font-semibold text-secondary' : ''}>{formatMoney(invoice.status === 'cancelled' ? 0 : invoice.total - invoice.paid, invoice.currency)}</Td>
                  <Td><InvoiceStatusBadge status={invoice.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
          <CardList>{list.pageItems.map(invoice => <Card key={invoice.id}><Link href={`/admin/finance/${invoice.id}`} className="block"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono !text-[13px] !font-semibold !text-primary">{invoice.reference}</p><p className="!text-[12px] !text-gray-400"><PartyName db={db} id={invoice.partyId} /></p></div><InvoiceStatusBadge status={invoice.status} /></div><p className="mt-2 !text-[13px] !text-secondary">{formatMoney(invoice.total, invoice.currency)} · paid {formatMoney(invoice.paid, invoice.currency)}</p></Link></Card>)}</CardList>
          <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
        </>
      )}
    </>
  );
}

function ChargesTab({ canFinance, onInvoiced }: { canFinance: boolean; onInvoiced: (reference: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueDays, setDueDays] = useState(30);
  const charges = useMemo(() => db ? db.charges.filter(c => !c.invoiceId && c.amount > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [], [db]);
  const list = useList<Charge, { party: string; service: string }>(charges, {
    pageSize: 15,
    initialFilters: { party: 'All', service: 'All' },
    search: (charge, query) => [charge.reference, charge.description, db?.parties.find(p => p.id === charge.partyId)?.name ?? '', db?.containers.find(c => c.id === charge.containerId)?.number ?? ''].some(value => value.toLowerCase().includes(query)),
    filter: (charge, filters) => (filters.party === 'All' || charge.partyId === filters.party) && (filters.service === 'All' || charge.serviceCode === filters.service),
  });
  if (!db || !actor) return null;
  const selectedCharges = charges.filter(c => selected.has(c.id));
  const parties = new Set(selectedCharges.map(c => c.partyId));
  const total = selectedCharges.reduce((s, c) => s + c.amount, 0);
  return (
    <>
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search reference, description, party or container" label="Search charges" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(o => !o)} filters={list.filters}
        groups={[{ key: 'party', label: 'Party', options: db.parties.filter(p => charges.some(c => c.partyId === p.id)).map(p => ({ value: p.id, label: p.name })) }, { key: 'service', label: 'Service', options: (Object.keys(SERVICE_LABELS) as ServiceCode[]).filter(s => charges.some(c => c.serviceCode === s)).map(s => ({ value: s, label: SERVICE_LABELS[s] })) }]}
        onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters} />
      {selected.size > 0 && (
        <div className="space-y-2 px-3 pt-3 sm:px-4">
          <BulkBar count={selected.size} confirming={false} busy={busy} actionLabel="" onAction={() => {}} onCancel={() => setSelected(new Set())} />
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-[13px]">
            <span className="font-semibold text-secondary">{formatMoney(total)} before VAT for <PartyName db={db} id={[...parties][0]} /></span>
            {parties.size > 1 && <span className="text-[#C0352B]">Select charges for one party only.</span>}
            <label className="inline-flex items-center gap-2">Due in <input type="number" min={0} className={`${INPUT} !h-9 !w-20`} value={dueDays} onChange={e => setDueDays(Number(e.target.value))} /> days</label>
            {canFinance && parties.size === 1 && <><PanelButton disabled={busy} onClick={() => void run(() => ops.createInvoice(actor, { partyId: [...parties][0], chargeIds: [...selected], dueDays, issue: false }), invoice => { setSelected(new Set()); onInvoiced(invoice!.reference); })}>Create draft</PanelButton><PanelButton primary disabled={busy} onClick={() => void run(() => ops.createInvoice(actor, { partyId: [...parties][0], chargeIds: [...selected], dueDays, issue: true }), invoice => { setSelected(new Set()); onInvoiced(invoice!.reference); })}>Create and issue</PanelButton></>}
          </div>
          <ActionError message={error} />
        </div>
      )}
      {list.pageItems.length === 0 ? <EmptyState title="No uninvoiced charges" description="Charges appear here as operations raise them." /> : (
        <>
          <TableWrap minWidth={940}>
            <THead><Th className="w-10"><input type="checkbox" aria-label="Select all on this page" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={list.pageItems.every(c => selected.has(c.id))} onChange={e => setSelected(current => { const next = new Set(current); list.pageItems.forEach(c => e.target.checked ? next.add(c.id) : next.delete(c.id)); return next; })} /></Th><Th>Charge</Th><Th>Service</Th><Th>Party</Th><Th>Reference</Th><Th>Raised</Th><Th align="right">Amount</Th></THead>
            <tbody>
              {list.pageItems.map(charge => { const container = db.containers.find(c => c.id === charge.containerId); return (
                <Tr key={charge.id} selected={selected.has(charge.id)}>
                  <Td><input type="checkbox" aria-label={`Select ${charge.reference}`} className="h-4 w-4 rounded border-gray-300 accent-primary" checked={selected.has(charge.id)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(charge.id)) next.delete(charge.id); else next.add(charge.id); return next; })} /></Td>
                  <Td><span className="font-mono text-[12px] text-gray-400">{charge.reference}</span><p className="!text-[13px] !text-secondary">{charge.description}</p></Td>
                  <Td>{SERVICE_LABELS[charge.serviceCode]}</Td>
                  <Td><PartyName db={db} id={charge.partyId} /></Td>
                  <Td>{container ? <ContainerLink container={container} /> : charge.transportJobId ? db.transportJobs.find(j => j.id === charge.transportJobId)?.reference : charge.orderId ? db.warehouseOrders.find(o => o.id === charge.orderId)?.reference : '—'}</Td>
                  <Td className="tabular-nums">{formatDate(charge.createdAt)}</Td>
                  <Td align="right">{charge.quantity !== 1 && <span className="text-[12px] text-gray-400">{charge.quantity} × {charge.unitAmount.toFixed(2)} </span>}{formatMoney(charge.amount, charge.currency)}</Td>
                </Tr>
              ); })}
            </tbody>
          </TableWrap>
          <CardList>{list.pageItems.map(charge => <Card key={charge.id}><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300 accent-primary" checked={selected.has(charge.id)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(charge.id)) next.delete(charge.id); else next.add(charge.id); return next; })} /><span className="min-w-0 flex-1"><p className="!text-[13px] !text-secondary">{charge.description}</p><p className="!text-[12px] !text-gray-400"><PartyName db={db} id={charge.partyId} /> · {formatDate(charge.createdAt)}</p></span><span className="text-[13px] font-semibold text-secondary">{formatMoney(charge.amount, charge.currency)}</span></label></Card>)}</CardList>
          <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
        </>
      )}
    </>
  );
}

function TariffTab({ canFinance }: { canFinance: boolean }) {
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error } = useAction();
  const [draft, setDraft] = useState<Partial<Tariff>>({});
  if (!db) return null;
  const tariff = { ...db.tariff, ...draft };
  const pair = (label: string, key: keyof Tariff, sub?: string) => {
    const value = (tariff[key] as unknown as Record<string, [number, number]> | [number, number]);
    const tuple = (sub ? (value as Record<string, [number, number]>)[sub] : value) as [number, number];
    const update = (index: 0 | 1, amount: number) => {
      const next: [number, number] = [tuple[0], tuple[1]]; next[index] = amount;
      setDraft(current => ({ ...current, [key]: sub ? { ...(tariff[key] as Record<string, [number, number]>), [sub]: next } : next }));
    };
    return (
      <tr key={`${key}-${sub}`} className="border-b border-gray-100 last:border-0"><td className="px-3 py-2 text-[13px] text-secondary">{label}</td>
        {[0, 1].map(index => <td key={index} className="px-3 py-1.5 text-right"><input aria-label={`${label} ${index === 0 ? '20 ft' : 'over 20 ft'}`} type="number" min={0} disabled={!canFinance} className={`${INPUT} !h-9 !w-28 text-right`} value={tuple[index]} onChange={e => update(index as 0 | 1, Number(e.target.value))} /></td>)}
      </tr>
    );
  };
  const single = (label: string, key: keyof Tariff, note?: string) => (
    <tr key={key} className="border-b border-gray-100 last:border-0"><td className="px-3 py-2 text-[13px] text-secondary">{label}{note && <span className="block text-[11px] text-gray-400">{note}</span>}</td><td className="px-3 py-1.5 text-right" colSpan={2}><input aria-label={label} type="number" min={0} step="0.01" disabled={!canFinance} className={`${INPUT} !h-9 !w-28 text-right`} value={tariff[key] as number} onChange={e => setDraft(current => ({ ...current, [key]: Number(e.target.value) }))} /></td></tr>
  );
  const slabs = (label: string, key: 'storageImport' | 'storageExport', table: 'normal' | 'oog' | 'dg') => (
    <div key={`${key}-${table}`}>
      <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-400">{label}</p>
      <table className="w-full text-[13px]"><tbody>{tariff[key][table].map(([from, to, r20, r40], index) => <tr key={index} className="border-b border-gray-100 last:border-0"><td className="px-3 py-1.5 text-secondary">Day {from}{to ? ` to ${to}` : ' onwards'}</td><td className="px-3 py-1.5 text-right tabular-nums">{r20}</td><td className="px-3 py-1.5 text-right tabular-nums">{r40}</td></tr>)}</tbody></table>
    </div>
  );
  return (
    <PanelBody>
      <p className="mb-4 !text-[13px] !text-gray-600">Values in AED from the Khorfakkan Container Terminal Schedule of Charges effective 1 June 2026, exclusive of VAT ({Math.round(tariff.vatRate * 100)}%). Rates per container: left column up to 20 ft, right column over 20 ft. Dangerous goods carry {tariff.dgSurchargePct}% on stevedoring, shifting and storage. Items without a published rate are marked as placeholders.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <table className="w-full"><thead><tr className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="px-3 py-2 text-left">Stevedoring and gate</th><th className="px-3 py-2 text-right">Up to 20 ft</th><th className="px-3 py-2 text-right">Over 20 ft</th></tr></thead><tbody>
            {pair('Discharge or load, full container', 'stevedoring', 'full')}
            {pair('Discharge or load, empty container', 'stevedoring', 'empty')}
            {pair('Transhipment, full (vessel to yard to vessel)', 'stevedoring', 'tsFull')}
            {pair('Transhipment, empty', 'stevedoring', 'tsEmpty')}
            {pair('Port receiving charge, full', 'portReceiving', 'full')}
            {pair('Port receiving charge, empty', 'portReceiving', 'empty')}
            {pair('Shifting to CFS, round trip', 'shifting', 'cfs')}
            {pair('Shifting for scanning', 'shifting', 'scan')}
            {pair('Other shifting within the terminal', 'shifting', 'other')}
            {pair('Empty release handling', 'shifting', 'emptyRelease')}
            {pair('Storage, empty, per day', 'storageEmptyPerDay')}
            {pair('Storage, transhipment, per day', 'storageTranshipmentPerDay')}
            {pair('Inland transfer to depot (placeholder)', 'inlandTransfer')}
          </tbody></table>
          <table className="mt-4 w-full"><thead><tr className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="px-3 py-2 text-left">Fees</th><th className="px-3 py-2 text-right" colSpan={2}>AED</th></tr></thead><tbody>
            {single('E-token, import pick-up (incl. VAT)', 'etoken')}
            {single('E-token amendment (incl. VAT)', 'etokenAmendment')}
            {single('Weighbridge and VGM', 'vgm', 'placeholder')}
            {single('Reefer monitoring per day', 'reeferMonitoringPerDay', 'placeholder, tariff clause 16')}
            {single('Overtime gate delivery, 22:00 to 06:00', 'overtimeGate', 'placeholder, tariff clause 21.1')}
            {single('Warehouse handling per unit', 'warehouseHandlingPerUnit', 'Momentum contract rate, placeholder')}
            {single('Transport per trip', 'transportPerTrip', 'Momentum contract rate, placeholder')}
            {single('Uncollected transfer window (days)', 'uncollectedTransferDays', 'Momentum advisory, April 2026')}
          </tbody></table>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-3 text-[12px] text-gray-600">Free storage for import full containers: {tariff.freeDays.nonDg} days non-DG, {tariff.freeDays.dg} day DG, counted from discharge (container enquiry page). Thereafter the slabs below apply per day or part thereof.</div>
          {slabs('Import full, normal', 'storageImport', 'normal')}
          {slabs('Import full, out of gauge', 'storageImport', 'oog')}
          {slabs('Import full, dangerous goods', 'storageImport', 'dg')}
          {slabs('Export full, normal', 'storageExport', 'normal')}
          {slabs('Export full, out of gauge', 'storageExport', 'oog')}
          {slabs('Export full, dangerous goods', 'storageExport', 'dg')}
        </div>
      </div>
      {canFinance && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <PanelButton primary disabled={busy || Object.keys(draft).length === 0} onClick={() => void run(() => ops.updateTariff(actor!, { patch: draft }), () => { setDraft({}); toast.success('Tariff updated and audited'); })}>Save tariff changes</PanelButton>
          <PanelButton disabled={Object.keys(draft).length === 0} onClick={() => setDraft({})}>Discard</PanelButton>
          <ActionError message={error} />
        </div>
      )}
    </PanelBody>
  );
}

function ChargeDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [form, setForm] = useState({ serviceCode: 'SHIFT_OTHER' as ServiceCode, partyId: db?.parties[0]?.id ?? '', containerId: '', quantity: 1, unitAmount: 0, description: '' });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(c => ({ ...c, [key]: value }));
  if (!db) return null;
  return (
    <FormDialog open title="Manual charge" description="For services outside the automatic tariff events, for example special equipment, restows or value-added services." submitLabel="Add charge" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.createCharge(actor!, { ...form, containerId: form.containerId || undefined }), onDone)}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Service" id="ch-service"><select id="ch-service" className={SELECT} value={form.serviceCode} onChange={e => set('serviceCode', e.target.value as ServiceCode)}>{(Object.keys(SERVICE_LABELS) as ServiceCode[]).map(s => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}</select></Field>
        <Field label="Charged to" id="ch-party"><select id="ch-party" className={SELECT} value={form.partyId} onChange={e => set('partyId', e.target.value)}>{db.parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Container (optional)" id="ch-container"><select id="ch-container" className={SELECT} value={form.containerId} onChange={e => set('containerId', e.target.value)}><option value="">None</option>{db.containers.filter(c => c.status !== 'delivered').map(c => <option key={c.id} value={c.id}>{c.number}</option>)}</select></Field>
        <Field label="Description" id="ch-desc"><input id="ch-desc" className={INPUT} value={form.description} onChange={e => set('description', e.target.value)} /></Field>
        <Field label="Quantity" id="ch-qty"><input id="ch-qty" type="number" min={1} className={INPUT} value={form.quantity} onChange={e => set('quantity', Number(e.target.value))} /></Field>
        <Field label="Unit amount (AED)" id="ch-amount"><input id="ch-amount" type="number" min={0} step="0.01" className={INPUT} value={form.unitAmount} onChange={e => set('unitAmount', Number(e.target.value))} /></Field>
      </div>
    </FormDialog>
  );
}

function Icon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
}
