'use client';

/*
 * Sync and integrations: the offline queue from gate and warehouse devices with
 * replay and reconciliation, the transactional outbox, and inbound messages from
 * shipping lines (BAPLIE, COPRAR), customs, carrier tracking and SAP, with
 * duplicate detection and failure isolation. Includes a message simulator so the
 * behaviour can be demonstrated without the external systems.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import Tabs from '@/components/ui/Tabs';
import EmptyState from '@/components/ui/EmptyState';
import { Field, StatusBadge } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { EmployeeName, PanelButton, PanelBody, ActionError } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { newId } from '@/lib/ops/core';
import { formatDateTime, relativeTime } from '@/lib/format';
import type { IntegrationEventType } from '@/lib/ops/types';

type Tab = 'queue' | 'outbox' | 'integrations';

export default function SyncPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error, clear } = useAction();
  const [tab, setTab] = useState<Tab>('queue');
  const [simulator, setSimulator] = useState({ provider: 'Sharjah Customs', type: 'CUSTOMS_CLEARANCE' as IntegrationEventType, eventId: `SC-${newId().slice(0, 6).toUpperCase()}`, subject: '', eta: '' });
  if (!db || !actor) return <PageSkeleton />;
  const queue = [...db.offlineQueue].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
  const outbox = [...db.outbox].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const integrations = [...db.integrations].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const offline = db.settings.offline;
  const canSync = ['gate_officer', 'terminal_ops', 'warehouse_supervisor', 'warehouse_worker', 'customer_service', 'system_admin'].includes(actor.role);

  async function syncAll() {
    const pending = queue.filter(item => item.status === 'queued');
    let synced = 0;
    let rejected = 0;
    for (const item of pending) {
      const result = await run(() => ops.syncQueued(actor!, item.clientId));
      if (result?.status === 'synced') synced += 1; else rejected += 1;
    }
    toast[rejected ? 'error' : 'success'](`${synced} synchronised${rejected ? `, ${rejected} rejected for reconciliation` : ''}`);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Control" title="Sync and integrations" subtitle="Operations captured offline replay through the same validation as live input, so nothing is accepted twice. Inbound messages from lines, customs, carriers and SAP are de-duplicated and failures never touch committed data."
        action={<div className="flex flex-wrap gap-2"><ToolbarButton variant={offline ? 'primary' : 'secondary'} onClick={() => ops.setOffline(!offline)}>{offline ? 'Reconnect' : 'Simulate offline'}</ToolbarButton>{!offline && canSync && queue.some(i => i.status === 'queued') && <ToolbarButton disabled={busy} onClick={() => void syncAll()}>Synchronise queue</ToolbarButton>}</div>} />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Icon />} label="Queued offline" value={queue.filter(i => i.status === 'queued').length} description={offline ? 'device offline' : 'ready to sync'} />
        <StatCard icon={<Icon />} label="Rejected" value={queue.filter(i => i.status === 'rejected').length} description="need reconciliation" />
        <StatCard icon={<Icon />} label="Outbox pending" value={outbox.filter(e => e.status === 'pending').length} description={`${outbox.length} events in total`} />
        <StatCard icon={<Icon />} label="Integration failures" value={integrations.filter(e => e.status === 'failed').length} description={`${integrations.filter(e => e.status === 'duplicate').length} duplicates ignored`} />
      </section>
      <Panel delay={0.08}>
        <Tabs tabs={[{ id: 'queue', label: 'Offline queue' }, { id: 'outbox', label: 'Event outbox' }, { id: 'integrations', label: 'Inbound messages' }]} value={tab} onChange={setTab} counts={{ queue: queue.length, outbox: outbox.length, integrations: integrations.length }} />
        {error && <div className="px-4 pt-4"><ActionError message={error} /></div>}
        {tab === 'queue' && (queue.length === 0 ? <EmptyState title="Queue is empty" description="Switch a gate or warehouse device offline and record an operation to see it queue here." /> : (
          <>
            <TableWrap minWidth={940}>
              <THead><Th>Operation</Th><Th>Client reference</Th><Th>Queued</Th><Th>By</Th><Th>Attempts</Th><Th>Status</Th><Th align="right">Action</Th></THead>
              <tbody>{queue.map(item => (
                <Tr key={item.clientId}>
                  <Td><p className="!text-[13px] !text-secondary">{item.summary}</p><p className="!text-[12px] !text-gray-400">{item.kind.replace(/_/g, ' ')}</p>{item.error && <p className="!text-[12px] !text-[#C0352B]">{item.error}</p>}{item.serverReference && <p className="font-mono !text-[12px] !text-[#1F8F6E]">Server reference {item.serverReference}</p>}</Td>
                  <Td><span className="font-mono text-[11px] text-gray-400">{item.clientId.slice(0, 13)}</span></Td>
                  <Td className="tabular-nums">{formatDateTime(item.queuedAt)}</Td>
                  <Td><EmployeeName db={db} id={item.queuedBy} /></Td>
                  <Td>{item.attempts}</Td>
                  <Td><StatusBadge variant={item.status === 'synced' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'} dot>{item.status === 'synced' ? 'Synchronised' : item.status === 'rejected' ? 'Rejected' : 'Queued'}</StatusBadge></Td>
                  <Td align="right"><div className="flex justify-end gap-1.5">
                    {item.status === 'queued' && !offline && canSync && <PanelButton primary disabled={busy} onClick={() => void run(() => ops.syncQueued(actor, item.clientId), result => toast[result?.status === 'synced' ? 'success' : 'error'](result?.status === 'synced' ? `Synchronised as ${result.serverReference}` : `Rejected: ${result?.error}`))}>Sync</PanelButton>}
                    {item.status === 'rejected' && canSync && <><PanelButton disabled={busy} onClick={() => void run(() => ops.requeue(actor, item.clientId), () => toast.success('Queued for retry'))}>Retry</PanelButton><PanelButton danger disabled={busy} onClick={() => { clear(); void run(() => ops.discardQueued(actor, item.clientId), () => toast.success('Discarded and audited')); }}>Discard</PanelButton></>}
                  </div></Td>
                </Tr>
              ))}</tbody>
            </TableWrap>
            <CardList>{queue.map(item => <Card key={item.clientId}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="!text-[13px] !font-semibold !text-secondary">{item.summary}</p><p className="!text-[12px] !text-gray-400">{relativeTime(item.queuedAt)}</p>{item.error && <p className="!text-[12px] !text-[#C0352B]">{item.error}</p>}</div><StatusBadge variant={item.status === 'synced' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>{item.status}</StatusBadge></div></Card>)}</CardList>
          </>
        ))}
        {tab === 'outbox' && (outbox.length === 0 ? <EmptyState title="No events" description="Business events written in the same transaction as their change appear here and are published by the worker." /> : (
          <TableWrap minWidth={700} className="!block">
            <THead><Th>Event</Th><Th>Payload</Th><Th>Created</Th><Th>Published</Th><Th>Status</Th></THead>
            <tbody>{outbox.slice(0, 80).map(event => (
              <Tr key={event.id}><Td><span className="font-mono text-[12px] text-secondary">{event.type}</span></Td><Td className="max-w-[320px] truncate font-mono text-[11px] text-gray-400">{JSON.stringify(event.payload)}</Td><Td className="tabular-nums">{formatDateTime(event.createdAt)}</Td><Td className="tabular-nums">{event.publishedAt ? formatDateTime(event.publishedAt) : '—'}</Td><Td><StatusBadge variant={event.status === 'published' ? 'success' : event.status === 'failed' ? 'danger' : 'warning'}>{event.status}</StatusBadge></Td></Tr>
            ))}</tbody>
          </TableWrap>
        ))}
        {tab === 'integrations' && (
          <div>
            <div className="border-b border-gray-100">
              <SectionHeader title="Message simulator" description="Sends a message as the external system would" />
              <PanelBody className="!pt-3">
                <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Provider" id="sim-provider"><select id="sim-provider" className={SELECT} value={simulator.provider} onChange={e => setSimulator(s => ({ ...s, provider: e.target.value }))}>{['Sharjah Customs', 'Hapag-Lloyd EDI', 'MSC EDI', 'Maersk EDI', 'GT Lines tracking', 'SAP S/4HANA'].map(p => <option key={p}>{p}</option>)}</select></Field>
                  <Field label="Message type" id="sim-type"><select id="sim-type" className={SELECT} value={simulator.type} onChange={e => setSimulator(s => ({ ...s, type: e.target.value as IntegrationEventType }))}><option value="CUSTOMS_CLEARANCE">Customs clearance (container)</option><option value="BAPLIE">BAPLIE discharge list (voyage)</option><option value="COPRAR">COPRAR load list (voyage)</option><option value="CARRIER_TRACKING">Carrier ETA update (voyage)</option><option value="SAP_POSTING">SAP posting acknowledgement (invoice)</option></select></Field>
                  <Field label="Event id" id="sim-id" hint="Send the same id twice to see duplicate detection"><input id="sim-id" className={`${INPUT} font-mono`} value={simulator.eventId} onChange={e => setSimulator(s => ({ ...s, eventId: e.target.value }))} /></Field>
                  <Field label={simulator.type === 'CUSTOMS_CLEARANCE' ? 'Container number' : simulator.type === 'SAP_POSTING' ? 'Invoice reference' : 'Voyage'} id="sim-subject"><input id="sim-subject" className={`${INPUT} font-mono uppercase`} value={simulator.subject} onChange={e => setSimulator(s => ({ ...s, subject: e.target.value }))} placeholder={simulator.type === 'CUSTOMS_CLEARANCE' ? 'HLCU 884214 2' : simulator.type === 'SAP_POSTING' ? 'INV-2026-00001' : 'JEMK641W'} /></Field>
                  {simulator.type === 'CARRIER_TRACKING' && <Field label="New ETA (UTC)" id="sim-eta"><input id="sim-eta" type="datetime-local" className={INPUT} value={simulator.eta} onChange={e => setSimulator(s => ({ ...s, eta: e.target.value }))} /></Field>}
                </div>
                <PanelButton primary disabled={busy || !simulator.subject} onClick={() => void run(() => ops.ingestIntegrationEvent(actor, { provider: simulator.provider, eventId: simulator.eventId, type: simulator.type, subject: simulator.subject, payload: simulator.type === 'CARRIER_TRACKING' ? { eta: simulator.eta ? `${simulator.eta}:00.000Z` : '' } : { status: 'cleared' } }), record => { toast[record?.status === 'applied' ? 'success' : record?.status === 'duplicate' ? 'info' : 'error'](`${record?.status}: ${record?.detail}`); })}>Send message</PanelButton>
              </PanelBody>
            </div>
            {integrations.length === 0 ? <EmptyState title="No messages yet" description="Use the simulator above." /> : (
              <TableWrap minWidth={800} className="!block">
                <THead><Th>Received</Th><Th>Provider</Th><Th>Type</Th><Th>Event id</Th><Th>Subject</Th><Th>Outcome</Th></THead>
                <tbody>{integrations.map(event => (
                  <Tr key={event.id}><Td className="tabular-nums">{formatDateTime(event.receivedAt)}</Td><Td>{event.provider}</Td><Td><span className="font-mono text-[12px]">{event.type}</span></Td><Td><span className="font-mono text-[12px] text-gray-500">{event.eventId}</span></Td><Td className="font-mono">{event.subject}</Td><Td><StatusBadge variant={event.status === 'applied' ? 'success' : event.status === 'duplicate' ? 'neutral' : 'danger'} dot>{event.status}</StatusBadge><p className="mt-0.5 !text-[12px] !text-gray-500">{event.detail}</p></Td></Tr>
                ))}</tbody>
              </TableWrap>
            )}
          </div>
        )}
      </Panel>
    </motion.div>
  );
}

function Icon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
}
