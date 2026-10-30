'use client';

/*
 * Momentum contract-logistics orders: inbound advance shipping notices received
 * line by line with discrepancies and damage, outbound orders allocated from
 * available stock, then picked and handed to transport. Receiving and picking
 * carry an idempotency key and can be queued offline.
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
import { Field, StatusBadge } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT, TEXTAREA } from '@/components/ui/Table';
import { PlusIcon } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { OrderStatusBadge, PartyName, LocationName, PanelButton, ActionError } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops, getBalance } from '@/lib/ops/ops';
import { newId, canAccessLocation } from '@/lib/ops/core';
import { useList } from '@/lib/use-list';
import { formatDate, fromLocalInput } from '@/lib/format';
import { ORDER_STATUS_LABELS, type WarehouseOrder, type WarehouseOrderStatus } from '@/lib/ops/types';

type Filters = { status: string; location: string; type: string };
type Dialog = { kind: 'receive' | 'pick' | 'allocate' | 'cancel'; order: WarehouseOrder } | { kind: 'new' } | null;

export default function WarehousePage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error, clear } = useAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const orders = useMemo(() => db ? [...db.warehouseOrders].sort((a, b) => b.expectedAt.localeCompare(a.expectedAt)) : [], [db]);
  const list = useList<WarehouseOrder, Filters>(orders, {
    initialFilters: { status: 'All', location: 'All', type: 'All' },
    search: (order, query) => [order.reference, order.customerReference, db?.parties.find(p => p.id === order.customerId)?.name ?? ''].some(value => value.toLowerCase().includes(query)),
    filter: (order, filters) => (filters.status === 'All' || order.status === filters.status) && (filters.location === 'All' || order.locationId === filters.location) && (filters.type === 'All' || order.type === filters.type),
  });
  if (!db || !actor) return <PageSkeleton />;

  const warehouses = db.locations.filter(location => ['warehouse', 'logistics_centre', 'inland_depot'].includes(location.type));
  const canCreate = ['inventory_manager', 'warehouse_supervisor', 'customer_service', 'system_admin'].includes(actor.role);
  const canWork = ['warehouse_worker', 'warehouse_supervisor', 'inventory_manager', 'system_admin'].includes(actor.role);
  const canAllocate = ['inventory_manager', 'warehouse_supervisor', 'system_admin'].includes(actor.role);
  const done = (message: string) => { setDialog(null); toast.success(message); };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Logistics" title="Warehouse orders" subtitle="Contract-logistics receipts and dispatches for Momentum customers. Receiving writes the stock ledger; allocation reserves available stock before picking." action={canCreate ? <ToolbarButton onClick={() => setDialog({ kind: 'new' })}><PlusIcon />New order</ToolbarButton> : undefined} />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<BoxIcon />} label="Expected inbound" value={orders.filter(order => order.type === 'inbound' && order.status === 'expected').length} description="to receive" />
        <StatCard icon={<BoxIcon />} label="Outbound to allocate" value={orders.filter(order => order.type === 'outbound' && order.status === 'expected').length} description="awaiting stock" />
        <StatCard icon={<BoxIcon />} label="Allocated, to pick" value={orders.filter(order => order.status === 'allocated').length} description="on the pick list" />
        <StatCard icon={<BoxIcon />} label="Picked, awaiting transport" value={orders.filter(order => order.status === 'picked' && !order.transportJobId).length} description="ready for dispatch" />
      </section>

      <Panel delay={0.08}>
        <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search order reference, customer or customer reference" label="Search orders" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(open => !open)} filters={list.filters}
          groups={[
            { key: 'type', label: 'Direction', options: [{ value: 'inbound', label: 'Inbound' }, { value: 'outbound', label: 'Outbound' }] },
            { key: 'status', label: 'Status', options: (Object.keys(ORDER_STATUS_LABELS) as WarehouseOrderStatus[]).map(status => ({ value: status, label: ORDER_STATUS_LABELS[status] })) },
            { key: 'location', label: 'Warehouse', options: warehouses.map(location => ({ value: location.id, label: location.code })) },
          ]} onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters} />
        {error && <div className="px-4 pt-4"><ActionError message={error} /></div>}
        {list.pageItems.length === 0 ? <EmptyState title="No orders" description={list.hasActiveFilters || list.search ? 'Nothing matches the current search and filters.' : 'Create an inbound or outbound order to begin.'} /> : (
          <>
            <TableWrap minWidth={980}>
              <THead><Th>Order</Th><Th>Customer</Th><Th>Warehouse</Th><Th>Lines</Th><Th>Expected</Th><Th>Status</Th><Th align="right">Action</Th></THead>
              <tbody>
                {list.pageItems.map(order => (
                  <Tr key={order.id}>
                    <Td><span className="font-mono text-[13px] font-semibold text-secondary">{order.reference}</span><p className="!text-[12px] !text-gray-400">{order.type === 'inbound' ? 'Inbound' : 'Outbound'} · {order.customerReference}</p></Td>
                    <Td><PartyName db={db} id={order.customerId} /></Td>
                    <Td><LocationName db={db} id={order.locationId} /></Td>
                    <Td>
                      <ul className="space-y-0.5 text-[12px]">{order.lines.map(line => { const sku = db.skus.find(s => s.id === line.skuId); return <li key={line.skuId}><span className="text-secondary">{sku?.name}</span> <span className="text-gray-400">· {line.quantity} {sku?.unit}{order.type === 'inbound' && order.status !== 'expected' ? ` · received ${line.receivedQty}${line.damagedQty ? `, ${line.damagedQty} damaged` : ''}` : ''}{order.type === 'outbound' && ['picked', 'dispatched'].includes(order.status) ? ` · picked ${line.pickedQty}` : ''}</span></li>; })}</ul>
                      {order.exceptions.length > 0 && <p className="mt-1 !text-[12px] !text-[#B7791F]">{order.exceptions.length} exception{order.exceptions.length === 1 ? '' : 's'}</p>}
                    </Td>
                    <Td className="tabular-nums">{formatDate(order.expectedAt)}</Td>
                    <Td><OrderStatusBadge status={order.status} />{order.transportJobId && <p className="mt-1 font-mono !text-[11px] !text-gray-400">{db.transportJobs.find(job => job.id === order.transportJobId)?.reference}</p>}</Td>
                    <Td align="right"><OrderActions order={order} canWork={canWork} canAllocate={canAllocate} actor={actor} onOpen={kind => { clear(); setDialog({ kind, order }); }} /></Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <CardList>
              {list.pageItems.map(order => (
                <Card key={order.id}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono !text-[13px] !font-semibold !text-secondary">{order.reference}</p><p className="truncate !text-[12px] !text-gray-400"><PartyName db={db} id={order.customerId} /> · {order.customerReference}</p></div><OrderStatusBadge status={order.status} /></div>
                  <p className="mt-2 !text-[12px] !text-gray-500">{order.lines.length} line{order.lines.length === 1 ? '' : 's'} · <LocationName db={db} id={order.locationId} code /> · {formatDate(order.expectedAt)}</p>
                  <div className="mt-3 flex justify-end border-t border-gray-100 pt-3"><OrderActions order={order} canWork={canWork} canAllocate={canAllocate} actor={actor} onOpen={kind => { clear(); setDialog({ kind, order }); }} /></div>
                </Card>
              ))}
            </CardList>
            <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
          </>
        )}
      </Panel>

      {dialog?.kind === 'new' && <NewOrderDialog onClose={() => setDialog(null)} onDone={order => done(`${order.reference} created`)} />}
      {dialog?.kind === 'receive' && <ReceiveDialog order={dialog.order} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'pick' && <PickDialog order={dialog.order} onClose={() => setDialog(null)} onDone={done} />}
      <ConfirmDialog open={dialog?.kind === 'allocate'} busy={busy} error={error} title="Allocate stock?" description={dialog?.kind === 'allocate' ? <>Reserves every line of {dialog.order.reference} from available stock at {db.locations.find(l => l.id === dialog.order.locationId)?.name}. The order fails as a whole if any line is short.</> : null} confirmLabel="Allocate" onConfirm={() => dialog?.kind === 'allocate' && void run(() => ops.allocateOrder(actor, { orderId: dialog.order.id, expectedVersion: dialog.order.version }), () => done('Stock allocated'))} onClose={() => setDialog(null)} />
      <ConfirmDialog open={dialog?.kind === 'cancel'} danger busy={busy} error={error} title="Cancel order?" description="Allocated stock is released back to available." confirmLabel="Cancel order" onConfirm={() => dialog?.kind === 'cancel' && void run(() => ops.cancelOrder(actor, { orderId: dialog.order.id, reason: 'Cancelled by warehouse' }), () => done('Order cancelled'))} onClose={() => setDialog(null)} />
    </motion.div>
  );
}

function OrderActions({ order, canWork, canAllocate, actor, onOpen }: { order: WarehouseOrder; canWork: boolean; canAllocate: boolean; actor: NonNullable<ReturnType<typeof useOps>['actor']>; onOpen: (kind: 'receive' | 'pick' | 'allocate' | 'cancel') => void }) {
  const here = canAccessLocation(actor, order.locationId);
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {order.type === 'inbound' && order.status === 'expected' && canWork && here && <PanelButton primary onClick={() => onOpen('receive')}>Receive</PanelButton>}
      {order.type === 'outbound' && order.status === 'expected' && canAllocate && <PanelButton primary onClick={() => onOpen('allocate')}>Allocate</PanelButton>}
      {order.type === 'outbound' && order.status === 'allocated' && canWork && here && <PanelButton primary onClick={() => onOpen('pick')}>Pick</PanelButton>}
      {['expected', 'allocated'].includes(order.status) && canAllocate && <PanelButton danger onClick={() => onOpen('cancel')}>Cancel</PanelButton>}
      {order.status === 'picked' && !order.transportJobId && <span className="text-[12px] text-gray-400">Awaiting transport job</span>}
    </div>
  );
}

function NewOrderDialog({ onClose, onDone }: { onClose: () => void; onDone: (order: WarehouseOrder) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const customers = (db?.parties ?? []).filter(party => party.type === 'contract_customer');
  const warehouses = (db?.locations ?? []).filter(location => ['warehouse', 'logistics_centre'].includes(location.type));
  const [type, setType] = useState<WarehouseOrder['type']>('inbound');
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [locationId, setLocationId] = useState(warehouses[0]?.id ?? '');
  const [customerReference, setCustomerReference] = useState('');
  const [expectedAt, setExpectedAt] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [lines, setLines] = useState<{ skuId: string; quantity: number }[]>([{ skuId: '', quantity: 0 }]);
  if (!db) return null;
  const skus = db.skus.filter(sku => sku.customerId === customerId);
  return (
    <FormDialog open title="New warehouse order" description="Inbound orders are advance notices of stock to receive; outbound orders are allocated from stock and picked." submitLabel="Create order" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.createWarehouseOrder(actor!, { type, customerId, locationId, customerReference, expectedAt: fromLocalInput(expectedAt), lines: lines.filter(line => line.skuId).map(line => ({ skuId: line.skuId, quantity: Number(line.quantity) })) }), order => { if (order) onDone(order); })}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Direction" id="wo-type"><select id="wo-type" className={SELECT} value={type} onChange={event => setType(event.target.value as WarehouseOrder['type'])}><option value="inbound">Inbound (receive)</option><option value="outbound">Outbound (pick and dispatch)</option></select></Field>
        <Field label="Customer" id="wo-customer"><select id="wo-customer" className={SELECT} value={customerId} onChange={event => { setCustomerId(event.target.value); setLines([{ skuId: '', quantity: 0 }]); }}>{customers.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
        <Field label="Warehouse" id="wo-location"><select id="wo-location" className={SELECT} value={locationId} onChange={event => setLocationId(event.target.value)}>{warehouses.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
        <Field label="Expected (UTC)" id="wo-expected"><input id="wo-expected" type="datetime-local" className={INPUT} value={expectedAt} onChange={event => setExpectedAt(event.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Customer reference" id="wo-ref"><input id="wo-ref" className={INPUT} value={customerReference} onChange={event => setCustomerReference(event.target.value)} placeholder={type === 'inbound' ? 'ASN or purchase order number' : 'Sales order and delivery point'} /></Field></div>
      </div>
      <fieldset className="form-group">
        <legend className="form-label">Lines</legend>
        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="flex gap-2">
              <select aria-label={`SKU for line ${index + 1}`} className={SELECT} value={line.skuId} onChange={event => setLines(current => current.map((entry, i) => i === index ? { ...entry, skuId: event.target.value } : entry))}><option value="">Select SKU</option>{skus.map(sku => <option key={sku.id} value={sku.id}>{sku.code} · {sku.name} ({sku.unit})</option>)}</select>
              <input aria-label={`Quantity for line ${index + 1}`} type="number" min={1} className={`${INPUT} !w-28`} value={line.quantity || ''} onChange={event => setLines(current => current.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} />
              <button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(current => current.filter((_, i) => i !== index))} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 disabled:opacity-40">×</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines(current => [...current, { skuId: '', quantity: 0 }])} className="mt-2 text-[12px] font-semibold text-primary hover:text-primary-dark">Add line</button>
      </fieldset>
    </FormDialog>
  );
}

function ReceiveDialog({ order, onClose, onDone }: { order: WarehouseOrder; onClose: () => void; onDone: (message: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [lines, setLines] = useState(() => order.lines.map(line => ({ skuId: line.skuId, actualQty: line.quantity, damagedQty: 0 })));
  const [notes, setNotes] = useState('');
  const offline = !!db?.settings.offline;
  function submit() {
    const payload = { orderId: order.id, lines, notes, idempotencyKey: newId() };
    if (offline) return ops.enqueueOffline(actor!, { kind: 'receiving', summary: `Receive ${order.reference}`, payload });
    return ops.receiveOrder(actor!, payload);
  }
  return (
    <FormDialog open title={`Receive ${order.reference}`} description="Count each line as it comes off the vehicle. Differences from the advised quantity and any damage are recorded as exceptions and notified to the inventory manager." submitLabel={offline ? 'Queue receipt' : 'Confirm receipt'} busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(submit, () => onDone(offline ? 'Receipt queued for sync' : `${order.reference} received`))}>
      <div className="space-y-3">
        {order.lines.map((line, index) => { const sku = db?.skus.find(s => s.id === line.skuId); const entry = lines[index]; return (
          <div key={line.skuId} className="rounded-xl border border-gray-200 p-3">
            <p className="!text-[13px] !font-semibold !text-secondary">{sku?.name} <span className="font-normal text-gray-400">· advised {line.quantity} {sku?.unit}</span></p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label="Received" id={`rc-${line.skuId}`}><input id={`rc-${line.skuId}`} type="number" min={0} className={INPUT} value={entry.actualQty} onChange={event => setLines(current => current.map((e, i) => i === index ? { ...e, actualQty: Number(event.target.value) } : e))} /></Field>
              <Field label="Of which damaged" id={`dm-${line.skuId}`}><input id={`dm-${line.skuId}`} type="number" min={0} className={INPUT} value={entry.damagedQty} onChange={event => setLines(current => current.map((e, i) => i === index ? { ...e, damagedQty: Number(event.target.value) } : e))} /></Field>
            </div>
          </div>
        ); })}
      </div>
      <div className="mt-4"><Field label="Notes" id="rc-notes"><textarea id="rc-notes" className={TEXTAREA} value={notes} onChange={event => setNotes(event.target.value)} /></Field></div>
    </FormDialog>
  );
}

function PickDialog({ order, onClose, onDone }: { order: WarehouseOrder; onClose: () => void; onDone: (message: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [lines, setLines] = useState(() => order.lines.map(line => ({ skuId: line.skuId, pickedQty: line.quantity })));
  const [notes, setNotes] = useState('');
  const offline = !!db?.settings.offline;
  function submit() {
    const payload = { orderId: order.id, lines, notes, idempotencyKey: newId() };
    if (offline) return ops.enqueueOffline(actor!, { kind: 'picking', summary: `Pick ${order.reference}`, payload });
    return ops.pickOrder(actor!, payload);
  }
  return (
    <FormDialog open title={`Pick ${order.reference}`} description="Confirm the picked quantity per line. Short picks release the balance back to available stock and are recorded as exceptions." submitLabel={offline ? 'Queue pick' : 'Confirm pick'} busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(submit, () => onDone(offline ? 'Pick queued for sync' : `${order.reference} picked`))}>
      <div className="space-y-3">
        {order.lines.map((line, index) => { const sku = db?.skus.find(s => s.id === line.skuId); const balance = db ? getBalance(db, line.skuId, order.locationId, false) : undefined; return (
          <div key={line.skuId} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
            <div className="min-w-0 flex-1"><p className="!text-[13px] !font-semibold !text-secondary">{sku?.name}</p><p className="!text-[12px] !text-gray-400">Allocated {line.quantity} {sku?.unit} · {balance?.reserved ?? 0} reserved at this warehouse</p></div>
            <input aria-label={`Picked quantity for ${sku?.name}`} type="number" min={0} max={line.quantity} className={`${INPUT} !w-28`} value={lines[index].pickedQty} onChange={event => setLines(current => current.map((e, i) => i === index ? { ...e, pickedQty: Number(event.target.value) } : e))} />
          </div>
        ); })}
      </div>
      <div className="mt-4"><Field label="Notes" id="pk-notes"><textarea id="pk-notes" className={TEXTAREA} value={notes} onChange={event => setNotes(event.target.value)} /></Field></div>
      <p className="!text-[12px] !text-gray-400"><StatusBadge variant="neutral">Idempotent</StatusBadge> Submitting twice cannot deduct stock twice: the second submission returns the first result.</p>
    </FormDialog>
  );
}

function BoxIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21V9l9-5 9 5v12M9 21v-6h6v6M3 13h18" /></svg>;
}
