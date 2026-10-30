'use client';

/*
 * In-application notifications for the signed-in role: vessel events, container
 * readiness, holds, e-tokens, gate-outs, discrepancies, approvals, integration
 * failures, overdue invoices. Each one links to the record it is about.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import Tabs from '@/components/ui/Tabs';
import EmptyState from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { useToast } from '@/components/ui/Toast';
import { useOps } from '@/lib/ops/use-ops';
import { ops, notificationsFor } from '@/lib/ops/ops';
import { formatDateTime, relativeTime } from '@/lib/format';
import type { Notification, Severity } from '@/lib/ops/types';

type Tab = 'unread' | 'all';

export default function NotificationsPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('unread');
  const [severity, setSeverity] = useState<Severity | 'All'>('All');
  const items = useMemo(() => db && actor ? notificationsFor(db, actor).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [], [db, actor]);
  if (!db || !actor) return <PageSkeleton />;
  const unread = items.filter(n => !n.readBy.includes(actor.id));
  const shown = (tab === 'unread' ? unread : items).filter(n => severity === 'All' || n.severity === severity);
  const href = (n: Notification) => {
    if (!n.entity) return null;
    const map: Record<string, string> = { container: `/admin/containers/${n.entity.id}`, vessel_call: `/admin/vessels/${n.entity.id}`, token: '/admin/gate', order: '/admin/warehouse', approval: '/admin/inventory?tab=adjustments', movement: '/admin/inventory?tab=ledger', document: '/admin/documents', invoice: `/admin/finance/${n.entity.id}`, transfer: '/admin/transfers', transport_job: '/admin/transport' };
    return map[n.entity.kind] ?? null;
  };
  const dot: Record<Severity, string> = { info: 'bg-primary', success: 'bg-[#1F8F6E]', warning: 'bg-[#B7791F]', danger: 'bg-[#C0352B]' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Control" title="Notifications" subtitle={`Operational alerts addressed to ${actor.role === 'system_admin' ? 'every role' : `the ${actor.role.replace(/_/g, ' ')} role`}. They are written in the same transaction as the business change and published through the outbox.`} action={unread.length > 0 ? <ToolbarButton variant="secondary" onClick={() => { ops.markNotificationsRead(actor, 'all'); toast.success('All notifications marked as read'); }}>Mark all as read</ToolbarButton> : undefined} />
      <Panel>
        <Tabs tabs={[{ id: 'unread', label: 'Unread' }, { id: 'all', label: 'All' }]} value={tab} onChange={setTab} counts={{ unread: unread.length, all: items.length }} />
        <div className="flex flex-wrap gap-2 border-b border-gray-100 px-3 py-3 sm:px-4">
          {(['All', 'danger', 'warning', 'success', 'info'] as const).map(option => <button key={option} type="button" aria-pressed={severity === option} onClick={() => setSeverity(option)} className={`min-h-[34px] rounded-lg border px-3 text-[12px] font-semibold capitalize transition-all ${severity === option ? 'border-primary/25 bg-primary/[0.07] text-primary' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-secondary'}`}>{option === 'All' ? 'All severities' : option === 'danger' ? 'Critical' : option}</button>)}
        </div>
        {shown.length === 0 ? <EmptyState title={tab === 'unread' ? 'Nothing unread' : 'No notifications'} description="Alerts appear here as vessels, containers, stock and invoices change." /> : (
          <ul className="divide-y divide-gray-100">
            {shown.map((n, index) => { const link = href(n); const read = n.readBy.includes(actor.id); const body = (
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot[n.severity]} ${read ? 'opacity-40' : ''}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className={`!text-[13px] ${read ? '!text-gray-600' : '!font-semibold !text-secondary'}`}>{n.title}</p>
                  <p className="!text-[13px] !leading-5 !text-gray-500">{n.body}</p>
                  <p className="mt-0.5 !text-[12px] !text-gray-400">{relativeTime(n.createdAt)} · {formatDateTime(n.createdAt)} UTC{n.audience.length ? ` · ${n.audience.map(r => r.replace(/_/g, ' ')).join(', ')}` : ''}</p>
                </div>
                {!read && <button type="button" onClick={event => { event.preventDefault(); ops.markNotificationsRead(actor, [n.id]); }} className="shrink-0 text-[12px] font-semibold text-primary hover:text-primary-dark">Mark read</button>}
              </div>
            ); return (
              <motion.li key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.03 }} className={read ? '' : 'bg-primary/[0.02]'}>
                {link ? <Link href={link} onClick={() => ops.markNotificationsRead(actor, [n.id])} className="block px-4 py-3.5 transition-colors hover:bg-gray-50">{body}</Link> : <div className="px-4 py-3.5">{body}</div>}
              </motion.li>
            ); })}
          </ul>
        )}
      </Panel>
    </motion.div>
  );
}
