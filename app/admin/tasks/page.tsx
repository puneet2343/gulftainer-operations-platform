'use client';

/*
 * Work tasks: discharge and load shifts, reefer rounds, receiving, picking,
 * stock counts, transfers. Created by supervisors or automatically by the
 * services; workers start and complete the ones assigned to them.
 */

import { useMemo, useState } from 'react';
import { useNow } from '@/lib/use-now';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import ListToolbar from '@/components/ui/ListToolbar';
import Pagination from '@/components/ui/Pagination';
import FormDialog from '@/components/ui/FormDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field, StatusBadge } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT } from '@/components/ui/Table';
import { PlusIcon } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { TaskStatusBadge, LocationName, EmployeeName, PanelButton, ActionError } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { canAccessLocation } from '@/lib/ops/core';
import { useList } from '@/lib/use-list';
import { formatDateTime, fromLocalInput } from '@/lib/format';
import type { TaskPriority, TaskType, WorkTask } from '@/lib/ops/types';

const TYPE_LABELS: Record<TaskType, string> = { discharge: 'Discharge', load: 'Load', gate: 'Gate', yard_shift: 'Yard shift', reefer_check: 'Reefer round', receiving: 'Receiving', picking: 'Picking', stock_count: 'Stock count', inspection: 'Inspection', transfer: 'Transfer' };

