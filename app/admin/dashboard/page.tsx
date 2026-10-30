'use client';

/*
 * Operations overview: what needs attention now across the network, the vessel
 * programme for the next 72 hours, yard utilisation per terminal and the Momentum
 * logistics position. Every figure is computed from the operations database.
 */

import { useMemo, useState } from 'react';
import { useNow } from '@/lib/use-now';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader, { RefreshButton } from '@/components/ui/PageHeader';
import QuickActionCard from '@/components/ui/QuickActionCard';
import { DashboardStat } from '@/components/ui/StatCard';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import { Progress } from '@/components/ui/KeyValue';
import { PageSkeleton } from '@/components/ui/Skeletons';
import EmptyState from '@/components/ui/EmptyState';
import { PlusIcon, SearchIcon, DownloadIcon, LocationIcon } from '@/components/ui/Icons';
import { StatusBadge } from '@/components/ui/Controls';
import { VesselStatusBadge, ContainerLink } from '@/components/admin/Shared';
import { useOps } from '@/lib/ops/use-ops';
import { ops, activeHolds, isReadyForPickup, uncollectedContainers, notificationsFor } from '@/lib/ops/ops';
import { formatDateTime, formatTime, relativeTime, formatMoney } from '@/lib/format';
import { hasAdminPermission } from '@/lib/admin-session';
import { useAdminSession } from '@/components/admin/AdminSessionContext';

