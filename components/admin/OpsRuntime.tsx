'use client';

/*
 * Background workers that a server would run, kept client-side in the prototype:
 *  - the outbox publisher drains pending events shortly after every commit;
 *  - the housekeeping sweep (token expiry, uncollected boxes, overdue invoices,
 *    unplugged reefers) runs on load and every five minutes;
 *  - the offline banner shows when the device is working disconnected.
 */

import { useEffect, useRef } from 'react';
import { ops } from '@/lib/ops/ops';
import { subscribe, loadDB } from '@/lib/ops/store';
import { useOps } from '@/lib/ops/use-ops';

export default function OpsRuntime() {
  const { db, actor } = useOps();
  const draining = useRef(false);

  useEffect(() => {
    function drain() {
      if (draining.current) return;
      const pending = loadDB().outbox.some(event => event.status === 'pending');
      if (!pending) return;
      draining.current = true;
      window.setTimeout(() => {
        try { ops.processOutbox(); } finally { draining.current = false; }
      }, 400);
    }
    const unsubscribe = subscribe(drain);
    const timer = window.setTimeout(drain, 0);
    return () => { unsubscribe(); window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!actor) return;
    const run = () => { try { ops.runHousekeeping(actor); } catch { /* housekeeping is best effort */ } };
    const timer = window.setTimeout(run, 0);
    const interval = window.setInterval(run, 5 * 60 * 1000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [actor]);

  if (!db?.settings.offline) return null;
  const queued = db.offlineQueue.filter(item => item.status === 'queued').length;
  return (
    <div role="status" className="fixed inset-x-0 top-[64px] z-[45] flex items-center justify-center gap-2 border-b border-[#B7791F]/30 bg-[rgba(214,158,46,0.12)] px-4 py-1.5 text-[12px] font-semibold text-[#B7791F] lg:left-[248px] lg:top-0 xl:left-[256px]">
      <span className="h-2 w-2 rounded-full bg-[#B7791F]" aria-hidden="true" />
      Working offline. Gate and warehouse operations are queued on this device{queued ? ` (${queued} waiting)` : ''}.
      <button type="button" onClick={() => ops.setOffline(false)} className="ml-2 underline underline-offset-2">Reconnect</button>
    </div>
  );
}
