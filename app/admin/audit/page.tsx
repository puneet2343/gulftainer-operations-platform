'use client';

/*
 * Audit log: every business action with actor, organisation, location, affected
 * record, before and after state, reason and request id. Auditors can trace a
 * container from registration through discharge, clearance, gate-out and delivery.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import ListToolbar from '@/components/ui/ListToolbar';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import Timeline from '@/components/ui/Timeline';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT } from '@/components/ui/Table';
import { DownloadIcon } from '@/components/ui/Icons';
import { LocationName, PanelBody, EmployeeName } from '@/components/admin/Shared';
import { useOps } from '@/lib/ops/use-ops';
import { useList } from '@/lib/use-list';
import { formatDateTime, downloadCsv } from '@/lib/format';
import { normaliseContainerNumber, validateContainerNumber } from '@/lib/ops/iso6346';
import { CONTAINER_EVENT_LABELS, type AuditEntry } from '@/lib/ops/types';

export default function AuditPage() {
  const { db, actor } = useOps();
  const [trace, setTrace] = useState('');
  const entries = useMemo(() => db ? [...db.audit].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) : [], [db]);
  const list = useList<AuditEntry, { kind: string; actor: string; location: string }>(entries, {
    pageSize: 20,
    initialFilters: { kind: 'All', actor: 'All', location: 'All' },
    search: (entry, query) => [entry.action, entry.entityRef, entry.actorName, entry.reason ?? '', entry.requestId, JSON.stringify(entry.after ?? {}), JSON.stringify(entry.before ?? {})].some(value => value.toLowerCase().includes(query)),
    filter: (entry, filters) => (filters.kind === 'All' || entry.entityKind === filters.kind) && (filters.actor === 'All' || entry.actorId === filters.actor) && (filters.location === 'All' || entry.locationId === filters.location),
  });
  const traced = useMemo(() => {
    if (!db) return null;
    const number = normaliseContainerNumber(trace);
    if (!number || validateContainerNumber(number)) return null;
    const container = db.containers.find(c => c.number === number);
    if (!container) return { container: null, events: [], audit: [] };
    return { container, events: db.containerEvents.filter(e => e.containerId === container.id).sort((a, b) => a.at.localeCompare(b.at)), audit: db.audit.filter(a => a.entityId === container.id) };
  }, [db, trace]);
  if (!db || !actor) return <PageSkeleton />;
  const kinds = [...new Set(entries.map(e => e.entityKind))].sort();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Control" title="Audit log" subtitle="Append-only record of every business action with who, where, what changed and why. Entries carry the request id that groups the records written in one transaction." action={<ToolbarButton variant="secondary" onClick={() => downloadCsv(`audit-${today}.csv`, ['Timestamp', 'Actor', 'Organisation', 'Location', 'Action', 'Entity', 'Reference', 'Before', 'After', 'Reason', 'Request'], list.filtered.map(e => [e.timestamp, e.actorName, db.organizations.find(o => o.id === e.orgId)?.code, db.locations.find(l => l.id === e.locationId)?.code ?? '', e.action, e.entityKind, e.entityRef, JSON.stringify(e.before ?? ''), JSON.stringify(e.after ?? ''), e.reason ?? '', e.requestId]))}><DownloadIcon />Export CSV</ToolbarButton>} />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Icon />} label="Entries" value={entries.length} description="since go-live of the demo data" />
        <StatCard icon={<Icon />} label="Today" value={entries.filter(e => e.timestamp.slice(0, 10) === today).length} description="actions recorded" />
        <StatCard icon={<Icon />} label="Users active" value={new Set(entries.filter(e => e.timestamp.slice(0, 10) === today).map(e => e.actorId)).size} description="today" />
        <StatCard icon={<Icon />} label="With reasons" value={entries.filter(e => e.reason).length} description="exceptional changes" />
      </section>

      <Panel delay={0.06}>
        <SectionHeader title="Trace a container" description="Full history from registration to delivery" />
        <PanelBody>
          <input aria-label="Container number to trace" className={`${INPUT} max-w-md font-mono uppercase`} placeholder="MSCU 884207 0" value={trace} onChange={e => setTrace(e.target.value)} />
          {traced && !traced.container && <p className="mt-3 !text-[13px] !text-gray-500">No container with that number.</p>}
          {traced?.container && (
            <div className="mt-4">
              <p className="mb-3 !text-[13px] !text-secondary"><Link href={`/admin/containers/${traced.container.id}`} className="font-mono font-semibold">{traced.container.number}</Link> · {traced.events.length} events · {traced.audit.length} audit entries</p>
              <Timeline items={traced.events.map(event => ({ id: event.id, title: <><span className="font-semibold">{CONTAINER_EVENT_LABELS[event.type]}</span>{event.note ? ` — ${event.note}` : ''}</>, meta: <><EmployeeName db={db} id={event.by} /> · {formatDateTime(event.at)} UTC{event.locationId ? <> · <LocationName db={db} id={event.locationId} code /></> : null}</> }))} />
            </div>
          )}
        </PanelBody>
      </Panel>

      <Panel delay={0.1}>
        <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search action, reference, user, reason or request id" label="Search audit log" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(o => !o)} filters={list.filters}
          groups={[{ key: 'kind', label: 'Record type', options: kinds.map(k => ({ value: k, label: k.replace(/_/g, ' ') })) }, { key: 'actor', label: 'User', options: db.employees.filter(e => entries.some(a => a.actorId === e.id)).map(e => ({ value: e.id, label: e.name })) }, { key: 'location', label: 'Location', options: db.locations.map(l => ({ value: l.id, label: l.code })) }]}
          onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters} />
        {list.pageItems.length === 0 ? <EmptyState title="No entries" description="Nothing matches the current search and filters." /> : (
          <>
            <TableWrap minWidth={1060}>
              <THead><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Record</Th><Th>Location</Th><Th>Change</Th><Th>Request</Th></THead>
              <tbody>
                {list.pageItems.map(entry => (
                  <Tr key={entry.id}>
                    <Td className="tabular-nums whitespace-nowrap">{formatDateTime(entry.timestamp)}</Td>
                    <Td>{entry.actorName}<p className="!text-[12px] !text-gray-400">{db.organizations.find(o => o.id === entry.orgId)?.code}</p></Td>
                    <Td><span className="text-[13px] text-secondary">{entry.action.replace(/[._]/g, ' ')}</span>{entry.reason && <p className="!text-[12px] !text-gray-500">{entry.reason}</p>}</Td>
                    <Td><span className="font-mono text-[12px] text-primary">{entry.entityRef}</span><p className="!text-[12px] !text-gray-400">{entry.entityKind.replace(/_/g, ' ')}</p></Td>
                    <Td><LocationName db={db} id={entry.locationId} code /></Td>
                    <Td className="max-w-[300px]">{(entry.before || entry.after) ? <div className="font-mono text-[11px] leading-4">{entry.before && <p className="text-gray-400">− {JSON.stringify(entry.before)}</p>}{entry.after && <p className="text-[#1F8F6E]">+ {JSON.stringify(entry.after)}</p>}</div> : <span className="text-gray-400">—</span>}</Td>
                    <Td><span className="font-mono text-[11px] text-gray-400">{entry.requestId.slice(0, 8)}</span></Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <CardList>{list.pageItems.map(entry => <Card key={entry.id}><p className="!text-[13px] !font-semibold !text-secondary">{entry.action.replace(/[._]/g, ' ')} <span className="font-mono font-normal text-primary">{entry.entityRef}</span></p><p className="!text-[12px] !text-gray-400">{entry.actorName} · {formatDateTime(entry.timestamp)}</p>{entry.reason && <p className="!text-[12px] !text-gray-500">{entry.reason}</p>}</Card>)}</CardList>
            <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
          </>
        )}
      </Panel>
    </motion.div>
  );
}

function Icon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
}
