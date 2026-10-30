'use client';

/*
 * Page-side access to the operations database and the acting employee.
 * `db` is null until the component has mounted (pages show skeletons meanwhile).
 */

import { useCallback, useMemo, useState } from 'react';
import { useAdminSession } from '@/components/admin/AdminSessionContext';
import { useOpsDB } from './store';
import type { Employee, OpsDB } from './types';
import { OpsError } from './core';

export function useOps(): { db: OpsDB | null; actor: Employee | null; ready: boolean } {
  const db = useOpsDB();
  const session = useAdminSession();
  const actor = useMemo(() => db && session ? db.employees.find(employee => employee.id === session.employeeId) ?? null : null, [db, session]);
  return { db, actor, ready: !!db && !!actor };
}

/** Turns any thrown value into the message to show the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof OpsError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please retry.';
}

/**
 * Runs a service call with busy state and an error message, so forms stay small:
 *   const { run, busy, error } = useAction();
 *   await run(() => ops.placeHold(actor, {...}), 'Hold placed');
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async <T,>(fn: () => T | Promise<T>, onSuccess?: (result: T) => void): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    try {
      await new Promise(resolve => window.setTimeout(resolve, 250));
      const result = await fn();
      onSuccess?.(result);
      return result;
    } catch (caught) {
      setError(errorMessage(caught));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => setError(''), []);
  return { run, busy, error, clear };
}
