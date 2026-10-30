/*
 * Tariff engine. Values are the KCT Schedule of Charges effective 1 June 2026
 * (stevedoring, port receiving, shifting, storage slabs, DG surcharge, e-token fees).
 * Items the public schedule does not price (reefer monitoring, overtime, inland
 * transfer, warehouse and transport rates) carry placeholder rates that Finance can
 * edit on the Tariff page; they are marked below.
 */

import type { Container, Tariff } from './types';

export const DEFAULT_TARIFF: Tariff = {
  currency: 'AED',
  vatRate: 0.05,
  stevedoring: { full: [557, 814], empty: [284, 386], tsFull: [600, 835], tsEmpty: [412, 586] },
  portReceiving: { full: [471, 747], empty: [260, 355] },
  shifting: { cfs: [175, 225], scan: [175, 225], other: [175, 225], emptyRelease: [150, 200], outside: [400, 450] },
  restow: { dry: 1500, dg: 3000, oog: 4000 },
  storageImport: {
    normal: [[1, 10, 50, 100], [11, 15, 82, 164], [16, null, 153, 306]],
    oog: [[1, 10, 246, 492], [11, 15, 246, 492], [16, null, 459, 918]],
    dg: [[1, 10, 123, 246], [11, 15, 230, 460], [16, null, 230, 460]],
  },
  storageExport: {
    normal: [[1, 10, 20, 40], [11, 30, 41, 82], [31, null, 82, 164]],
    oog: [[1, 10, 110, 170], [11, 30, 160, 320], [31, null, 246, 492]],
    dg: [[1, 10, 45, 90], [11, 30, 62, 123], [31, null, 82, 164]],
  },
  storageEmptyPerDay: [20, 40],
  storageTranshipmentPerDay: [20, 40],
  // Container enquiry page: "For DG containers 1 day storage free / non-DG containers 10 days storage free".
  freeDays: { nonDg: 10, dg: 1 },
  dgSurchargePct: 50,
  reeferMonitoringPerDay: 120,   // placeholder, tariff clause 16
  overtimeGate: 150,             // placeholder, tariff clause 21.1
  etoken: 25,
  etokenAmendment: 20,
  inlandTransfer: [350, 450],    // placeholder, Momentum advisory April 2026
  warehouseHandlingPerUnit: 12,  // placeholder, Momentum contract rate
  warehouseStoragePerPalletDay: 4.5, // placeholder
  transportPerTrip: 650,         // placeholder
  vgm: 60,                       // placeholder, weighbridge and VGM
  uncollectedTransferDays: 3,
};

const DAY = 24 * 60 * 60 * 1000;

/** "Per day or part thereof": the discharge day counts as day 1. */
export function storageDays(from: string, to: string): number {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (end <= start) return 1;
  return Math.max(1, Math.ceil((end - start) / DAY));
}

export function sizeIndex(container: Pick<Container, 'size'>): 0 | 1 {
  return container.size === '20' ? 0 : 1;
}

function rateFromSlabs(slabs: [number, number | null, number, number][], day: number, size: 0 | 1): number {
  for (const [from, to, rate20, rate40] of slabs) {
    if (day >= from && (to === null || day <= to)) return size === 0 ? rate20 : rate40;
  }
  return 0;
}

export interface StorageQuote {
  days: number;
  freeDays: number;
  chargeableDays: number;
  amount: number;
  breakdown: { day: number; rate: number }[];
}

/**
 * Storage for one container between two dates. Import full boxes get free days
 * (10 non-DG, 1 DG) counted from discharge; after that the slab for each day applies.
 * A box that is both OOG and DG is charged on the OOG table plus the DG surcharge.
 */
export function quoteStorage(tariff: Tariff, container: Pick<Container, 'size' | 'category' | 'full' | 'dg' | 'oog'>, from: string, to: string): StorageQuote {
  const days = storageDays(from, to);
  const size = sizeIndex(container);
  const isDg = !!container.dg;
  const breakdown: { day: number; rate: number }[] = [];
  let freeDays = 0;

  if (container.category === 'import' && container.full) {
    freeDays = isDg ? tariff.freeDays.dg : tariff.freeDays.nonDg;
    const table = container.oog ? tariff.storageImport.oog : isDg ? tariff.storageImport.dg : tariff.storageImport.normal;
    for (let day = 1; day <= days; day += 1) {
      let rate = day <= freeDays ? 0 : rateFromSlabs(table, day, size);
      if (container.oog && isDg) rate = Math.ceil(rate * (1 + tariff.dgSurchargePct / 100));
      breakdown.push({ day, rate });
    }
  } else if (container.category === 'export' && container.full) {
    const table = container.oog ? tariff.storageExport.oog : isDg ? tariff.storageExport.dg : tariff.storageExport.normal;
    for (let day = 1; day <= days; day += 1) {
      let rate = rateFromSlabs(table, day, size);
      if (container.oog && isDg) rate = Math.ceil(rate * (1 + tariff.dgSurchargePct / 100));
      breakdown.push({ day, rate });
    }
  } else {
    const perDay = container.category === 'transhipment' ? tariff.storageTranshipmentPerDay[size] : tariff.storageEmptyPerDay[size];
    const multiplier = container.oog ? 2 : 1;
    for (let day = 1; day <= days; day += 1) {
      let rate = perDay * multiplier;
      if (isDg) rate = Math.ceil(rate * (1 + tariff.dgSurchargePct / 100));
      breakdown.push({ day, rate });
    }
  }

  const amount = breakdown.reduce((sum, entry) => sum + entry.rate, 0);
  return { days, freeDays, chargeableDays: breakdown.filter(entry => entry.rate > 0).length, amount, breakdown };
}

/** Stevedoring rate for one move, DG surcharge included where applicable. */
export function stevedoringRate(tariff: Tariff, container: Pick<Container, 'size' | 'category' | 'full' | 'dg'>): { base: number; surcharge: number } {
  const size = sizeIndex(container);
  let base: number;
  if (container.category === 'transhipment') base = container.full ? tariff.stevedoring.tsFull[size] : tariff.stevedoring.tsEmpty[size];
  else base = container.full ? tariff.stevedoring.full[size] : tariff.stevedoring.empty[size];
  const surcharge = container.dg ? Math.ceil(base * tariff.dgSurchargePct / 100) : 0;
  return { base, surcharge };
}

export function portReceivingRate(tariff: Tariff, container: Pick<Container, 'size' | 'full'>): number {
  const size = sizeIndex(container);
  return container.full ? tariff.portReceiving.full[size] : tariff.portReceiving.empty[size];
}

export function shiftingRate(tariff: Tariff, container: Pick<Container, 'size' | 'dg'>, purpose: 'cfs' | 'scan' | 'other' | 'emptyRelease' | 'outside'): number {
  const base = tariff.shifting[purpose][sizeIndex(container)];
  return container.dg ? Math.ceil(base * (1 + tariff.dgSurchargePct / 100)) : base;
}

/** Overtime window for gate deliveries: 22:00 to 06:00 local time (tariff 21.1). */
export function isOvertime(at: string, timezone: string): boolean {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: timezone }).format(new Date(at)));
    return hour >= 22 || hour < 6;
  } catch {
    const hour = new Date(at).getUTCHours();
    return hour >= 22 || hour < 6;
  }
}

export function money(amount: number, currency = 'AED'): string {
  return `${currency} ${amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
