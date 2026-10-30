'use client';

/*
 * Gate screen for the gate officer: today's e-token appointments at the selected
 * terminal or depot, truck arrival at the marshalling yard, gate-in with
 * equipment interchange, gate-out with seal check, and the EIR register.
 * Works offline: transactions are queued on the device and replayed on sync.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import Tabs from '@/components/ui/Tabs';
import FormDialog from '@/components/ui/FormDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field, StatusBadge } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT } from '@/components/ui/Table';
import { SearchBar } from '@/components/ui/Filters';
import { useToast } from '@/components/ui/Toast';
import { TokenStatusBadge, ContainerLink, ContainerFlags, PartyName, EmployeeName, PanelButton, PanelBody, ActionError } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops, releaseBlockers } from '@/lib/ops/ops';
import { newId, canAccessLocation } from '@/lib/ops/core';
import { normaliseContainerNumber } from '@/lib/ops/iso6346';
import { formatDateTime, formatTime, relativeTime } from '@/lib/format';
import { TOKEN_TYPE_LABELS, type EToken, type Container } from '@/lib/ops/types';

type Tab = 'appointments' | 'transactions' | 'tokens';

export default function GatePage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error, clear } = useAction();
  const [tab, setTab] = useState<Tab>('appointments');
  const [locationId, setLocationId] = useState('');
  const [query, setQuery] = useState('');
  const [processing, setProcessing] = useState<EToken | null>(null);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const locations = useMemo(() => (db?.locations ?? []).filter(location => location.type !== 'warehouse' && actor && canAccessLocation(actor, location.id)), [db, actor]);
  const selected = locationId || locations[0]?.id || '';

  const data = useMemo(() => {
    if (!db) return null;
    const tokens = db.tokens.filter(token => token.locationId === selected).sort((a, b) => a.slotStart.localeCompare(b.slotStart));
    const q = normaliseContainerNumber(query);
    const matches = (token: EToken) => {
      if (!q) return true;
      const container = db.containers.find(entry => entry.id === token.containerId);
      return token.number.toUpperCase().includes(q) || token.truckPlate.replace(/\s/g, '').includes(q) || (container?.number ?? '').includes(q);
    };
    const appointments = tokens.filter(token => ['generated', 'at_marshalling_yard'].includes(token.status) && matches(token));
    const transactions = db.gateTransactions.filter(entry => entry.locationId === selected).sort((a, b) => b.at.localeCompare(a.at));
    const todayTokens = tokens.filter(token => token.slotStart.slice(0, 10) === today);
    return { tokens: tokens.filter(matches), appointments, transactions, todayTokens, outToday: transactions.filter(entry => entry.direction === 'out' && entry.at.slice(0, 10) === today).length, inToday: transactions.filter(entry => entry.direction === 'in' && entry.at.slice(0, 10) === today).length, atYard: tokens.filter(token => token.status === 'at_marshalling_yard').length };
  }, [db, selected, query, today]);

  if (!db || !actor || !data) return <PageSkeleton />;
  const canGate = ['gate_officer', 'terminal_ops', 'system_admin'].includes(actor.role);
  const offline = db.settings.offline;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow="Terminal"
        title="Gate and e-tokens"
        subtitle="Trucks arrive on an e-token appointment, check in at the marshalling yard and are processed at the gate with an equipment interchange. Deliveries between 22:00 and 06:00 carry the overtime charge."
        action={
          <div className="flex flex-wrap gap-2">
            <select aria-label="Gate location" className={`${SELECT} !h-10 !w-auto`} value={selected} onChange={event => setLocationId(event.target.value)}>{locations.map(location => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select>
            {canGate && <ToolbarButton variant={offline ? 'primary' : 'secondary'} onClick={() => ops.setOffline(!offline)}>{offline ? 'Reconnect' : 'Work offline'}</ToolbarButton>}
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<GateIcon />} label="Appointments today" value={data.todayTokens.length} description={`${data.todayTokens.filter(token => token.status === 'generated').length} still to arrive`} />
        <StatCard icon={<GateIcon />} label="At marshalling yard" value={data.atYard} description="waiting for the gate" />
        <StatCard icon={<GateIcon />} label="Gated out today" value={data.outToday} description="import pick-ups and empties" />
        <StatCard icon={<GateIcon />} label="Gated in today" value={data.inToday} description="export drop-offs and returns" />
      </section>

      <Panel delay={0.08}>
        <div className="border-b border-gray-100 p-3 sm:p-4">
          <SearchBar value={query} onChange={setQuery} placeholder="Scan or type an e-token number, container number or truck plate" label="Find e-token" />
        </div>
        <Tabs tabs={[{ id: 'appointments', label: 'Open appointments' }, { id: 'transactions', label: 'Gate transactions' }, { id: 'tokens', label: 'All e-tokens' }]} value={tab} onChange={setTab} counts={{ appointments: data.appointments.length, transactions: data.transactions.length, tokens: data.tokens.length }} />
        {tab === 'appointments' && (
          data.appointments.length === 0 ? <EmptyState title="No open appointments" description={query ? 'No e-token matches that search at this location.' : 'E-tokens generated by hauliers for this location appear here with their time slot.'} /> : (
            <>
              <TableWrap minWidth={980}>
                <THead><Th>E-token</Th><Th>Container</Th><Th>Haulier and truck</Th><Th>Slot</Th><Th>Readiness</Th><Th>Status</Th><Th align="right">Action</Th></THead>
                <tbody>
                  {data.appointments.map(token => <AppointmentRow key={token.id} token={token} db={db} canGate={canGate} busy={busy} onArrive={() => void run(() => ops.marshallingYardArrival(actor, { tokenId: token.id }), () => toast.success(`${token.truckPlate} checked in at the marshalling yard`))} onProcess={() => { clear(); setProcessing(token); }} />)}
                </tbody>
              </TableWrap>
              <CardList>
                {data.appointments.map(token => { const container = db.containers.find(entry => entry.id === token.containerId)!; return (
                  <Card key={token.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="font-mono !text-[13px] !font-semibold !text-secondary">{token.number}</p><ContainerLink container={container} /><p className="!text-[12px] !text-gray-400">{TOKEN_TYPE_LABELS[token.type]} · {token.truckPlate} · <PartyName db={db} id={token.haulierId} /></p></div>
                      <TokenStatusBadge status={token.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                      <span className="text-[12px] text-gray-500">{formatTime(token.slotStart)} to {formatTime(token.slotEnd)} UTC</span>
                      {canGate && (token.status === 'generated' ? <PanelButton onClick={() => void run(() => ops.marshallingYardArrival(actor, { tokenId: token.id }), () => toast.success('Checked in'))}>Truck arrived</PanelButton> : <PanelButton primary onClick={() => { clear(); setProcessing(token); }}>{['import_pickup', 'empty_release'].includes(token.type) ? 'Gate out' : 'Gate in'}</PanelButton>)}
                    </div>
                  </Card>
                ); })}
              </CardList>
            </>
          )
        )}
        {tab === 'transactions' && (
          data.transactions.length === 0 ? <EmptyState title="No gate transactions" description="Every gate-in and gate-out is recorded here with its equipment interchange details." /> : (
            <>
              <TableWrap minWidth={980}>
                <THead><Th>Reference</Th><Th>Direction</Th><Th>Container</Th><Th>Truck</Th><Th>Haulier</Th><Th>Interchange</Th><Th>Time</Th><Th>Operator</Th></THead>
                <tbody>
                  {data.transactions.slice(0, 60).map(entry => { const container = db.containers.find(c => c.id === entry.containerId)!; return (
                    <Tr key={entry.id}>
                      <Td><span className="font-mono text-[13px] font-semibold text-secondary">{entry.reference}</span>{entry.syncedFromClientId && <p className="!text-[11px] !text-gray-400">synced from device</p>}</Td>
                      <Td><StatusBadge variant={entry.direction === 'out' ? 'success' : 'info'}>{entry.direction === 'out' ? 'Gate out' : 'Gate in'}</StatusBadge></Td>
                      <Td><ContainerLink container={container} /></Td>
                      <Td className="font-mono">{entry.truckPlate}</Td>
                      <Td><PartyName db={db} id={entry.haulierId} /></Td>
                      <Td>{entry.sealVerified ? 'Seal verified' : 'No seal check'}{entry.damageRemarks && <p className="!text-[12px] !text-[#B7791F]">{entry.damageRemarks}</p>}{entry.overtime && <p className="!text-[12px] !text-gray-400">Overtime window</p>}</Td>
                      <Td className="tabular-nums">{formatDateTime(entry.at)}</Td>
                      <Td><EmployeeName db={db} id={entry.operatorId} /></Td>
                    </Tr>
                  ); })}
                </tbody>
              </TableWrap>
              <CardList>
                {data.transactions.slice(0, 30).map(entry => { const container = db.containers.find(c => c.id === entry.containerId)!; return (
                  <Card key={entry.id}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><ContainerLink container={container} /><p className="!text-[12px] !text-gray-400">{entry.reference} · {entry.truckPlate} · <PartyName db={db} id={entry.haulierId} /></p></div><StatusBadge variant={entry.direction === 'out' ? 'success' : 'info'}>{entry.direction === 'out' ? 'Out' : 'In'}</StatusBadge></div>
                    <p className="mt-2 !text-[12px] !text-gray-500">{formatDateTime(entry.at)} · {entry.sealVerified ? 'seal verified' : 'no seal check'}{entry.damageRemarks ? ` · ${entry.damageRemarks}` : ''}</p>
                  </Card>
                ); })}
              </CardList>
            </>
          )
        )}
        {tab === 'tokens' && (
          data.tokens.length === 0 ? <EmptyState title="No e-tokens" description="Hauliers generate e-tokens on the customer portal; customer service can generate them from a container record." /> : (
            <>
              <TableWrap minWidth={900}>
                <THead><Th>E-token</Th><Th>Type</Th><Th>Container</Th><Th>Haulier and truck</Th><Th>Slot</Th><Th>Status</Th><Th>Updated</Th></THead>
                <tbody>
                  {[...data.tokens].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 80).map(token => { const container = db.containers.find(entry => entry.id === token.containerId)!; return (
                    <Tr key={token.id}>
                      <Td><span className="font-mono text-[13px] font-semibold text-secondary">{token.number}</span></Td>
                      <Td>{TOKEN_TYPE_LABELS[token.type]}</Td>
                      <Td><ContainerLink container={container} /></Td>
                      <Td><PartyName db={db} id={token.haulierId} /><p className="font-mono !text-[12px] !text-gray-400">{token.truckPlate} · {token.driverName}</p></Td>
                      <Td className="tabular-nums">{formatDateTime(token.slotStart)}</Td>
                      <Td><TokenStatusBadge status={token.status} /></Td>
                      <Td className="text-gray-400">{relativeTime(token.updatedAt)}</Td>
                    </Tr>
                  ); })}
                </tbody>
              </TableWrap>
              <CardList>
                {[...data.tokens].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30).map(token => { const container = db.containers.find(entry => entry.id === token.containerId)!; return (
                  <Card key={token.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono !text-[13px] !font-semibold !text-secondary">{token.number}</p><ContainerLink container={container} /><p className="!text-[12px] !text-gray-400">{TOKEN_TYPE_LABELS[token.type]} · {token.truckPlate} · {formatDateTime(token.slotStart)}</p></div><TokenStatusBadge status={token.status} /></div></Card>
                ); })}
              </CardList>
            </>
          )
        )}
        {error && <div className="px-4 pb-4"><ActionError message={error} /></div>}
      </Panel>

      <Panel delay={0.14}>
        <SectionHeader title="How the gate works" description="Reference for new gate staff" />
        <PanelBody>
          <ol className="grid gap-3 text-[13px] text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
            <li className="rounded-xl bg-gray-50 p-3.5"><span className="block font-semibold text-secondary">1. E-token</span>The consignee assigns a haulier on the portal; the haulier generates an e-token for a two-hour slot. Import pick-ups carry the e-token fee.</li>
            <li className="rounded-xl bg-gray-50 p-3.5"><span className="block font-semibold text-secondary">2. Marshalling yard</span>The truck checks in against its token. Tokens cannot be deleted after this point; late trucks get an expired token and must rebook.</li>
            <li className="rounded-xl bg-gray-50 p-3.5"><span className="block font-semibold text-secondary">3. Gate</span>Release conditions are re-checked (customs, holds, delivery order, charges). Seal and condition are recorded on the EIR.</li>
            <li className="rounded-xl bg-gray-50 p-3.5"><span className="block font-semibold text-secondary">4. Out or in</span>Storage to the actual exit is settled on gate-out; export drop-offs are received only inside the vessel&apos;s gate window and need a VGM.</li>
          </ol>
          <p className="mt-3 !text-[12px] !text-gray-400">Offline mode queues gate transactions on this device with a client-generated reference; they replay through the same checks on sync, so nothing is accepted twice. See <Link href="/admin/sync" className="font-semibold text-primary">Sync and integrations</Link>.</p>
        </PanelBody>
      </Panel>

      {processing && <GateDialog token={processing} onClose={() => setProcessing(null)} onDone={message => { setProcessing(null); toast.success(message); }} />}
    </motion.div>
  );
}

function AppointmentRow({ token, db, canGate, busy, onArrive, onProcess }: { token: EToken; db: NonNullable<ReturnType<typeof useOps>['db']>; canGate: boolean; busy: boolean; onArrive: () => void; onProcess: () => void }) {
  const container = db.containers.find(entry => entry.id === token.containerId)!;
  const isOut = ['import_pickup', 'empty_release'].includes(token.type);
  const blockers = token.type === 'import_pickup' ? releaseBlockers(container, new Date().toISOString()) : [];
  const late = new Date(token.slotEnd) < new Date();
  return (
    <Tr>
      <Td><span className="font-mono text-[13px] font-semibold text-secondary">{token.number}</span><p className="!text-[12px] !text-gray-400">{TOKEN_TYPE_LABELS[token.type]}</p></Td>
      <Td><ContainerLink container={container} /><div className="mt-1"><ContainerFlags container={container} /></div></Td>
      <Td><PartyName db={db} id={token.haulierId} /><p className="font-mono !text-[12px] !text-gray-400">{token.truckPlate} · {token.driverName}</p></Td>
      <Td className="tabular-nums">{formatTime(token.slotStart)} to {formatTime(token.slotEnd)}<p className={`!text-[12px] ${late ? '!font-semibold !text-[#C0352B]' : '!text-gray-400'}`}>{late ? 'Slot passed' : token.slotStart.slice(0, 10) === new Date().toISOString().slice(0, 10) ? 'Today' : token.slotStart.slice(0, 10)}</p></Td>
      <Td>{blockers.length ? <span className="text-[12px] text-[#C0352B]">{blockers.join('; ')}</span> : <span className="text-[12px] text-[#1F8F6E]">{isOut ? 'Cleared for release' : 'Ready to receive'}</span>}</Td>
      <Td><TokenStatusBadge status={token.status} /></Td>
      <Td align="right">
        {canGate && (token.status === 'generated'
          ? <div className="flex justify-end gap-1.5"><PanelButton disabled={busy} onClick={onArrive}>Truck arrived</PanelButton><PanelButton disabled={busy} onClick={onProcess}>{isOut ? 'Gate out' : 'Gate in'}</PanelButton></div>
          : <PanelButton primary disabled={busy} onClick={onProcess}>{isOut ? 'Gate out' : 'Gate in'}</PanelButton>)}
      </Td>
    </Tr>
  );
}

function GateDialog({ token, onClose, onDone }: { token: EToken; onClose: () => void; onDone: (message: string) => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const container = db?.containers.find(entry => entry.id === token.containerId) as Container;
  const isOut = ['import_pickup', 'empty_release'].includes(token.type);
  const [truckPlate, setTruckPlate] = useState(token.truckPlate);
  const [sealVerified, setSealVerified] = useState(!!container?.full);
  const [damageRemarks, setDamageRemarks] = useState('');
  const [yardPosition, setYardPosition] = useState('');
  const [vgm, setVgm] = useState('');
  const offline = !!db?.settings.offline;
  const blockers = token.type === 'import_pickup' && container ? releaseBlockers(container, new Date().toISOString()) : [];

  function submit() {
    const key = newId();
    if (isOut) {
      const payload = { tokenId: token.id, truckPlate, sealVerified, damageRemarks, idempotencyKey: key };
      if (offline) return ops.enqueueOffline(actor!, { kind: 'gate_out', summary: `Gate out ${container.number} on ${token.number}, truck ${truckPlate}`, payload });
      return ops.gateOut(actor!, payload);
    }
    const payload = { tokenId: token.id, truckPlate, yardPosition, sealVerified, damageRemarks, vgmKg: vgm ? Number(vgm) : null, idempotencyKey: key };
    if (offline) return ops.enqueueOffline(actor!, { kind: 'gate_in', summary: `Gate in ${container.number} on ${token.number} to ${yardPosition.toUpperCase()}`, payload });
    return ops.gateIn(actor!, payload);
  }

  return (
    <FormDialog open title={`${isOut ? 'Gate out' : 'Gate in'}: ${container?.number}`} description={`${TOKEN_TYPE_LABELS[token.type]} on e-token ${token.number}, ${db?.parties.find(party => party.id === token.haulierId)?.name}. ${offline ? 'This device is offline: the transaction is queued and replayed on sync.' : 'Record the equipment interchange and confirm.'}`} submitLabel={offline ? 'Queue transaction' : isOut ? 'Confirm gate out' : 'Confirm gate in'} busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(submit, () => onDone(offline ? 'Queued for sync' : isOut ? `${container.number} gated out` : `${container.number} received in the yard`))}
      footer={blockers.length ? <span className="text-[#C0352B]">Blocked: {blockers.join('; ')}</span> : undefined}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Truck plate" id="gate-plate"><input id="gate-plate" className={`${INPUT} uppercase`} value={truckPlate} onChange={event => setTruckPlate(event.target.value)} /></Field>
        {!isOut && <Field label="Yard position" id="gate-position"><input id="gate-position" autoFocus className={`${INPUT} font-mono uppercase`} value={yardPosition} onChange={event => setYardPosition(event.target.value)} placeholder="E04-03-1" /></Field>}
        {!isOut && token.type === 'export_dropoff' && <Field label="Weighbridge VGM (kg)" id="gate-vgm" hint="Leave empty if weighed elsewhere"><input id="gate-vgm" type="number" min={0} className={INPUT} value={vgm} onChange={event => setVgm(event.target.value)} /></Field>}
      </div>
      <label className="mb-4 inline-flex items-center gap-2 text-[13px] text-secondary"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={sealVerified} onChange={event => setSealVerified(event.target.checked)} />Seal {container?.sealNumber ? container.sealNumber : ''} checked and intact</label>
      <Field label="Condition remarks (EIR)" id="gate-remarks"><input id="gate-remarks" className={INPUT} value={damageRemarks} onChange={event => setDamageRemarks(event.target.value)} placeholder="No damage observed" /></Field>
    </FormDialog>
  );
}

function GateIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 21V5a1 1 0 011-1h3v17M16 21V4h3a1 1 0 011 1v16M8 9h8M8 13h8M8 17h8" /></svg>;
}
