'use client';

/*
 * Network: Gulftainer's operating entities and every terminal, inland depot,
 * logistics centre and warehouse with its capacity facts, time zone and hours.
 * System administrators add and edit locations; settings for approvals and
 * low-stock alerts live here too.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

import PageHeader, { ToolbarButton } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import FormDialog from '@/components/ui/FormDialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Field, StatusBadge, IconButton } from '@/components/ui/Controls';
import { Progress } from '@/components/ui/KeyValue';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { TableWrap, THead, Th, Tr, Td, CardList, Card, INPUT, SELECT } from '@/components/ui/Table';
import { PlusIcon, EditIcon } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { PanelButton, PanelBody, ActionError } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { resetDB } from '@/lib/ops/store';
import { LOCATION_TYPE_LABELS, type Location, type LocationType } from '@/lib/ops/types';

export default function NetworkPage() {
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error } = useAction();
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  const [resetting, setResetting] = useState(false);
  const [settings, setSettings] = useState<{ lowStockThreshold?: number; adjustmentApprovalThreshold?: number }>({});
  if (!db || !actor) return <PageSkeleton />;
  const isAdmin = actor.role === 'system_admin';
  const teu = (locationId: string) => db.containers.filter(c => c.locationId === locationId && c.status === 'in_yard').reduce((s, c) => s + (c.size === '20' ? 1 : 2), 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Administration" title="Network and locations" subtitle="Gulftainer's terminals in the UAE, Iraq, Saudi Arabia and the United States, the inland depots and logistics centres of GT Logistics, and the Momentum warehouses. Permissions are granted per location." action={isAdmin ? <ToolbarButton onClick={() => setEditing('new')}><PlusIcon />New location</ToolbarButton> : undefined} />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Icon />} label="Terminals" value={db.locations.filter(l => l.type === 'terminal').length} description={`${new Set(db.locations.filter(l => l.type === 'terminal').map(l => l.country)).size} countries`} />
        <StatCard icon={<Icon />} label="Inland depots" value={db.locations.filter(l => ['inland_depot', 'logistics_centre'].includes(l.type)).length} description={`${db.locations.filter(l => l.bonded && l.type !== 'warehouse').length} bonded`} />
        <StatCard icon={<Icon />} label="Warehouses" value={db.locations.filter(l => l.type === 'warehouse').length} description={`${db.locations.filter(l => l.type === 'warehouse').reduce((s, l) => s + (l.warehouseSqm ?? 0), 0).toLocaleString()} sqm`} />
        <StatCard icon={<Icon />} label="Yard capacity" value={`${(db.locations.reduce((s, l) => s + (l.yardCapacityTeu ?? 0), 0) / 1000).toFixed(0)}k`} description="TEU across the network" />
      </section>

      <Panel delay={0.06}>
        <SectionHeader title="Operating entities" description="Organisations and the platform each belongs to" />
        <ul className="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x lg:grid-cols-3">
          {db.organizations.map(org => <li key={org.id} className="px-4 py-3.5"><p className="!text-[13px] !font-semibold !text-secondary">{org.name}</p><p className="!text-[12px] !text-gray-400">{org.code} · {org.country} · {org.platform}</p><p className="mt-1 !text-[12px] !text-gray-500">{db.locations.filter(l => l.orgId === org.id).length} location{db.locations.filter(l => l.orgId === org.id).length === 1 ? '' : 's'} · {db.employees.filter(e => e.orgId === org.id && e.active && !['integration', 'portal'].includes(e.username)).length} users</p></li>)}
        </ul>
      </Panel>

      <Panel delay={0.1}>
        <SectionHeader title="Locations" description={`${db.locations.length} locations`} />
        <TableWrap minWidth={1040}>
          <THead><Th>Location</Th><Th>Type</Th><Th>Country</Th><Th>Hours and time zone</Th><Th>Capacity</Th><Th>Yard now</Th><Th>Status</Th><Th align="right">Edit</Th></THead>
          <tbody>{db.locations.map(location => (
            <Tr key={location.id}>
              <Td><p className="!text-[13px] !font-semibold !text-secondary">{location.name}</p><p className="font-mono !text-[12px] !text-gray-400">{location.code} · {db.organizations.find(o => o.id === location.orgId)?.code}</p></Td>
              <Td>{LOCATION_TYPE_LABELS[location.type]}{location.bonded && <p className="!text-[12px] !text-gray-400">Bonded</p>}</Td>
              <Td>{location.city}<p className="!text-[12px] !text-gray-400">{location.country}</p></Td>
              <Td>{location.operatingHours}<p className="!text-[12px] !text-gray-400">{location.timezone}</p></Td>
              <Td className="text-[12px]">{location.berths ? `${location.berths} berths · ${location.quayLengthM} m quay · ${location.draftM} m draft` : ''}{location.yardCapacityTeu ? <p>{location.yardCapacityTeu.toLocaleString()} TEU · {location.reeferPlugs} reefer plugs</p> : null}{location.warehouseSqm ? <p>{location.warehouseSqm.toLocaleString()} sqm warehouse</p> : null}</Td>
              <Td className="w-40">{location.yardCapacityTeu ? <Progress value={teu(location.id)} max={location.yardCapacityTeu} label={`${teu(location.id).toLocaleString()} TEU`} /> : <span className="text-gray-400">—</span>}</Td>
              <Td><StatusBadge variant={location.active ? 'success' : 'neutral'} dot>{location.active ? 'Active' : 'Inactive'}</StatusBadge></Td>
              <Td align="right">{isAdmin && <IconButton title="Edit" onClick={() => setEditing(location)}><EditIcon /></IconButton>}</Td>
            </Tr>
          ))}</tbody>
        </TableWrap>
        <CardList>{db.locations.map(location => <Card key={location.id} onClick={isAdmin ? () => setEditing(location) : undefined}><p className="!text-[13px] !font-semibold !text-secondary">{location.name}</p><p className="!text-[12px] !text-gray-400">{location.code} · {LOCATION_TYPE_LABELS[location.type]} · {location.city}, {location.country}</p></Card>)}</CardList>
      </Panel>

      {isAdmin && (
        <Panel delay={0.14}>
          <SectionHeader title="System settings" description="Thresholds and the demonstration data" />
          <PanelBody>
            <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Adjustment approval threshold (units)" id="st-approval" hint="Stock adjustments at or above this need a second person"><input id="st-approval" type="number" min={1} className={INPUT} value={settings.adjustmentApprovalThreshold ?? db.settings.adjustmentApprovalThreshold} onChange={e => setSettings(s => ({ ...s, adjustmentApprovalThreshold: Number(e.target.value) }))} /></Field>
              <Field label="Low stock alert threshold (units)" id="st-low"><input id="st-low" type="number" min={1} className={INPUT} value={settings.lowStockThreshold ?? db.settings.lowStockThreshold} onChange={e => setSettings(s => ({ ...s, lowStockThreshold: Number(e.target.value) }))} /></Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PanelButton primary disabled={busy || Object.keys(settings).length === 0} onClick={() => void run(() => ops.updateSettings(actor, settings), () => { setSettings({}); toast.success('Settings saved'); })}>Save settings</PanelButton>
              <PanelButton danger onClick={() => setResetting(true)}>Reset demonstration data</PanelButton>
              <span className="text-[12px] text-gray-400">Data seeded {new Date(db.seededAt).toLocaleString('en-GB')} · schema {db.schemaVersion}</span>
            </div>
            <div className="mt-3"><ActionError message={error} /></div>
          </PanelBody>
        </Panel>
      )}

      {editing && <LocationDialog location={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast.success('Location saved'); }} />}
      <ConfirmDialog open={resetting} danger title="Reset demonstration data?" description="Every container, order, invoice and audit entry in this browser is replaced with the seeded data set. Sessions in other tabs reload automatically." confirmLabel="Reset data" onConfirm={() => { resetDB(); setResetting(false); toast.success('Demonstration data reset'); }} onClose={() => setResetting(false)} />
    </motion.div>
  );
}

function LocationDialog({ location, onClose, onDone }: { location: Location | null; onClose: () => void; onDone: () => void }) {
  const { db, actor } = useOps();
  const { run, busy, error } = useAction();
  const [form, setForm] = useState<Omit<Location, 'id'>>({ orgId: location?.orgId ?? db?.organizations[0]?.id ?? '', code: location?.code ?? '', name: location?.name ?? '', type: location?.type ?? 'terminal', country: location?.country ?? 'United Arab Emirates', city: location?.city ?? '', timezone: location?.timezone ?? 'Asia/Dubai', operatingHours: location?.operatingHours ?? '24 hours, 365 days', bonded: location?.bonded ?? false, berths: location?.berths, quayLengthM: location?.quayLengthM, draftM: location?.draftM, yardCapacityTeu: location?.yardCapacityTeu, reeferPlugs: location?.reeferPlugs, warehouseSqm: location?.warehouseSqm, active: location?.active ?? true });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(c => ({ ...c, [key]: value }));
  const num = (key: 'berths' | 'quayLengthM' | 'draftM' | 'yardCapacityTeu' | 'reeferPlugs' | 'warehouseSqm', label: string) => <Field key={key} label={label} id={`loc-${key}`}><input id={`loc-${key}`} type="number" min={0} className={INPUT} value={form[key] ?? ''} onChange={e => set(key, e.target.value === '' ? undefined : Number(e.target.value))} /></Field>;
  return (
    <FormDialog open wide title={location ? `Edit ${location.name}` : 'New location'} submitLabel="Save" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.upsertLocation(actor!, { ...form, id: location?.id }), onDone)}>
      <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name" id="loc-name"><input id="loc-name" autoFocus className={INPUT} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Code" id="loc-code"><input id="loc-code" className={`${INPUT} font-mono uppercase`} value={form.code} onChange={e => set('code', e.target.value)} /></Field>
        <Field label="Entity" id="loc-org"><select id="loc-org" className={SELECT} value={form.orgId} onChange={e => set('orgId', e.target.value)}>{db?.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        <Field label="Type" id="loc-type"><select id="loc-type" className={SELECT} value={form.type} onChange={e => set('type', e.target.value as LocationType)}>{(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map(t => <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>)}</select></Field>
        <Field label="City" id="loc-city"><input id="loc-city" className={INPUT} value={form.city} onChange={e => set('city', e.target.value)} /></Field>
        <Field label="Country" id="loc-country"><input id="loc-country" className={INPUT} value={form.country} onChange={e => set('country', e.target.value)} /></Field>
        <Field label="Time zone (IANA)" id="loc-tz"><input id="loc-tz" className={INPUT} value={form.timezone} onChange={e => set('timezone', e.target.value)} /></Field>
        <div className="lg:col-span-2"><Field label="Operating hours" id="loc-hours"><input id="loc-hours" className={INPUT} value={form.operatingHours} onChange={e => set('operatingHours', e.target.value)} /></Field></div>
        {num('berths', 'Berths')}{num('quayLengthM', 'Quay length (m)')}{num('draftM', 'Draft (m)')}{num('yardCapacityTeu', 'Yard capacity (TEU)')}{num('reeferPlugs', 'Reefer plugs')}{num('warehouseSqm', 'Warehouse (sqm)')}
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-[13px] text-secondary"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={form.bonded} onChange={e => set('bonded', e.target.checked)} />Bonded facility</label>
        <label className="inline-flex items-center gap-2 text-[13px] text-secondary"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={form.active} onChange={e => set('active', e.target.checked)} />Active</label>
      </div>
    </FormDialog>
  );
}

function Icon() {
  return <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
