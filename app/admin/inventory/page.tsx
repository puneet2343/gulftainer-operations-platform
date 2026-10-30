'use client';

/*
 * Momentum stock: balances per SKU and warehouse (available, allocated, damaged,
 * held), the immutable movement ledger with compensating reversals, adjustments
 * with second-person approval, and the SKU master.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import Tabs from '@/components/ui/Tabs';
import ListToolbar from '@/components/ui/ListToolbar';
import Pagination from '@/components/ui/Pagination';
import FormDialog from '@/components/ui/FormDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field, StatusBadge } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT, TEXTAREA } from '@/components/ui/Table';
import { DownloadIcon, PlusIcon } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { ApprovalStatusBadge, PartyName, LocationName, EmployeeName, PanelButton } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops, onHand } from '@/lib/ops/ops';
import { newId } from '@/lib/ops/core';
import { useList } from '@/lib/use-list';
import { formatDateTime, downloadCsv } from '@/lib/format';
import { BUCKETS, BUCKET_LABELS, MOVEMENT_TYPE_LABELS, type Approval, type Bucket, type StockBalance, type StockMovement, type StockMovementType, type StockCategory, type StockUnit } from '@/lib/ops/types';

type Tab = 'balances' | 'ledger' | 'adjustments' | 'skus';
type Dialog = { kind: 'adjust' | 'hold' | 'transfer'; balance: StockBalance } | { kind: 'reverse'; movement: StockMovement } | { kind: 'decide'; approval: Approval; decision: 'approved' | 'rejected' } | { kind: 'sku' } | { kind: 'adjust-any' } | null;

export default function InventoryPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(() => (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('tab') as Tab)) || 'balances');
  const [dialog, setDialog] = useState<Dialog>(null);
  if (!db || !actor) return <PageSkeleton />;

  const balances = db.balances.filter(balance => onHand(balance) > 0 || balance.version > 0);
  const totals = BUCKETS.reduce((acc, bucket) => { acc[bucket] = balances.reduce((sum, balance) => sum + balance[bucket], 0); return acc; }, {} as Record<Bucket, number>);
  const pending = db.approvals.filter(approval => approval.status === 'pending');
  const canManage = ['inventory_manager', 'warehouse_supervisor', 'system_admin'].includes(actor.role);
  const done = (message: string) => { setDialog(null); toast.success(message); };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Logistics" title="Inventory" subtitle="Every balance equals the sum of its ledger entries. Corrections are posted as new movements, never by editing history; adjustments at or above the threshold need a second person." action={canManage ? <div className="flex flex-wrap gap-2"><ToolbarButton variant="secondary" onClick={() => setDialog({ kind: 'sku' })}><PlusIcon />New SKU</ToolbarButton><ToolbarButton onClick={() => setDialog({ kind: 'adjust-any' })}>Request adjustment</ToolbarButton></div> : undefined} />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Icon />} label="Available" value={totals.available} description="across warehouses" />
        <StatCard icon={<Icon />} label="Allocated" value={totals.reserved} description="reserved to orders" />
        <StatCard icon={<Icon />} label="Damaged or held" value={totals.damaged + totals.held} description={`${totals.damaged} damaged, ${totals.held} held`} />
        <StatCard icon={<Icon />} label="Awaiting approval" value={pending.length} description="stock adjustments" />
      </section>

      <Panel delay={0.08}>
        <Tabs tabs={[{ id: 'balances', label: 'Balances' }, { id: 'ledger', label: 'Movement ledger' }, { id: 'adjustments', label: 'Adjustments and approvals' }, { id: 'skus', label: 'SKUs' }]} value={tab} onChange={setTab} counts={{ balances: balances.length, ledger: db.movements.length, adjustments: pending.length, skus: db.skus.length }} />
        {tab === 'balances' && <BalancesTab balances={balances} canManage={canManage} onOpen={setDialog} />}
        {tab === 'ledger' && <LedgerTab onReverse={movement => setDialog({ kind: 'reverse', movement })} />}
        {tab === 'adjustments' && <AdjustmentsTab onDecide={(approval, decision) => setDialog({ kind: 'decide', approval, decision })} />}
        {tab === 'skus' && <SkusTab />}
      </Panel>

      {dialog?.kind === 'adjust' && <AdjustDialog skuId={dialog.balance.skuId} locationId={dialog.balance.locationId} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'adjust-any' && <AdjustDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'hold' && <HoldDialog balance={dialog.balance} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'transfer' && <TransferDialog balance={dialog.balance} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'reverse' && <ReverseDialog movement={dialog.movement} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'decide' && <DecideDialog approval={dialog.approval} decision={dialog.decision} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'sku' && <SkuDialog onClose={() => setDialog(null)} onDone={done} />}
    </motion.div>
  );
}

function BalancesTab({ balances, canManage, onOpen }: { balances: StockBalance[]; canManage: boolean; onOpen: (dialog: Dialog) => void }) {
  const { db } = useOps();
  const list = useList<StockBalance, { location: string; customer: string }>(balances, {
    pageSize: 15,
    initialFilters: { location: 'All', customer: 'All' },
    search: (balance, query) => { const sku = db?.skus.find(s => s.id === balance.skuId); return [sku?.code ?? '', sku?.name ?? '', sku?.barcode ?? ''].some(value => value.toLowerCase().includes(query)); },
    filter: (balance, filters) => (filters.location === 'All' || balance.locationId === filters.location) && (filters.customer === 'All' || db?.skus.find(s => s.id === balance.skuId)?.customerId === filters.customer),
    sort: (a, b) => (db?.skus.find(s => s.id === a.skuId)?.name ?? '').localeCompare(db?.skus.find(s => s.id === b.skuId)?.name ?? ''),
  });
  if (!db) return null;
  const warehouses = db.locations.filter(location => ['warehouse', 'logistics_centre', 'inland_depot'].includes(location.type));
  return (
    <>
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search SKU code, name or barcode" label="Search balances" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(open => !open)} filters={list.filters}
        groups={[{ key: 'location', label: 'Warehouse', options: warehouses.map(l => ({ value: l.id, label: l.code })) }, { key: 'customer', label: 'Customer', options: db.parties.filter(p => p.type === 'contract_customer').map(p => ({ value: p.id, label: p.name })) }]}
        onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters}
        extra={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`stock-balances-${new Date().toISOString().slice(0, 10)}.csv`, ['SKU', 'Name', 'Customer', 'Warehouse', ...BUCKETS.map(b => BUCKET_LABELS[b]), 'On hand', 'Unit'], list.filtered.map(balance => { const sku = db.skus.find(s => s.id === balance.skuId); return [sku?.code, sku?.name, db.parties.find(p => p.id === sku?.customerId)?.name, db.locations.find(l => l.id === balance.locationId)?.code, ...BUCKETS.map(b => balance[b]), onHand(balance), sku?.unit]; }))}><DownloadIcon />CSV</ToolbarButton>} />
      {list.pageItems.length === 0 ? <EmptyState title="No stock" description="Balances appear once inbound orders are received." /> : (
        <>
          <TableWrap minWidth={980}>
            <THead><Th>SKU</Th><Th>Customer</Th><Th>Warehouse</Th><Th align="right">Available</Th><Th align="right">Allocated</Th><Th align="right">Damaged</Th><Th align="right">Held</Th><Th align="right">On hand</Th><Th align="right">Actions</Th></THead>
            <tbody>
              {list.pageItems.map(balance => { const sku = db.skus.find(s => s.id === balance.skuId)!; const low = balance.available > 0 && balance.available < db.settings.lowStockThreshold; return (
                <Tr key={balance.id}>
                  <Td><span className="font-mono text-[12px] text-gray-400">{sku.code}</span><p className="!text-[13px] !font-semibold !text-secondary">{sku.name}</p></Td>
                  <Td><PartyName db={db} id={sku.customerId} /></Td>
                  <Td><LocationName db={db} id={balance.locationId} /></Td>
                  <Td align="right"><span className={low ? 'font-semibold text-[#B7791F]' : ''}>{balance.available.toLocaleString()}</span>{low && <p className="!text-[11px] !text-[#B7791F]">low</p>}</Td>
                  <Td align="right">{balance.reserved.toLocaleString()}</Td>
                  <Td align="right">{balance.damaged ? <span className="text-[#C0352B]">{balance.damaged.toLocaleString()}</span> : '0'}</Td>
                  <Td align="right">{balance.held.toLocaleString()}</Td>
                  <Td align="right" className="font-semibold text-secondary">{onHand(balance).toLocaleString()} <span className="text-[11px] font-normal text-gray-400">{sku.unit}</span></Td>
                  <Td align="right">{canManage && <div className="flex justify-end gap-1.5"><PanelButton onClick={() => onOpen({ kind: 'adjust', balance })}>Adjust</PanelButton><PanelButton onClick={() => onOpen({ kind: 'hold', balance })}>Hold</PanelButton><PanelButton onClick={() => onOpen({ kind: 'transfer', balance })}>Transfer</PanelButton></div>}</Td>
                </Tr>
              ); })}
            </tbody>
          </TableWrap>
          <CardList>
            {list.pageItems.map(balance => { const sku = db.skus.find(s => s.id === balance.skuId)!; return (
              <Card key={balance.id}>
                <p className="!text-[13px] !font-semibold !text-secondary">{sku.name}</p>
                <p className="!text-[12px] !text-gray-400">{sku.code} · <LocationName db={db} id={balance.locationId} code /> · <PartyName db={db} id={sku.customerId} /></p>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[12px]">{BUCKETS.map(bucket => <div key={bucket} className="rounded-lg bg-gray-50 py-1.5"><p className="!text-[14px] !font-semibold !text-secondary">{balance[bucket]}</p><p className="!text-[11px] !text-gray-400">{BUCKET_LABELS[bucket]}</p></div>)}</div>
                {canManage && <div className="mt-3 flex gap-1.5 border-t border-gray-100 pt-3"><PanelButton onClick={() => onOpen({ kind: 'adjust', balance })}>Adjust</PanelButton><PanelButton onClick={() => onOpen({ kind: 'transfer', balance })}>Transfer</PanelButton></div>}
              </Card>
            ); })}
          </CardList>
          <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
        </>
      )}
    </>
  );
}

function LedgerTab({ onReverse }: { onReverse: (movement: StockMovement) => void }) {
  const { db, actor } = useOps();
  const movements = useMemo(() => db ? [...db.movements].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) : [], [db]);
  const list = useList<StockMovement, { type: string; location: string }>(movements, {
    pageSize: 15,
    initialFilters: { type: 'All', location: 'All' },
    search: (movement, query) => { const sku = db?.skus.find(s => s.id === movement.skuId); return [movement.reference, movement.reason, sku?.code ?? '', sku?.name ?? ''].some(value => value.toLowerCase().includes(query)); },
    filter: (movement, filters) => (filters.type === 'All' || movement.type === filters.type) && (filters.location === 'All' || movement.effects.some(effect => effect.locationId === filters.location)),
  });
  if (!db || !actor) return null;
  const canReverse = ['inventory_manager', 'system_admin'].includes(actor.role);
  return (
    <>
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search reference, SKU or reason" label="Search ledger" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(open => !open)} filters={list.filters}
        groups={[{ key: 'type', label: 'Movement type', options: (Object.keys(MOVEMENT_TYPE_LABELS) as StockMovementType[]).map(type => ({ value: type, label: MOVEMENT_TYPE_LABELS[type] })) }, { key: 'location', label: 'Warehouse', options: db.locations.filter(l => ['warehouse', 'logistics_centre', 'inland_depot'].includes(l.type)).map(l => ({ value: l.id, label: l.code })) }]}
        onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters}
        extra={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`stock-ledger-${new Date().toISOString().slice(0, 10)}.csv`, ['Reference', 'Timestamp', 'Type', 'SKU', 'Quantity', 'Unit', 'Effects', 'Reason', 'Employee', 'Reverses', 'Reversed by'], list.filtered.map(m => [m.reference, m.timestamp, m.type, db.skus.find(s => s.id === m.skuId)?.code, m.quantity, m.unit, m.effects.map(e => `${db.locations.find(l => l.id === e.locationId)?.code} ${e.bucket} ${e.delta > 0 ? '+' : ''}${e.delta}`).join('; '), m.reason, db.employees.find(e => e.id === m.employeeId)?.name, db.movements.find(x => x.id === m.reversesMovementId)?.reference ?? '', db.movements.find(x => x.id === m.reversedByMovementId)?.reference ?? '']))}><DownloadIcon />CSV</ToolbarButton>} />
      {list.pageItems.length === 0 ? <EmptyState title="No movements" description="The ledger fills as stock is received, allocated, picked and adjusted." /> : (
        <>
          <TableWrap minWidth={1040}>
            <THead><Th>Reference</Th><Th>Type</Th><Th>SKU</Th><Th>Effects</Th><Th>Reason</Th><Th>By</Th><Th>When</Th><Th align="right">Action</Th></THead>
            <tbody>
              {list.pageItems.map(movement => { const sku = db.skus.find(s => s.id === movement.skuId); const reversed = movement.reversedByMovementId ? db.movements.find(m => m.id === movement.reversedByMovementId) : null; return (
                <Tr key={movement.id}>
                  <Td><span className="font-mono text-[13px] font-semibold text-secondary">{movement.reference}</span>{movement.reversesMovementId && <p className="!text-[11px] !text-gray-400">reverses {db.movements.find(m => m.id === movement.reversesMovementId)?.reference}</p>}</Td>
                  <Td><StatusBadge variant={movement.type === 'reversal' ? 'warning' : movement.type === 'damage' ? 'danger' : movement.type === 'receipt' ? 'success' : 'neutral'}>{MOVEMENT_TYPE_LABELS[movement.type]}</StatusBadge></Td>
                  <Td><p className="!text-[13px] !text-secondary">{sku?.name}</p><p className="!text-[12px] !text-gray-400">{movement.quantity} {movement.unit}</p></Td>
                  <Td><ul className="font-mono text-[12px]">{movement.effects.map((effect, index) => <li key={index}><span className="text-gray-500">{db.locations.find(l => l.id === effect.locationId)?.code}</span> {effect.bucket} <span className={effect.delta > 0 ? 'text-[#1F8F6E]' : 'text-[#C0352B]'}>{effect.delta > 0 ? '+' : ''}{effect.delta}</span></li>)}</ul></Td>
                  <Td className="max-w-[260px]">{movement.reason}</Td>
                  <Td><EmployeeName db={db} id={movement.employeeId} /></Td>
                  <Td className="tabular-nums">{formatDateTime(movement.timestamp)}</Td>
                  <Td align="right">{reversed ? <span className="text-[12px] text-gray-400">Reversed by {reversed.reference}</span> : movement.type !== 'reversal' && canReverse ? <PanelButton onClick={() => onReverse(movement)}>Reverse</PanelButton> : null}</Td>
                </Tr>
              ); })}
            </tbody>
          </TableWrap>
          <CardList>
            {list.pageItems.map(movement => { const sku = db.skus.find(s => s.id === movement.skuId); return (
              <Card key={movement.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono !text-[13px] !font-semibold !text-secondary">{movement.reference}</p><p className="!text-[12px] !text-gray-500">{sku?.name} · {movement.quantity} {movement.unit}</p><p className="!text-[12px] !text-gray-400">{movement.reason}</p></div><StatusBadge variant="neutral">{MOVEMENT_TYPE_LABELS[movement.type]}</StatusBadge></div><p className="mt-2 !text-[12px] !text-gray-400">{formatDateTime(movement.timestamp)}</p></Card>
            ); })}
          </CardList>
          <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
        </>
      )}
    </>
  );
}

function AdjustmentsTab({ onDecide }: { onDecide: (approval: Approval, decision: 'approved' | 'rejected') => void }) {
  const { db, actor } = useOps();
  if (!db || !actor) return null;
  const approvals = [...db.approvals].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const canDecide = ['inventory_manager', 'warehouse_supervisor', 'system_admin'].includes(actor.role);
  if (approvals.length === 0) return <EmptyState title="No adjustment requests" description="Cycle-count corrections and write-offs are requested here and approved by a second person." />;
  return (
    <>
      <p className="border-b border-gray-100 px-4 py-3 !text-[12px] !text-gray-500">Adjustments of {db.settings.adjustmentApprovalThreshold} units or more, and any request from a supervisor or worker, wait for a second person. Requesters cannot approve their own request.</p>
      <TableWrap minWidth={980}>
        <THead><Th>Request</Th><Th>SKU and warehouse</Th><Th align="right">Change</Th><Th>Reason</Th><Th>Requested by</Th><Th>Decision</Th><Th>Status</Th><Th align="right">Action</Th></THead>
        <tbody>
          {approvals.map(approval => { const sku = db.skus.find(s => s.id === approval.payload.skuId); const own = approval.requestedBy === actor.id; return (
            <Tr key={approval.id}>
              <Td><span className="font-mono text-[13px] font-semibold text-secondary">{approval.reference}</span><p className="!text-[12px] !text-gray-400">{formatDateTime(approval.requestedAt)}</p></Td>
              <Td><p className="!text-[13px] !text-secondary">{sku?.name}</p><p className="!text-[12px] !text-gray-400"><LocationName db={db} id={approval.payload.locationId} /> · {BUCKET_LABELS[approval.payload.bucket!]}</p></Td>
              <Td align="right"><span className={`font-semibold ${approval.payload.delta! > 0 ? 'text-[#1F8F6E]' : 'text-[#C0352B]'}`}>{approval.payload.delta! > 0 ? '+' : ''}{approval.payload.delta} {sku?.unit}</span></Td>
              <Td className="max-w-[260px]">{approval.payload.reason}</Td>
              <Td><EmployeeName db={db} id={approval.requestedBy} /></Td>
              <Td>{approval.decidedBy ? <><EmployeeName db={db} id={approval.decidedBy} /><p className="!text-[12px] !text-gray-400">{approval.decisionNote}{approval.movementId && <> · {db.movements.find(m => m.id === approval.movementId)?.reference}</>}</p></> : <span className="text-gray-400">Pending</span>}</Td>
              <Td><ApprovalStatusBadge status={approval.status} /></Td>
              <Td align="right">{approval.status === 'pending' && canDecide && (own ? <span className="text-[12px] text-gray-400">Your own request</span> : <div className="flex justify-end gap-1.5"><PanelButton primary onClick={() => onDecide(approval, 'approved')}>Approve</PanelButton><PanelButton danger onClick={() => onDecide(approval, 'rejected')}>Reject</PanelButton></div>)}</Td>
            </Tr>
          ); })}
        </tbody>
      </TableWrap>
      <CardList>
        {approvals.map(approval => { const sku = db.skus.find(s => s.id === approval.payload.skuId); const own = approval.requestedBy === actor.id; return (
          <Card key={approval.id}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono !text-[13px] !font-semibold !text-secondary">{approval.reference}</p><p className="!text-[12px] !text-gray-500">{sku?.name} · {approval.payload.delta! > 0 ? '+' : ''}{approval.payload.delta} {sku?.unit}</p><p className="!text-[12px] !text-gray-400">{approval.payload.reason}</p></div><ApprovalStatusBadge status={approval.status} /></div>
            {approval.status === 'pending' && canDecide && !own && <div className="mt-3 flex gap-1.5 border-t border-gray-100 pt-3"><PanelButton primary onClick={() => onDecide(approval, 'approved')}>Approve</PanelButton><PanelButton danger onClick={() => onDecide(approval, 'rejected')}>Reject</PanelButton></div>}
          </Card>
        ); })}
      </CardList>
    </>
  );
}

function SkusTab() {
  const { db } = useOps();
  if (!db) return null;
  if (db.skus.length === 0) return <EmptyState title="No SKUs" description="Create the SKU master for each contract customer." />;
  return (
    <>
      <TableWrap minWidth={900}>
        <THead><Th>Code</Th><Th>Name</Th><Th>Customer</Th><Th>Category</Th><Th>Unit</Th><Th>Handling</Th><Th align="right">On hand</Th></THead>
        <tbody>
          {db.skus.map(sku => { const total = db.balances.filter(b => b.skuId === sku.id).reduce((sum, b) => sum + onHand(b), 0); return (
            <Tr key={sku.id}>
              <Td><span className="font-mono text-[13px] font-semibold text-secondary">{sku.code}</span><p className="font-mono !text-[11px] !text-gray-400">{sku.barcode}</p></Td>
              <Td><p className="!text-[13px] !text-secondary">{sku.name}</p><p className="!text-[12px] !text-gray-400">{sku.description}</p></Td>
              <Td><PartyName db={db} id={sku.customerId} /></Td>
              <Td>{sku.category}</Td>
              <Td>{sku.unit} · {sku.weightKg} kg</Td>
              <Td>{sku.handling.length ? sku.handling.join(', ') : <span className="text-gray-400">—</span>}</Td>
              <Td align="right" className="font-semibold text-secondary">{total.toLocaleString()}</Td>
            </Tr>
          ); })}
        </tbody>
      </TableWrap>
      <CardList>{db.skus.map(sku => <Card key={sku.id}><p className="!text-[13px] !font-semibold !text-secondary">{sku.name}</p><p className="!text-[12px] !text-gray-400">{sku.code} · <PartyName db={db} id={sku.customerId} /> · {sku.unit}</p></Card>)}</CardList>
    </>
  );
}

/* ------------------------------------------------------------ Dialogs */

