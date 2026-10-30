'use client';

/*
 * Document register: delivery orders, bills of lading, customs declarations,
 * EIRs, bay plans, DG declarations, VGM certificates and proofs of delivery,
 * each with append-only versions, SHA-256 checksums, retention and role access.
 */

import { useMemo, useState } from 'react';
import { useNow } from '@/lib/use-now';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import ListToolbar from '@/components/ui/ListToolbar';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card } from '@/components/ui/Table';
import { PlusIcon } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { EmployeeName, PanelButton } from '@/components/admin/Shared';
import DocumentUploadDialog from '@/components/admin/DocumentUploadDialog';
import { useOps } from '@/lib/ops/use-ops';
import { canOpenDocument } from '@/lib/ops/ops';
import { useList } from '@/lib/use-list';
import { formatDateTime, formatDate } from '@/lib/format';
import { formatContainerNumber } from '@/lib/ops/iso6346';
import type { DocumentRecord } from '@/lib/ops/types';

const TYPES = ['Delivery order', 'Bill of lading', 'Customs declaration', 'Equipment interchange receipt', 'Bay plan', 'BAPLIE', 'Dangerous goods declaration', 'VGM certificate', 'Proof of delivery', 'Inspection report', 'Commercial invoice', 'Packing list', 'Other'];

