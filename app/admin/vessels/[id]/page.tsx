'use client';

/*
 * One vessel call: status actions in the order the terminal works them
 * (berth → start operations → complete → depart), the carrier's pre-arrival
 * documents and notices, the discharge and load worklists, documents and history.
 */

import { use, useMemo, useState } from 'react';
import { useNow } from '@/lib/use-now';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader from '@/components/ui/PageHeader';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import Tabs from '@/components/ui/Tabs';
import { KeyValueList, Progress, CheckItem } from '@/components/ui/KeyValue';
import Timeline from '@/components/ui/Timeline';
import FormDialog from '@/components/ui/FormDialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { VesselStatusBadge, ContainerLink, ContainerFlags, PartyName, PanelButton, PanelBody, ActionError, ContainerStatusBadge } from '@/components/admin/Shared';
import DocumentUploadDialog from '@/components/admin/DocumentUploadDialog';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops, activeHolds } from '@/lib/ops/ops';
import { formatDateTime, formatDate, formatTime, relativeTime } from '@/lib/format';
import { CONTAINER_CATEGORY_LABELS, type Container, type VesselCall } from '@/lib/ops/types';
import { newId } from '@/lib/ops/core';

type Tab = 'discharge' | 'load' | 'documents' | 'history';

export default function VesselCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error, clear } = useAction();
  const [tab, setTab] = useState<Tab>('discharge');
  const [discharging, setDischarging] = useState<Container | null>(null);
  const [confirm, setConfirm] = useState<'berth' | 'start' | 'complete' | 'depart' | null>(null);
  const [uploading, setUploading] = useState(false);
  const nowMs = useNow();

  const call = db?.vesselCalls.find(entry => entry.id === id);
  const data = useMemo(() => {
    if (!db || !call) return null;
    const dischargeList = db.containers.filter(container => container.inboundCallId === call.id);
    const loadList = db.containers.filter(container => container.outboundCallId === call.id);
    const documents = db.documents.filter(document => document.vesselCallId === call.id);
    const history = db.audit.filter(entry => entry.entityId === call.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const terminal = db.locations.find(location => location.id === call.terminalId);
    return { dischargeList, loadList, documents, history, terminal };
  }, [db, call]);

  if (!db || !actor) return <PageSkeleton />;
  if (!call || !data) return <EmptyState title="Vessel call not found" description="It may have been removed in another session." action={<Link href="/admin/vessels" className="btn btn-secondary">Back to vessel calls</Link>} />;

  const canOperate = ['planner', 'terminal_ops', 'system_admin'].includes(actor.role);
  const canDocs = ['planner', 'terminal_ops', 'customer_service', 'system_admin'].includes(actor.role);
  const total = call.plannedDischarge + call.plannedLoad;
  const windowOpen = new Date() >= new Date(call.gateOpen) && new Date() <= new Date(call.gateClose) && call.status === 'expected';
  const hasDg = [...data.dischargeList, ...data.loadList].some(container => container.dg);

  async function action(kind: NonNullable<typeof confirm>) {
    const c = call!;
    const result = await run(() => {
      if (kind === 'berth') return ops.berthVessel(actor!, { callId: c.id, expectedVersion: c.version });
      if (kind === 'start') return ops.startVesselOperations(actor!, { callId: c.id, expectedVersion: c.version });
      if (kind === 'complete') return ops.completeVesselOperations(actor!, { callId: c.id, expectedVersion: c.version });
      return ops.departVessel(actor!, { callId: c.id, expectedVersion: c.version });
    });
    if (result) { setConfirm(null); toast.success({ berth: 'Vessel recorded on berth', start: 'Operations started', complete: 'Operations completed', depart: 'Departure recorded' }[kind]); }
  }

  const nextAction = call.status === 'expected' ? { kind: 'berth' as const, label: 'Record on berth' } : call.status === 'berthed' ? { kind: 'start' as const, label: 'Start operations' } : call.status === 'working' ? { kind: 'complete' as const, label: 'Complete operations' } : call.status === 'completed' ? { kind: 'depart' as const, label: 'Record departure' } : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow={<Link href="/admin/vessels" className="hover:text-primary">Vessel calls</Link>}
        title={`${call.vessel} · ${call.voyage}`}
        subtitle={`${data.terminal?.name}, berth ${call.berth}. ${call.service || 'Service not set'}. Operated for ${db.parties.find(party => party.id === call.lineId)?.name}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <VesselStatusBadge status={call.status} />
            {canOperate && nextAction && <PanelButton primary onClick={() => { clear(); setConfirm(nextAction.kind); }}>{nextAction.label}</PanelButton>}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SectionHeader title="Call details" description={`Version ${call.version} · updated ${relativeTime(call.updatedAt)}`} />
          <PanelBody>
            <KeyValueList columns={4} items={[
              { label: 'ETA', value: formatDateTime(call.eta) },
              { label: 'ETB', value: formatDateTime(call.etb) },
              { label: 'ETD', value: formatDateTime(call.etd) },
              { label: 'Cranes', value: `${call.cranesAllocated} allocated` },
              { label: 'Arrived', value: call.ata ? formatDateTime(call.ata) : '' },
              { label: 'Alongside', value: call.atb ? formatDateTime(call.atb) : '' },
              { label: 'Operations completed', value: call.opsCompletedAt ? formatDateTime(call.opsCompletedAt) : '' },
              { label: 'Departed', value: call.atd ? formatDateTime(call.atd) : '' },
              { label: 'Export gate window', value: <>{formatDate(call.gateOpen)} {formatTime(call.gateOpen)} to {formatDate(call.gateClose)} {formatTime(call.gateClose)} UTC <span className={`ml-1 text-[12px] font-semibold ${windowOpen ? 'text-[#1F8F6E]' : 'text-gray-400'}`}>{windowOpen ? 'open now' : 'closed'}</span></>, span: true },
            ]} />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Progress value={call.discharged} max={call.plannedDischarge} label={`Discharged ${call.discharged} of ${call.plannedDischarge}`} tone="success" />
              <Progress value={call.loaded} max={call.plannedLoad} label={`Loaded ${call.loaded} of ${call.plannedLoad}`} tone="primary" />
            </div>
            {call.status === 'working' && call.atb && (
              <p className="mt-3 !text-[12px] !text-gray-500">Gross moves per hour so far: <span className="font-semibold text-secondary">{(((call.discharged + call.loaded) / Math.max(0.25, (nowMs - new Date(call.atb).getTime()) / 3600000))).toFixed(1)}</span> against the terminal benchmark of 29.</p>
            )}
            {total > 0 && call.status === 'completed' && <p className="mt-3 !text-[12px] !text-gray-500">Import containers not collected within {db.tariff.uncollectedTransferDays} days of completion are transferred to an inland depot for the account of the cargo interests.</p>}
          </PanelBody>
        </Panel>

        <Panel delay={0.1}>
          <SectionHeader title="Pre-arrival" description="Due 48 hours before arrival (tariff clause 8)" />
          <PanelBody className="!pt-2">
            <ul className="divide-y divide-gray-100">
              {([['bayPlan', 'Bay plan / stowage plan'], ['dischargeList', 'Discharge list'], ['loadList', 'Load list'], ['dgList', `Dangerous cargo list${hasDg ? '' : ' (not required)'}`], ['baplie', 'BAPLIE by EDI']] as [keyof VesselCall['preArrival'], string][]).map(([key, label]) => (
                <CheckItem key={key} done={call.preArrival[key]} label={label} detail={!call.preArrival[key] && canDocs && call.status !== 'departed' ? <button type="button" onClick={() => void run(() => ops.recordPreArrival(actor, { callId: call.id, doc: key }), () => toast.success(`${label} recorded`))} className="font-semibold text-primary hover:text-primary-dark">Mark received</button> : undefined} />
              ))}
            </ul>
            <p className="mt-3 mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-400">Arrival notices</p>
            <div className="flex flex-wrap gap-2">
              {([['h72', '72 h'], ['h48', '48 h'], ['h24', '24 h']] as [keyof VesselCall['notices'], string][]).map(([key, label]) => (
                <button key={key} type="button" disabled={call.notices[key] || !canDocs} aria-pressed={call.notices[key]} onClick={() => void run(() => ops.recordPreArrival(actor, { callId: call.id, notice: key }), () => toast.success(`${label} notice recorded`))} className={`min-h-[34px] rounded-lg border px-3 text-[12px] font-semibold transition-all disabled:cursor-default ${call.notices[key] ? 'border-[#1F8F6E]/30 bg-[rgba(52,189,152,0.10)] text-[#1F8F6E]' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-secondary'}`}>{label} {call.notices[key] ? 'received' : 'pending'}</button>
              ))}
            </div>
            <div className="mt-3"><ActionError message={error} /></div>
          </PanelBody>
        </Panel>
      </div>

      <Panel delay={0.15}>
        <Tabs tabs={[{ id: 'discharge', label: 'Discharge list' }, { id: 'load', label: 'Load list' }, { id: 'documents', label: 'Documents' }, { id: 'history', label: 'History' }]} value={tab} onChange={setTab} counts={{ discharge: data.dischargeList.length, load: data.loadList.length, documents: data.documents.length, history: data.history.length }} />
        {tab === 'discharge' && (
          <Worklist db={db} containers={data.dischargeList} empty="No containers on the discharge list. Containers are added from the BAPLIE or by registering them against this call." mode="discharge" call={call} canOperate={canOperate} onDischarge={container => { clear(); setDischarging(container); }} />
        )}
        {tab === 'load' && (
          <Worklist db={db} containers={data.loadList} empty="No export or transhipment containers booked on this call." mode="load" call={call} canOperate={canOperate} onLoad={container => void run(() => ops.loadContainer(actor, { callId: call.id, containerId: container.id, idempotencyKey: newId() }), () => toast.success(`${container.number} loaded`))} />
        )}
        {tab === 'load' && error && <div className="px-4 pb-4"><ActionError message={error} /></div>}
        {tab === 'documents' && (
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="!text-[13px] !text-gray-500">Bay plans, BAPLIE files and DG declarations filed against this call.</p>
              {canDocs && <PanelButton onClick={() => setUploading(true)}>Upload document</PanelButton>}
            </div>
            {data.documents.length === 0 ? <EmptyState title="No documents" description="Upload the carrier's pre-arrival documents here." /> : (
              <ul className="divide-y divide-gray-100">
                {data.documents.map(document => { const latest = document.versions[document.versions.length - 1]; return (
                  <li key={document.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/documents?q=${document.reference}`} className="!text-[13px] !font-semibold text-primary">{document.title}</Link>
                      <p className="truncate !text-[12px] !text-gray-400">{document.type} · {document.reference} · v{latest.version} · {latest.fileName} · {formatDateTime(latest.uploadedAt)}</p>
                    </div>
                    <span className="hidden font-mono text-[11px] text-gray-400 sm:block" title="SHA-256">{latest.checksum.slice(0, 12)}…</span>
                  </li>
                ); })}
              </ul>
            )}
          </div>
        )}
        {tab === 'history' && (
          <PanelBody>
            <Timeline items={data.history.map(entry => ({ id: entry.id, title: <>{entry.action.replace(/[._]/g, ' ')}{entry.reason ? ` — ${entry.reason}` : ''}{entry.after?.status ? ` (${String(entry.after.status)})` : ''}</>, meta: `${entry.actorName} · ${formatDateTime(entry.timestamp)} UTC` }))} />
          </PanelBody>
        )}
      </Panel>

      {discharging && (
        <DischargeDialog container={discharging} busy={busy} error={error} onClose={() => setDischarging(null)} onSubmit={position => void run(() => ops.dischargeContainer(actor, { callId: call.id, containerId: discharging.id, yardPosition: position, idempotencyKey: newId() }), () => { toast.success(`${discharging.number} discharged`); setDischarging(null); })} />
      )}
      {uploading && <DocumentUploadDialog links={{ vesselCallId: call.id }} defaultType="Bay plan" onClose={() => setUploading(false)} onDone={document => { setUploading(false); toast.success(`${document.reference} filed`); }} />}
      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        error={error}
        title={{ berth: 'Record vessel on berth?', start: 'Start operations?', complete: 'Complete operations?', depart: 'Record departure?', '': '' }[confirm ?? '']}
        description={{
          berth: <>Confirms {call.vessel} is alongside berth {call.berth}. The export gate closes for this voyage.</>,
          start: <>Requires the bay plan, discharge and load lists{hasDg ? ' and the dangerous cargo list' : ''}. Discharge and load tasks are created for the shift.</>,
          complete: <>Every container on the discharge list must be off the vessel. The three-day collection window starts now.</>,
          depart: <>Loaded export and transhipment containers are closed as sailed.</>,
          '': null,
        }[confirm ?? '']}
        confirmLabel="Confirm"
        onConfirm={() => confirm && void action(confirm)}
        onClose={() => setConfirm(null)}
      />
    </motion.div>
  );
}

function Worklist({ db, containers, empty, mode, call, canOperate, onDischarge, onLoad }: {
  db: NonNullable<ReturnType<typeof useOps>['db']>; containers: Container[]; empty: string; mode: 'discharge' | 'load'; call: VesselCall; canOperate: boolean;
  onDischarge?: (container: Container) => void; onLoad?: (container: Container) => void;
}) {
  if (containers.length === 0) return <EmptyState title="Nothing on this list" description={empty} />;
  const working = call.status === 'working';
  const readiness = (container: Container) => {
    if (mode === 'discharge') return container.status === 'expected' ? null : 'Discharged';
    if (container.status === 'on_vessel' || container.status === 'delivered') return 'Loaded';
    if (container.status !== 'in_yard') return 'Not in yard';
    if (activeHolds(container).length) return 'On hold';
    if (container.category === 'export' && container.vgmKg === null) return 'No VGM';
    if (container.category === 'export' && container.customsStatus !== 'cleared') return 'Customs pending';
    return null;
  };
  return (
    <>
      <TableWrap minWidth={860}>
        <THead><Th>Container</Th><Th>Type</Th><Th>{mode === 'discharge' ? 'Consignee' : 'Shipper'}</Th><Th>Commodity</Th><Th>Position</Th><Th>Status</Th><Th align="right">Action</Th></THead>
        <tbody>
          {containers.map(container => { const blocker = readiness(container); return (
            <Tr key={container.id}>
              <Td><ContainerLink container={container} /><div className="mt-1"><ContainerFlags container={container} /></div></Td>
              <Td>{container.size}{container.type} · {CONTAINER_CATEGORY_LABELS[container.category]}</Td>
              <Td>{mode === 'discharge' ? <PartyName db={db} id={container.consigneeId} fallback="Not assigned" /> : container.shipperName || '—'}</Td>
              <Td className="max-w-[200px] truncate">{container.commodity || '—'}</Td>
              <Td className="font-mono">{container.yardPosition ?? '—'}</Td>
              <Td><ContainerStatusBadge container={container} /></Td>
              <Td align="right">
                {blocker ? <span className={`text-[12px] font-medium ${['Discharged', 'Loaded'].includes(blocker) ? 'text-[#1F8F6E]' : 'text-[#B7791F]'}`}>{blocker}</span>
                  : canOperate && working ? <PanelButton onClick={() => mode === 'discharge' ? onDischarge?.(container) : onLoad?.(container)}>{mode === 'discharge' ? 'Discharge' : 'Load'}</PanelButton>
                  : <span className="text-[12px] text-gray-400">{working ? 'View only' : 'Operations not running'}</span>}
              </Td>
            </Tr>
          ); })}
        </tbody>
      </TableWrap>
      <CardList>
        {containers.map(container => { const blocker = readiness(container); return (
          <Card key={container.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><ContainerLink container={container} /><p className="!text-[12px] !text-gray-400">{container.size}{container.type} · {container.commodity || CONTAINER_CATEGORY_LABELS[container.category]}</p></div>
              <ContainerStatusBadge container={container} />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="font-mono text-[12px] text-gray-500">{container.yardPosition ?? '—'}</span>
              {blocker ? <span className="text-[12px] font-medium text-gray-500">{blocker}</span> : canOperate && working ? <PanelButton onClick={() => mode === 'discharge' ? onDischarge?.(container) : onLoad?.(container)}>{mode === 'discharge' ? 'Discharge' : 'Load'}</PanelButton> : null}
            </div>
          </Card>
        ); })}
      </CardList>
    </>
  );
}

function DischargeDialog({ container, busy, error, onClose, onSubmit }: { container: Container; busy: boolean; error: string; onClose: () => void; onSubmit: (position: string) => void }) {
  const [position, setPosition] = useState('');
  return (
    <FormDialog open title={`Discharge ${container.number}`} description="Enter the yard slot the box is stacked in (block, row, tier). Stevedoring is charged to the line on discharge." submitLabel="Confirm discharge" busy={busy} error={error} onClose={onClose} onSubmit={() => onSubmit(position)}>
      <Field label="Yard position" id="position" hint={container.reefer ? 'Reefer: use a block with plugs, for example R03-2-1' : 'For example C04-07-2'}><input id="position" autoFocus className={`${INPUT} font-mono uppercase`} value={position} onChange={event => setPosition(event.target.value)} placeholder={container.reefer ? 'R03-2-1' : 'C04-07-2'} /></Field>
    </FormDialog>
  );
}
