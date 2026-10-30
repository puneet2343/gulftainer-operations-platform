'use client';

/*
 * E-token portal, following the Marshall Yard E-Token consignee manual: the
 * consignee dashboard (ready, assigned, unassigned, tokens generated, pending;
 * hazardous, reefer, OOG and on-hold counts), container assignment to hauliers,
 * and the haulier's token generation with a two-hour slot. Online payment of
 * container charges is also here, as it is a release condition.
 */

import { useMemo, useState } from 'react';
import { useNow } from '@/lib/use-now';
import Link from 'next/link';
import { useOpsDB } from '@/lib/ops/store';
import { usePortalParty, setPortalPartyId, portalActor } from '@/lib/ops/portal';
import { ops, releaseBlockers, activeHolds } from '@/lib/ops/ops';
import { errorMessage } from '@/lib/ops/use-ops';
import { formatContainerNumber } from '@/lib/ops/iso6346';
import { formatDateTime, formatMoney, fromLocalInput } from '@/lib/format';
import { CollectionDialog } from '@/components/admin/ContainerDialogs';
import { AdminSessionContext } from '@/components/admin/AdminSessionContext';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { ROLE_PERMISSIONS } from '@/lib/admin-session';
import { TOKEN_TYPE_LABELS, type Container, type OpsDB, type Party, type TokenType } from '@/lib/ops/types';

export default function ETokenPage() {
  const db = useOpsDB();
  const party = usePortalParty(db);
  const portal = db ? portalActor(db) : null;
  // Portal dialogs reuse the admin components; they act as the portal service account.
  const session = portal ? { employeeId: portal.id, username: portal.username, name: portal.name, role: portal.role, permissions: ROLE_PERMISSIONS[portal.role], canCreate: true, canDelete: false, loggedInAt: 0 } : null;

  return (
    <AdminSessionContext.Provider value={session}>
      <ToastProvider>
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-8 md:pt-14">
          <Link href="/" className="text-[13px] font-medium text-primary underline-offset-4 hover:underline">Home</Link>
          <h1 className="mt-4 text-[32px] font-semibold leading-tight tracking-[-0.01em] text-secondary md:text-[44px]">E-token portal</h1>
          <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.6] text-gray-600 md:text-[18px]">Consignees assign hauliers to released containers and settle charges online. Hauliers generate the e-token for a two-hour gate slot before the truck arrives at the marshalling yard. Import pick-up tokens cost AED {db?.tariff.etoken ?? 25} inclusive of VAT.</p>
          {!db ? <p className="mt-8 text-[14px] text-gray-400">Loading…</p> : !party ? <PartyPicker parties={db.parties.filter(p => ['consignee', 'haulier', 'clearing_agent'].includes(p.type) && p.active)} /> : party.type === 'haulier' ? <HaulierView party={party} db={db} /> : <ConsigneeView party={party} db={db} />}
        </main>
      </ToastProvider>
    </AdminSessionContext.Provider>
  );
}

function PartyPicker({ parties }: { parties: Party[] }) {
  const [id, setId] = useState(parties[0]?.id ?? '');
  const chosen = parties.find(p => p.id === id);
  return (
    <section className="mt-8 max-w-[560px] rounded-[22px] bg-gray-50 p-6 md:p-8">
      <h2 className="text-[20px] font-semibold text-secondary md:text-[24px]">Sign in with your portal credentials</h2>
      <p className="mt-2 text-[15px] leading-[1.6] text-gray-600">Credentials are issued to the registered email address after customer registration. In this prototype, choose the organisation you act for.</p>
      <label className="mt-4 block"><span className="mb-1 block text-[13px] font-semibold text-secondary">Organisation</span><select value={id} onChange={e => setId(e.target.value)} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-[15px] text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10">{parties.map(p => <option key={p.id} value={p.id}>{p.name} · {p.type.replace('_', ' ')}{p.portalRegistered ? '' : ' (not registered)'}</option>)}</select></label>
      {chosen && !chosen.portalRegistered && <p className="mt-2 text-[14px] text-[#C0352B]">{chosen.name} is not registered on the customer portal. Complete customer registration or contact your Gulftainer representative.</p>}
      <button type="button" disabled={!chosen?.portalRegistered} onClick={() => setPortalPartyId(id)} className="btn btn-primary mt-5 disabled:opacity-50">Continue</button>
    </section>
  );
}

function Header({ party }: { party: Party }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[15px] text-gray-600">Signed in as <span className="font-semibold text-secondary">{party.name}</span> ({party.type.replace('_', ' ')})</p>
      <button type="button" onClick={() => setPortalPartyId(null)} className="text-[14px] font-medium text-primary underline-offset-4 hover:underline">Switch organisation</button>
    </div>
  );
}

