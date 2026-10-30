'use client';

/*
 * Customer portal session: a consignee, clearing agent or haulier chooses the
 * organisation they act for. Portal actions run as the "Customer portal" service
 * account with the party's name recorded on every event.
 */

import { useEffect, useState } from 'react';
import type { Employee, OpsDB, Party } from './types';

const KEY = 'gt_portal_party';

export function getPortalPartyId(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export function setPortalPartyId(id: string | null) {
  try { if (id) window.localStorage.setItem(KEY, id); else window.localStorage.removeItem(KEY); } catch { /* optional */ }
  window.dispatchEvent(new Event('gt-portal-party'));
}

export function usePortalParty(db: OpsDB | null): Party | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setId(getPortalPartyId());
    const timer = window.setTimeout(read, 0);
    window.addEventListener('gt-portal-party', read);
    return () => { window.clearTimeout(timer); window.removeEventListener('gt-portal-party', read); };
  }, []);
  if (!db || !id) return null;
  return db.parties.find(party => party.id === id) ?? null;
}

export function portalActor(db: OpsDB): Employee {
  return db.employees.find(employee => employee.username === 'portal') ?? db.employees[0];
}