function AdjustDialog({ skuId, locationId, onClose, onDone }: { skuId?: string; locationId?: string; onClose: () => void; onDone: (message: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [sku, setSku] = useState(skuId ?? db?.skus[0]?.id ?? '');
  const [location, setLocation] = useState(locationId ?? '');
  const [bucket, setBucket] = useState<Bucket>('available');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  if (!db) return null;
  const locations = db.locations.filter(l => ['warehouse', 'logistics_centre', 'inland_depot'].includes(l.type));
  const needsSecond = Math.abs(Number(delta)) >= db.settings.adjustmentApprovalThreshold || !['inventory_manager', 'system_admin'].includes(actor?.role ?? '');
  return (
    <FormDialog open title="Request stock adjustment" description="Positive quantities add stock, negative quantities remove it. Every adjustment needs a reason and is kept in the ledger." submitLabel={needsSecond ? 'Submit for approval' : 'Post adjustment'} busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.requestAdjustment(actor!, { skuId: sku, locationId: location || locations[0]?.id, bucket, delta: Number(delta), reason }), approval => onDone(approval?.status === 'approved' ? 'Adjustment posted' : 'Submitted for a second approver'))}
      footer={needsSecond ? 'A second person must approve this request' : `Below the ${db.settings.adjustmentApprovalThreshold}-unit threshold: posts immediately`}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="SKU" id="adj-sku"><select id="adj-sku" className={SELECT} value={sku} disabled={!!skuId} onChange={event => setSku(event.target.value)}>{db.skus.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></Field>
        <Field label="Warehouse" id="adj-loc"><select id="adj-loc" className={SELECT} value={location || locations[0]?.id} disabled={!!locationId} onChange={event => setLocation(event.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Bucket" id="adj-bucket"><select id="adj-bucket" className={SELECT} value={bucket} onChange={event => setBucket(event.target.value as Bucket)}>{BUCKETS.map(b => <option key={b} value={b}>{BUCKET_LABELS[b]}</option>)}</select></Field>
        <Field label="Quantity change" id="adj-delta"><input id="adj-delta" type="number" className={INPUT} value={delta} onChange={event => setDelta(event.target.value)} placeholder="-12" /></Field>
      </div>
      <Field label="Reason" id="adj-reason"><textarea id="adj-reason" className={TEXTAREA} value={reason} onChange={event => setReason(event.target.value)} placeholder="Cycle count 7 October: 12 cartons short in bay A4" /></Field>
    </FormDialog>
  );
}

function HoldDialog({ balance, onClose, onDone }: { balance: StockBalance; onClose: () => void; onDone: (message: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [release, setRelease] = useState(false);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const sku = db?.skus.find(s => s.id === balance.skuId);
  return (
    <FormDialog open title={`${release ? 'Release hold on' : 'Place hold on'} ${sku?.name}`} description={`${balance.available} available, ${balance.held} held at ${db?.locations.find(l => l.id === balance.locationId)?.name}.`} submitLabel={release ? 'Release' : 'Place hold'} busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.holdStock(actor!, { skuId: balance.skuId, locationId: balance.locationId, qty: Number(qty), reason, release }), () => onDone(release ? 'Hold released' : 'Hold placed'))}>
      <div className="mb-4 flex gap-2">{[false, true].map(value => <button key={String(value)} type="button" aria-pressed={release === value} onClick={() => setRelease(value)} className={`min-h-[34px] rounded-lg border px-3 text-[12px] font-semibold ${release === value ? 'border-primary/25 bg-primary/[0.07] text-primary' : 'border-gray-200 bg-white text-gray-500'}`}>{value ? 'Release hold' : 'Place hold'}</button>)}</div>
      <Field label={`Quantity (${sku?.unit})`} id="hold-qty"><input id="hold-qty" type="number" min={1} className={INPUT} value={qty} onChange={event => setQty(event.target.value)} /></Field>
      <Field label="Reason" id="hold-reason"><input id="hold-reason" className={INPUT} value={reason} onChange={event => setReason(event.target.value)} placeholder="Quality hold pending customer release" /></Field>
    </FormDialog>
  );
}

function TransferDialog({ balance, onClose, onDone }: { balance: StockBalance; onClose: () => void; onDone: (message: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const targets = (db?.locations ?? []).filter(l => ['warehouse', 'logistics_centre', 'inland_depot'].includes(l.type) && l.id !== balance.locationId && l.active);
  const [toLocationId, setToLocationId] = useState(targets[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const sku = db?.skus.find(s => s.id === balance.skuId);
  const offline = !!db?.settings.offline;
  function submit() {
    const payload = { skuId: balance.skuId, fromLocationId: balance.locationId, toLocationId, qty: Number(qty), reason, idempotencyKey: newId() };
    if (offline) return ops.enqueueOffline(actor!, { kind: 'stock_transfer', summary: `Transfer ${qty} ${sku?.unit} ${sku?.name}`, payload });
    return ops.transferStock(actor!, payload);
  }
  return (
    <FormDialog open title={`Transfer ${sku?.name}`} description={`${balance.available} ${sku?.unit} available at ${db?.locations.find(l => l.id === balance.locationId)?.name}. The transfer posts one ledger movement with effects at both warehouses.`} submitLabel={offline ? 'Queue transfer' : 'Transfer'} busy={busy} error={error} onClose={onClose} onSubmit={() => void run(submit, () => onDone(offline ? 'Transfer queued' : 'Stock transferred'))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="To warehouse" id="tf-to"><select id="tf-to" className={SELECT} value={toLocationId} onChange={event => setToLocationId(event.target.value)}>{targets.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label={`Quantity (${sku?.unit})`} id="tf-qty"><input id="tf-qty" type="number" min={1} max={balance.available} className={INPUT} value={qty} onChange={event => setQty(event.target.value)} /></Field>
      </div>
      <Field label="Reason" id="tf-reason"><input id="tf-reason" className={INPUT} value={reason} onChange={event => setReason(event.target.value)} /></Field>
    </FormDialog>
  );
}

function ReverseDialog({ movement, onClose, onDone }: { movement: StockMovement; onClose: () => void; onDone: (message: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [reason, setReason] = useState('');
  return (
    <FormDialog open title={`Reverse ${movement.reference}`} description={`Posts a compensating movement that undoes the effects of ${MOVEMENT_TYPE_LABELS[movement.type].toLowerCase()} of ${movement.quantity} ${movement.unit} ${db?.skus.find(s => s.id === movement.skuId)?.name}. The original entry stays in the ledger.`} submitLabel="Post reversal" danger busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.reverseMovement(actor!, { movementId: movement.id, reason }), reversal => onDone(`${reversal?.reference} posted`))}>
      <Field label="Reason" id="rev-reason"><textarea id="rev-reason" autoFocus className={TEXTAREA} value={reason} onChange={event => setReason(event.target.value)} /></Field>
    </FormDialog>
  );
}

function DecideDialog({ approval, decision, onClose, onDone }: { approval: Approval; decision: 'approved' | 'rejected'; onClose: () => void; onDone: (message: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [note, setNote] = useState('');
  const sku = db?.skus.find(s => s.id === approval.payload.skuId);
  return (
    <FormDialog open title={`${decision === 'approved' ? 'Approve' : 'Reject'} ${approval.reference}`} description={`${approval.payload.delta! > 0 ? '+' : ''}${approval.payload.delta} ${sku?.unit} of ${sku?.name} (${BUCKET_LABELS[approval.payload.bucket!]}) requested by ${db?.employees.find(e => e.id === approval.requestedBy)?.name}: ${approval.payload.reason}`} submitLabel={decision === 'approved' ? 'Approve and post' : 'Reject'} danger={decision === 'rejected'} busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.decideApproval(actor!, { approvalId: approval.id, decision, note }), () => onDone(decision === 'approved' ? 'Adjustment approved and posted' : 'Request rejected'))}>
      <Field label="Decision note" id="dec-note"><textarea id="dec-note" className={TEXTAREA} value={note} onChange={event => setNote(event.target.value)} /></Field>
    </FormDialog>
  );
}

function SkuDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const customers = (db?.parties ?? []).filter(p => p.type === 'contract_customer');
  const [form, setForm] = useState({ code: '', name: '', description: '', customerId: customers[0]?.id ?? '', category: 'FMCG' as StockCategory, unit: 'cartons' as StockUnit, weightKg: 1, handling: '' });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));
  return (
    <FormDialog open title="New SKU" description="Stock-keeping unit for a contract customer. The code is generated when left empty." submitLabel="Create SKU" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.createSku(actor!, { ...form, handling: form.handling.split(',').map(h => h.trim()).filter(Boolean) }), sku => onDone(`${sku?.code} created`))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Customer" id="sku-customer"><select id="sku-customer" className={SELECT} value={form.customerId} onChange={event => set('customerId', event.target.value)}>{customers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Code" id="sku-code"><input id="sku-code" className={`${INPUT} font-mono uppercase`} value={form.code} onChange={event => set('code', event.target.value)} placeholder="UNL-DOVE-24" /></Field>
        <div className="sm:col-span-2"><Field label="Name" id="sku-name"><input id="sku-name" className={INPUT} value={form.name} onChange={event => set('name', event.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Description" id="sku-desc"><input id="sku-desc" className={INPUT} value={form.description} onChange={event => set('description', event.target.value)} /></Field></div>
        <Field label="Category" id="sku-cat"><select id="sku-cat" className={SELECT} value={form.category} onChange={event => set('category', event.target.value as StockCategory)}>{(['FMCG', 'Automotive', 'Industrial', 'Oil and gas', 'Project cargo', 'Retail', 'Pharma'] as StockCategory[]).map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Unit" id="sku-unit"><select id="sku-unit" className={SELECT} value={form.unit} onChange={event => set('unit', event.target.value as StockUnit)}>{(['units', 'cartons', 'pallets', 'kg', 'tonnes'] as StockUnit[]).map(u => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Weight per unit (kg)" id="sku-weight"><input id="sku-weight" type="number" min={0} step="0.1" className={INPUT} value={form.weightKg} onChange={event => set('weightKg', Number(event.target.value))} /></Field>
        <Field label="Handling notes" id="sku-handling" hint="Comma separated"><input id="sku-handling" className={INPUT} value={form.handling} onChange={event => set('handling', event.target.value)} placeholder="Keep dry, Hazardous class 8" /></Field>
      </div>
    </FormDialog>
  );
}

function Icon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h7v5H4zM13 7h7v5h-7zM4 14h7v5H4zM13 14h7v5h-7z" /></svg>;
}
