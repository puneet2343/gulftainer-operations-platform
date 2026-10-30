'use client';

/*
 * Dialogs used on the container record and the gate screen: holds, customs,
 * delivery order, online charge collection, e-token generation, yard shift,
 * VGM and reefer checks. Each one calls a single service and reports its error.
 */

import { useMemo, useState } from 'react';
import FormDialog from '@/components/ui/FormDialog';
import { Field } from '@/components/ui/Controls';
import { INPUT, SELECT, TEXTAREA } from '@/components/ui/Table';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops, quoteCollection } from '@/lib/ops/ops';
import { formatMoney, fromLocalInput, toDateInput } from '@/lib/format';
import { newId } from '@/lib/ops/core';
import { HOLD_LABELS, CUSTOMS_LABELS, TOKEN_TYPE_LABELS, SERVICE_LABELS, type Container, type CustomsStatus, type HoldType, type TokenType, type EToken } from '@/lib/ops/types';

type Base = { container: Container; onClose: () => void; onDone: (message: string) => void };

export function HoldDialog({ container, onClose, onDone }: Base) {
  const { actor } = useOps();
  const { run, busy, error } = useAction();
  const [type, setType] = useState<HoldType>('terminal');
  const [reason, setReason] = useState('');
  return (
    <FormDialog open title={`Place hold on ${container.number}`} description="A hold stops release, loading and e-token generation until it is lifted. Any active e-token is cancelled." submitLabel="Place hold" danger busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.placeHold(actor!, { containerId: container.id, type, reason }), () => onDone(`${HOLD_LABELS[type]} placed`))}>
      <Field label="Hold type" id="hold-type"><select id="hold-type" className={SELECT} value={type} onChange={event => setType(event.target.value as HoldType)}>{(Object.keys(HOLD_LABELS) as HoldType[]).filter(entry => entry !== 'customs').map(entry => <option key={entry} value={entry}>{HOLD_LABELS[entry]}</option>)}</select></Field>
      <Field label="Reason" id="hold-reason"><textarea id="hold-reason" className={TEXTAREA} value={reason} onChange={event => setReason(event.target.value)} placeholder="Line instruction: freight unpaid" /></Field>
    </FormDialog>
  );
}

export function CustomsDialog({ container, onClose, onDone }: Base) {
  const { actor } = useOps();
  const { run, busy, error } = useAction();
  const [status, setStatus] = useState<CustomsStatus>(container.customsStatus === 'cleared' ? 'inspection' : 'cleared');
  const [reference, setReference] = useState('');
  return (
    <FormDialog open title={`Customs status for ${container.number}`} description="Normally updated by the customs clearance message. Use this screen for manual declarations and inspections." submitLabel="Update" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.updateCustoms(actor!, { containerId: container.id, status, reference }), () => onDone(`Customs ${CUSTOMS_LABELS[status].toLowerCase()}`))}>
      <Field label="Status" id="customs-status"><select id="customs-status" className={SELECT} value={status} onChange={event => setStatus(event.target.value as CustomsStatus)}>{(Object.keys(CUSTOMS_LABELS) as CustomsStatus[]).filter(entry => entry !== container.customsStatus).map(entry => <option key={entry} value={entry}>{CUSTOMS_LABELS[entry]}</option>)}</select></Field>
      <Field label="Declaration or reference" id="customs-ref"><input id="customs-ref" className={INPUT} value={reference} onChange={event => setReference(event.target.value)} placeholder="SHJ-IMP-90120" /></Field>
      {status === 'inspection' && <p className="!text-[12px] !text-gray-500">Selecting inspection places a customs hold and cancels any active e-token.</p>}
    </FormDialog>
  );
}

export function DeliveryOrderDialog({ container, onClose, onDone }: Base) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [number, setNumber] = useState('');
  const [validUntil, setValidUntil] = useState(() => { const date = new Date(); date.setUTCDate(date.getUTCDate() + 10); return toDateInput(date.toISOString()); });
  const [issuedBy, setIssuedBy] = useState(`${db?.parties.find(party => party.id === container.lineId)?.name ?? 'Line'} agency`);
  const [consigneeId, setConsigneeId] = useState(container.consigneeId ?? '');
  const [agentId, setAgentId] = useState(container.clearingAgentId ?? '');
  return (
    <FormDialog open title={`Delivery order for ${container.number}`} description="The line's release authority. Storage keeps running until the box leaves, so a late delivery order costs the consignee." submitLabel="Record delivery order" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.recordDeliveryOrder(actor!, { containerId: container.id, number, validUntil: validUntil ? `${validUntil}T23:59:59.000Z` : '', issuedBy, consigneeId: consigneeId || undefined, clearingAgentId: agentId || undefined }), () => onDone('Delivery order recorded'))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Delivery order number" id="do-number"><input id="do-number" autoFocus className={INPUT} value={number} onChange={event => setNumber(event.target.value)} placeholder="DO-55210" /></Field>
        <Field label="Valid until" id="do-valid"><input id="do-valid" type="date" className={INPUT} value={validUntil} onChange={event => setValidUntil(event.target.value)} /></Field>
        <Field label="Issued by" id="do-issuer"><input id="do-issuer" className={INPUT} value={issuedBy} onChange={event => setIssuedBy(event.target.value)} /></Field>
        <Field label="Consignee" id="do-consignee"><select id="do-consignee" className={SELECT} value={consigneeId} onChange={event => setConsigneeId(event.target.value)}><option value="">Select</option>{db?.parties.filter(party => party.type === 'consignee').map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
        <Field label="Clearing agent" id="do-agent"><select id="do-agent" className={SELECT} value={agentId} onChange={event => setAgentId(event.target.value)}><option value="">None</option>{db?.parties.filter(party => party.type === 'clearing_agent').map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
      </div>
    </FormDialog>
  );
}

