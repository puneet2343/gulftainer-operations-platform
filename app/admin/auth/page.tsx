'use client';

/*
 * Users and roles: every account with its role and the locations it may operate
 * in, plus the permission matrix. Any seeded login ID signs in with any password
 * in this prototype; the roles drive what each person can see and do.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import Tabs from '@/components/ui/Tabs';
import FormDialog from '@/components/ui/FormDialog';
import { Field, StatusBadge, Avatar, IconButton } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT } from '@/components/ui/Table';
import { PlusIcon, EditIcon } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { ROLE_PERMISSIONS, ADMIN_PERMISSION_ROUTES, type AdminPermission } from '@/lib/admin-session';
import { formatDate } from '@/lib/format';
import { ROLE_LABELS, type Employee, type Role } from '@/lib/ops/types';

const MODULE_LABELS: Record<AdminPermission, string> = { dashboard: 'Dashboard', vessels: 'Vessel calls', containers: 'Containers', gate: 'Gate and e-tokens', transfers: 'Inland transfers', transport: 'Transport jobs', inventory: 'Inventory', warehouse: 'Warehouse orders', tasks: 'Tasks', customers: 'Customers', documents: 'Documents', finance: 'Finance', notifications: 'Notifications', reports: 'Reports', audit: 'Audit log', sync: 'Sync and integrations', network: 'Network', auth: 'Users and roles', design: 'Design system' };

const ROLE_DUTIES: Record<Role, string> = {
  system_admin: 'Configures the network, users and settings; unrestricted access for support.',
  terminal_ops: 'Duty superintendent: vessel operations, discharge and load, yard, holds, inland transfers.',
  planner: 'Ship and yard planning: vessel calls, pre-arrival documents, container registration.',
  gate_officer: 'Marshalling yard and gate: e-token arrivals, gate-in, gate-out, equipment interchange.',
  customer_service: 'Documentation desk: customs, delivery orders, holds, hauliers, e-tokens, online collection.',
  warehouse_worker: 'Receiving, picking and stock transfers at assigned Momentum warehouses.',
  warehouse_supervisor: 'Warehouse shift supervision, task assignment, adjustment requests and approvals.',
  inventory_manager: 'Stock accuracy: SKUs, orders, adjustments, reversals, approvals.',
  transport_manager: 'Momentum fleet: transport jobs, inland transfer dispatch, delays.',
  finance_manager: 'Charges, invoices, payments and the tariff.',
  auditor: 'Read-only access to records, ledgers, documents and the audit log.',
};

export default function UsersPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  if (!db || !actor) return <PageSkeleton />;
  const people = db.employees.filter(e => !['integration', 'portal'].includes(e.username)).sort((a, b) => a.name.localeCompare(b.name));
  const isAdmin = actor.role === 'system_admin';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Administration" title="Users and roles" subtitle="Access is restricted by role, organisation and location. The prototype signs in with the single operations account; the other accounts are the employees who appear on tasks, events and approvals." action={isAdmin ? <ToolbarButton onClick={() => setEditing('new')}><PlusIcon />New user</ToolbarButton> : undefined} />
      <Panel>
        <Tabs tabs={[{ id: 'users', label: 'Users' }, { id: 'roles', label: 'Roles and permissions' }]} value={tab} onChange={setTab} counts={{ users: people.length }} />
        {tab === 'users' && (
          <>
            <TableWrap minWidth={980}>
              <THead><Th>User</Th><Th>Login ID</Th><Th>Role</Th><Th>Entity</Th><Th>Locations</Th><Th>Since</Th><Th>Status</Th><Th align="right">Edit</Th></THead>
              <tbody>{people.map(person => (
                <Tr key={person.id}>
                  <Td><div className="flex items-center gap-2.5"><Avatar name={person.name} /><div><p className="!text-[13px] !font-semibold !text-secondary">{person.name}</p><p className="!text-[12px] !text-gray-400">{person.email}</p></div></div></Td>
                  <Td><span className="font-mono text-[13px]">{person.username}</span></Td>
                  <Td>{ROLE_LABELS[person.role]}</Td>
                  <Td>{db.organizations.find(o => o.id === person.orgId)?.code}</Td>
                  <Td className="text-[12px]">{person.role === 'system_admin' ? 'All locations' : person.locationIds.length === 0 ? <span className="text-gray-400">No location scope</span> : person.locationIds.map(id => db.locations.find(l => l.id === id)?.code).join(', ')}</Td>
                  <Td className="tabular-nums">{formatDate(person.createdAt)}</Td>
                  <Td><StatusBadge variant={person.active ? 'success' : 'neutral'} dot>{person.active ? 'Active' : 'Deactivated'}</StatusBadge></Td>
                  <Td align="right">{isAdmin && <IconButton title="Edit" onClick={() => setEditing(person)}><EditIcon /></IconButton>}</Td>
                </Tr>
              ))}</tbody>
            </TableWrap>
            <CardList>{people.map(person => <Card key={person.id} onClick={isAdmin ? () => setEditing(person) : undefined}><div className="flex items-center gap-3"><Avatar name={person.name} large /><div className="min-w-0 flex-1"><p className="!text-[14px] !font-semibold !text-secondary">{person.name}</p><p className="!text-[12px] !text-gray-400">{person.username} · {ROLE_LABELS[person.role]}</p></div></div></Card>)}</CardList>
          </>
        )}
        {tab === 'roles' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[12px]">
              <thead><tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="sticky left-0 bg-white px-4 py-3">Module</th>{(Object.keys(ROLE_LABELS) as Role[]).map(role => <th key={role} className="px-2 py-3 text-center"><span className="block">{ROLE_LABELS[role]}</span></th>)}</tr></thead>
              <tbody>
                {(Object.keys(ADMIN_PERMISSION_ROUTES) as AdminPermission[]).map(module => (
                  <tr key={module} className="border-b border-gray-100 last:border-0">
                    <td className="sticky left-0 bg-white px-4 py-2 font-medium text-secondary">{MODULE_LABELS[module]}</td>
                    {(Object.keys(ROLE_LABELS) as Role[]).map(role => { const allowed = ROLE_PERMISSIONS[role].includes(module) && !(['auth', 'network'].includes(module) && role !== 'system_admin'); return <td key={role} className="px-2 py-2 text-center">{allowed ? <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" aria-label="Allowed" /> : <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-100" aria-label="Not allowed" />}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid gap-3 border-t border-gray-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(ROLE_LABELS) as Role[]).map(role => <div key={role} className="rounded-xl bg-gray-50 p-3.5"><p className="!text-[13px] !font-semibold !text-secondary">{ROLE_LABELS[role]}</p><p className="!text-[12px] !text-gray-500">{ROLE_DUTIES[role]}</p><p className="mt-1 !text-[12px] !text-gray-400">{people.filter(p => p.role === role).map(p => p.username).join(', ') || 'No accounts'}</p></div>)}
            </div>
          </div>
        )}
      </Panel>
      <Panel delay={0.1}>
        <SectionHeader title="Action-level rules enforced by the services" description="Independent of the module matrix" />
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-[13px] text-gray-600 sm:grid-cols-2 sm:p-5">
          <li>Operations at a location require that location in the user&apos;s scope.</li>
          <li>Stock adjustments at or above the threshold need a second approver; nobody approves their own request.</li>
          <li>Ledger reversals are limited to inventory managers; reversals cannot be reversed.</li>
          <li>Customs holds are released by the customs message, not by hand.</li>
          <li>E-tokens cannot be deleted after the truck enters the marshalling yard.</li>
          <li>Invoice status follows draft, issued, partially paid, paid, overdue, cancelled; paid invoices settle containers.</li>
          <li>Documents of legally significant types are append-only; auditors are read-only everywhere.</li>
          <li>Every write is idempotent where a device may retry: gate, receiving, picking, discharge, load, transfer.</li>
        </ul>
      </Panel>
      {editing && <UserDialog person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast.success('User saved'); }} />}
    </motion.div>
  );
}

function UserDialog({ person, onClose, onDone }: { person: Employee | null; onClose: () => void; onDone: () => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [form, setForm] = useState({ username: person?.username ?? '', name: person?.name ?? '', email: person?.email ?? '', role: person?.role ?? 'warehouse_worker' as Role, orgId: person?.orgId ?? db?.organizations[0]?.id ?? '', locationIds: person?.locationIds ?? [], active: person?.active ?? true });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(c => ({ ...c, [key]: value }));
  return (
    <FormDialog open wide title={person ? `Edit ${person.name}` : 'New user'} description="Role decides the modules; locations decide where operations are allowed." submitLabel="Save" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.upsertEmployee(actor!, { ...form, id: person?.id }), onDone)}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Name" id="us-name"><input id="us-name" autoFocus className={INPUT} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Login ID" id="us-login"><input id="us-login" className={`${INPUT} font-mono lowercase`} value={form.username} onChange={e => set('username', e.target.value)} /></Field>
        <Field label="Email" id="us-email"><input id="us-email" type="email" className={INPUT} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Role" id="us-role"><select id="us-role" className={SELECT} value={form.role} onChange={e => set('role', e.target.value as Role)}>{(Object.keys(ROLE_LABELS) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
        <Field label="Entity" id="us-org"><select id="us-org" className={SELECT} value={form.orgId} onChange={e => set('orgId', e.target.value)}>{db?.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
      </div>
      <fieldset className="form-group">
        <legend className="form-label">Locations</legend>
        <div className="flex flex-wrap gap-2">{db?.locations.map(location => { const selected = form.locationIds.includes(location.id); return <button key={location.id} type="button" aria-pressed={selected} onClick={() => set('locationIds', selected ? form.locationIds.filter(id => id !== location.id) : [...form.locationIds, location.id])} className={`min-h-[34px] rounded-lg border px-3 text-[12px] font-semibold transition-all ${selected ? 'border-primary/25 bg-primary/[0.07] text-primary' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>{location.code}</button>; })}</div>
      </fieldset>
      <label className="inline-flex items-center gap-2 text-[13px] text-secondary"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={form.active} onChange={e => set('active', e.target.checked)} />Active</label>
    </FormDialog>
  );
}
