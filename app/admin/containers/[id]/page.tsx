'use client';

/*
 * The container record. For an import box this is the clearance desk: customs,
 * delivery order, holds, online charge collection, haulier and e-token. For exports
 * it tracks gate-in, VGM and customs before loading. Every change is in the history.
 */

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader from '@/components/ui/PageHeader';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import Tabs from '@/components/ui/Tabs';
import { KeyValueList, CheckItem } from '@/components/ui/KeyValue';
import Timeline from '@/components/ui/Timeline';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { SELECT } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { ContainerStatusBadge, ContainerFlags, CustomsBadge, TokenStatusBadge, PartyName, LocationName, EmployeeName, PanelButton, PanelBody, ActionError } from '@/components/admin/Shared';
import DocumentUploadDialog from '@/components/admin/DocumentUploadDialog';
import { HoldDialog, CustomsDialog, DeliveryOrderDialog, CollectionDialog, TokenDialog, AmendTokenDialog, ShiftDialog, VgmDialog, ReeferDialog } from '@/components/admin/ContainerDialogs';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops, activeHolds, releaseBlockers, canOpenDocument } from '@/lib/ops/ops';
import { formatContainerNumber } from '@/lib/ops/iso6346';
import { quoteStorage } from '@/lib/ops/tariff';
import { formatDateTime, formatMoney, formatKg, relativeTime, formatDate } from '@/lib/format';
import { CONTAINER_CATEGORY_LABELS, CONTAINER_EVENT_LABELS, HOLD_LABELS, TOKEN_TYPE_LABELS, SERVICE_LABELS, type TokenType } from '@/lib/ops/types';

type Tab = 'history' | 'charges' | 'documents' | 'tokens';
type Dialog = 'hold' | 'customs' | 'do' | 'collect' | 'token' | 'amend' | 'shift' | 'vgm' | 'reefer' | 'upload' | null;

