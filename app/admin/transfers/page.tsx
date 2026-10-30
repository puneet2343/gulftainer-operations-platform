'use client';

/*
 * Inland transfers: import boxes left in a terminal yard beyond the collection
 * window are moved to the inland depots (SICD, Sajaa) for the account of the
 * cargo interests. Plan from the uncollected list, dispatch with a Momentum
 * tractor, receive at the depot with yard positions.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import PageHeader from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import FormDialog from '@/components/ui/FormDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field, BulkBar } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { TransferStatusBadge, ContainerLink, ContainerFlags, PartyName, LocationName, PanelButton, ActionError } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops, uncollectedContainers } from '@/lib/ops/ops';
import { canAccessLocation } from '@/lib/ops/core';
import { formatDateTime, formatDate, daysBetween } from '@/lib/format';
import type { InlandTransfer } from '@/lib/ops/types';

export default function TransfersPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error, clear } = useAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState(false);
  const [receiving, setReceiving] = useState<InlandTransfer | null>(null);
  const now = new Date().toISOString();

  const data = useMemo(() => {
    if (!db || !actor) return null;
    const uncollected = uncollectedContainers(db, now).filter(container => canAccessLocation(actor, container.locationId!) || actor.role === 'transport_manager');
    const open = new Set(db.inlandTransfers.filter(transfer => transfer.status !== 'received').flatMap(transfer => transfer.containerIds));
    const candidates = uncollected.filter(container => !open.has(container.id) && !container.tokenId);
    const transfers = [...db.inlandTransfers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const weekAgo = new Date(new Date(now).getTime() - 7 * 86400000).toISOString();
    return { uncollected, candidates, transfers, planned: transfers.filter(t => t.status === 'planned').length, inTransit: transfers.filter(t => t.status === 'in_transit').length, receivedWeek: transfers.filter(t => t.status === 'received' && (t.receivedAt ?? '') >= weekAgo).length };
  }, [db, actor, now]);

  if (!db || !actor || !data) return <PageSkeleton />;
  const canPlan = ['terminal_ops', 'transport_manager', 'planner', 'system_admin'].includes(actor.role);
  const canReceive = ['terminal_ops', 'gate_officer', 'warehouse_supervisor', 'transport_manager', 'system_admin'].includes(actor.role);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Terminal" title="Inland transfers" subtitle={`Import containers not collected within ${db.tariff.uncollectedTransferDays} days of vessel completion are transferred to Sharjah Inland Container Depot or Sajaa Bonded Dry Port. Transfer and depot storage are charged to the cargo interests.`} />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<TruckIcon />} label="Uncollected now" value={data.uncollected.length} description="beyond the window" />
        <StatCard icon={<TruckIcon />} label="Planned" value={data.planned} description="awaiting dispatch" />
        <StatCard icon={<TruckIcon />} label="In transit" value={data.inTransit} description="on the road" />
        <StatCard icon={<TruckIcon />} label="Received this week" value={data.receivedWeek} description="at inland depots" />
      </section>

      <Panel delay={0.08}>
        <SectionHeader title="Uncollected import containers" description="Candidates for transfer: not released, no active e-token, no open transfer" action={canPlan && selected.size > 0 ? <PanelButton primary onClick={() => { clear(); setPlanning(true); }}>Plan transfer ({selected.size})</PanelButton> : undefined} />
        {selected.size > 0 && <div className="px-3 pt-3 sm:px-4"><BulkBar count={selected.size} confirming={false} busy={false} actionLabel="Plan transfer" onAction={() => { clear(); setPlanning(true); }} onCancel={() => setSelected(new Set())} /></div>}
        {data.candidates.length === 0 ? <EmptyState title="Nothing to transfer" description="Every uncollected container is already on a transfer or has a collection booked." /> : (
          <>
            <TableWrap minWidth={900}>
              <THead>
                <Th className="w-10"><input type="checkbox" aria-label="Select all" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={data.candidates.every(c => selected.has(c.id))} onChange={event => setSelected(event.target.checked ? new Set(data.candidates.map(c => c.id)) : new Set())} /></Th>
                <Th>Container</Th><Th>Terminal</Th><Th>Consignee</Th><Th>Vessel completed</Th><Th>Days in yard</Th><Th>Clearance</Th>
              </THead>
              <tbody>
                {data.candidates.map(container => { const call = db.vesselCalls.find(entry => entry.id === container.inboundCallId); const since = call?.opsCompletedAt ?? container.dischargedAt!; return (
                  <Tr key={container.id} selected={selected.has(container.id)}>
                    <Td><input type="checkbox" aria-label={`Select ${container.number}`} className="h-4 w-4 rounded border-gray-300 accent-primary" checked={selected.has(container.id)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(container.id)) next.delete(container.id); else next.add(container.id); return next; })} /></Td>
                    <Td><ContainerLink container={container} /><div className="mt-1"><ContainerFlags container={container} /></div></Td>
                    <Td><LocationName db={db} id={container.locationId} code /> <span className="font-mono text-[12px] text-gray-400">{container.yardPosition}</span></Td>
                    <Td><PartyName db={db} id={container.consigneeId} fallback="Not assigned" /></Td>
                    <Td className="tabular-nums">{formatDate(since)}<p className="!text-[12px] !text-gray-400">{call?.vessel} {call?.voyage}</p></Td>
                    <Td className="tabular-nums"><span className="font-semibold text-[#B7791F]">{daysBetween(container.dischargedAt!, now)}</span></Td>
                    <Td className="text-[12px]">{container.customsStatus === 'cleared' ? 'Customs cleared' : 'Customs pending'} · {container.deliveryOrder ? 'DO on file' : 'no DO'} · {container.chargesSettled ? 'paid' : 'unpaid'}</Td>
                  </Tr>
                ); })}
              </tbody>
            </TableWrap>
            <CardList>
              {data.candidates.map(container => (
                <Card key={container.id}>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300 accent-primary" checked={selected.has(container.id)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(container.id)) next.delete(container.id); else next.add(container.id); return next; })} />
                    <span className="min-w-0 flex-1"><ContainerLink container={container} /><p className="!text-[12px] !text-gray-400"><LocationName db={db} id={container.locationId} code /> {container.yardPosition} · <PartyName db={db} id={container.consigneeId} fallback="No consignee" /> · {daysBetween(container.dischargedAt!, now)} days</p></span>
                  </label>
                </Card>
              ))}
            </CardList>
          </>
        )}
      </Panel>

      <Panel delay={0.12}>
        <SectionHeader title="Transfers" description={`${data.transfers.length} transfer${data.transfers.length === 1 ? '' : 's'}`} />
        {error && <div className="px-4 pt-4"><ActionError message={error} /></div>}
        {data.transfers.length === 0 ? <EmptyState title="No transfers yet" description="Plan one from the uncollected list above." /> : (
          <>
            <TableWrap minWidth={940}>
              <THead><Th>Reference</Th><Th>Route</Th><Th>Containers</Th><Th>Reason</Th><Th>Vehicle</Th><Th>Timing</Th><Th>Status</Th><Th align="right">Action</Th></THead>
              <tbody>
                {data.transfers.map(transfer => { const job = db.transportJobs.find(entry => entry.id === transfer.transportJobId); return (
                  <Tr key={transfer.id}>
                    <Td><span className="font-mono text-[13px] font-semibold text-secondary">{transfer.reference}</span></Td>
                    <Td><LocationName db={db} id={transfer.fromLocationId} code /> → <LocationName db={db} id={transfer.toLocationId} code /></Td>
                    <Td><div className="flex flex-wrap gap-x-2 gap-y-1">{transfer.containerIds.map(id => { const container = db.containers.find(c => c.id === id)!; return <span key={id} className="inline-flex items-center gap-1"><ContainerLink container={container} />{transfer.receivedContainerIds.includes(id) && <span className="text-[11px] text-[#1F8F6E]">received</span>}</span>; })}</div></Td>
                    <Td className="capitalize">{transfer.reason.replace(/_/g, ' ')}</Td>
                    <Td>{job?.tractor ? <>{job.tractor}<p className="!text-[12px] !text-gray-400">{job.driverName}</p></> : <span className="text-gray-400">Not assigned</span>}</Td>
                    <Td className="tabular-nums text-[12px]">Planned {formatDateTime(transfer.createdAt)}{transfer.dispatchedAt && <><br />Left {formatDateTime(transfer.dispatchedAt)}</>}{transfer.receivedAt && <><br />Received {formatDateTime(transfer.receivedAt)}</>}</Td>
                    <Td><TransferStatusBadge status={transfer.status} /></Td>
                    <Td align="right">
                      {transfer.status === 'planned' && canPlan && <PanelButton disabled={busy} onClick={() => void run(() => ops.dispatchInlandTransfer(actor, { transferId: transfer.id }), () => toast.success(`${transfer.reference} dispatched`))}>Dispatch</PanelButton>}
                      {transfer.status === 'in_transit' && canReceive && <PanelButton primary onClick={() => { clear(); setReceiving(transfer); }}>Receive</PanelButton>}
                    </Td>
                  </Tr>
                ); })}
              </tbody>
            </TableWrap>
            <CardList>
              {data.transfers.map(transfer => (
                <Card key={transfer.id}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono !text-[13px] !font-semibold !text-secondary">{transfer.reference}</p><p className="!text-[12px] !text-gray-400"><LocationName db={db} id={transfer.fromLocationId} code /> → <LocationName db={db} id={transfer.toLocationId} code /> · {transfer.containerIds.length} container{transfer.containerIds.length === 1 ? '' : 's'}</p></div><TransferStatusBadge status={transfer.status} /></div>
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3"><span className="text-[12px] text-gray-500">{formatDateTime(transfer.dispatchedAt ?? transfer.createdAt)}</span>
                    {transfer.status === 'planned' && canPlan && <PanelButton disabled={busy} onClick={() => void run(() => ops.dispatchInlandTransfer(actor, { transferId: transfer.id }), () => toast.success('Dispatched'))}>Dispatch</PanelButton>}
                    {transfer.status === 'in_transit' && canReceive && <PanelButton primary onClick={() => { clear(); setReceiving(transfer); }}>Receive</PanelButton>}
                  </div>
                </Card>
              ))}
            </CardList>
          </>
        )}
      </Panel>

      {planning && <PlanTransferDialog containerIds={[...selected]} onClose={() => setPlanning(false)} onDone={transfer => { setPlanning(false); setSelected(new Set()); toast.success(`${transfer.reference} planned`); }} />}
      {receiving && <ReceiveTransferDialog transfer={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); toast.success('Transfer received'); }} />}
    </motion.div>
  );
}

function PlanTransferDialog({ containerIds, onClose, onDone }: { containerIds: string[]; onClose: () => void; onDone: (transfer: InlandTransfer) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const containers = (db?.containers ?? []).filter(container => containerIds.includes(container.id));
  const from = containers[0]?.locationId ?? '';
  const fromCountry = db?.locations.find(l => l.id === from)?.country;
  const depots = (db?.locations ?? []).filter(location => ['inland_depot', 'logistics_centre'].includes(location.type) && location.active && location.country === fromCountry);
  const [toLocationId, setToLocationId] = useState(depots[0]?.id ?? '');
  const [reason, setReason] = useState<InlandTransfer['reason']>('uncollected_3_days');
  const [tractor, setTractor] = useState('');
  const [trailer, setTrailer] = useState('');
  const [driverName, setDriverName] = useState('');
  const mixed = containers.some(container => container.locationId !== from);
  return (
    <FormDialog open title="Plan inland transfer" description={`${containers.length} container${containers.length === 1 ? '' : 's'} from ${db?.locations.find(l => l.id === from)?.name}. A Momentum transport job is created; assign the tractor now or later.`} submitLabel="Plan transfer" busy={busy} error={mixed ? 'Select containers from one terminal at a time.' : error} onClose={onClose}
      onSubmit={() => !mixed && void run(() => ops.createInlandTransfer(actor!, { fromLocationId: from, toLocationId, containerIds, reason, tractor, trailer, driverName }), transfer => { if (transfer) onDone(transfer); })}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Destination depot" id="tr-to"><select id="tr-to" className={SELECT} value={toLocationId} onChange={event => setToLocationId(event.target.value)}>{depots.map(location => <option key={location.id} value={location.id}>{location.name}{location.bonded ? ' (bonded)' : ''}</option>)}</select></Field>
        <Field label="Reason" id="tr-reason"><select id="tr-reason" className={SELECT} value={reason} onChange={event => setReason(event.target.value as InlandTransfer['reason'])}><option value="uncollected_3_days">Not collected within {db?.tariff.uncollectedTransferDays} days</option><option value="yard_capacity">Yard capacity</option><option value="customer_request">Customer request</option></select></Field>
        <Field label="Tractor" id="tr-tractor"><input id="tr-tractor" className={`${INPUT} uppercase`} value={tractor} onChange={event => setTractor(event.target.value)} placeholder="SHJ 61120" /></Field>
        <Field label="Trailer" id="tr-trailer"><input id="tr-trailer" className={`${INPUT} uppercase`} value={trailer} onChange={event => setTrailer(event.target.value)} placeholder="TR-204" /></Field>
        <div className="sm:col-span-2"><Field label="Driver" id="tr-driver"><input id="tr-driver" className={INPUT} value={driverName} onChange={event => setDriverName(event.target.value)} /></Field></div>
      </div>
      <ul className="rounded-xl bg-gray-50 p-3 text-[13px] text-secondary">{containers.map(container => <li key={container.id} className="font-mono">{container.number} <span className="font-sans text-gray-500">· {container.size}{container.type} · {db?.parties.find(p => p.id === container.consigneeId)?.name ?? 'no consignee'}</span></li>)}</ul>
    </FormDialog>
  );
}

function ReceiveTransferDialog({ transfer, onClose, onDone }: { transfer: InlandTransfer; onClose: () => void; onDone: () => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const pending = transfer.containerIds.filter(id => !transfer.receivedContainerIds.includes(id));
  const [lines, setLines] = useState(() => Object.fromEntries(pending.map(id => [id, { position: '', remarks: '', include: true }])));
  return (
    <FormDialog open title={`Receive ${transfer.reference}`} description={`Confirm each container as it is unloaded at ${db?.locations.find(l => l.id === transfer.toLocationId)?.name}. Unticked containers stay in transit.`} submitLabel="Confirm receipt" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.receiveInlandTransfer(actor!, { transferId: transfer.id, lines: pending.filter(id => lines[id].include).map(id => ({ containerId: id, yardPosition: lines[id].position, damageRemarks: lines[id].remarks })) }), onDone)}>
      <div className="space-y-3">
        {pending.map(id => { const container = db?.containers.find(c => c.id === id); const line = lines[id]; if (!container) return null; return (
          <div key={id} className="rounded-xl border border-gray-200 p-3">
            <label className="flex items-center gap-2 text-[13px] font-semibold text-secondary"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={line.include} onChange={event => setLines(current => ({ ...current, [id]: { ...line, include: event.target.checked } }))} /><span className="font-mono">{container.number}</span><span className="font-normal text-gray-500">{container.size}{container.type}</span></label>
            <div className="mt-2 grid gap-x-3 sm:grid-cols-2">
              <Field label="Yard position" id={`rc-pos-${id}`}><input id={`rc-pos-${id}`} className={`${INPUT} font-mono uppercase`} disabled={!line.include} value={line.position} onChange={event => setLines(current => ({ ...current, [id]: { ...line, position: event.target.value } }))} placeholder="D03-2-1" /></Field>
              <Field label="Remarks" id={`rc-rem-${id}`}><input id={`rc-rem-${id}`} className={INPUT} disabled={!line.include} value={line.remarks} onChange={event => setLines(current => ({ ...current, [id]: { ...line, remarks: event.target.value } }))} /></Field>
            </div>
          </div>
        ); })}
      </div>
    </FormDialog>
  );
}

function TruckIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16V8a1 1 0 011-1h10v9M14 10h4l3 3v3h-7M5 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z" /></svg>;
}
