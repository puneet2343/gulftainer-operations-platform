'use client';

/*
 * Container enquiry: status of a full import container, its release position
 * and the approximate storage charges from discharge to an expected delivery
 * date, calculated from the terminal tariff.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useOpsDB } from '@/lib/ops/store';
import { normaliseContainerNumber, validateContainerNumber, formatContainerNumber } from '@/lib/ops/iso6346';
import { quoteStorage } from '@/lib/ops/tariff';
import { releaseBlockers, activeHolds } from '@/lib/ops/ops';
import { formatDateTime, formatDate, formatMoney, toDateInput } from '@/lib/format';
import { CONTAINER_STATUS_LABELS, CUSTOMS_LABELS, HOLD_LABELS } from '@/lib/ops/types';

export default function ContainerEnquiryPage() {
  const db = useOpsDB();
  const [number, setNumber] = useState('');
  const [expected, setExpected] = useState(() => toDateInput(new Date().toISOString()));
  const [submitted, setSubmitted] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const preset = new URLSearchParams(window.location.search).get('number');
      if (preset) { setNumber(preset); setSubmitted(normaliseContainerNumber(preset)); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const result = useMemo(() => {
    if (!db || !submitted) return null;
    const container = db.containers.find(c => c.number === submitted && c.status !== 'delivered') ?? db.containers.find(c => c.number === submitted);
    if (!container) return { found: false as const };
    const location = db.locations.find(l => l.id === container.locationId);
    const call = db.vesselCalls.find(v => v.id === container.inboundCallId);
    const storage = container.dischargedAt && container.category === 'import' ? quoteStorage(db.tariff, container, container.dischargedAt, `${expected}T23:59:59.000Z`) : null;
    const blockers = releaseBlockers(container, new Date().toISOString());
    const token = container.tokenId ? db.tokens.find(t => t.id === container.tokenId) : null;
    return { found: true as const, container, location, call, storage, blockers, token };
  }, [db, submitted, expected]);

  function search() {
    const problem = validateContainerNumber(number);
    if (problem) { setError(problem); return; }
    setError('');
    setSubmitted(normaliseContainerNumber(number));
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-8 md:pt-14">
      <Link href="/e-services" className="text-[13px] font-medium text-primary underline-offset-4 hover:underline">Home</Link>
      <h1 className="mt-4 text-[32px] font-semibold leading-tight tracking-[-0.01em] text-secondary md:text-[44px]">Container enquiry</h1>
      <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.6] text-gray-600 md:text-[18px]">Status updates for full import containers and the approximate storage charges calculated from discharge as per the terminal tariff. Non-DG containers have {db?.tariff.freeDays.nonDg ?? 10} days storage free; DG containers {db?.tariff.freeDays.dg ?? 1} day.</p>

      <form onSubmit={event => { event.preventDefault(); search(); }} className="mt-8 grid max-w-[720px] gap-3 rounded-[22px] bg-gray-50 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-end md:p-6">
        <label className="block"><span className="mb-1 block text-[13px] font-semibold text-secondary">Container number</span><input value={number} onChange={event => { setNumber(event.target.value); setError(''); }} placeholder="MSCU 884207 0" className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 font-mono text-[15px] uppercase text-secondary outline-none transition placeholder:font-sans placeholder:normal-case placeholder:text-gray-400 focus:border-primary/40 focus:ring-2 focus:ring-primary/10" /></label>
        <label className="block"><span className="mb-1 block text-[13px] font-semibold text-secondary">Expected delivery date</span><input type="date" value={expected} min={toDateInput(new Date().toISOString())} onChange={event => setExpected(event.target.value)} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-[15px] text-secondary outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10" /></label>
        <button type="submit" className="btn btn-primary h-12">Search</button>
        {error && <p role="alert" className="text-[14px] text-[#C0352B] sm:col-span-3">{error}</p>}
      </form>

      {result && !result.found && (
        <div className="mt-8 max-w-[62ch] rounded-[22px] border border-gray-200 bg-white p-6"><p className="text-[16px] font-semibold text-secondary">No information returned for {formatContainerNumber(submitted)}.</p><p className="mt-2 text-[15px] leading-[1.6] text-gray-600">This enquiry covers full import containers only. Re-check the container number, or the container may not have arrived at the terminal yet. Please contact the terminal for more information.</p></div>
      )}

      {result?.found && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <section className="rounded-[22px] border border-gray-200 bg-white p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-gray-400">Container</p>
            <h2 className="mt-1 font-mono text-[24px] font-semibold text-secondary">{formatContainerNumber(result.container.number)}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
              <div><dt className="text-[12px] text-gray-400">Size and type</dt><dd className="text-secondary">{result.container.size} ft {result.container.type}{result.container.dg ? ' · DG' : ''}{result.container.reefer ? ' · Reefer' : ''}{result.container.oog ? ' · OOG' : ''}</dd></div>
              <div><dt className="text-[12px] text-gray-400">Status</dt><dd className="font-semibold text-secondary">{CONTAINER_STATUS_LABELS[result.container.status]}</dd></div>
              <div><dt className="text-[12px] text-gray-400">Location</dt><dd className="text-secondary">{result.location?.name ?? '—'}</dd></div>
              <div><dt className="text-[12px] text-gray-400">Vessel</dt><dd className="text-secondary">{result.call ? `${result.call.vessel} ${result.call.voyage}` : '—'}</dd></div>
              <div><dt className="text-[12px] text-gray-400">Discharged</dt><dd className="text-secondary">{result.container.dischargedAt ? `${formatDateTime(result.container.dischargedAt)} UTC` : 'Not yet discharged'}</dd></div>
              <div><dt className="text-[12px] text-gray-400">Customs</dt><dd className="text-secondary">{CUSTOMS_LABELS[result.container.customsStatus]}</dd></div>
              <div><dt className="text-[12px] text-gray-400">Delivery order</dt><dd className="text-secondary">{result.container.deliveryOrder ? `${result.container.deliveryOrder.number}, valid to ${formatDate(result.container.deliveryOrder.validUntil)}` : 'Not received'}</dd></div>
              <div><dt className="text-[12px] text-gray-400">Charges</dt><dd className="text-secondary">{result.container.chargesSettled ? 'Settled' : 'Outstanding'}</dd></div>
            </dl>
            {activeHolds(result.container).length > 0 && <p className="mt-4 rounded-xl bg-[#FDF1EF] px-3.5 py-2.5 text-[14px] text-[#C0352B]">{activeHolds(result.container).map(h => HOLD_LABELS[h.type]).join(', ')} in place. Contact customer service.</p>}
            {result.container.status === 'in_yard' && result.container.category === 'import' && (
              <div className="mt-4 rounded-xl bg-gray-50 p-4">
                <p className="text-[13px] font-semibold text-secondary">{result.blockers.length === 0 ? 'Ready for collection' : 'Before collection'}</p>
                {result.blockers.length === 0 ? <p className="mt-1 text-[14px] text-gray-600">{result.token ? `E-token ${result.token.number} issued for ${formatDateTime(result.token.slotStart)} UTC.` : 'Assign a haulier and generate an e-token on the portal.'}</p> : <ul className="mt-1 list-disc pl-5 text-[14px] text-gray-600">{result.blockers.map(b => <li key={b}>{b}</li>)}</ul>}
                {result.blockers.length === 0 && !result.token && <Link href="/e-token" className="mt-3 inline-flex h-10 items-center rounded-full bg-primary px-5 text-[14px] font-semibold text-white">Go to e-token portal</Link>}
              </div>
            )}
            {result.container.status === 'on_truck' && <p className="mt-4 text-[14px] text-gray-600">Collected on {formatDateTime(result.container.gateOutAt)} UTC.</p>}
          </section>
          <section className="rounded-[22px] border border-gray-200 bg-white p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-gray-400">Approximate storage charges</p>
            {result.storage ? (
              <>
                <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-secondary">{formatMoney(result.storage.amount)}</h2>
                <p className="text-[14px] text-gray-600">{result.storage.days} day{result.storage.days === 1 ? '' : 's'} from discharge to {formatDate(`${expected}T00:00:00Z`)}, {result.storage.freeDays} free, {result.storage.chargeableDays} chargeable. Exclusive of VAT and other service charges.</p>
                <table className="mt-4 w-full text-[13px]"><thead><tr className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="py-1.5 text-left">Day</th><th className="py-1.5 text-right">Rate</th></tr></thead><tbody>{groupDays(result.storage.breakdown).map(group => <tr key={group.label} className="border-t border-gray-100"><td className="py-1.5 text-secondary">{group.label}</td><td className="py-1.5 text-right tabular-nums text-gray-600">{group.rate === 0 ? 'Free' : `${formatMoney(group.rate)} per day`}</td></tr>)}</tbody></table>
                <p className="mt-4 text-[12px] text-gray-400">Calculated from the container discharge from vessel as per the terminal tariff. Delays in customs clearance or cargo collection may result in additional storage, transfer and transportation charges.</p>
              </>
            ) : <p className="mt-2 text-[15px] text-gray-600">Storage starts when the container is discharged from the vessel.</p>}
          </section>
        </div>
      )}
    </main>
  );
}

function groupDays(breakdown: { day: number; rate: number }[]) {
  const groups: { label: string; rate: number; from: number; to: number }[] = [];
  for (const entry of breakdown) {
    const last = groups[groups.length - 1];
    if (last && last.rate === entry.rate) { last.to = entry.day; last.label = `Day ${last.from} to ${last.to}`; }
    else groups.push({ label: `Day ${entry.day}`, rate: entry.rate, from: entry.day, to: entry.day });
  }
  return groups;
}
