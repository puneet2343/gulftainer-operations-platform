'use client';

/*
 * Container register: every box the network knows about, searchable by number,
 * consignee, voyage or commodity, with the clearance position of each import box
 * (customs, delivery order, charges) visible at a glance.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import ListToolbar from '@/components/ui/ListToolbar';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card } from '@/components/ui/Table';
import { PlusIcon, DownloadIcon } from '@/components/ui/Icons';
import { ContainerStatusBadge, ContainerFlags, PartyName, LocationName, ClearanceChips } from '@/components/admin/Shared';
import { useOps } from '@/lib/ops/use-ops';
import { activeHolds, isReadyForPickup } from '@/lib/ops/ops';
import { useList } from '@/lib/use-list';
import { formatContainerNumber } from '@/lib/ops/iso6346';
import { downloadCsv, formatDate } from '@/lib/format';
import { CONTAINER_CATEGORY_LABELS, CONTAINER_STATUS_LABELS, CUSTOMS_LABELS, type Container, type ContainerCategory, type ContainerPhysicalStatus } from '@/lib/ops/types';

type Filters = { location: string; category: string; status: string; clearance: string; flag: string };

export default function ContainersPage() {
  const { db, actor } = useOps();
  const router = useRouter();
  const now = new Date().toISOString();
  const containers = useMemo(() => db ? [...db.containers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [], [db]);
  const list = useList<Container, Filters>(containers, {
    pageSize: 12,
    initialFilters: { location: 'All', category: 'All', status: 'All', clearance: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ready') ? 'ready' : 'All', flag: 'All' },
    search: (container, query) => {
      const consignee = db?.parties.find(party => party.id === container.consigneeId)?.name ?? '';
      const call = db?.vesselCalls.find(entry => entry.id === container.inboundCallId || entry.id === container.outboundCallId);
      return [container.number, consignee, container.commodity, container.shipperName, call?.voyage ?? '', call?.vessel ?? '', container.yardPosition ?? '', container.deliveryOrder?.number ?? ''].some(value => value.toLowerCase().includes(query));
    },
    filter: (container, filters) => {
      if (filters.location !== 'All' && container.locationId !== filters.location) return false;
      if (filters.category !== 'All' && container.category !== filters.category) return false;
      if (filters.status !== 'All' && container.status !== filters.status) return false;
      if (filters.clearance === 'ready' && !isReadyForPickup(container, now)) return false;
      if (filters.clearance === 'hold' && activeHolds(container).length === 0) return false;
      if (filters.clearance === 'customs' && container.customsStatus !== 'pending' && container.customsStatus !== 'inspection') return false;
      if (filters.clearance === 'unpaid' && (container.chargesSettled || container.category !== 'import' || container.status !== 'in_yard')) return false;
      if (filters.flag === 'dg' && !container.dg) return false;
      if (filters.flag === 'reefer' && !container.reefer) return false;
      if (filters.flag === 'oog' && !container.oog) return false;
      return true;
    },
  });

  if (!db || !actor) return <PageSkeleton />;

  const inYard = db.containers.filter(container => container.status === 'in_yard');
  const ready = inYard.filter(container => isReadyForPickup(container, now));
  const onHold = inYard.filter(container => activeHolds(container).length > 0);
  const inTransit = db.containers.filter(container => container.status === 'on_truck' || container.status === 'on_vessel');
  const canRegister = ['planner', 'terminal_ops', 'customer_service', 'gate_officer', 'system_admin'].includes(actor.role);

  function exportCsv() {
    downloadCsv(`containers-${now.slice(0, 10)}.csv`, ['Container', 'Size/type', 'Category', 'Status', 'Location', 'Position', 'Line', 'Consignee', 'Customs', 'Delivery order', 'Charges settled', 'Discharged'],
      list.filtered.map(container => [container.number, `${container.size}${container.type}`, container.category, container.status, db!.locations.find(l => l.id === container.locationId)?.code ?? '', container.yardPosition ?? '', db!.parties.find(p => p.id === container.lineId)?.name ?? '', db!.parties.find(p => p.id === container.consigneeId)?.name ?? '', container.customsStatus, container.deliveryOrder?.number ?? '', container.chargesSettled ? 'yes' : 'no', container.dischargedAt ? formatDate(container.dischargedAt) : '']));
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow="Terminal"
        title="Containers"
        subtitle="Every container across terminals and inland depots, with its physical position, customs status, delivery order and payment position."
        action={
          <div className="flex flex-wrap gap-2">
            <ToolbarButton variant="secondary" onClick={exportCsv}><DownloadIcon />Export CSV</ToolbarButton>
            {canRegister && <ToolbarButton onClick={() => router.push('/admin/containers/new')}><PlusIcon />Register container</ToolbarButton>}
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<BoxIcon />} label="In yard" value={inYard.length} description={`${inYard.reduce((sum, c) => sum + (c.size === '20' ? 1 : 2), 0).toLocaleString()} TEU`} />
        <StatCard icon={<BoxIcon />} label="Ready for pick-up" value={ready.length} description="cleared and paid" />
        <StatCard icon={<BoxIcon />} label="On hold" value={onHold.length} description="customs, line, DG or terminal" />
        <StatCard icon={<BoxIcon />} label="In transit" value={inTransit.length} description="on truck or vessel" />
      </section>

      <Panel delay={0.08}>
        <ListToolbar
          search={list.search} onSearch={list.setSearch} placeholder="Search container number, consignee, voyage, commodity or delivery order" label="Search containers" count={list.filtered.length}
          showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(open => !open)} filters={list.filters}
          groups={[
            { key: 'location', label: 'Location', options: db.locations.filter(location => location.type !== 'warehouse').map(location => ({ value: location.id, label: location.code })) },
            { key: 'category', label: 'Category', options: (Object.keys(CONTAINER_CATEGORY_LABELS) as ContainerCategory[]).map(category => ({ value: category, label: CONTAINER_CATEGORY_LABELS[category] })) },
            { key: 'status', label: 'Physical status', options: (Object.keys(CONTAINER_STATUS_LABELS) as ContainerPhysicalStatus[]).map(status => ({ value: status, label: CONTAINER_STATUS_LABELS[status] })) },
            { key: 'clearance', label: 'Clearance', options: [{ value: 'ready', label: 'Ready for pick-up' }, { value: 'hold', label: 'On hold' }, { value: 'customs', label: 'Customs pending' }, { value: 'unpaid', label: 'Charges unpaid' }] },
            { key: 'flag', label: 'Special', options: [{ value: 'dg', label: 'Dangerous goods' }, { value: 'reefer', label: 'Reefer' }, { value: 'oog', label: 'Out of gauge' }] },
          ]}
          onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters}
        />
        {list.pageItems.length === 0 ? <EmptyState title="No containers found" description={list.hasActiveFilters || list.search ? 'Nothing matches the current search and filters.' : 'Register a container or load a BAPLIE to begin.'} action={(list.hasActiveFilters || list.search) && <button type="button" onClick={list.clearFilters} className="btn btn-secondary">Clear Filters</button>} /> : (
          <>
            <TableWrap minWidth={1040}>
              <THead><Th>Container</Th><Th>Category</Th><Th>Location</Th><Th>Line / consignee</Th><Th>Voyage</Th><Th>Clearance</Th><Th>Status</Th></THead>
              <tbody>
                {list.pageItems.map(container => {
                  const call = db.vesselCalls.find(entry => entry.id === (container.category === 'export' ? container.outboundCallId : container.inboundCallId));
                  return (
                    <Tr key={container.id} onClick={() => router.push(`/admin/containers/${container.id}`)}>
                      <Td>
                        <Link href={`/admin/containers/${container.id}`} className="font-mono !text-[13px] !font-semibold text-primary">{formatContainerNumber(container.number)}</Link>
                        <p className="mt-0.5 !text-[12px] !text-gray-400">{container.size}{container.type} · {container.commodity || (container.full ? 'Commodity not set' : 'Empty')}</p>
                        <div className="mt-1"><ContainerFlags container={container} /></div>
                      </Td>
                      <Td>{CONTAINER_CATEGORY_LABELS[container.category]}</Td>
                      <Td><LocationName db={db} id={container.locationId} code />{container.yardPosition && <p className="font-mono !text-[12px] !text-gray-400">{container.yardPosition}</p>}</Td>
                      <Td><PartyName db={db} id={container.lineId} /><p className="truncate !text-[12px] !text-gray-400"><PartyName db={db} id={container.consigneeId} fallback={container.shipperName || 'No consignee'} /></p></Td>
                      <Td>{call ? <>{call.vessel}<p className="font-mono !text-[12px] !text-gray-400">{call.voyage}</p></> : <span className="text-gray-400">—</span>}</Td>
                      <Td>{container.category === 'import' ? <ClearanceChips container={container} now={now} /> : container.category === 'export' ? <span className="text-[12px] text-gray-500">{container.vgmKg ? 'VGM ' : 'No VGM · '}{CUSTOMS_LABELS[container.customsStatus]}</span> : <span className="text-[12px] text-gray-400">Not applicable</span>}</Td>
                      <Td><ContainerStatusBadge container={container} /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <CardList>
              {list.pageItems.map(container => (
                <Card key={container.id} onClick={() => router.push(`/admin/containers/${container.id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono !text-[14px] !font-semibold !text-primary">{formatContainerNumber(container.number)}</p>
                      <p className="truncate !text-[12px] !text-gray-400">{container.size}{container.type} · {CONTAINER_CATEGORY_LABELS[container.category]} · <PartyName db={db} id={container.consigneeId} fallback={container.shipperName || 'No consignee'} /></p>
                    </div>
                    <ContainerStatusBadge container={container} />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                    <span className="text-[12px] text-gray-500"><LocationName db={db} id={container.locationId} code /> {container.yardPosition ?? ''}</span>
                    {container.category === 'import' ? <ClearanceChips container={container} now={now} /> : <ContainerFlags container={container} />}
                  </div>
                </Card>
              ))}
            </CardList>
            <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
          </>
        )}
      </Panel>
    </motion.div>
  );
}

function BoxIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16v10H4zM4 7l2-3h12l2 3M8 7v10M12 7v10M16 7v10" /></svg>;
}