export default function TasksPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error, clear } = useAction();
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<WorkTask | null>(null);
  const tasks = useMemo(() => db ? [...db.tasks].sort((a, b) => (a.status === 'done' || a.status === 'cancelled' ? 1 : 0) - (b.status === 'done' || b.status === 'cancelled' ? 1 : 0) || a.dueAt.localeCompare(b.dueAt)) : [], [db]);
  const list = useList<WorkTask, { status: string; location: string; mine: string }>(tasks, {
    pageSize: 12,
    initialFilters: { status: 'All', location: 'All', mine: 'All' },
    search: (task, query) => [task.title, task.reference, TYPE_LABELS[task.type]].some(value => value.toLowerCase().includes(query)),
    filter: (task, filters) => (filters.status === 'All' || task.status === filters.status) && (filters.location === 'All' || task.locationId === filters.location) && (filters.mine !== 'mine' || task.assigneeId === actor?.id),
  });
  if (!db || !actor) return <PageSkeleton />;

  const supervisor = ['warehouse_supervisor', 'terminal_ops', 'planner', 'transport_manager', 'inventory_manager', 'gate_officer', 'system_admin'].includes(actor.role);
  const open = tasks.filter(task => ['open', 'in_progress'].includes(task.status));
  const overdue = open.filter(task => new Date(task.dueAt) < new Date());
  const mine = open.filter(task => task.assigneeId === actor.id);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Logistics" title="Tasks" subtitle="Shift work across terminals and warehouses. Vessel, order and transfer tasks are created automatically; supervisors add the rest and assign them." action={supervisor ? <ToolbarButton onClick={() => setCreating(true)}><PlusIcon />New task</ToolbarButton> : undefined} />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Icon />} label="Open" value={open.length} description="across your locations" />
        <StatCard icon={<Icon />} label="In progress" value={open.filter(t => t.status === 'in_progress').length} description="being worked" />
        <StatCard icon={<Icon />} label="Overdue" value={overdue.length} description="past due time" />
        <StatCard icon={<Icon />} label="Assigned to me" value={mine.length} description="open tasks" />
      </section>
      <Panel delay={0.08}>
        <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search tasks" label="Search tasks" count={list.filtered.length} showFilters={list.showFilters} onToggleFilters={() => list.setShowFilters(o => !o)} filters={list.filters}
          groups={[{ key: 'status', label: 'Status', options: [{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In progress' }, { value: 'done', label: 'Done' }, { value: 'cancelled', label: 'Cancelled' }] }, { key: 'location', label: 'Location', options: db.locations.map(l => ({ value: l.id, label: l.code })) }, { key: 'mine', label: 'Assignment', options: [{ value: 'mine', label: 'Assigned to me' }] }]}
          onFilter={(key, value) => list.setFilter(key, value)} onClear={list.clearFilters} hasActiveFilters={list.hasActiveFilters} />
        {error && <div className="px-4 pt-4"><ActionError message={error} /></div>}
        {list.pageItems.length === 0 ? <EmptyState title="No tasks" description="Tasks appear as vessel calls start, orders are created and transfers are planned." /> : (
          <>
            <TableWrap minWidth={900}>
              <THead><Th>Task</Th><Th>Type</Th><Th>Location</Th><Th>Assignee</Th><Th>Due</Th><Th>Status</Th><Th align="right">Action</Th></THead>
              <tbody>
                {list.pageItems.map(task => { const late = ['open', 'in_progress'].includes(task.status) && new Date(task.dueAt) < new Date(); const here = canAccessLocation(actor, task.locationId); const canAct = (supervisor || task.assigneeId === actor.id || !task.assigneeId) && here; return (
                  <Tr key={task.id}>
                    <Td><p className="!text-[13px] !font-semibold !text-secondary">{task.title}</p><p className="font-mono !text-[12px] !text-gray-400">{task.reference}</p></Td>
                    <Td>{TYPE_LABELS[task.type]}</Td>
                    <Td><LocationName db={db} id={task.locationId} code /></Td>
                    <Td><EmployeeName db={db} id={task.assigneeId} /></Td>
                    <Td className="tabular-nums">{formatDateTime(task.dueAt)}{late && <p className="!text-[12px] !font-semibold !text-[#C0352B]">Overdue</p>}</Td>
                    <Td><TaskStatusBadge status={task.status} />{task.priority === 'high' && <StatusBadge variant="danger">High</StatusBadge>}</Td>
                    <Td align="right"><div className="flex justify-end gap-1.5">
                      {supervisor && ['open', 'in_progress'].includes(task.status) && <PanelButton onClick={() => { clear(); setAssigning(task); }}>Assign</PanelButton>}
                      {task.status === 'open' && canAct && <PanelButton disabled={busy} onClick={() => void run(() => ops.setTaskStatus(actor, { taskId: task.id, status: 'in_progress' }), () => toast.success('Task started'))}>Start</PanelButton>}
                      {['open', 'in_progress'].includes(task.status) && canAct && <PanelButton primary disabled={busy} onClick={() => void run(() => ops.setTaskStatus(actor, { taskId: task.id, status: 'done' }), () => toast.success('Task completed'))}>Complete</PanelButton>}
                      {['open', 'in_progress'].includes(task.status) && supervisor && <PanelButton danger disabled={busy} onClick={() => void run(() => ops.setTaskStatus(actor, { taskId: task.id, status: 'cancelled' }), () => toast.success('Task cancelled'))}>Cancel</PanelButton>}
                    </div></Td>
                  </Tr>
                ); })}
              </tbody>
            </TableWrap>
            <CardList>
              {list.pageItems.map(task => (
                <Card key={task.id}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="!text-[13px] !font-semibold !text-secondary">{task.title}</p><p className="!text-[12px] !text-gray-400">{TYPE_LABELS[task.type]} · <LocationName db={db} id={task.locationId} code /> · <EmployeeName db={db} id={task.assigneeId} /></p></div><TaskStatusBadge status={task.status} /></div>
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3"><span className="text-[12px] text-gray-500">Due {formatDateTime(task.dueAt)}</span>{['open', 'in_progress'].includes(task.status) && <PanelButton primary disabled={busy} onClick={() => void run(() => ops.setTaskStatus(actor, { taskId: task.id, status: 'done' }), () => toast.success('Task completed'))}>Complete</PanelButton>}</div>
                </Card>
              ))}
            </CardList>
            <Pagination page={list.page} totalPages={list.totalPages} total={list.filtered.length} pageSize={list.pageSize} onChange={list.setPage} />
          </>
        )}
      </Panel>
      {creating && <TaskDialog onClose={() => setCreating(false)} onDone={() => { setCreating(false); toast.success('Task created'); }} />}
      {assigning && <AssignTaskDialog task={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); toast.success('Task assigned'); }} />}
    </motion.div>
  );
}

function TaskDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const locations = (db?.locations ?? []).filter(l => actor && canAccessLocation(actor, l.id));
  const nowMs = useNow();
  const [form, setForm] = useState({ title: '', type: 'inspection' as TaskType, locationId: locations[0]?.id ?? '', assigneeId: '', priority: 'normal' as TaskPriority, dueAt: '' });
  const dueAt = form.dueAt || new Date(nowMs + 4 * 3600000).toISOString().slice(0, 16);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(c => ({ ...c, [key]: value }));
  const people = (db?.employees ?? []).filter(e => e.active && canAccessLocation(e, form.locationId) && !['integration', 'portal'].includes(e.username));
  return (
    <FormDialog open title="New task" submitLabel="Create task" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.createTask(actor!, { ...form, assigneeId: form.assigneeId || null, dueAt: fromLocalInput(dueAt) }), onDone)}>
      <Field label="Title" id="tk-title"><input id="tk-title" autoFocus className={INPUT} value={form.title} onChange={e => set('title', e.target.value)} /></Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Type" id="tk-type"><select id="tk-type" className={SELECT} value={form.type} onChange={e => set('type', e.target.value as TaskType)}>{(Object.keys(TYPE_LABELS) as TaskType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select></Field>
        <Field label="Location" id="tk-loc"><select id="tk-loc" className={SELECT} value={form.locationId} onChange={e => { set('locationId', e.target.value); set('assigneeId', ''); }}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Assignee" id="tk-assignee"><select id="tk-assignee" className={SELECT} value={form.assigneeId} onChange={e => set('assigneeId', e.target.value)}><option value="">Unassigned</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Priority" id="tk-priority"><select id="tk-priority" className={SELECT} value={form.priority} onChange={e => set('priority', e.target.value as TaskPriority)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></Field>
        <Field label="Due (UTC)" id="tk-due"><input id="tk-due" type="datetime-local" className={INPUT} value={dueAt} onChange={e => set('dueAt', e.target.value)} /></Field>
      </div>
    </FormDialog>
  );
}

function AssignTaskDialog({ task, onClose, onDone }: { task: WorkTask; onClose: () => void; onDone: () => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const people = (db?.employees ?? []).filter(e => e.active && canAccessLocation(e, task.locationId) && !['integration', 'portal'].includes(e.username));
  return (
    <FormDialog open title={`Assign ${task.reference}`} description={task.title} submitLabel="Assign" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.assignTask(actor!, { taskId: task.id, assigneeId: assigneeId || null }), onDone)}>
      <Field label="Assignee" id="as-assignee"><select id="as-assignee" className={SELECT} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}><option value="">Unassigned</option>{people.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role.replace(/_/g, ' ')}</option>)}</select></Field>
    </FormDialog>
  );
}

function Icon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>;
}
