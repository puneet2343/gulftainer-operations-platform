'use client';

/*
 * Vessel calls: the schedule for every terminal in scope, with the export gate
 * window per call, progress against the planned moves, and the planner's form
 * to create a new call.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import ListToolbar from '@/components/ui/ListToolbar';
import Pagination from '@/components/ui/Pagination';
import FormDialog from '@/components/ui/FormDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Controls';
import { Progress } from '@/components/ui/KeyValue';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT } from '@/components/ui/Table';
import { PlusIcon } from '@/components/ui/Icons';
import { VesselStatusBadge } from '@/components/admin/Shared';
import { useToast } from '@/components/ui/Toast';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { useList } from '@/lib/use-list';
import { formatDateTime, formatDate, formatTime, fromLocalInput } from '@/lib/format';
import { VESSEL_STATUS_LABELS, type VesselCall, type VesselCallStatus } from '@/lib/ops/types';
import { canAccessLocation } from '@/lib/ops/core';

type Filters = { terminal: string; status: string };

export default function VesselsPage() {
  const { db, actor } = useOps();
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const calls = useMemo(() => db ? [...db.vesselCalls].sort((a, b) => new Date(b.etb).getTime() - new Date(a.etb).getTime()) : [], [db]);
  const list = useList<VesselCall, Filters>(calls, {
    initialFilters: { terminal: 'All', status: 'All' },
    search: (call, query) => [call.vessel, call.voyage, call.berth, call.service].some(value => value.toLowerCase().includes(query)),
    filter: (call, filters) => (filters.terminal === 'All' || call.terminalId === filters.terminal) && (filters.status === 'All' || call.status === filters.status),
  });

  if (!db || !actor) return <PageSkeleton />;

  const terminals = db.locations.filter(location => location.type === 'terminal');
  const active = db.vesselCalls.filter(call => ['berthed', 'working'].includes(call.status));
  const expected = db.vesselCalls.filter(call => call.status === 'expected');
  const today = new Date().toISOString().slice(0, 10);
  const completedToday = db.vesselCalls.filter(call => call.opsCompletedAt?.slice(0, 10) === today);
  const gateOpen = db.vesselCalls.filter(call => call.status === 'expected' && new Date() >= new Date(call.gateOpen) && new Date() <= new Date(call.gateClose));
  const canPlan = ['planner', 'terminal_ops', 'system_admin'].includes(actor.role);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow="Terminal"
        title="Vessel calls"
        subtitle="Berthing programme for every terminal. The export gate opens four days before ETB and closes one day before, as published on the vessel schedule."
        action={canPlan ? <ToolbarButton onClick={() => setCreating(true)}><PlusIcon />New vessel call</ToolbarButton> : undefined}
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<ShipIcon />} label="Alongside now" value={active.length} description={`${active.filter(call => call.status === 'working').length} working`} />
        <StatCard icon={<ShipIcon />} label="Expected" value={expected.length} description="not yet berthed" />
        <StatCard icon={<ShipIcon />} label="Export gate open" value={gateOpen.length} description="accepting drop-offs" />
        <StatCard icon={<ShipIcon />} label="Completed today" value={completedToday.length} description="operations finished" />
      </section>

      <Panel delay={0.08}>
        <ListToolbar
          search={list.search} onSearch={list.setSearch} placeholder="Search vessel, voyage, berth or service" label="Search vessel calls" count={list.filtered.length}
          showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(open => !open)} filters={list.filters}
          groups={[
            { key: 'terminal', label: 'Terminal', options: terminals.map(terminal => ({ value: terminal.id, label: terminal.code })) },
            { key: 'status', label: 'Status', options: (Object.keys(VESSEL_STATUS_LABELS) as VesselCallStatus[]).map(status => ({ value: status, label: VESSEL_STATUS_LABELS[status] })) },
          ]}
          onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters}
        />
        {list.pageItems.length === 0 ? <EmptyState title="No vessel calls" description={list.hasActiveFilters || list.search ? 'Nothing matches the current search and filters.' : 'Create the first call to start planning.'} /> : (
          <>
            <TableWrap minWidth={980}>
              <THead>
                <Th>Vessel</Th><Th>Terminal</Th><Th>ETA / ETB</Th><Th>ETD</Th><Th>Export gate window</Th><Th>Moves</Th><Th>Status</Th>
              </THead>
              <tbody>
                {list.pageItems.map(call => {
                  const terminal = db.locations.find(location => location.id === call.terminalId);
                  const total = call.plannedDischarge + call.plannedLoad;
                  const windowOpen = call.status === 'expected' && new Date() >= new Date(call.gateOpen) && new Date() <= new Date(call.gateClose);
                  return (
                    <Tr key={call.id} onClick={() => router.push(`/admin/vessels/${call.id}`)}>
                      <Td>
                        <Link href={`/admin/vessels/${call.id}`} className="!text-[13px] !font-semibold text-primary">{call.vessel}</Link>
                        <p className="mt-0.5 font-mono !text-[12px] !text-gray-400">{call.voyage} · {db.parties.find(party => party.id === call.lineId)?.name}</p>
                      </Td>
                      <Td>{terminal?.code}<p className="!text-[12px] !text-gray-400">berth {call.berth}</p></Td>
                      <Td className="tabular-nums">{formatDateTime(call.eta)}<p className="!text-[12px] !text-gray-400">ETB {formatDateTime(call.etb)}</p></Td>
                      <Td className="tabular-nums">{formatDateTime(call.etd)}</Td>
                      <Td className="tabular-nums">
                        {call.status === 'expected' ? <>{formatDate(call.gateOpen)} {formatTime(call.gateOpen)} to {formatDate(call.gateClose)} {formatTime(call.gateClose)}<p className={`!text-[12px] ${windowOpen ? '!font-semibold !text-[#1F8F6E]' : '!text-gray-400'}`}>{windowOpen ? 'Gate open' : new Date() < new Date(call.gateOpen) ? 'Opens later' : 'Gate closed'}</p></> : <span className="text-gray-400">Gate closed</span>}
                      </Td>
                      <Td className="w-40"><Progress value={call.discharged + call.loaded} max={total} label={`${call.discharged + call.loaded}/${total}`} tone={call.status === 'working' ? 'success' : 'primary'} /></Td>
                      <Td><VesselStatusBadge status={call.status} /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <CardList>
              {list.pageItems.map(call => (
                <Card key={call.id} onClick={() => router.push(`/admin/vessels/${call.id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="!text-[14px] !font-semibold !text-primary">{call.vessel}</p>
                      <p className="font-mono !text-[12px] !text-gray-400">{call.voyage} · {db.locations.find(l => l.id === call.terminalId)?.code} berth {call.berth}</p>
                    </div>
                    <VesselStatusBadge status={call.status} />
                  </div>
                  <p className="mt-2 !text-[12px] !text-gray-500">ETB {formatDateTime(call.etb)} · ETD {formatDateTime(call.etd)}</p>
                  <div className="mt-2"><Progress value={call.discharged + call.loaded} max={call.plannedDischarge + call.plannedLoad} label={`${call.discharged + call.loaded} of ${call.plannedDischarge + call.plannedLoad} moves`} /></div>
                </Card>
              ))}
            </CardList>
            <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
          </>
        )}
      </Panel>

      {creating && <CreateVesselCallDialog onClose={() => setCreating(false)} onCreated={call => { setCreating(false); toast.success(`${call.vessel} ${call.voyage} created`); router.push(`/admin/vessels/${call.id}`); }} />}
    </motion.div>
  );
}

function CreateVesselCallDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (call: VesselCall) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const terminals = (db?.locations ?? []).filter(location => location.type === 'terminal' && actor && canAccessLocation(actor, location.id));
  const lines = (db?.parties ?? []).filter(party => party.type === 'shipping_line');
  const [form, setForm] = useState({ vessel: '', voyage: '', lineId: lines[0]?.id ?? '', terminalId: terminals[0]?.id ?? '', berth: '', service: '', eta: '', etb: '', etd: '', plannedDischarge: 0, plannedLoad: 0, cranesAllocated: 2 });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));
  if (!db || !actor) return null;

  return (
    <FormDialog open title="New vessel call" description="Pre-arrival documents are recorded on the call once it exists. The export gate window is derived from the ETB." submitLabel="Create call" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.createVesselCall(actor, { ...form, eta: fromLocalInput(form.eta), etb: fromLocalInput(form.etb), etd: fromLocalInput(form.etd) }), onCreated)}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Vessel name" id="vessel"><input id="vessel" className={INPUT} value={form.vessel} onChange={event => set('vessel', event.target.value)} placeholder="MSC AURORA" /></Field>
        <Field label="Voyage" id="voyage" hint="As published on the schedule, e.g. JEMK641W"><input id="voyage" className={`${INPUT} font-mono uppercase`} value={form.voyage} onChange={event => set('voyage', event.target.value)} /></Field>
        <Field label="Shipping line" id="line"><select id="line" className={SELECT} value={form.lineId} onChange={event => set('lineId', event.target.value)}>{lines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}</select></Field>
        <Field label="Terminal" id="terminal"><select id="terminal" className={SELECT} value={form.terminalId} onChange={event => set('terminalId', event.target.value)}>{terminals.map(terminal => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}</select></Field>
        <Field label="Berth" id="berth"><input id="berth" className={INPUT} value={form.berth} onChange={event => set('berth', event.target.value)} placeholder="3" /></Field>
        <Field label="Service" id="service"><input id="service" className={INPUT} value={form.service} onChange={event => set('service', event.target.value)} placeholder="Indian Ocean Express" /></Field>
        <Field label="ETA (UTC)" id="eta"><input id="eta" type="datetime-local" className={INPUT} value={form.eta} onChange={event => set('eta', event.target.value)} /></Field>
        <Field label="ETB (UTC)" id="etb"><input id="etb" type="datetime-local" className={INPUT} value={form.etb} onChange={event => set('etb', event.target.value)} /></Field>
        <Field label="ETD (UTC)" id="etd"><input id="etd" type="datetime-local" className={INPUT} value={form.etd} onChange={event => set('etd', event.target.value)} /></Field>
        <Field label="Cranes allocated" id="cranes"><input id="cranes" type="number" min={1} className={INPUT} value={form.cranesAllocated} onChange={event => set('cranesAllocated', Number(event.target.value))} /></Field>
        <Field label="Planned discharge moves" id="discharge"><input id="discharge" type="number" min={0} className={INPUT} value={form.plannedDischarge} onChange={event => set('plannedDischarge', Number(event.target.value))} /></Field>
        <Field label="Planned load moves" id="load"><input id="load" type="number" min={0} className={INPUT} value={form.plannedLoad} onChange={event => set('plannedLoad', Number(event.target.value))} /></Field>
      </div>
    </FormDialog>
  );
}

function ShipIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 17l1.5 3h15L21 17M4 17l-1-4 9-3 9 3-1 4M6 13V9h12v4M10 9V5h4v4" /></svg>;
}