export default function DashboardPage() {
  const { db, actor } = useOps();
  const session = useAdminSession();
  const [refreshing, setRefreshing] = useState(false);
  const nowMs = useNow();
  const now = new Date(nowMs).toISOString();

  const view = useMemo(() => {
    if (!db || !actor) return null;
    const scope = actor.role === 'system_admin' || actor.locationIds.length === 0 ? db.locations.map(location => location.id) : actor.locationIds;
    const inScope = (locationId: string | null) => !locationId || scope.includes(locationId);
    const containers = db.containers.filter(container => inScope(container.locationId));
    const inYard = containers.filter(container => container.status === 'in_yard');
    const ready = inYard.filter(container => container.category === 'import' && isReadyForPickup(container, now));
    const onHold = inYard.filter(container => activeHolds(container).length > 0);
    const uncollected = uncollectedContainers(db, now).filter(container => inScope(container.locationId));
    const calls = db.vesselCalls.filter(call => inScope(call.terminalId));
    const horizon = nowMs + 72 * 3600 * 1000;
    const programme = calls.filter(call => ['berthed', 'working'].includes(call.status) || (call.status === 'expected' && new Date(call.etb).getTime() <= horizon))
      .sort((a, b) => new Date(a.etb).getTime() - new Date(b.etb).getTime());
    const tokensToday = db.tokens.filter(token => inScope(token.locationId) && token.slotStart.slice(0, 10) === now.slice(0, 10));
    const pendingApprovals = db.approvals.filter(approval => approval.status === 'pending');
    const rejectedQueue = db.offlineQueue.filter(item => item.status === 'rejected');
    const overdue = db.invoices.filter(invoice => invoice.status === 'overdue');
    const reeferAlerts = inYard.filter(container => container.reefer && !container.reefer.plugged);
    const jobsEnRoute = db.transportJobs.filter(job => job.status === 'en_route');
    const openOrders = db.warehouseOrders.filter(order => ['expected', 'allocated', 'picked'].includes(order.status) && inScope(order.locationId));
    const terminals = db.locations.filter(location => location.type === 'terminal' && scope.includes(location.id)).map(location => {
      const boxes = db.containers.filter(container => container.locationId === location.id && container.status === 'in_yard');
      const teu = boxes.reduce((sum, container) => sum + (container.size === '20' ? 1 : 2), 0);
      const reefers = boxes.filter(container => container.reefer?.plugged).length;
      return { location, boxes: boxes.length, teu, reefers };
    });
    const unread = notificationsFor(db, actor).filter(notification => !notification.readBy.includes(actor.id)).slice(-6).reverse();
    const recentAudit = [...db.audit].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8);
    const attention = [
      ...uncollected.map(container => ({ id: `u-${container.id}`, tone: 'warning' as const, title: `${container.number} uncollected beyond ${db.tariff.uncollectedTransferDays} days`, href: `/admin/containers/${container.id}`, meta: db.locations.find(l => l.id === container.locationId)?.name ?? '' })),
      ...onHold.map(container => ({ id: `h-${container.id}`, tone: 'danger' as const, title: `${container.number}: ${activeHolds(container).map(hold => hold.type.replace('_', ' ')).join(', ')} hold`, href: `/admin/containers/${container.id}`, meta: activeHolds(container)[0]?.reason ?? '' })),
      ...reeferAlerts.map(container => ({ id: `r-${container.id}`, tone: 'danger' as const, title: `Reefer ${container.number} not plugged`, href: `/admin/containers/${container.id}`, meta: `Setpoint ${container.reefer?.setpointC} °C` })),
      ...pendingApprovals.map(approval => ({ id: `a-${approval.id}`, tone: 'warning' as const, title: `${approval.reference} awaiting a second approver`, href: '/admin/inventory?tab=adjustments', meta: approval.payload.reason })),
      ...rejectedQueue.map(item => ({ id: `q-${item.clientId}`, tone: 'danger' as const, title: `Offline operation rejected: ${item.summary}`, href: '/admin/sync', meta: item.error ?? '' })),
      ...overdue.map(invoice => ({ id: `i-${invoice.id}`, tone: 'danger' as const, title: `${invoice.reference} overdue, ${formatMoney(invoice.total - invoice.paid, invoice.currency)} outstanding`, href: `/admin/finance/${invoice.id}`, meta: db.parties.find(party => party.id === invoice.partyId)?.name ?? '' })),
    ];
    return { inYard, ready, onHold, uncollected, programme, tokensToday, pendingApprovals, terminals, unread, recentAudit, attention, jobsEnRoute, openOrders, overdue };
  }, [db, actor, now, nowMs]);

  if (!db || !actor || !view) return <PageSkeleton />;

  const can = (permission: Parameters<typeof hasAdminPermission>[1]) => hasAdminPermission(session, permission);
  const quickActions = [
    can('containers') && { href: '/admin/containers/new', title: 'Register container', description: 'Import, export, transhipment or empty', icon: <PlusIcon /> },
    can('gate') && { href: '/admin/gate', title: 'Process gate', description: 'E-tokens, marshalling yard, gate in and out', icon: <GateIcon /> },
    can('warehouse') && { href: '/admin/warehouse', title: 'Warehouse orders', description: 'Receive, allocate and pick', icon: <SearchIcon /> },
    can('transport') && { href: '/admin/transport', title: 'Transport jobs', description: 'Momentum fleet dispatch', icon: <TruckIcon /> },
    can('reports') && { href: '/admin/reports', title: 'Reports', description: 'Yard, gate, finance and inventory', icon: <DownloadIcon /> },
    can('customers') && { href: '/admin/customers', title: 'Customers', description: 'Lines, consignees, hauliers', icon: <SearchIcon /> },
  ].filter(Boolean).slice(0, 4) as { href: string; title: string; description: string; icon: React.ReactNode }[];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden sm:space-y-5 lg:space-y-6">
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${actor.name.split(' ')[0]}`}
        subtitle={`${actor.locationIds.length === 0 || actor.role === 'system_admin' ? 'Network-wide view' : `${actor.locationIds.length} location${actor.locationIds.length === 1 ? '' : 's'} in your scope`}. Figures are live from the operations database and update as colleagues work.`}
        action={<RefreshButton refreshing={refreshing} onClick={() => { setRefreshing(true); try { ops.runHousekeeping(actor); } catch { /* best effort */ } window.setTimeout(() => setRefreshing(false), 600); }} label="Refresh" />}
      />

      {quickActions.length > 0 && (
        <Panel>
          <div className={`grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x lg:divide-y-0 ${quickActions.length === 4 ? 'lg:grid-cols-4' : quickActions.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
            {quickActions.map((action, index) => <QuickActionCard key={action.href} index={index} {...action} />)}
          </div>
        </Panel>
      )}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <DashboardStat index={0} label="Containers in yard" value={view.inYard.length} description={`${view.inYard.reduce((sum, c) => sum + (c.size === '20' ? 1 : 2), 0).toLocaleString()} TEU across your terminals`} icon={<BoxIcon />} highlight />
        <DashboardStat index={1} label="Ready for pick-up" value={view.ready.length} description={`${view.tokensToday.length} e-token${view.tokensToday.length === 1 ? '' : 's'} booked for today`} icon={<GateIcon />} />
        <DashboardStat index={2} label="Needs attention" value={view.attention.length} description={`${view.onHold.length} on hold, ${view.uncollected.length} uncollected`} icon={<AlertIcon />} />
        <DashboardStat index={3} label="Vessels in programme" value={view.programme.length} description={`${view.programme.filter(call => call.status === 'working').length} working now`} icon={<ShipIcon />} />
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3 lg:gap-6">
        <Panel className="xl:col-span-2" delay={0.1}>
          <SectionHeader title="Vessel programme" description="On berth, working, and arrivals in the next 72 hours" href="/admin/vessels" linkText="All vessel calls" />
          {view.programme.length === 0 ? <EmptyState title="No vessels in the next 72 hours" description="Calls appear here once the planner creates them." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-400">
                    <th className="px-4 py-3">Vessel</th>
                    <th className="px-4 py-3">Terminal</th>
                    <th className="px-4 py-3">ETB</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {view.programme.map(call => {
                    const terminal = db.locations.find(location => location.id === call.terminalId);
                    const total = call.plannedDischarge + call.plannedLoad;
                    const done = call.discharged + call.loaded;
                    return (
                      <tr key={call.id} className="border-b border-gray-100 text-[13px] transition-colors last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link href={`/admin/vessels/${call.id}`} className="!text-[13px] !font-semibold text-primary">{call.vessel}</Link>
                          <p className="mt-0.5 font-mono !text-[12px] !text-gray-400">{call.voyage} · berth {call.berth}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{terminal?.code}</td>
                        <td className="px-4 py-3 tabular-nums text-gray-500">{formatDateTime(call.etb)}</td>
                        <td className="w-44 px-4 py-3"><Progress value={done} max={total} label={`${done}/${total} moves`} tone={call.status === 'working' ? 'success' : 'primary'} /></td>
                        <td className="px-4 py-3"><VesselStatusBadge status={call.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel delay={0.15}>
          <SectionHeader title="Needs attention" description={`${view.attention.length} open item${view.attention.length === 1 ? '' : 's'}`} href="/admin/notifications" linkText="Notifications" />
          {view.attention.length === 0 ? <EmptyState title="Nothing outstanding" description="Holds, uncollected boxes, reefer alerts, approvals and failed sync items appear here." /> : (
            <ul className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
              {view.attention.slice(0, 12).map((item, index) => (
                <motion.li key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + index * 0.04, duration: 0.4 }}>
                  <Link href={item.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.tone === 'danger' ? 'bg-[#C0352B]' : 'bg-[#B7791F]'}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-secondary">{item.title}</span>
                      {item.meta && <span className="block truncate text-[12px] text-gray-400">{item.meta}</span>}
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3 lg:gap-6">
        <Panel delay={0.18}>
          <SectionHeader title="Yard utilisation" description="Containers in yard against design capacity" href="/admin/reports" linkText="Reports" />
          <ul className="divide-y divide-gray-100">
            {view.terminals.map(entry => (
              <li key={entry.location.id} className="px-4 py-3.5">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <p className="truncate !text-[13px] !font-semibold !text-secondary">{entry.location.name}</p>
                  <span className="shrink-0 text-[12px] tabular-nums text-gray-500">{entry.teu.toLocaleString()} / {(entry.location.yardCapacityTeu ?? 0).toLocaleString()} TEU</span>
                </div>
                <Progress value={entry.teu} max={entry.location.yardCapacityTeu ?? 1} tone={entry.teu / (entry.location.yardCapacityTeu ?? 1) > 0.85 ? 'danger' : 'primary'} />
                <p className="mt-1 !text-[12px] !text-gray-400">{entry.boxes} containers · {entry.reefers} of {entry.location.reeferPlugs ?? 0} reefer plugs in use</p>
              </li>
            ))}
            {view.terminals.length === 0 && <li><EmptyState title="No terminals in scope" description="Your account is not assigned to a container terminal." /></li>}
          </ul>
        </Panel>

        <Panel delay={0.22}>
          <SectionHeader title="Logistics" description="Momentum transport and warehouse position" href="/admin/transport" linkText="Transport" />
          <ul className="divide-y divide-gray-100">
            <li className="flex items-center justify-between px-4 py-3.5"><span className="text-[13px] text-gray-600">Trucks en route</span><span className="font-heading text-[18px] font-bold text-secondary">{view.jobsEnRoute.length}</span></li>
            <li className="flex items-center justify-between px-4 py-3.5"><span className="text-[13px] text-gray-600">Open warehouse orders</span><span className="font-heading text-[18px] font-bold text-secondary">{view.openOrders.length}</span></li>
            <li className="flex items-center justify-between px-4 py-3.5"><span className="text-[13px] text-gray-600">Adjustments awaiting approval</span><span className="font-heading text-[18px] font-bold text-secondary">{view.pendingApprovals.length}</span></li>
            <li className="flex items-center justify-between px-4 py-3.5"><span className="text-[13px] text-gray-600">Overdue invoices</span><span className="font-heading text-[18px] font-bold text-secondary">{view.overdue.length}</span></li>
          </ul>
          <div className="border-t border-gray-100 px-4 py-3">
            {view.jobsEnRoute.slice(0, 3).map(job => (
              <p key={job.id} className="flex items-center gap-1 truncate !text-[12px] !text-gray-500"><LocationIcon /><Link href="/admin/transport" className="truncate">{job.reference} · {job.tractor} · {job.destinationAddress || db.locations.find(l => l.id === job.toLocationId)?.name}</Link></p>
            ))}
          </div>
        </Panel>

        <Panel delay={0.26}>
          <SectionHeader title="Recent activity" description="Latest audit entries" href="/admin/audit" linkText="Audit log" />
          <ul className="divide-y divide-gray-100">
            {view.recentAudit.map(entry => (
              <li key={entry.id} className="px-4 py-3">
                <p className="truncate !text-[13px] !text-secondary">{entry.action.replace(/[._]/g, ' ')} <span className="font-mono text-[12px] text-primary">{entry.entityRef}</span></p>
                <p className="!text-[12px] !text-gray-400">{entry.actorName} · {relativeTime(entry.timestamp)} · {formatTime(entry.timestamp)} UTC</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {view.ready.length > 0 && (
        <Panel delay={0.3}>
          <SectionHeader title="Ready for pick-up" description="Cleared, delivery order on file, charges settled" href="/admin/containers?ready=1" linkText="All containers" />
          <ul className="grid grid-cols-1 divide-y divide-gray-100 md:grid-cols-2 md:divide-x xl:grid-cols-3">
            {view.ready.slice(0, 6).map(container => (
              <li key={container.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <ContainerLink container={container} />
                  <p className="truncate !text-[12px] !text-gray-400">{db.parties.find(party => party.id === container.consigneeId)?.name} · {db.locations.find(l => l.id === container.locationId)?.code} {container.yardPosition}</p>
                </div>
                {container.tokenId ? <StatusBadge variant="info">E-token issued</StatusBadge> : container.haulierId ? <StatusBadge variant="warning">Awaiting e-token</StatusBadge> : <StatusBadge variant="neutral">No haulier</StatusBadge>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </motion.div>
  );
}

function GateIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 21V5a1 1 0 011-1h3v17M16 21V4h3a1 1 0 011 1v16M8 9h8M8 13h8M8 17h8" /></svg>;
}
function ShipIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 17l1.5 3h15L21 17M4 17l-1-4 9-3 9 3-1 4M6 13V9h12v4M10 9V5h4v4" /></svg>;
}
function BoxIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16v10H4zM4 7l2-3h12l2 3M8 7v10M12 7v10M16 7v10" /></svg>;
}
function AlertIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>;
}
function TruckIcon() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16V8a1 1 0 011-1h10v9M14 10h4l3 3v3h-7M5 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z" /></svg>;
}
