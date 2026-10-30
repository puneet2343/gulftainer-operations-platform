'use client';

/*
 * Customer e-services home: the three services customers use most (vessel
 * schedule, container enquiry with storage estimate, e-token portal) and the
 * current advisories, with a direct container lookup.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FeatureCard, ItemCard } from '@/components/user/Cards';
import { SectionHeading } from '@/components/ui/Panel';
import { BRAND } from '@/lib/brand';
import { useOpsDB } from '@/lib/ops/store';
import { normaliseContainerNumber, validateContainerNumber } from '@/lib/ops/iso6346';
import { formatDateTime } from '@/lib/format';

export default function HomePage() {
  const db = useOpsDB();
  const router = useRouter();
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const kct = db?.locations.find(l => l.code === 'KCT');
  const upcoming = (db?.vesselCalls ?? []).filter(call => ['expected', 'berthed', 'working'].includes(call.status)).sort((a, b) => a.etb.localeCompare(b.etb)).slice(0, 3);
  const gateOpen = (db?.vesselCalls ?? []).filter(call => call.status === 'expected' && new Date() >= new Date(call.gateOpen) && new Date() <= new Date(call.gateClose)).length;

  function lookup() {
    const problem = validateContainerNumber(number);
    if (problem) { setError(problem); return; }
    router.push(`/container-enquiry?number=${normaliseContainerNumber(number)}`);
  }

  const features = [
    { href: '/vessel-schedule', title: 'Vessel schedule', description: 'Expected berthing times and the export gate open and close windows for every voyage at KCT and SCT.', status: `${upcoming.length} calls in the programme` },
    { href: '/container-enquiry', title: 'Container enquiry', description: 'Status of full import containers, expected delivery date, and the approximate storage charges from discharge.', status: 'Storage free for 10 days, 1 day for DG' },
    { href: '/e-token', title: 'E-token portal', description: 'Consignees assign hauliers to released containers; hauliers generate the truck appointment before arriving at the marshalling yard.', status: `${gateOpen} export gate${gateOpen === 1 ? '' : 's'} open now` },
  ];

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 md:px-8 md:pt-10">
      <section className="mb-8 md:mb-12">
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.01em] text-secondary md:text-[44px]">
          {BRAND.company} <span className="ssi-highlight">{BRAND.siteSuffix}</span>
        </h1>
        <p className="mt-3 max-w-[62ch] text-[16px] leading-[1.6] text-gray-600 md:text-[18px]">
          Online services for consignees, clearing agents, freight forwarders and hauliers using Khorfakkan Container Terminal, Sharjah Container Terminal and the inland depots. Online payment is the only accepted mode for cargo collection.
        </p>
        <form onSubmit={event => { event.preventDefault(); lookup(); }} className="mt-5 flex max-w-[560px] flex-col gap-2 sm:flex-row">
          <input aria-label="Container number" value={number} onChange={event => { setNumber(event.target.value); setError(''); }} placeholder="Container number, e.g. MSCU 884207 0" className="h-12 flex-1 rounded-full border border-gray-200 bg-white px-5 font-mono text-[15px] uppercase text-secondary outline-none transition placeholder:font-sans placeholder:normal-case placeholder:text-gray-400 focus:border-primary/40 focus:ring-2 focus:ring-primary/10" />
          <button type="submit" className="btn btn-primary">Track container</button>
        </form>
        {error && <p role="alert" className="mt-2 text-[14px] text-[#C0352B]">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/e-token" className="btn btn-secondary">Open e-token portal</Link>
          <Link href="/admin/login" className="text-[14px] font-medium text-primary underline-offset-4 hover:underline">Staff sign in</Link>
        </div>
        <div className="ssi-rule mt-8 w-24" />
      </section>

      <section aria-label="Services" className="mb-8 md:mb-12">
        <ul className="grid gap-3 md:grid-cols-3 md:gap-4">
          {features.map((feature, index) => <FeatureCard key={feature.title} index={index} {...feature} />)}
        </ul>
      </section>

      <section className="mb-8 md:mb-12">
        <SectionHeading title="Vessels in the programme" subtitle="Soonest first. Export containers are received only inside the gate window." />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 md:gap-3">
          {upcoming.map((call, index) => {
            const terminal = db?.locations.find(l => l.id === call.terminalId);
            const open = new Date() >= new Date(call.gateOpen) && new Date() <= new Date(call.gateClose) && call.status === 'expected';
            return <ItemCard key={call.id} index={index} href="/vessel-schedule" title={`${call.vessel} · ${call.voyage}`} location={`${terminal?.name}, berth ${call.berth}`} date={`ETB ${formatDateTime(call.etb)} UTC`} description={call.status === 'expected' ? `Gate ${open ? 'open' : 'closed'}: ${formatDateTime(call.gateOpen)} to ${formatDateTime(call.gateClose)}` : 'On berth, gate closed for this voyage'} footer={call.status === 'expected' ? 'Expected' : 'On berth'} action="View schedule" />;
          })}
        </div>
      </section>

      <section>
        <SectionHeading title="Customer advisories" subtitle="Current operating notices" />
        <div className="max-w-[62ch] space-y-3 rounded-[22px] bg-gray-50 p-6 text-[15px] leading-[1.6] text-gray-600 md:p-8">
          <p><span className="font-semibold text-secondary">Online payment only.</span> Cargo collection charges at {kct?.name ?? 'Khorfakkan'} are paid through the customer portal; cash is no longer accepted at the terminal.</p>
          <p><span className="font-semibold text-secondary">E-token charges.</span> Import pick-up e-tokens are AED {db?.tariff.etoken ?? 25} and amendments AED {db?.tariff.etokenAmendment ?? 20}, inclusive of VAT. Trucks must hold a valid token before entering the marshalling yard.</p>
          <p><span className="font-semibold text-secondary">Uncollected containers.</span> Import containers not collected within {db?.tariff.uncollectedTransferDays ?? 3} days of vessel completion are transferred to Sharjah Inland Container Depot or Sajaa Dry Port for the account of the cargo interests.</p>
          <p className="text-[13px] text-gray-500">Questions: {BRAND.supportEmail} · {BRAND.phone}</p>
        </div>
      </section>
    </main>
  );
}
