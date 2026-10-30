'use client';

/*
 * Momentum transport jobs: import deliveries from the terminal, export collections,
 * empty repositioning and warehouse distribution, dispatched with a tractor,
 * trailer and driver, tracked to proof of delivery.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import ListToolbar from '@/components/ui/ListToolbar';
import Pagination from '@/components/ui/Pagination';
import FormDialog from '@/components/ui/FormDialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT, TEXTAREA } from '@/components/ui/Table';
import { PlusIcon } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { TransportStatusBadge, ContainerLink, PartyName, LocationName, PanelButton, ActionError } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { useList } from '@/lib/use-list';
import { formatDateTime, fromLocalInput } from '@/lib/format';
import { TRANSPORT_STATUS_LABELS, TRANSPORT_TYPE_LABELS, type TransportJob, type TransportJobStatus, type TransportJobType } from '@/lib/ops/types';

type Filters = { status: string; type: string };
type Dialog = { kind: 'assign' | 'complete' | 'cancel' | 'delay'; job: TransportJob } | { kind: 'new' } | null;

export default function TransportPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error, clear } = useAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const jobs = useMemo(() => db ? [...db.transportJobs].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)) : [], [db]);
  const list = useList<TransportJob, Filters>(jobs, {
    initialFilters: { status: 'All', type: 'All' },
    search: (job, query) => [job.reference, job.tractor, job.driverName, job.destinationAddress, db?.parties.find(p => p.id === job.customerId)?.name ?? '', ...job.containerIds.map(id => db?.containers.find(c => c.id === id)?.number ?? '')].some(value => value.toLowerCase().includes(query)),
    filter: (job, filters) => (filters.status === 'All' || job.status === filters.status) && (filters.type === 'All' || job.type === filters.type),
  });
  if (!db || !actor) return <PageSkeleton />;

  const canManage = ['transport_manager', 'system_admin'].includes(actor.role);
  const canStart = ['transport_manager', 'warehouse_supervisor', 'gate_officer', 'system_admin'].includes(actor.role);
  const today = new Date().toISOString().slice(0, 10);
  const done = (message: string) => { setDialog(null); toast.success(message); };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Logistics" title="Transport jobs" subtitle="Momentum Logistics fleet dispatch. Jobs move gated-out containers to consignees, bring exports to the terminal, reposition empties and deliver picked warehouse orders." action={canManage || actor.role === 'customer_service' ? <ToolbarButton onClick={() => setDialog({ kind: 'new' })}><PlusIcon />New transport job</ToolbarButton> : undefined} />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<TruckIcon />} label="Planned" value={jobs.filter(job => job.status === 'planned').length} description="no vehicle yet" />
        <StatCard icon={<TruckIcon />} label="Assigned" value={jobs.filter(job => job.status === 'assigned').length} description="ready to start" />
        <StatCard icon={<TruckIcon />} label="En route" value={jobs.filter(job => job.status === 'en_route').length} description="on the road now" />
        <StatCard icon={<TruckIcon />} label="Delivered today" value={jobs.filter(job => job.status === 'delivered' && job.deliveredAt?.slice(0, 10) === today).length} description="proof of delivery recorded" />
      </section>

      <Panel delay={0.08}>
        <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search reference, tractor, driver, container or destination" label="Search transport jobs" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(open => !open)} filters={list.filters}
          groups={[
            { key: 'status', label: 'Status', options: (Object.keys(TRANSPORT_STATUS_LABELS) as TransportJobStatus[]).map(status => ({ value: status, label: TRANSPORT_STATUS_LABELS[status] })) },
            { key: 'type', label: 'Type', options: (Object.keys(TRANSPORT_TYPE_LABELS) as TransportJobType[]).map(type => ({ value: type, label: TRANSPORT_TYPE_LABELS[type] })) },
          ]} onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters} />
        {error && <div className="px-4 pt-4"><ActionError message={error} /></div>}
        {list.pageItems.length === 0 ? <EmptyState title="No transport jobs" description={list.hasActiveFilters || list.search ? 'Nothing matches the current search and filters.' : 'Create a job to dispatch the fleet.'} /> : (
          <>
            <TableWrap minWidth={1000}>
              <THead><Th>Job</Th><Th>Route</Th><Th>Load</Th><Th>Vehicle</Th><Th>Scheduled</Th><Th>Status</Th><Th align="right">Actions</Th></THead>
              <tbody>
                {list.pageItems.map(job => (
                  <Tr key={job.id}>
                    <Td><span className="font-mono text-[13px] font-semibold text-secondary">{job.reference}</span><p className="!text-[12px] !text-gray-400">{TRANSPORT_TYPE_LABELS[job.type]}{job.customerId && <> · <PartyName db={db} id={job.customerId} /></>}</p></Td>
                    <Td><LocationName db={db} id={job.fromLocationId} /><p className="!text-[12px] !text-gray-400">to {job.toLocationId ? <LocationName db={db} id={job.toLocationId} /> : job.destinationAddress}</p></Td>
                    <Td>{job.containerIds.length ? <div className="flex flex-wrap gap-x-2">{job.containerIds.map(id => { const c = db.containers.find(e => e.id === id); return c ? <ContainerLink key={id} container={c} /> : null; })}</div> : job.warehouseOrderId ? <span className="font-mono text-[13px]">{db.warehouseOrders.find(order => order.id === job.warehouseOrderId)?.reference}</span> : job.inlandTransferId ? <span className="font-mono text-[13px]">{db.inlandTransfers.find(t => t.id === job.inlandTransferId)?.reference}</span> : <span className="text-gray-400">—</span>}</Td>
                    <Td>{job.tractor ? <>{job.tractor}{job.trailer && ` · ${job.trailer}`}<p className="!text-[12px] !text-gray-400">{job.driverName}</p></> : <span className="text-gray-400">Not assigned</span>}</Td>
                    <Td className="tabular-nums">{formatDateTime(job.scheduledAt)}{job.deliveredAt && <p className="!text-[12px] !text-[#1F8F6E]">Delivered {formatDateTime(job.deliveredAt)}</p>}{job.proofOfDelivery && <p className="!text-[12px] !text-gray-400">POD: {job.proofOfDelivery.receivedBy}</p>}</Td>
                    <Td><TransportStatusBadge status={job.status} /></Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1.5">
                        {['planned', 'assigned'].includes(job.status) && canManage && !job.inlandTransferId && <PanelButton onClick={() => { clear(); setDialog({ kind: 'assign', job }); }}>{job.status === 'planned' ? 'Assign' : 'Reassign'}</PanelButton>}
                        {job.status === 'assigned' && canStart && !job.inlandTransferId && <PanelButton primary disabled={busy} onClick={() => void run(() => ops.startTransportJob(actor, { jobId: job.id, expectedVersion: job.version }), () => toast.success(`${job.reference} started`))}>Start</PanelButton>}
                        {job.status === 'en_route' && canManage && !job.inlandTransferId && <PanelButton primary onClick={() => { clear(); setDialog({ kind: 'complete', job }); }}>Deliver</PanelButton>}
                        {['assigned', 'en_route'].includes(job.status) && canManage && <PanelButton onClick={() => { clear(); setDialog({ kind: 'delay', job }); }}>Delay</PanelButton>}
                        {['planned', 'assigned'].includes(job.status) && canManage && !job.inlandTransferId && <PanelButton danger onClick={() => { clear(); setDialog({ kind: 'cancel', job }); }}>Cancel</PanelButton>}
                        {job.inlandTransferId && ['planned', 'assigned', 'en_route'].includes(job.status) && <span className="text-[12px] text-gray-400">Managed from Inland transfers</span>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <CardList>
              {list.pageItems.map(job => (
                <Card key={job.id}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono !text-[13px] !font-semibold !text-secondary">{job.reference}</p><p className="truncate !text-[12px] !text-gray-400">{TRANSPORT_TYPE_LABELS[job.type]} · {job.toLocationId ? db.locations.find(l => l.id === job.toLocationId)?.name : job.destinationAddress}</p></div><TransportStatusBadge status={job.status} /></div>
                  <p className="mt-2 !text-[12px] !text-gray-500">{job.tractor || 'No vehicle'}{job.driverName ? ` · ${job.driverName}` : ''} · {formatDateTime(job.scheduledAt)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
                    {['planned', 'assigned'].includes(job.status) && canManage && !job.inlandTransferId && <PanelButton onClick={() => { clear(); setDialog({ kind: 'assign', job }); }}>Assign</PanelButton>}
                    {job.status === 'assigned' && canStart && !job.inlandTransferId && <PanelButton primary disabled={busy} onClick={() => void run(() => ops.startTransportJob(actor, { jobId: job.id, expectedVersion: job.version }), () => toast.success('Started'))}>Start</PanelButton>}
                    {job.status === 'en_route' && canManage && !job.inlandTransferId && <PanelButton primary onClick={() => { clear(); setDialog({ kind: 'complete', job }); }}>Deliver</PanelButton>}
                  </div>
                </Card>
              ))}
            </CardList>
            <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
          </>
        )}
      </Panel>

      {dialog?.kind === 'new' && <NewJobDialog onClose={() => setDialog(null)} onDone={job => done(`${job.reference} created`)} />}
      {dialog?.kind === 'assign' && <AssignDialog job={dialog.job} onClose={() => setDialog(null)} onDone={() => done('Vehicle assigned')} />}
      {dialog?.kind === 'complete' && <CompleteDialog job={dialog.job} onClose={() => setDialog(null)} onDone={() => done('Delivery recorded')} />}
      {dialog?.kind === 'delay' && <DelayDialog job={dialog.job} onClose={() => setDialog(null)} onDone={() => done('Delay recorded')} />}
      <ConfirmDialog open={dialog?.kind === 'cancel'} danger busy={busy} error={error} title="Cancel transport job?" description="Containers on the job are released for another job; uninvoiced transport charges are waived." confirmLabel="Cancel job" onConfirm={() => dialog?.kind === 'cancel' && void run(() => ops.cancelTransportJob(actor, { jobId: dialog.job.id, reason: 'Cancelled by transport manager' }), () => done('Job cancelled'))} onClose={() => setDialog(null)} />
    </motion.div>
  );
}

function NewJobDialog({ onClose, onDone }: { onClose: () => void; onDone: (job: TransportJob) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [type, setType] = useState<TransportJobType>('import_delivery');
  const [customerId, setCustomerId] = useState('');
  const [fromLocationId, setFromLocationId] = useState(db?.locations.find(l => l.code === 'KCT')?.id ?? '');
  const [toLocationId, setToLocationId] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [containerIds, setContainerIds] = useState<string[]>([]);
  const [orderId, setOrderId] = useState('');
  const [tractor, setTractor] = useState('');
  const [trailer, setTrailer] = useState('');
  const [driverName, setDriverName] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  if (!db) return null;
  const busyContainers = new Set(db.transportJobs.filter(job => !['closed', 'cancelled', 'delivered'].includes(job.status)).flatMap(job => job.containerIds));
  const eligible = db.containers.filter(container => !busyContainers.has(container.id) && (type === 'import_delivery' ? container.status === 'on_truck' && container.category === 'import' : type === 'export_collection' ? container.category === 'export' && container.status === 'expected' : type === 'empty_repositioning' ? container.category === 'empty' : false));
  const orders = db.warehouseOrders.filter(order => order.type === 'outbound' && order.status === 'picked' && !order.transportJobId);
  const customers = db.parties.filter(party => ['consignee', 'contract_customer', 'shipper'].includes(party.type));
  return (
    <FormDialog open wide title="New transport job" description="Transport is charged per trip to the customer at the tariff rate. Containers can only be on one open job." submitLabel="Create job" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.createTransportJob(actor!, { type, fromLocationId: fromLocationId || null, toLocationId: toLocationId || null, customerId: customerId || null, destinationAddress, containerIds, warehouseOrderId: orderId || null, tractor, trailer, driverName, scheduledAt: fromLocalInput(scheduledAt) }), job => { if (job) onDone(job); })}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Job type" id="tj-type"><select id="tj-type" className={SELECT} value={type} onChange={event => { setType(event.target.value as TransportJobType); setContainerIds([]); setOrderId(''); }}>{(Object.keys(TRANSPORT_TYPE_LABELS) as TransportJobType[]).filter(t => t !== 'inland_transfer').map(t => <option key={t} value={t}>{TRANSPORT_TYPE_LABELS[t]}</option>)}</select></Field>
        <Field label="Customer (charged)" id="tj-customer"><select id="tj-customer" className={SELECT} value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">Internal, no charge</option>{customers.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
        <Field label="From" id="tj-from"><select id="tj-from" className={SELECT} value={fromLocationId} onChange={event => setFromLocationId(event.target.value)}><option value="">Customer premises</option>{db.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
        <Field label="To (Gulftainer location)" id="tj-to"><select id="tj-to" className={SELECT} value={toLocationId} onChange={event => setToLocationId(event.target.value)}><option value="">Customer address below</option>{db.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
        {!toLocationId && <div className="sm:col-span-2"><Field label="Destination address" id="tj-address"><input id="tj-address" className={INPUT} value={destinationAddress} onChange={event => setDestinationAddress(event.target.value)} placeholder="Al Futtaim Logistics DC, Jebel Ali Free Zone" /></Field></div>}
        {type === 'warehouse_distribution' ? (
          <div className="sm:col-span-2"><Field label="Picked outbound order" id="tj-order"><select id="tj-order" className={SELECT} value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Select an order</option>{orders.map(order => <option key={order.id} value={order.id}>{order.reference} · {db.parties.find(p => p.id === order.customerId)?.name} · {order.customerReference}</option>)}</select></Field></div>
        ) : (
          <fieldset className="form-group sm:col-span-2">
            <legend className="form-label">Containers</legend>
            {eligible.length === 0 ? <p className="!text-[12px] !text-gray-400">No containers are eligible for this job type right now.</p> : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2">
                {eligible.map(container => <label key={container.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-gray-50"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={containerIds.includes(container.id)} onChange={event => setContainerIds(current => event.target.checked ? [...current, container.id] : current.filter(id => id !== container.id))} /><span className="font-mono">{container.number}</span><span className="text-gray-500">{container.size}{container.type} · {db.parties.find(p => p.id === container.consigneeId)?.name ?? container.shipperName ?? ''} · {db.locations.find(l => l.id === container.locationId)?.code}</span></label>)}
              </div>
            )}
          </fieldset>
        )}
        <Field label="Tractor" id="tj-tractor"><input id="tj-tractor" className={`${INPUT} uppercase`} value={tractor} onChange={event => setTractor(event.target.value)} placeholder="SHJ 52300" /></Field>
        <Field label="Trailer" id="tj-trailer"><input id="tj-trailer" className={`${INPUT} uppercase`} value={trailer} onChange={event => setTrailer(event.target.value)} /></Field>
        <Field label="Driver" id="tj-driver"><input id="tj-driver" className={INPUT} value={driverName} onChange={event => setDriverName(event.target.value)} /></Field>
        <Field label="Scheduled (UTC)" id="tj-when"><input id="tj-when" type="datetime-local" className={INPUT} value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /></Field>
      </div>
    </FormDialog>
  );
}

function AssignDialog({ job, onClose, onDone }: { job: TransportJob; onClose: () => void; onDone: () => void }) {
  const { actor } = useOps();
  const { run, busy, error } = useAction();
  const [tractor, setTractor] = useState(job.tractor);
  const [trailer, setTrailer] = useState(job.trailer);
  const [driverName, setDriverName] = useState(job.driverName);
  return (
    <FormDialog open title={`Assign vehicle to ${job.reference}`} description="A tractor cannot be assigned while it is en route on another job." submitLabel="Assign" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.assignTransportJob(actor!, { jobId: job.id, tractor, trailer, driverName, expectedVersion: job.version }), onDone)}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Tractor" id="as-tractor"><input id="as-tractor" autoFocus className={`${INPUT} uppercase`} value={tractor} onChange={event => setTractor(event.target.value)} /></Field>
        <Field label="Trailer" id="as-trailer"><input id="as-trailer" className={`${INPUT} uppercase`} value={trailer} onChange={event => setTrailer(event.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Driver" id="as-driver"><input id="as-driver" className={INPUT} value={driverName} onChange={event => setDriverName(event.target.value)} /></Field></div>
      </div>
    </FormDialog>
  );
}

function CompleteDialog({ job, onClose, onDone }: { job: TransportJob; onClose: () => void; onDone: () => void }) {
  const { actor } = useOps();
  const { run, busy, error } = useAction();
  const [receivedBy, setReceivedBy] = useState('');
  const [note, setNote] = useState('');
  return (
    <FormDialog open title={`Proof of delivery for ${job.reference}`} description="Import containers on the job are closed as delivered; a picked order is marked dispatched." submitLabel="Record delivery" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.completeTransportJob(actor!, { jobId: job.id, receivedBy, note, expectedVersion: job.version }), onDone)}>
      <Field label="Received by" id="pod-by"><input id="pod-by" autoFocus className={INPUT} value={receivedBy} onChange={event => setReceivedBy(event.target.value)} placeholder="Name and role at the consignee" /></Field>
      <Field label="Remarks" id="pod-note"><textarea id="pod-note" className={TEXTAREA} value={note} onChange={event => setNote(event.target.value)} /></Field>
    </FormDialog>
  );
}

function DelayDialog({ job, onClose, onDone }: { job: TransportJob; onClose: () => void; onDone: () => void }) {
  const { actor } = useOps();
  const { run, busy, error } = useAction();
  const [reason, setReason] = useState('');
  return (
    <FormDialog open title={`Record delay on ${job.reference}`} description="Customer service is notified so the consignee can be informed." submitLabel="Record delay" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.recordTransportDelay(actor!, { jobId: job.id, reason }), onDone)}>
      <Field label="Reason" id="delay-reason"><textarea id="delay-reason" autoFocus className={TEXTAREA} value={reason} onChange={event => setReason(event.target.value)} placeholder="Traffic on E311, expected 90 minutes late" /></Field>
    </FormDialog>
  );
}

function TruckIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16V8a1 1 0 011-1h10v9M14 10h4l3 3v3h-7M5 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z" /></svg>;
}