function ConsigneeView({ party, db }: { party: Party; db: OpsDB }) {
  const toast = useToast();
  const now = new Date(useNow()).toISOString();
  const [haulierChoice, setHaulierChoice] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkHaulier, setBulkHaulier] = useState('');
  const [paying, setPaying] = useState<Container | null>(null);
  const [error, setError] = useState('');
  const mine = useMemo(() => db.containers.filter(c => (c.consigneeId === party.id || c.clearingAgentId === party.id) && c.category === 'import' && ['expected', 'in_yard'].includes(c.status)), [db, party.id]);
  const ready = mine.filter(c => releaseBlockers(c, now).length === 0);
  const assigned = ready.filter(c => c.haulierId);
  const unassigned = ready.filter(c => !c.haulierId);
  const tokened = ready.filter(c => c.tokenId);
  const hauliers = db.parties.filter(p => p.type === 'haulier' && p.active && p.portalRegistered);
  const actor = portalActor(db);
  const act = (fn: () => unknown, message: string) => { setError(''); try { fn(); toast.success(message); } catch (caught) { setError(errorMessage(caught)); } };
  const assign = (ids: string[], haulierId: string) => act(() => ids.forEach(id => ops.assignHaulier(actor, { containerId: id, haulierId: haulierId || null, onBehalfOf: party.name })), `${ids.length} container${ids.length === 1 ? '' : 's'} assigned`);
  const tile = (label: string, value: number, tone = 'text-secondary') => <div className="rounded-[18px] border border-gray-200 bg-white p-4"><p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-gray-400">{label}</p><p className={`mt-1 text-[28px] font-semibold tracking-[-0.02em] ${tone}`}>{value}</p></div>;

  return (
    <>
      <Header party={party} />
      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tile('Total containers', ready.length)}{tile('Assigned', assigned.length)}{tile('Unassigned', unassigned.length)}{tile('Tokens generated', tokened.length)}{tile('Pending token', assigned.length - tokened.length)}
      </section>
      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile('Hazardous', mine.filter(c => c.dg).length)}{tile('Reefer', mine.filter(c => c.reefer).length)}{tile('Out of gauge', mine.filter(c => c.oog).length)}{tile('On hold', mine.filter(c => activeHolds(c).length > 0).length, 'text-[#C0352B]')}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-[22px] font-semibold tracking-[-0.02em] text-secondary md:text-[28px]">Container assignment</h2><p className="mt-1 text-[14px] text-gray-500 md:text-[16px]">Containers ready for pick-up. Assign a haulier; the haulier then generates the e-token.</p></div>
          {selected.size > 0 && <div className="flex items-center gap-2"><select value={bulkHaulier} onChange={e => setBulkHaulier(e.target.value)} aria-label="Haulier for selected containers" className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-[14px]"><option value="">Choose haulier</option>{hauliers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select><button type="button" disabled={!bulkHaulier} onClick={() => { assign([...selected], bulkHaulier); setSelected(new Set()); }} className="h-11 rounded-full bg-primary px-5 text-[14px] font-semibold text-white disabled:opacity-50">Assign haulier ({selected.size})</button></div>}
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-[#FDF1EF] px-4 py-2.5 text-[14px] text-[#C0352B]">{error}</p>}
        <div className="mt-4 overflow-hidden rounded-[22px] border border-gray-200 bg-white">
          {ready.length === 0 ? <p className="p-8 text-center text-[15px] text-gray-500">No containers are ready for pick-up. Containers appear here once customs clearance, the delivery order and the charges are complete.</p> : (
            <ul className="divide-y divide-gray-100">
              {ready.map(container => { const token = container.tokenId ? db.tokens.find(t => t.id === container.tokenId) : null; const location = db.locations.find(l => l.id === container.locationId); return (
                <li key={container.id} className="flex flex-wrap items-center gap-3 p-4">
                  {!token && <input type="checkbox" aria-label={`Select ${container.number}`} className="h-4 w-4 rounded border-gray-300 accent-primary" checked={selected.has(container.id)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(container.id)) next.delete(container.id); else next.add(container.id); return next; })} />}
                  <div className="min-w-[200px] flex-1"><p className="font-mono text-[15px] font-semibold text-secondary">{formatContainerNumber(container.number)}</p><p className="text-[12px] text-gray-500">{container.size} ft {container.type}{container.full ? ' full' : ' empty'} · {location?.name} {container.yardPosition} · {container.commodity}</p>{container.deliveryOrder && <p className="text-[12px] text-gray-400">DO {container.deliveryOrder.number}</p>}</div>
                  {token ? <div className="text-right"><p className="text-[13px] font-semibold text-[#1F8F6E]">Token created: Yes</p><p className="text-[12px] text-gray-500">{token.number} · {db.parties.find(p => p.id === token.haulierId)?.name} · {formatDateTime(token.slotStart)} UTC</p>{token.status === 'generated' && <button type="button" onClick={() => act(() => ops.cancelToken(actor, { tokenId: token.id, reason: `Deleted by ${party.name} on the portal` }), 'Token deleted')} className="text-[12px] font-semibold text-[#C0352B]">Delete token</button>}{token.status === 'at_marshalling_yard' && <p className="text-[12px] text-gray-400">Truck already at the marshalling yard</p>}</div> : (
                    <div className="flex items-center gap-2">
                      <select aria-label={`Haulier for ${container.number}`} value={haulierChoice[container.id] ?? container.haulierId ?? ''} onChange={e => setHaulierChoice(c => ({ ...c, [container.id]: e.target.value }))} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-[13px]"><option value="">Unassigned</option>{hauliers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
                      <button type="button" disabled={(haulierChoice[container.id] ?? container.haulierId ?? '') === (container.haulierId ?? '')} onClick={() => assign([container.id], haulierChoice[container.id] ?? '')} className="h-10 rounded-full border border-gray-200 bg-white px-4 text-[13px] font-semibold text-secondary disabled:opacity-40">{container.haulierId ? 'Reassign' : 'Assign'}</button>
                    </div>
                  )}
                </li>
              ); })}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-secondary md:text-[28px]">Containers awaiting clearance or payment</h2>
        <p className="mt-1 text-[14px] text-gray-500 md:text-[16px]">Pay online to settle storage and service charges. Storage keeps accruing until the container leaves the terminal.</p>
        <div className="mt-4 overflow-hidden rounded-[22px] border border-gray-200 bg-white">
          {mine.filter(c => releaseBlockers(c, now).length > 0).length === 0 ? <p className="p-8 text-center text-[15px] text-gray-500">Nothing pending.</p> : (
            <ul className="divide-y divide-gray-100">
              {mine.filter(c => releaseBlockers(c, now).length > 0).map(container => { const blockers = releaseBlockers(container, now); const payable = blockers.includes('Charges not settled') && container.status === 'in_yard'; return (
                <li key={container.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-[200px] flex-1"><p className="font-mono text-[15px] font-semibold text-secondary">{formatContainerNumber(container.number)}</p><p className="text-[12px] text-gray-500">{container.status === 'expected' ? `Expected on ${db.vesselCalls.find(v => v.id === container.inboundCallId)?.vessel}` : `${db.locations.find(l => l.id === container.locationId)?.name} · discharged ${formatDateTime(container.dischargedAt)} UTC`}</p><ul className="mt-1 flex flex-wrap gap-1.5">{blockers.map(b => <li key={b} className="rounded bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-600">{b}</li>)}</ul></div>
                  {payable && <button type="button" onClick={() => setPaying(container)} className="h-10 rounded-full bg-primary px-4 text-[13px] font-semibold text-white">Pay charges online</button>}
                </li>
              ); })}
            </ul>
          )}
        </div>
      </section>
      {paying && <CollectionDialog container={paying} onBehalfOf={party.name} onClose={() => setPaying(null)} onDone={message => { setPaying(null); toast.success(message); }} />}
    </>
  );
}

