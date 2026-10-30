'use client';

/*
 * Register a container: an import or transhipment box on an inbound call, an export
 * booking on an outbound call, or an empty. The ISO 6346 check digit is validated
 * as the number is typed.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import PageHeader from '@/components/ui/PageHeader';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import { Field } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { INPUT, SELECT, TEXTAREA } from '@/components/ui/Table';
import { PanelBody, ActionError } from '@/components/admin/Shared';
import { useToast } from '@/components/ui/Toast';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { validateContainerNumber, normaliseContainerNumber } from '@/lib/ops/iso6346';
import { formatDateTime } from '@/lib/format';
import { CONTAINER_CATEGORY_LABELS, type ContainerCategory, type ContainerSize, type ContainerType } from '@/lib/ops/types';

export default function RegisterContainerPage() {
  const { db, actor } = useOps();
  const router = useRouter();
  const toast = useToast();
  const { run, busy, error } = useAction();
  const [form, setForm] = useState({
    number: '', size: '40' as ContainerSize, type: 'GP' as ContainerType, category: 'import' as ContainerCategory, lineId: '', consigneeId: '', clearingAgentId: '',
    shipperName: '', commodity: '', grossWeightKg: 20000, sealNumber: '', isDg: false, imoClass: '', unNumber: '', oog: false, setpointC: -18, inboundCallId: '', outboundCallId: '',
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));
  if (!db || !actor) return <PageSkeleton />;

  const lines = db.parties.filter(party => party.type === 'shipping_line');
  const consignees = db.parties.filter(party => party.type === 'consignee');
  const agents = db.parties.filter(party => party.type === 'clearing_agent');
  const openCalls = db.vesselCalls.filter(call => !['departed'].includes(call.status)).sort((a, b) => a.etb.localeCompare(b.etb));
  const numberProblem = form.number ? validateContainerNumber(form.number) : null;
  const isImportLike = form.category === 'import' || form.category === 'transhipment';
  const full = form.category !== 'empty';

  function submit() {
    return ops.registerContainer(actor!, {
      number: normaliseContainerNumber(form.number), size: form.size, type: form.type, category: form.category, full, lineId: form.lineId || lines[0]?.id,
      consigneeId: form.category === 'import' ? form.consigneeId || null : null, clearingAgentId: form.category === 'import' ? form.clearingAgentId || null : null,
      shipperName: form.shipperName, commodity: form.commodity, grossWeightKg: form.grossWeightKg, sealNumber: form.sealNumber,
      dg: form.isDg ? { imoClass: form.imoClass, unNumber: form.unNumber } : null, oog: form.oog, reefer: form.type === 'RF' ? { setpointC: form.setpointC } : null,
      inboundCallId: isImportLike ? form.inboundCallId || null : null, outboundCallId: form.category === 'export' || form.category === 'empty' ? form.outboundCallId || null : null,
    });
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow="Terminal" title="Register container" subtitle="Manual registration for boxes not received by EDI. Imports and transhipments go on an inbound call; exports on the booked outbound call." />
      <form onSubmit={event => { event.preventDefault(); void run(submit, container => { if (container) { toast.success(`${container.number} registered`); router.push(`/admin/containers/${container.id}`); } }); }} className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SectionHeader title="Container" description="Identification, equipment and cargo" />
          <PanelBody>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Container number" id="number" hint="Owner code, six digits and the check digit" error={numberProblem ?? undefined}><input id="number" autoFocus className={`${INPUT} font-mono uppercase`} value={form.number} onChange={event => set('number', event.target.value)} placeholder="MSKU 884210 7" /></Field>
              <Field label="Category" id="category"><select id="category" className={SELECT} value={form.category} onChange={event => set('category', event.target.value as ContainerCategory)}>{(Object.keys(CONTAINER_CATEGORY_LABELS) as ContainerCategory[]).map(category => <option key={category} value={category}>{CONTAINER_CATEGORY_LABELS[category]}</option>)}</select></Field>
              <Field label="Size" id="size"><select id="size" className={SELECT} value={form.size} onChange={event => set('size', event.target.value as ContainerSize)}><option value="20">20 ft</option><option value="40">40 ft</option><option value="45">45 ft</option></select></Field>
              <Field label="Type" id="type"><select id="type" className={SELECT} value={form.type} onChange={event => set('type', event.target.value as ContainerType)}><option value="GP">GP, general purpose</option><option value="HC">HC, high cube</option><option value="RF">RF, reefer</option><option value="OT">OT, open top</option><option value="FR">FR, flat rack</option><option value="TK">TK, tank</option></select></Field>
              <Field label="Shipping line" id="line"><select id="line" className={SELECT} value={form.lineId} onChange={event => set('lineId', event.target.value)}><option value="">Select a line</option>{lines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}</select></Field>
              <Field label="Seal number" id="seal"><input id="seal" className={INPUT} value={form.sealNumber} onChange={event => set('sealNumber', event.target.value)} disabled={!full} /></Field>
              <Field label="Gross weight (kg)" id="weight"><input id="weight" type="number" min={0} className={INPUT} value={form.grossWeightKg} onChange={event => set('grossWeightKg', Number(event.target.value))} /></Field>
              {form.type === 'RF' && <Field label="Reefer setpoint (°C)" id="setpoint"><input id="setpoint" type="number" className={INPUT} value={form.setpointC} onChange={event => set('setpointC', Number(event.target.value))} /></Field>}
              <div className="sm:col-span-2"><Field label="Commodity" id="commodity"><textarea id="commodity" className={TEXTAREA} value={form.commodity} onChange={event => set('commodity', event.target.value)} disabled={!full} placeholder="Consumer electronics, 1,240 cartons" /></Field></div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-[13px] text-secondary"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={form.isDg} onChange={event => set('isDg', event.target.checked)} />Dangerous goods</label>
              <label className="inline-flex items-center gap-2 text-[13px] text-secondary"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary" checked={form.oog} onChange={event => set('oog', event.target.checked)} />Out of gauge</label>
            </div>
            {form.isDg && (
              <div className="mt-4 grid gap-x-4 rounded-xl bg-gray-50 p-3.5 sm:grid-cols-2">
                <Field label="IMO class" id="imo"><input id="imo" className={INPUT} value={form.imoClass} onChange={event => set('imoClass', event.target.value)} placeholder="8" /></Field>
                <Field label="UN number" id="un"><input id="un" className={INPUT} value={form.unNumber} onChange={event => set('unNumber', event.target.value)} placeholder="UN1824" /></Field>
                <p className="!text-[12px] !text-gray-500 sm:col-span-2">A DG hold is placed on registration and released once the dangerous goods declaration is filed. Stevedoring and storage carry a {db.tariff.dgSurchargePct}% surcharge.</p>
              </div>
            )}
          </PanelBody>
        </Panel>

        <div className="space-y-4 sm:space-y-5">
          <Panel delay={0.1}>
            <SectionHeader title="Voyage and parties" />
            <PanelBody>
              {isImportLike ? (
                <Field label="Inbound vessel call" id="inbound"><select id="inbound" className={SELECT} value={form.inboundCallId} onChange={event => set('inboundCallId', event.target.value)}><option value="">Select a call</option>{openCalls.map(call => <option key={call.id} value={call.id}>{call.vessel} {call.voyage} · {db.locations.find(l => l.id === call.terminalId)?.code} · ETB {formatDateTime(call.etb)}</option>)}</select></Field>
              ) : (
                <Field label={form.category === 'export' ? 'Outbound vessel call' : 'Outbound vessel call (optional)'} id="outbound"><select id="outbound" className={SELECT} value={form.outboundCallId} onChange={event => set('outboundCallId', event.target.value)}><option value="">{form.category === 'export' ? 'Select a call' : 'None'}</option>{openCalls.filter(call => call.status === 'expected' || call.status === 'berthed').map(call => <option key={call.id} value={call.id}>{call.vessel} {call.voyage} · {db.locations.find(l => l.id === call.terminalId)?.code} · gate closes {formatDateTime(call.gateClose)}</option>)}</select></Field>
              )}
              {form.category === 'import' && (
                <>
                  <Field label="Consignee" id="consignee"><select id="consignee" className={SELECT} value={form.consigneeId} onChange={event => set('consigneeId', event.target.value)}><option value="">Not yet known</option>{consignees.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
                  <Field label="Clearing agent" id="agent"><select id="agent" className={SELECT} value={form.clearingAgentId} onChange={event => set('clearingAgentId', event.target.value)}><option value="">Not yet known</option>{agents.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
                </>
              )}
              {(form.category === 'export' || form.category === 'transhipment') && <Field label="Shipper" id="shipper"><input id="shipper" className={INPUT} value={form.shipperName} onChange={event => set('shipperName', event.target.value)} placeholder="Emirates Global Aluminium" /></Field>}
            </PanelBody>
          </Panel>
          <Panel delay={0.15}>
            <PanelBody>
              <ActionError message={error} />
              <div className={`flex gap-2.5 ${error ? 'mt-3' : ''}`}>
                <Link href="/admin/containers" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">Cancel</Link>
                <button type="submit" disabled={busy || !!numberProblem || !form.number} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Registering' : 'Register container'}</button>
              </div>
            </PanelBody>
          </Panel>
        </div>
      </form>
    </motion.div>
  );
}
