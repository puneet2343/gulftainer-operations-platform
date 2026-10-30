'use client';

/*
 * Public vessel schedule, as on the Gulftainer site: terminal, voyage, vessel,
 * ETB and the export gate open and close window. Filter by terminal.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useOpsDB } from '@/lib/ops/store';
import { formatDateTime } from '@/lib/format';
import { VESSEL_STATUS_LABELS } from '@/lib/ops/types';

export default function VesselSchedulePage() {
  const db = useOpsDB();
  const [terminal, setTerminal] = useState('All');
  const terminals = (db?.locations ?? []).filter(l => l.type === 'terminal' && db?.vesselCalls.some(c => c.terminalId === l.id));
  const calls = (db?.vesselCalls ?? []).filter(call => call.status !== 'departed' && (terminal === 'All' || call.terminalId === terminal)).sort((a, b) => a.etb.localeCompare(b.etb));
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-8 md:px-8 md:pt-14">
      <Link href="/e-services" className="text-[13px] font-medium text-primary underline-offset-4 hover:underline">Home</Link>
      <h1 className="mt-4 text-[32px] font-semibold leading-tight tracking-[-0.01em] text-secondary md:text-[44px]">Vessel schedule</h1>
      <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.6] text-gray-600 md:text-[18px]">Expected berthing times and export gate windows. The gate opens four days before the ETB and closes one day before; export containers are received only inside the window. Information is received from the carriers and presented in good faith; it is subject to change.</p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-400">Terminal</span>
        {['All', ...terminals.map(t => t.id)].map(id => { const label = id === 'All' ? 'All' : terminals.find(t => t.id === id)?.code; return <button key={id} type="button" aria-pressed={terminal === id} onClick={() => setTerminal(id)} className={`h-10 rounded-full border px-4 text-[14px] font-medium transition ${terminal === id ? 'border-primary/25 bg-primary/[0.07] text-primary' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>{label}</button>; })}
      </div>

      <div className="mt-6 overflow-hidden rounded-[22px] border border-gray-200 bg-white">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left">
            <thead><tr className="border-b border-gray-100 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="px-5 py-3">Terminal</th><th className="px-5 py-3">Voyage</th><th className="px-5 py-3">Vessel</th><th className="px-5 py-3">ETB</th><th className="px-5 py-3">Export gate</th></tr></thead>
            <tbody>
              {calls.map(call => { const open = call.status === 'expected' && now >= new Date(call.gateOpen) && now <= new Date(call.gateClose); return (
                <tr key={call.id} className="border-b border-gray-100 text-[14px] last:border-0">
                  <td className="px-5 py-3.5 font-semibold text-secondary">{db?.locations.find(l => l.id === call.terminalId)?.code}</td>
                  <td className="px-5 py-3.5 font-mono text-[13px] text-gray-600">{call.voyage}</td>
                  <td className="px-5 py-3.5 text-secondary">{call.vessel}<span className="block text-[12px] text-gray-400">berth {call.berth} · {call.service}</span></td>
                  <td className="px-5 py-3.5 tabular-nums text-gray-600">{call.status === 'expected' ? `${formatDateTime(call.etb)} UTC` : <span className="font-semibold text-secondary">{VESSEL_STATUS_LABELS[call.status]} [Gate closed]</span>}</td>
                  <td className="px-5 py-3.5 text-gray-600">{call.status === 'expected' ? <>Open {formatDateTime(call.gateOpen)} · Close {formatDateTime(call.gateClose)}<span className={`block text-[12px] font-semibold ${open ? 'text-[#1F8F6E]' : 'text-gray-400'}`}>{open ? 'Gate open now' : now < new Date(call.gateOpen) ? 'Opens later' : 'Gate closed'}</span></> : <span className="text-gray-400">Closed</span>}</td>
                </tr>
              ); })}
              {calls.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No records found.</td></tr>}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-gray-100 md:hidden">
          {calls.map(call => { const open = call.status === 'expected' && now >= new Date(call.gateOpen) && now <= new Date(call.gateClose); return (
            <li key={call.id} className="p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[15px] font-semibold text-secondary">{call.vessel}</p><p className="font-mono text-[12px] text-gray-500">{call.voyage} · {db?.locations.find(l => l.id === call.terminalId)?.code} berth {call.berth}</p></div><span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${call.status === 'expected' ? (open ? 'bg-[rgba(52,189,152,0.10)] text-[#1F8F6E]' : 'bg-gray-100 text-gray-500') : 'bg-primary/[0.08] text-primary'}`}>{call.status === 'expected' ? (open ? 'Gate open' : 'Gate closed') : VESSEL_STATUS_LABELS[call.status]}</span></div>
              <p className="mt-2 text-[13px] text-gray-600">ETB {formatDateTime(call.etb)} UTC</p>
              {call.status === 'expected' && <p className="text-[12px] text-gray-400">Gate {formatDateTime(call.gateOpen)} to {formatDateTime(call.gateClose)}</p>}
            </li>
          ); })}
        </ul>
      </div>
    </main>
  );
}