export default function ContainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error, clear } = useAction();
  const [tab, setTab] = useState<Tab>('history');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [releasingHold, setReleasingHold] = useState<string | null>(null);
  const [cancellingToken, setCancellingToken] = useState(false);
  const [haulierId, setHaulierId] = useState<string | null>(null);
  const now = new Date().toISOString();

  const container = db?.containers.find(entry => entry.id === id);
  const data = useMemo(() => {
    if (!db || !container) return null;
    const events = db.containerEvents.filter(event => event.containerId === container.id).sort((a, b) => b.at.localeCompare(a.at));
    const charges = db.charges.filter(charge => charge.containerId === container.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const documents = db.documents.filter(document => document.containerId === container.id);
    const tokens = db.tokens.filter(token => token.containerId === container.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const token = container.tokenId ? db.tokens.find(entry => entry.id === container.tokenId) ?? null : null;
    const inbound = db.vesselCalls.find(entry => entry.id === container.inboundCallId);
    const outbound = db.vesselCalls.find(entry => entry.id === container.outboundCallId);
    const location = db.locations.find(entry => entry.id === container.locationId);
    const storageSoFar = container.dischargedAt && container.status === 'in_yard' && container.category === 'import' ? quoteStorage(db.tariff, container, container.dischargedAt, now) : null;
    const transfer = db.inlandTransfers.find(entry => entry.containerIds.includes(container.id) && entry.status !== 'received');
    const job = container.transportJobId ? db.transportJobs.find(entry => entry.id === container.transportJobId) : null;
    return { events, charges, documents, tokens, token, inbound, outbound, location, storageSoFar, transfer, job };
  }, [db, container, now]);

  if (!db || !actor) return <PageSkeleton />;
  if (!container || !data) return <EmptyState title="Container not found" description="It may have been removed in another session." action={<Link href="/admin/containers" className="btn btn-secondary">Back to containers</Link>} />;

  const role = actor.role;
  const can = {
    clearance: ['customer_service', 'system_admin'].includes(role),
    holds: ['customer_service', 'terminal_ops', 'planner', 'system_admin'].includes(role),
    yard: ['terminal_ops', 'planner', 'gate_officer', 'system_admin'].includes(role),
    tokens: ['customer_service', 'gate_officer', 'system_admin'].includes(role),
    documents: role !== 'auditor',
    finance: ['customer_service', 'finance_manager', 'system_admin'].includes(role),
  };
  const holds = activeHolds(container);
  const blockers = releaseBlockers(container, now);
  const ready = blockers.length === 0;
  const isImport = container.category === 'import';
  const inYard = container.status === 'in_yard';
  const doValid = !!container.deliveryOrder && new Date(container.deliveryOrder.validUntil) >= new Date(now);
  const tokenType: TokenType = isImport ? 'import_pickup' : container.category === 'export' && container.status === 'expected' ? 'export_dropoff' : container.category === 'empty' && inYard ? 'empty_release' : 'empty_return';
  const done = (message: string) => { setDialog(null); toast.success(message); };
  const consigneeOutstanding = data.charges.filter(charge => charge.partyId === container.consigneeId && charge.amount > 0 && (!charge.invoiceId || db.invoices.find(invoice => invoice.id === charge.invoiceId)?.status !== 'paid')).reduce((sum, charge) => sum + charge.amount, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow={<Link href="/admin/containers" className="hover:text-primary">Containers</Link>}
        title={formatContainerNumber(container.number)}
        subtitle={`${container.size} ft ${container.type}, ${CONTAINER_CATEGORY_LABELS[container.category].toLowerCase()} ${container.full ? 'full' : 'empty'} for ${db.parties.find(party => party.id === container.lineId)?.name}. ${data.location ? `${inYard ? 'In the yard at' : 'Last at'} ${data.location.name}${container.yardPosition ? `, ${container.yardPosition}` : ''}.` : 'Not yet in a yard.'}`}
        action={<div className="flex flex-wrap items-center gap-2"><ContainerFlags container={container} /><ContainerStatusBadge container={container} /></div>}
      />

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 sm:space-y-5 xl:col-span-2">
          <Panel>
            <SectionHeader title="Container details" description={`Version ${container.version} · updated ${relativeTime(container.updatedAt)}`} action={can.documents && container.status !== 'delivered' ? <PanelButton onClick={() => setDialog('upload')}>Upload document</PanelButton> : undefined} />
            <PanelBody>
              <KeyValueList columns={4} items={[
                { label: 'Shipping line', value: <PartyName db={db} id={container.lineId} /> },
                { label: 'Consignee', value: <PartyName db={db} id={container.consigneeId} fallback="Not assigned" /> },
                { label: 'Clearing agent', value: <PartyName db={db} id={container.clearingAgentId} fallback="None" /> },
                { label: 'Shipper', value: container.shipperName },
                { label: 'Commodity', value: container.commodity, span: true },
                { label: 'Gross weight', value: formatKg(container.grossWeightKg) },
                { label: 'Verified gross mass', value: container.vgmKg === null ? <span className="text-[#B7791F]">Not weighed</span> : formatKg(container.vgmKg) },
                { label: 'Seal', value: container.sealNumber, mono: true },
                { label: 'Yard position', value: container.yardPosition ?? '', mono: true },
                { label: 'Inbound call', value: data.inbound ? <Link href={`/admin/vessels/${data.inbound.id}`} className="font-semibold">{data.inbound.vessel} {data.inbound.voyage}</Link> : '' },
                { label: 'Outbound call', value: data.outbound ? <Link href={`/admin/vessels/${data.outbound.id}`} className="font-semibold">{data.outbound.vessel} {data.outbound.voyage}</Link> : '' },
                { label: 'Discharged', value: container.dischargedAt ? formatDateTime(container.dischargedAt) : '' },
                { label: 'Gate in', value: container.gateInAt ? formatDateTime(container.gateInAt) : '' },
                { label: 'Gate out', value: container.gateOutAt ? formatDateTime(container.gateOutAt) : '' },
                { label: 'Loaded', value: container.loadedAt ? formatDateTime(container.loadedAt) : '' },
                { label: 'Delivered', value: container.deliveredAt ? formatDateTime(container.deliveredAt) : '' },
                { label: 'Custody', value: container.status === 'in_yard' ? 'Terminal operator' : container.status === 'on_truck' ? `Haulier${container.haulierId ? `: ${db.parties.find(p => p.id === container.haulierId)?.name}` : ''}` : container.status === 'on_vessel' ? 'Carrier' : container.status === 'delivered' ? 'Consignee' : 'Carrier (on vessel)' },
              ]} />
              {data.storageSoFar && (
                <p className="mt-4 rounded-xl bg-gray-50 px-3.5 py-2.5 !text-[13px] !text-gray-600">
                  Storage running: day {data.storageSoFar.days} since discharge ({data.storageSoFar.freeDays} free day{data.storageSoFar.freeDays === 1 ? '' : 's'}), {formatMoney(data.storageSoFar.amount)} accrued at today&apos;s tariff. {consigneeOutstanding > 0 ? `${formatMoney(consigneeOutstanding)} is unpaid.` : container.chargesSettled ? 'Charges settled.' : ''}
                </p>
              )}
              {data.transfer && <p className="mt-3 !text-[13px] !text-gray-600">On inland transfer <Link href="/admin/transfers" className="font-semibold">{data.transfer.reference}</Link> to {db.locations.find(l => l.id === data.transfer!.toLocationId)?.name} ({data.transfer.status.replace('_', ' ')}).</p>}
              {data.job && <p className="mt-3 !text-[13px] !text-gray-600">Transport job <Link href="/admin/transport" className="font-semibold">{data.job.reference}</Link>, {data.job.status.replace('_', ' ')}{data.job.tractor ? `, tractor ${data.job.tractor}` : ''}.</p>}
            </PanelBody>
          </Panel>

          <Panel delay={0.1}>
            <Tabs tabs={[{ id: 'history', label: 'History' }, { id: 'charges', label: 'Charges' }, { id: 'documents', label: 'Documents' }, { id: 'tokens', label: 'E-tokens' }]} value={tab} onChange={setTab} counts={{ history: data.events.length, charges: data.charges.length, documents: data.documents.length, tokens: data.tokens.length }} />
            {tab === 'history' && (
              <PanelBody>
                <Timeline items={data.events.map(event => ({ id: event.id, title: <><span className="font-semibold">{CONTAINER_EVENT_LABELS[event.type]}</span>{event.note ? ` — ${event.note}` : ''}</>, meta: <><EmployeeName db={db} id={event.by} /> · {formatDateTime(event.at)} UTC{event.locationId ? <> · <LocationName db={db} id={event.locationId} code /></> : null}</>, tone: ['hold_placed', 'token_cancelled'].includes(event.type) ? 'danger' : ['gate_out', 'delivered', 'customs_update', 'hold_released', 'charges_settled'].includes(event.type) ? 'success' : ['shifted', 'reefer_check'].includes(event.type) ? 'neutral' : 'primary' }))} />
              </PanelBody>
            )}
            {tab === 'charges' && (
              data.charges.length === 0 ? <EmptyState title="No charges yet" description="Stevedoring, storage, shifting and e-token fees appear here as they are raised." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[13px]">
                    <thead><tr className="border-b border-gray-100 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="px-4 py-3">Service</th><th className="px-4 py-3">Charged to</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
                    <tbody>
                      {data.charges.map(charge => { const invoice = db.invoices.find(entry => entry.id === charge.invoiceId); return (
                        <tr key={charge.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-3"><p className="!text-[13px] !text-secondary">{charge.description}</p><p className="!text-[12px] !text-gray-400">{SERVICE_LABELS[charge.serviceCode]} · {charge.reference} · {formatDate(charge.createdAt)}</p></td>
                          <td className="px-4 py-3"><PartyName db={db} id={charge.partyId} /></td>
                          <td className="px-4 py-3">{invoice ? <Link href={`/admin/finance/${invoice.id}`} className="font-semibold">{invoice.reference}</Link> : <span className="text-gray-400">Not invoiced</span>}{invoice && <span className="ml-1.5 text-[12px] text-gray-400">{invoice.status.replace('_', ' ')}</span>}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{charge.amount === 0 ? <span className="text-gray-400">waived</span> : formatMoney(charge.amount, charge.currency)}</td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
              )
            )}
            {tab === 'documents' && (
              data.documents.length === 0 ? <EmptyState title="No documents" description="Delivery orders, customs declarations, EIRs and DG declarations filed against this container appear here." action={can.documents && <button type="button" onClick={() => setDialog('upload')} className="btn btn-secondary">Upload document</button>} /> : (
                <ul className="divide-y divide-gray-100">
                  {data.documents.map(document => { const latest = document.versions[document.versions.length - 1]; const allowed = canOpenDocument(document, actor); return (
                    <li key={document.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        {allowed ? <Link href={`/admin/documents?q=${document.reference}`} className="!text-[13px] !font-semibold text-primary">{document.title}</Link> : <p className="!text-[13px] !font-semibold !text-gray-400">{document.type} (restricted)</p>}
                        <p className="truncate !text-[12px] !text-gray-400">{document.type} · {document.reference} · v{latest.version} · {latest.fileName} · {formatDateTime(latest.uploadedAt)} · <EmployeeName db={db} id={latest.uploadedBy} /></p>
                      </div>
                      {document.legallySignificant && <StatusBadge variant="neutral">Legal</StatusBadge>}
                    </li>
                  ); })}
                </ul>
              )
            )}
            {tab === 'tokens' && (
              data.tokens.length === 0 ? <EmptyState title="No e-tokens" description="Truck appointments generated by hauliers appear here." /> : (
                <ul className="divide-y divide-gray-100">
                  {data.tokens.map(token => (
                    <li key={token.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono !text-[13px] !font-semibold !text-secondary">{token.number} <span className="font-sans font-normal text-gray-500">· {TOKEN_TYPE_LABELS[token.type]}</span></p>
                        <p className="!text-[12px] !text-gray-400"><PartyName db={db} id={token.haulierId} /> · {token.truckPlate} · {token.driverName} · slot {formatDateTime(token.slotStart)} to {token.slotEnd.slice(11, 16)} UTC{token.feeAed ? ` · ${formatMoney(token.feeAed)}` : ''}{token.amendments ? ` · ${token.amendments} amendment${token.amendments === 1 ? '' : 's'}` : ''}</p>
                      </div>
                      <TokenStatusBadge status={token.status} />
                    </li>
                  ))}
                </ul>
              )
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-5">
          {isImport && container.status !== 'delivered' && (
            <Panel delay={0.08}>
              <SectionHeader title="Release conditions" description={ready ? 'Ready for pick-up' : `${blockers.length} outstanding`} action={ready ? <StatusBadge variant="success" dot>Ready</StatusBadge> : undefined} />
              <PanelBody className="!pt-1">
                <ul className="divide-y divide-gray-100">
                  <CheckItem done={inYard} label={inYard ? 'In the yard' : container.status === 'expected' ? 'Awaiting discharge' : 'Left the yard'} detail={data.location?.name} />
                  <CheckItem done={container.customsStatus === 'cleared'} label={`Customs: ${container.customsStatus.replace('_', ' ')}`} detail={can.clearance && inYard ? <button type="button" onClick={() => setDialog('customs')} className="font-semibold text-primary hover:text-primary-dark">Update customs status</button> : undefined} />
                  <CheckItem done={holds.length === 0} label={holds.length ? `${holds.length} active hold${holds.length === 1 ? '' : 's'}` : 'No holds'} detail={holds.length ? <ul className="mt-1 space-y-1">{holds.map(hold => <li key={hold.id}>{HOLD_LABELS[hold.type]}: {hold.reason}{can.holds && hold.type !== 'customs' && <> · <button type="button" onClick={() => { clear(); setReleasingHold(hold.id); }} className="font-semibold text-primary hover:text-primary-dark">Release</button></>}{hold.type === 'dg' && <span className="text-gray-400"> (released by filing the DG declaration)</span>}</li>)}</ul> : undefined} />
                  <CheckItem done={doValid} label={container.deliveryOrder ? `Delivery order ${container.deliveryOrder.number}${doValid ? '' : ', expired'}` : 'Delivery order not received'} detail={container.deliveryOrder ? `Valid until ${formatDate(container.deliveryOrder.validUntil)} · ${container.deliveryOrder.issuedBy}` : can.clearance && inYard ? <button type="button" onClick={() => setDialog('do')} className="font-semibold text-primary hover:text-primary-dark">Record delivery order</button> : undefined} />
                  <CheckItem done={container.chargesSettled} label={container.chargesSettled ? 'Charges settled' : consigneeOutstanding > 0 ? `${formatMoney(consigneeOutstanding)} unpaid` : 'Charges not yet collected'} detail={!container.chargesSettled && can.finance && inYard ? <button type="button" onClick={() => setDialog('collect')} className="font-semibold text-primary hover:text-primary-dark">Collect charges online</button> : undefined} />
                </ul>
                {can.holds && inYard && <div className="mt-3"><PanelButton danger onClick={() => setDialog('hold')}>Place hold</PanelButton></div>}
              </PanelBody>
            </Panel>
          )}

          {container.status !== 'delivered' && (
            <Panel delay={0.12}>
              <SectionHeader title="Collection" description={data.token ? `E-token ${data.token.number}` : isImport ? 'Haulier assignment and e-token' : `${TOKEN_TYPE_LABELS[tokenType]} e-token`} />
              <PanelBody>
                {data.token ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3"><TokenStatusBadge status={data.token.status} /><span className="text-[12px] text-gray-500">slot {formatDateTime(data.token.slotStart)} to {data.token.slotEnd.slice(11, 16)} UTC</span></div>
                    <p className="!text-[13px] !text-secondary"><PartyName db={db} id={data.token.haulierId} /> · {data.token.truckPlate} · {data.token.driverName}</p>
                    {can.tokens && data.token.status === 'generated' && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <PanelButton onClick={() => setDialog('amend')}>Amend</PanelButton>
                        <PanelButton danger onClick={() => { clear(); setCancellingToken(true); }}>Cancel e-token</PanelButton>
                      </div>
                    )}
                    {data.token.status === 'at_marshalling_yard' && <p className="!text-[12px] !text-gray-500">The truck has entered the marshalling yard; the token can no longer be deleted. Process it on the <Link href="/admin/gate" className="font-semibold">gate screen</Link>.</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {isImport && (
                      <label className="block">
                        <span className="form-label">Haulier</span>
                        <div className="flex gap-2">
                          <select className={SELECT} value={haulierId ?? container.haulierId ?? ''} disabled={!can.clearance || !ready} onChange={event => setHaulierId(event.target.value)}>
                            <option value="">Not assigned</option>
                            {db.parties.filter(party => party.type === 'haulier' && party.active).map(party => <option key={party.id} value={party.id}>{party.name}</option>)}
                          </select>
                          {can.clearance && ready && <PanelButton disabled={busy || (haulierId ?? container.haulierId ?? '') === (container.haulierId ?? '')} onClick={() => void run(() => ops.assignHaulier(actor, { containerId: container.id, haulierId: haulierId || null }), () => { toast.success('Haulier updated'); setHaulierId(null); })}>Save</PanelButton>}
                        </div>
                        {!ready && isImport && <p className="mt-1 !text-[12px] !text-gray-400">Available once the release conditions are met.</p>}
                      </label>
                    )}
                    {can.tokens && (isImport ? ready : true) && (container.status !== 'on_vessel') && (
                      <PanelButton primary onClick={() => setDialog('token')} disabled={isImport && !container.haulierId}>Generate {TOKEN_TYPE_LABELS[tokenType].toLowerCase()} e-token</PanelButton>
                    )}
                    {isImport && ready && !container.haulierId && <p className="!text-[12px] !text-gray-400">Assign a haulier first. Consignees can also do this on the customer portal.</p>}
                  </div>
                )}
                <div className="mt-3"><ActionError message={error} /></div>
              </PanelBody>
            </Panel>
          )}

          {(inYard || container.status === 'expected') && can.yard && (
            <Panel delay={0.16}>
              <SectionHeader title="Yard and equipment" />
              <PanelBody>
                <div className="flex flex-wrap gap-2">
                  {inYard && <PanelButton onClick={() => setDialog('shift')}>Shift container</PanelButton>}
                  {container.full && <PanelButton onClick={() => setDialog('vgm')}>{container.vgmKg === null ? 'Record VGM' : 'Re-weigh'}</PanelButton>}
                  {container.reefer && inYard && <PanelButton onClick={() => setDialog('reefer')}>Reefer check</PanelButton>}
                  {inYard && isImport && data.location?.type === 'terminal' && <Link href="/admin/transfers" className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-secondary hover:border-primary/30 hover:text-primary sm:text-[13px]">Inland transfer</Link>}
                </div>
                {container.reefer && <p className="mt-3 !text-[12px] !text-gray-500">Reefer setpoint {container.reefer.setpointC} °C, {container.reefer.plugged ? 'plugged in' : <span className="font-semibold text-[#C0352B]">not plugged in</span>}.</p>}
                {container.customsStatus !== 'not_required' && !isImport && <p className="mt-2 !text-[12px] !text-gray-500">Export customs: <CustomsBadge status={container.customsStatus} /></p>}
              </PanelBody>
            </Panel>
          )}
        </div>
      </div>

      {dialog === 'hold' && <HoldDialog container={container} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'customs' && <CustomsDialog container={container} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'do' && <DeliveryOrderDialog container={container} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'collect' && <CollectionDialog container={container} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'token' && <TokenDialog container={container} type={tokenType} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'amend' && data.token && <AmendTokenDialog token={data.token} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'shift' && <ShiftDialog container={container} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'vgm' && <VgmDialog container={container} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'reefer' && <ReeferDialog container={container} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'upload' && <DocumentUploadDialog links={{ containerId: container.id, partyId: container.consigneeId ?? undefined }} defaultType={isImport ? 'Delivery order' : container.dg ? 'Dangerous goods declaration' : 'Other'} onClose={() => setDialog(null)} onDone={document => done(`${document.reference} filed`)} />}
      <ConfirmDialog open={!!releasingHold} busy={busy} error={error} title="Release hold?" description="The hold is lifted and recorded in the container history." confirmLabel="Release" onConfirm={() => void run(() => ops.releaseHold(actor, { containerId: container.id, holdId: releasingHold!, note: '' }), () => { setReleasingHold(null); toast.success('Hold released'); })} onClose={() => setReleasingHold(null)} />
      <ConfirmDialog open={cancellingToken} danger busy={busy} error={error} title="Cancel e-token?" description="The haulier must generate a new token to collect the container. The e-token fee is not refunded." confirmLabel="Cancel e-token" onConfirm={() => void run(() => ops.cancelToken(actor, { tokenId: data.token!.id, reason: 'Cancelled by customer service' }), () => { setCancellingToken(false); toast.success('E-token cancelled'); })} onClose={() => setCancellingToken(false)} />
    </motion.div>
  );
}