function HaulierView({ party, db }: { party: Party; db: OpsDB }) {
  const toast = useToast();
  const actor = portalActor(db);
  const nowMs = useNow();
  const now = new Date(nowMs).toISOString();
  const [form, setForm] = useState<Record<string, { plate: string; driver: string; slot: string }>>({});
  const [error, setError] = useState('');
  const assigned = db.containers.filter(c => c.haulierId === party.id && !c.tokenId && c.status === 'in_yard' && releaseBlockers(c, now).length === 0);
  const exports = db.containers.filter(c => c.category === 'export' && c.status === 'expected' && c.outboundCallId && !c.tokenId);
  const tokens = db.tokens.filter(t => t.haulierId === party.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const defaultSlot = () => { const d = new Date(nowMs + 2 * 3600000); d.setUTCMinutes(0, 0, 0); return d.toISOString().slice(0, 16); };
  const generate = (container: Container, type: TokenType) => {
    const f = form[container.id] ?? { plate: '', driver: '', slot: defaultSlot() };
    setError('');
    try { const token = ops.generateToken(actor, { containerId: container.id, type, haulierId: party.id, truckPlate: f.plate, driverName: f.driver, slotStart: fromLocalInput(f.slot || defaultSlot()), onBehalfOf: party.name }); toast.success(`E-token ${token.number} generated`); }
    catch (caught) { setError(errorMessage(caught)); }
  };
  const row = (container: Container, type: TokenType) => { const f = form[container.id] ?? { plate: '', driver: '', slot: defaultSlot() }; const call = db.vesselCalls.find(v => v.id === container.outboundCallId); return (
    <li key={container.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
      <div><p className="font-mono text-[15px] font-semibold text-secondary">{formatContainerNumber(container.number)}</p><p className="text-[12px] text-gray-500">{container.size} ft {container.type} · {TOKEN_TYPE_LABELS[type]} · {type === 'export_dropoff' && call ? `${call.vessel} ${call.voyage}, gate ${formatDateTime(call.gateOpen)} to ${formatDateTime(call.gateClose)} UTC` : `${db.locations.find(l => l.id === container.locationId)?.name} · consignee ${db.parties.find(p => p.id === container.consigneeId)?.name ?? ''}`}</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block"><span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400">Truck plate</span><input value={f.plate} onChange={e => setForm(c => ({ ...c, [container.id]: { ...f, plate: e.target.value } }))} className="h-10 w-32 rounded-xl border border-gray-200 px-3 text-[13px] uppercase" placeholder="SHJ 52300" /></label>
        <label className="block"><span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400">Driver</span><input value={f.driver} onChange={e => setForm(c => ({ ...c, [container.id]: { ...f, driver: e.target.value } }))} className="h-10 w-36 rounded-xl border border-gray-200 px-3 text-[13px]" /></label>
        <label className="block"><span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400">Slot (UTC)</span><input type="datetime-local" value={f.slot} onChange={e => setForm(c => ({ ...c, [container.id]: { ...f, slot: e.target.value } }))} className="h-10 rounded-xl border border-gray-200 px-3 text-[13px]" /></label>
        <button type="button" onClick={() => generate(container, type)} className="h-10 rounded-full bg-primary px-4 text-[13px] font-semibold text-white">Generate e-token{type === 'import_pickup' ? ` · ${formatMoney(db.tariff.etoken)}` : ''}</button>
      </div>
    </li>
  ); };

  return (
    <>
      <Header party={party} />
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#FDF1EF] px-4 py-2.5 text-[14px] text-[#C0352B]">{error}</p>}
      <section className="mt-6">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-secondary md:text-[28px]">Import pick-ups assigned to you</h2>
        <p className="mt-1 text-[14px] text-gray-500 md:text-[16px]">Generate the e-token for a two-hour slot. Fees are charged to your account.</p>
        <div className="mt-4 overflow-hidden rounded-[22px] border border-gray-200 bg-white">{assigned.length === 0 ? <p className="p-8 text-center text-[15px] text-gray-500">No containers assigned to you are waiting for a token.</p> : <ul className="divide-y divide-gray-100">{assigned.map(c => row(c, 'import_pickup'))}</ul>}</div>
      </section>
      <section className="mt-8">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-secondary md:text-[28px]">Export drop-offs</h2>
        <p className="mt-1 text-[14px] text-gray-500 md:text-[16px]">Export bookings awaiting delivery to the terminal. Slots must fall inside the vessel&apos;s gate window.</p>
        <div className="mt-4 overflow-hidden rounded-[22px] border border-gray-200 bg-white">{exports.length === 0 ? <p className="p-8 text-center text-[15px] text-gray-500">No export bookings are waiting.</p> : <ul className="divide-y divide-gray-100">{exports.map(c => row(c, 'export_dropoff'))}</ul>}</div>
      </section>
      <section className="mt-8">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-secondary md:text-[28px]">Your e-tokens</h2>
        <div className="mt-4 overflow-hidden rounded-[22px] border border-gray-200 bg-white">{tokens.length === 0 ? <p className="p-8 text-center text-[15px] text-gray-500">No e-tokens yet.</p> : <ul className="divide-y divide-gray-100">{tokens.slice(0, 20).map(token => { const container = db.containers.find(c => c.id === token.containerId)!; return <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-mono text-[14px] font-semibold text-secondary">{token.number} <span className="font-sans font-normal text-gray-500">· {formatContainerNumber(container.number)}</span></p><p className="text-[12px] text-gray-500">{TOKEN_TYPE_LABELS[token.type]} · {token.truckPlate} · {token.driverName} · {formatDateTime(token.slotStart)} to {token.slotEnd.slice(11, 16)} UTC</p></div><span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${token.status === 'completed' ? 'bg-[rgba(52,189,152,0.10)] text-[#1F8F6E]' : token.status === 'generated' ? 'bg-primary/[0.08] text-primary' : token.status === 'at_marshalling_yard' ? 'bg-[rgba(214,158,46,0.12)] text-[#B7791F]' : 'bg-gray-100 text-gray-500'}`}>{token.status.replace(/_/g, ' ')}</span></li>; })}</ul>}</div>
      </section>
    </>
  );
}
