'use client';

/*
 * Customers and parties: shipping lines, consignees, clearing agents, hauliers,
 * contract-logistics customers and shippers. Portal registration is a condition
 * for online payment and e-tokens, so it is visible and editable here.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import ListToolbar from '@/components/ui/ListToolbar';
import Pagination from '@/components/ui/Pagination';
import FormDialog from '@/components/ui/FormDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field, StatusBadge, Avatar, IconButton } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT } from '@/components/ui/Table';
import { PlusIcon, EditIcon } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops, outstandingFor } from '@/lib/ops/ops';
import { useList } from '@/lib/use-list';
import { formatMoney } from '@/lib/format';
import { PARTY_TYPE_LABELS, type Party, type PartyType } from '@/lib/ops/types';

export default function CustomersPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const { run } = useAction();
  const [editing, setEditing] = useState<Party | 'new' | null>(null);
  const parties = useMemo(() => db ? [...db.parties].sort((a, b) => a.name.localeCompare(b.name)) : [], [db]);
  const list = useList<Party, { type: string; portal: string }>(parties, {
    pageSize: 12,
    initialFilters: { type: 'All', portal: 'All' },
    search: (party, query) => [party.name, party.code, party.country, party.email].some(value => value.toLowerCase().includes(query)),
    filter: (party, filters) => (filters.type === 'All' || party.type === filters.type) && (filters.portal === 'All' || (filters.portal === 'yes') === party.portalRegistered),
  });
  if (!db || !actor) return <PageSkeleton />;
  const canEdit = ['customer_service', 'finance_manager', 'system_admin'].includes(actor.role);
  const activity = (party: Party) => {
    const containers = db.containers.filter(c => c.consigneeId === party.id || c.lineId === party.id || c.haulierId === party.id || c.clearingAgentId === party.id);
    const open = containers.filter(c => c.status === 'in_yard' || c.status === 'expected').length;
    return { containers: containers.length, open, outstanding: outstandingFor(db, party.id), skus: db.skus.filter(s => s.customerId === party.id).length };
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Customers" title="Customers and parties" subtitle="Every organisation that appears on a container, order or invoice. Consignees and hauliers must be registered on the customer portal before they can pay online or generate e-tokens." action={canEdit ? <ToolbarButton onClick={() => setEditing('new')}><PlusIcon />New party</ToolbarButton> : undefined} />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Icon />} label="Shipping lines" value={parties.filter(p => p.type === 'shipping_line').length} description="carriers" />
        <StatCard icon={<Icon />} label="Consignees and agents" value={parties.filter(p => ['consignee', 'clearing_agent', 'shipper'].includes(p.type)).length} description="cargo interests" />
        <StatCard icon={<Icon />} label="Hauliers" value={parties.filter(p => p.type === 'haulier').length} description={`${parties.filter(p => p.type === 'haulier' && p.portalRegistered).length} on the portal`} />
        <StatCard icon={<Icon />} label="Contract customers" value={parties.filter(p => p.type === 'contract_customer').length} description="Momentum warehousing" />
      </section>
      <Panel delay={0.08}>
        <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search name, code, country or email" label="Search parties" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(o => !o)} filters={list.filters}
          groups={[{ key: 'type', label: 'Type', options: (Object.keys(PARTY_TYPE_LABELS) as PartyType[]).map(t => ({ value: t, label: PARTY_TYPE_LABELS[t] })) }, { key: 'portal', label: 'Portal', options: [{ value: 'yes', label: 'Registered' }, { value: 'no', label: 'Not registered' }] }]}
          onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters} />
        {list.pageItems.length === 0 ? <EmptyState title="No parties" description="Nothing matches the current search and filters." /> : (
          <>
            <TableWrap minWidth={940}>
              <THead><Th>Party</Th><Th>Type</Th><Th>Country</Th><Th>Portal</Th><Th>Containers</Th><Th align="right">Outstanding</Th><Th>Terms</Th><Th align="right">Actions</Th></THead>
              <tbody>
                {list.pageItems.map(party => { const a = activity(party); return (
                  <Tr key={party.id}>
                    <Td><div className="flex items-center gap-2.5"><Avatar name={party.name} /><div className="min-w-0"><p className="!text-[13px] !font-semibold !text-secondary">{party.name}</p><p className="font-mono !text-[12px] !text-gray-400">{party.code} · {party.email}</p></div></div></Td>
                    <Td>{PARTY_TYPE_LABELS[party.type]}</Td>
                    <Td>{party.country}</Td>
                    <Td>{party.portalRegistered ? <StatusBadge variant="success" dot>Registered</StatusBadge> : canEdit ? <button type="button" onClick={() => void run(() => ops.registerPortalAccount(actor, { partyId: party.id }), () => toast.success(`${party.name} registered on the portal`))} className="text-[12px] font-semibold text-primary hover:text-primary-dark">Register</button> : <StatusBadge variant="neutral">Not registered</StatusBadge>}</Td>
                    <Td>{a.containers ? <Link href={`/admin/containers?q=${encodeURIComponent(party.name)}`} className="font-semibold">{a.containers}</Link> : <span className="text-gray-400">0</span>}{a.open > 0 && <span className="ml-1 text-[12px] text-gray-400">({a.open} open)</span>}{a.skus > 0 && <p className="!text-[12px] !text-gray-400">{a.skus} SKUs</p>}</Td>
                    <Td align="right">{a.outstanding > 0 ? <Link href={`/admin/finance?party=${party.id}`} className="font-semibold text-[#B7791F]">{formatMoney(a.outstanding)}</Link> : <span className="text-gray-400">—</span>}</Td>
                    <Td>{party.creditTerms} days</Td>
                    <Td align="right">{canEdit && <IconButton title="Edit" onClick={() => setEditing(party)}><EditIcon /></IconButton>}</Td>
                  </Tr>
                ); })}
              </tbody>
            </TableWrap>
            <CardList>{list.pageItems.map(party => <Card key={party.id} onClick={canEdit ? () => setEditing(party) : undefined}><div className="flex items-center gap-3"><Avatar name={party.name} large /><div className="min-w-0 flex-1"><p className="!text-[14px] !font-semibold !text-secondary">{party.name}</p><p className="!text-[12px] !text-gray-400">{PARTY_TYPE_LABELS[party.type]} · {party.country}</p></div>{party.portalRegistered ? <StatusBadge variant="success">Portal</StatusBadge> : <StatusBadge variant="neutral">No portal</StatusBadge>}</div></Card>)}</CardList>
            <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
          </>
        )}
      </Panel>
      {editing && <PartyDialog party={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast.success('Party saved'); }} />}
    </motion.div>
  );
}

function PartyDialog({ party, onClose, onDone }: { party: Party | null; onClose: () => void; onDone: () => void }) {
  const { actor } = useOps();
  const { run, busy, error } = useAction();
  const [form, setForm] = useState({ code: party?.code ?? '', name: party?.name ?? '', type: party?.type ?? 'consignee' as PartyType, country: party?.country ?? 'United Arab Emirates', email: party?.email ?? '', portalRegistered: party?.portalRegistered ?? false, creditTerms: party?.creditTerms ?? 30, active: party?.active ?? true });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(c => ({ ...c, [key]: value }));
  return (
    <FormDialog open title={party ? `Edit ${party.name}` : 'New party'} submitLabel="Save" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.upsertParty(actor!, { ...form, id: party?.id }), onDone)}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Name" id="pt-name"><input id="pt-name" autoFocus className={INPUT} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Code" id="pt-code"><input id="pt-code" className={`${INPUT} font-mono uppercase`} value={form.code} onChange={e => set('code', e.target.value)} /></Field>
        <Field label="Type" id="pt-type"><select id="pt-type" className={SELECT} value={form.type} onChange={e => set('type', e.target.value as PartyType)}>{(Object.keys(PARTY_TYPE_LABELS) as PartyType[]).map(t => <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>)}</select></Field>
        <Field label="Country" id="pt-country"><input id="pt-country" className={INPUT} value={form.country} onChange={e => set('country', e.target.value)} /></Field>
        <Field label="Accounts email" id="pt-email"><input id="pt-email" type="email" className={INPUT} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Credit terms (days)" id="pt-terms"><input id="pt-terms" type="number" min={0} className={INPUT} value={form.creditTerms} onChange={e => set('creditTerms', Number(e.target.value))} /></Field>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-[13px] text-secondary"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={form.portalRegistered} onChange={e => set('portalRegistered', e.target.checked)} />Registered on the customer portal</label>
        <label className="inline-flex items-center gap-2 text-[13px] text-secondary"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={form.active} onChange={e => set('active', e.target.checked)} />Active</label>
      </div>
    </FormDialog>
  );
}

function Icon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
}