/** Container Cash Collection – Online: quote storage to the expected exit date and pay the consignee's service lines. */
export function CollectionDialog({ container, onClose, onDone, onBehalfOf }: Base & { onBehalfOf?: string }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [expectedExit, setExpectedExit] = useState(() => toDateInput(new Date().toISOString()));
  const [haulierId, setHaulierId] = useState(container.haulierId ?? '');
  const [mode, setMode] = useState<'full' | 'partial' | 'zero'>('full');
  const [partial, setPartial] = useState('');
  const [card, setCard] = useState('');
  const quote = useMemo(() => db && expectedExit ? quoteCollection(db, container.id, `${expectedExit}T23:59:59.000Z`, new Date().toISOString()) : null, [db, container.id, expectedExit]);
  const payable = mode === 'full' ? (quote?.total ?? 0) : mode === 'partial' ? Number(partial) || 0 : 0;
  return (
    <FormDialog open wide title={`Container cash collection: ${container.number}`} description="Online payment is the only accepted mode for cargo collection. Storage is charged per day from discharge to the expected exit date; later exit is charged at the gate." submitLabel={payable > 0 ? `Pay ${formatMoney(payable)}` : 'Issue invoice without payment'} busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.collectContainerCharges(actor!, { containerId: container.id, expectedExit: `${expectedExit}T23:59:59.000Z`, haulierId: haulierId || null, payableAmount: payable, cardReference: card, onBehalfOf }), result => onDone(!result?.invoice ? 'No charges due; container marked settled' : result.invoice.status === 'paid' ? `${result.invoice.reference} paid, container settled` : `${result.invoice.reference} issued, balance outstanding`))}
      footer={quote?.blockersAfterPayment.length ? `Still required after payment: ${quote.blockersAfterPayment.join(', ')}` : 'Payment completes the release conditions'}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Expected exit date" id="exit" hint="Defaults to today; change it for a later collection"><input id="exit" type="date" className={INPUT} value={expectedExit} min={toDateInput(new Date().toISOString())} onChange={event => setExpectedExit(event.target.value)} /></Field>
        <Field label="Haulier" id="col-haulier" hint="Select GNTT-H when the haulier is not yet known"><select id="col-haulier" className={SELECT} value={haulierId} onChange={event => setHaulierId(event.target.value)}><option value="">GNTT-H, general transport</option>{db?.parties.filter(party => party.type === 'haulier' && party.active).map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
      </div>
      {quote && (
        <div className="mb-4 overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-gray-100 bg-gray-50 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="px-3 py-2">Service line</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
            <tbody>
              {quote.openCharges.map(charge => <tr key={charge.id} className="border-b border-gray-100"><td className="px-3 py-2 text-secondary">{charge.description}<span className="block text-[11px] text-gray-400">{charge.reference}</span></td><td className="px-3 py-2 text-right tabular-nums">{formatMoney(charge.amount, charge.currency)}</td></tr>)}
              {quote.storage && <tr className="border-b border-gray-100"><td className="px-3 py-2 text-secondary">{SERVICE_LABELS.STORAGE_IMPORT}<span className="block text-[11px] text-gray-400">{quote.storage.days} day{quote.storage.days === 1 ? '' : 's'} from discharge, {quote.storage.freeDays} free, {quote.storage.chargeableDays} chargeable</span></td><td className="px-3 py-2 text-right tabular-nums">{formatMoney(quote.storage.amount)}</td></tr>}
              <tr className="border-b border-gray-100"><td className="px-3 py-2 text-gray-500">Subtotal</td><td className="px-3 py-2 text-right tabular-nums">{formatMoney(quote.subtotal)}</td></tr>
              <tr className="border-b border-gray-100"><td className="px-3 py-2 text-gray-500">VAT {Math.round((db?.tariff.vatRate ?? 0) * 100)}%</td><td className="px-3 py-2 text-right tabular-nums">{formatMoney(quote.vat)}</td></tr>
              <tr className="bg-gray-50 font-semibold text-secondary"><td className="px-3 py-2">Total payable</td><td className="px-3 py-2 text-right tabular-nums">{formatMoney(quote.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      <fieldset className="form-group">
        <legend className="form-label">Payment</legend>
        <div className="flex flex-wrap gap-2">
          {(['full', 'partial', 'zero'] as const).map(option => <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)} className={`min-h-[34px] rounded-lg border px-3 text-[12px] font-semibold transition-all ${mode === option ? 'border-primary/25 bg-primary/[0.07] text-primary' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>{option === 'full' ? 'Full (default)' : option === 'partial' ? 'Partial' : 'Zero, invoice only'}</button>)}
        </div>
      </fieldset>
      {mode === 'partial' && <Field label="Payable amount" id="partial"><input id="partial" type="number" min={0} step="0.01" className={INPUT} value={partial} onChange={event => setPartial(event.target.value)} /></Field>}
      {payable > 0 && <Field label="Card authorisation reference" id="card" hint="Returned by the secure payment gateway"><input id="card" className={`${INPUT} font-mono`} value={card} onChange={event => setCard(event.target.value)} placeholder="AUTH7731120" /></Field>}
    </FormDialog>
  );
}

export function TokenDialog({ container, type, onClose, onDone, onBehalfOf }: Base & { type: TokenType; onBehalfOf?: string }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const hauliers = (db?.parties ?? []).filter(party => party.type === 'haulier' && party.active);
  const [haulierId, setHaulierId] = useState(container.haulierId ?? hauliers[0]?.id ?? '');
  const [truckPlate, setTruckPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [slot, setSlot] = useState(() => { const date = new Date(Date.now() + 2 * 3600 * 1000); date.setUTCMinutes(0, 0, 0); return date.toISOString().slice(0, 16); });
  const call = type === 'export_dropoff' ? db?.vesselCalls.find(entry => entry.id === container.outboundCallId) : null;
  return (
    <FormDialog open title={`${TOKEN_TYPE_LABELS[type]} e-token for ${container.number}`} description={type === 'import_pickup' ? `Books a two-hour gate slot. The e-token fee of ${formatMoney(db?.tariff.etoken ?? 25)} (incl. VAT) is charged to the haulier; amendments cost ${formatMoney(db?.tariff.etokenAmendment ?? 20)}.` : call ? `The export gate for ${call.vessel} ${call.voyage} is open ${call.gateOpen.slice(0, 16).replace('T', ' ')} to ${call.gateClose.slice(0, 16).replace('T', ' ')} UTC.` : 'Books a two-hour gate slot for the truck.'} submitLabel="Generate e-token" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.generateToken(actor!, { containerId: container.id, type, haulierId, truckPlate, driverName, slotStart: fromLocalInput(slot), onBehalfOf }), token => onDone(`E-token ${token?.number} generated`))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Haulier" id="tk-haulier"><select id="tk-haulier" className={SELECT} value={haulierId} onChange={event => setHaulierId(event.target.value)}>{hauliers.map(party => <option key={party.id} value={party.id}>{party.name}{party.portalRegistered ? '' : ' (not registered)'}</option>)}</select></Field>
        <Field label="Appointment slot (UTC)" id="tk-slot"><input id="tk-slot" type="datetime-local" className={INPUT} value={slot} onChange={event => setSlot(event.target.value)} /></Field>
        <Field label="Truck plate" id="tk-plate"><input id="tk-plate" className={`${INPUT} uppercase`} value={truckPlate} onChange={event => setTruckPlate(event.target.value)} placeholder="SHJ 52300" /></Field>
        <Field label="Driver" id="tk-driver"><input id="tk-driver" className={INPUT} value={driverName} onChange={event => setDriverName(event.target.value)} /></Field>
      </div>
    </FormDialog>
  );
}

export function AmendTokenDialog({ token, onClose, onDone }: { token: EToken; onClose: () => void; onDone: (message: string) => void }) {
  const { actor, db } = useOps();
  const { run, busy, error } = useAction();
  const [truckPlate, setTruckPlate] = useState(token.truckPlate);
  const [driverName, setDriverName] = useState(token.driverName);
  const [slot, setSlot] = useState(token.slotStart.slice(0, 16));
  return (
    <FormDialog open title={`Amend e-token ${token.number}`} description={token.type === 'import_pickup' ? `An amendment fee of ${formatMoney(db?.tariff.etokenAmendment ?? 20)} applies.` : 'Change the truck, driver or slot before the truck reaches the marshalling yard.'} submitLabel="Amend" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.amendToken(actor!, { tokenId: token.id, truckPlate, driverName, slotStart: fromLocalInput(slot) }), () => onDone(`E-token ${token.number} amended`))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Truck plate" id="am-plate"><input id="am-plate" className={`${INPUT} uppercase`} value={truckPlate} onChange={event => setTruckPlate(event.target.value)} /></Field>
        <Field label="Driver" id="am-driver"><input id="am-driver" className={INPUT} value={driverName} onChange={event => setDriverName(event.target.value)} /></Field>
        <Field label="Appointment slot (UTC)" id="am-slot"><input id="am-slot" type="datetime-local" className={INPUT} value={slot} onChange={event => setSlot(event.target.value)} /></Field>
      </div>
    </FormDialog>
  );
}

export function ShiftDialog({ container, onClose, onDone }: Base) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [toPosition, setToPosition] = useState('');
  const [purpose, setPurpose] = useState<'cfs' | 'scan' | 'other' | 'inspection'>('other');
  const [note, setNote] = useState('');
  function submit() {
    const payload = { containerId: container.id, toPosition, purpose, note, idempotencyKey: newId() };
    if (db?.settings.offline) return ops.enqueueOffline(actor!, { kind: 'yard_shift', summary: `${container.number} to ${toPosition.toUpperCase()} (${purpose})`, payload });
    return ops.shiftContainer(actor!, payload);
  }
  return (
    <FormDialog open title={`Shift ${container.number}`} description={`Currently at ${container.yardPosition}. Shifting is charged per the tariff: CFS and scanning moves to the requesting party, housekeeping to the line.`} submitLabel={db?.settings.offline ? 'Queue shift' : 'Record shift'} busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(submit, () => onDone(db?.settings.offline ? 'Shift queued for sync' : 'Yard shift recorded'))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="New position" id="shift-to"><input id="shift-to" autoFocus className={`${INPUT} font-mono uppercase`} value={toPosition} onChange={event => setToPosition(event.target.value)} placeholder="SCAN-02" /></Field>
        <Field label="Purpose" id="shift-purpose"><select id="shift-purpose" className={SELECT} value={purpose} onChange={event => setPurpose(event.target.value as typeof purpose)}><option value="other">Yard housekeeping</option><option value="scan">Customs scanning</option><option value="inspection">Inspection</option><option value="cfs">To CFS for stripping</option></select></Field>
      </div>
      <Field label="Note" id="shift-note"><input id="shift-note" className={INPUT} value={note} onChange={event => setNote(event.target.value)} /></Field>
    </FormDialog>
  );
}

export function VgmDialog({ container, onClose, onDone }: Base) {
  const { actor, db } = useOps();
  const { run, busy, error } = useAction();
  const [vgm, setVgm] = useState(String(container.vgmKg ?? container.grossWeightKg));
  return (
    <FormDialog open title={`Verified gross mass for ${container.number}`} description={`Weighbridge reading in kilograms. Declared gross weight is ${container.grossWeightKg.toLocaleString()} kg; a difference above 5% is flagged as a misdeclaration. The weighbridge charge is ${formatMoney(db?.tariff.vgm ?? 60)}.`} submitLabel="Record VGM" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.recordVgm(actor!, { containerId: container.id, vgmKg: Number(vgm) }), () => onDone('Verified gross mass recorded'))}>
      <Field label="Mass (kg)" id="vgm"><input id="vgm" type="number" min={0} className={INPUT} value={vgm} onChange={event => setVgm(event.target.value)} /></Field>
    </FormDialog>
  );
}

export function ReeferDialog({ container, onClose, onDone }: Base) {
  const { actor } = useOps();
  const { run, busy, error } = useAction();
  const [temperature, setTemperature] = useState(String(container.reefer?.setpointC ?? 0));
  const [plugged, setPlugged] = useState(container.reefer?.plugged ?? true);
  const [note, setNote] = useState('');
  return (
    <FormDialog open title={`Reefer check ${container.number}`} description={`Setpoint ${container.reefer?.setpointC} °C. A deviation above 2 °C or an unplugged unit raises an alert.`} submitLabel="Record check" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.reeferCheck(actor!, { containerId: container.id, temperatureC: Number(temperature), plugged, note }), () => onDone('Reefer check recorded'))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Measured temperature (°C)" id="rf-temp"><input id="rf-temp" type="number" step="0.1" className={INPUT} value={temperature} onChange={event => setTemperature(event.target.value)} /></Field>
        <Field label="Power" id="rf-plug"><select id="rf-plug" className={SELECT} value={plugged ? 'yes' : 'no'} onChange={event => setPlugged(event.target.value === 'yes')}><option value="yes">Plugged in</option><option value="no">Not plugged</option></select></Field>
      </div>
      <Field label="Note" id="rf-note"><input id="rf-note" className={INPUT} value={note} onChange={event => setNote(event.target.value)} /></Field>
    </FormDialog>
  );
}