export default function DocumentsPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [versioning, setVersioning] = useState<DocumentRecord | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const nowMs = useNow();
  const documents = useMemo(() => db ? [...db.documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [], [db]);
  const list = useList<DocumentRecord, { type: string; legal: string }>(documents, {
    pageSize: 12,
    initialFilters: { type: 'All', legal: 'All' },
    search: (document, query) => { const container = db?.containers.find(c => c.id === document.containerId); const call = db?.vesselCalls.find(v => v.id === document.vesselCallId); return [document.title, document.reference, document.type, container?.number ?? '', call?.voyage ?? '', ...document.versions.map(v => v.fileName)].some(value => value.toLowerCase().includes(query)); },
    filter: (document, filters) => (filters.type === 'All' || document.type === filters.type) && (filters.legal === 'All' || document.legallySignificant),
  });
  if (!db || !actor) return <PageSkeleton />;
  const canUpload = actor.role !== 'auditor';
  const linkFor = (document: DocumentRecord) => {
    if (document.containerId) { const c = db.containers.find(x => x.id === document.containerId); return c ? { href: `/admin/containers/${c.id}`, label: formatContainerNumber(c.number) } : null; }
    if (document.vesselCallId) { const v = db.vesselCalls.find(x => x.id === document.vesselCallId); return v ? { href: `/admin/vessels/${v.id}`, label: `${v.vessel} ${v.voyage}` } : null; }
    if (document.transportJobId) { const j = db.transportJobs.find(x => x.id === document.transportJobId); return j ? { href: '/admin/transport', label: j.reference } : null; }
    if (document.orderId) { const o = db.warehouseOrders.find(x => x.id === document.orderId); return o ? { href: '/admin/warehouse', label: o.reference } : null; }
    if (document.partyId) { const p = db.parties.find(x => x.id === document.partyId); return p ? { href: '/admin/customers', label: p.name } : null; }
    return null;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Customers" title="Documents" subtitle="Shipping and operational paperwork linked to containers, vessel calls, orders and transport jobs. Files are hashed on upload; legally significant documents keep every version." action={canUpload ? <ToolbarButton onClick={() => setUploading(true)}><PlusIcon />Upload document</ToolbarButton> : undefined} />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Icon />} label="Documents" value={documents.length} description={`${documents.reduce((s, d) => s + d.versions.length, 0)} versions`} />
        <StatCard icon={<Icon />} label="Legally significant" value={documents.filter(d => d.legallySignificant).length} description="append-only" />
        <StatCard icon={<Icon />} label="Delivery orders" value={documents.filter(d => d.type === 'Delivery order').length} description="on file" />
        <StatCard icon={<Icon />} label="Uploaded this week" value={documents.filter(d => new Date(d.updatedAt).getTime() > nowMs - 7 * 86400000).length} description="new or new version" />
      </section>
      <Panel delay={0.08}>
        <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search title, reference, container, voyage or file name" label="Search documents" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(o => !o)} filters={list.filters}
          groups={[{ key: 'type', label: 'Type', options: TYPES.map(t => ({ value: t, label: t })) }, { key: 'legal', label: 'Retention', options: [{ value: 'yes', label: 'Legally significant' }] }]}
          onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters} />
        {list.pageItems.length === 0 ? <EmptyState title="No documents" description="Upload a document or file one from a container or vessel call." /> : (
          <>
            <TableWrap minWidth={980}>
              <THead><Th>Document</Th><Th>Type</Th><Th>Linked to</Th><Th>Current version</Th><Th>Access</Th><Th>Retention</Th><Th align="right">Actions</Th></THead>
              <tbody>
                {list.pageItems.map(document => { const latest = document.versions[document.versions.length - 1]; const link = linkFor(document); const allowed = canOpenDocument(document, actor); return (
                  <Tr key={document.id}>
                    <Td>
                      <p className={`!text-[13px] !font-semibold ${allowed ? '!text-secondary' : '!text-gray-400'}`}>{allowed ? document.title : `${document.type} (restricted)`}</p>
                      <p className="font-mono !text-[12px] !text-gray-400">{document.reference}</p>
                      {expanded === document.id && allowed && (
                        <ul className="mt-2 space-y-1 rounded-lg bg-gray-50 p-2 text-[12px]">{[...document.versions].reverse().map(version => <li key={version.version}><span className="font-semibold text-secondary">v{version.version}</span> {version.fileName} · {(version.sizeBytes / 1024).toFixed(0)} KB · <EmployeeName db={db} id={version.uploadedBy} /> · {formatDateTime(version.uploadedAt)}<br /><span className="font-mono text-[11px] text-gray-400">sha256 {version.checksum}</span>{version.note && <span className="block text-gray-500">{version.note}</span>}</li>)}</ul>
                      )}
                    </Td>
                    <Td>{document.type}</Td>
                    <Td>{link ? <Link href={link.href} className="font-semibold">{link.label}</Link> : <span className="text-gray-400">—</span>}</Td>
                    <Td>{allowed ? <>v{latest.version} · {latest.fileName}<p className="!text-[12px] !text-gray-400">{formatDate(latest.uploadedAt)} · <EmployeeName db={db} id={latest.uploadedBy} /></p></> : <span className="text-gray-400">Restricted</span>}</Td>
                    <Td>{document.access.length === 0 ? 'All roles' : `${document.access.length} role${document.access.length === 1 ? '' : 's'}`}</Td>
                    <Td>{document.retentionYears} years{document.legallySignificant && <p><StatusBadge variant="neutral">Legal</StatusBadge></p>}</Td>
                    <Td align="right"><div className="flex justify-end gap-1.5">{allowed && <PanelButton onClick={() => setExpanded(expanded === document.id ? null : document.id)}>{expanded === document.id ? 'Hide versions' : `Versions (${document.versions.length})`}</PanelButton>}{allowed && canUpload && <PanelButton onClick={() => setVersioning(document)}>New version</PanelButton>}</div></Td>
                  </Tr>
                ); })}
              </tbody>
            </TableWrap>
            <CardList>{list.pageItems.map(document => { const latest = document.versions[document.versions.length - 1]; const link = linkFor(document); return <Card key={document.id}><p className="!text-[13px] !font-semibold !text-secondary">{document.title}</p><p className="!text-[12px] !text-gray-400">{document.type} · v{latest.version} · {link?.label ?? ''} · {formatDate(latest.uploadedAt)}</p></Card>; })}</CardList>
            <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
          </>
        )}
      </Panel>
      {uploading && <DocumentUploadDialog onClose={() => setUploading(false)} onDone={document => { setUploading(false); toast.success(`${document.reference} filed`); }} />}
      {versioning && <DocumentUploadDialog existing={versioning} onClose={() => setVersioning(null)} onDone={document => { setVersioning(null); toast.success(`${document.reference} now at version ${document.versions.length}`); }} />}
    </motion.div>
  );
}

function Icon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
}
