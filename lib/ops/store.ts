'use client';

/*
 * Client-side persistence for the prototype. The whole OpsDB document is kept in
 * localStorage under one key and mirrored in memory.
 *
 *  - `commit(mutator)` is the transaction boundary: the mutator works on a deep clone,
 *    and only if it returns without throwing is the clone persisted and broadcast.
 *    A validation error therefore leaves the database untouched (SRS §5).
 *  - Other tabs receive the `storage` event and reload, which stands in for other
 *    employees working concurrently on the same data.
 *  - `useOpsDB()` subscribes a page to changes; it resolves after mount so server
 *    rendering never touches localStorage.
 *
 * Replace `loadDB`/`commit` with API calls when a backend exists; the service layer
 * (services.ts) is written against the `Ctx` shape so pages do not change.
 */

import { useEffect, useState } from 'react';
import type { OpsDB } from './types';
import { createSeedDB, SCHEMA_VERSION } from './seed';

export const OPS_DB_KEY = 'gt_ops_db';
export const OPS_DB_EVENT = 'gt-ops-db-change';

let cache: OpsDB | null = null;
const listeners = new Set<() => void>();

function readStorage(): OpsDB | null {
  try {
    const raw = window.localStorage.getItem(OPS_DB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpsDB;
    return parsed && parsed.schemaVersion === SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function writeStorage(db: OpsDB) {
  try {
    window.localStorage.setItem(OPS_DB_KEY, JSON.stringify(db));
  } catch {
    // Storage may be full or disabled; the in-memory copy still serves this tab.
  }
}

function emit() {
  listeners.forEach(listener => listener());
}

/** The current database. Seeds on first use. */
export function loadDB(): OpsDB {
  if (cache) return cache;
  if (typeof window === 'undefined') return createSeedDB();
  const stored = readStorage();
  cache = stored ?? createSeedDB();
  if (!stored) writeStorage(cache);
  return cache;
}

/** Discards everything and reseeds. Used by the demo reset in Settings. */
export function resetDB(): OpsDB {
  cache = createSeedDB();
  writeStorage(cache);
  emit();
  return cache;
}

/**
 * Runs `mutator` against a clone of the database. If it throws, nothing is written.
 * The clone is cheap at prototype volumes and guarantees that partially applied
 * mutations never leak into the live document.
 */
export function commit<R>(mutator: (draft: OpsDB) => R): R {
  const base = loadDB();
  const draft = structuredClone(base);
  const result = mutator(draft);
  cache = draft;
  writeStorage(draft);
  emit();
  return result;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* Cross-tab synchronisation: another tab committed, so adopt its version. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== OPS_DB_KEY) return;
    const stored = readStorage();
    if (stored) { cache = stored; emit(); }
  });
}

/** Subscribes a page to the database. `null` until the component has mounted. */
export function useOpsDB(): OpsDB | null {
  const [db, setDb] = useState<OpsDB | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setDb(loadDB()), 0);
    const unsubscribe = subscribe(() => setDb(loadDB()));
    return () => { window.clearTimeout(timer); unsubscribe(); };
  }, []);
  return db;
}
