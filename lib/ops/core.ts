/*
 * Shared plumbing for the service layer: the transaction context, errors, lookups,
 * authorisation guards, references, audit, notifications, the transactional outbox,
 * idempotency and charge creation. The domain services (services/*.ts) build on this.
 */

import type {
  AuditEntry, Charge, Container, Employee, Location, Notification, NotificationType, OpsDB, Party, Role, ServiceCode,
  Severity, VesselCall, Currency,
} from './types';
import { SERVICE_LABELS } from './types';

export type OpsErrorCode =
  | 'NOT_FOUND' | 'VALIDATION' | 'FORBIDDEN' | 'LOCATION_FORBIDDEN' | 'INVALID_STATE'
  | 'INSUFFICIENT_STOCK' | 'CONFLICT' | 'SEPARATION_OF_DUTIES' | 'DUPLICATE' | 'NOT_READY';

export class OpsError extends Error {
  code: OpsErrorCode;
  constructor(code: OpsErrorCode, message: string) {
    super(message);
    this.name = 'OpsError';
    this.code = code;
  }
}

export interface Ctx {
  db: OpsDB;
  actor: Employee;
  at: string;
  requestId: string;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const REF_FORMAT: Record<string, (n: number, year: number) => string> = {
  MOV: n => `MOV-${String(n).padStart(6, '0')}`,
  OP: n => `OP-${String(n).padStart(6, '0')}`,
  GT: n => `GATE-${String(n).padStart(6, '0')}`,
  ET: n => `ET-${String(n).padStart(6, '0')}`,
  TR: (n, year) => `TRF-${year}-${String(n).padStart(4, '0')}`,
  TJ: (n, year) => `TJ-${year}-${String(n).padStart(5, '0')}`,
  WO: (n, year) => `WO-${year}-${String(n).padStart(5, '0')}`,
  TSK: n => `TSK-${String(n).padStart(4, '0')}`,
  DOC: n => `DOC-${String(n).padStart(5, '0')}`,
  INV: (n, year) => `INV-${year}-${String(n).padStart(5, '0')}`,
  CHG: n => `CHG-${String(n).padStart(6, '0')}`,
  APR: n => `APR-${String(n).padStart(4, '0')}`,
  RCP: n => `RCP-${String(n).padStart(6, '0')}`,
  SKU: n => `SKU-${String(n).padStart(5, '0')}`,
};

export function nextReference(db: OpsDB, prefix: keyof typeof REF_FORMAT, at: string): string {
  const next = (db.settings.counters[prefix] ?? 0) + 1;
  db.settings.counters[prefix] = next;
  return REF_FORMAT[prefix](next, new Date(at).getUTCFullYear());
}

export function makeCtx(db: OpsDB, actor: Employee, at = new Date().toISOString()): Ctx {
  return { db, actor, at, requestId: newId() };
}

/* ------------------------------------------------------------ Lookups */

export function find<T extends { id: string }>(list: T[], id: string, kind: string): T {
  const item = list.find(entry => entry.id === id);
  if (!item) throw new OpsError('NOT_FOUND', `${kind} not found.`);
  return item;
}

export const getLocation = (db: OpsDB, id: string): Location => find(db.locations, id, 'Location');
export const getEmployee = (db: OpsDB, id: string): Employee => find(db.employees, id, 'Employee');
export const getParty = (db: OpsDB, id: string): Party => find(db.parties, id, 'Party');
export const getContainer = (db: OpsDB, id: string): Container => find(db.containers, id, 'Container');
export const getVesselCall = (db: OpsDB, id: string): VesselCall => find(db.vesselCalls, id, 'Vessel call');

export function partyName(db: OpsDB, id: string | null | undefined): string {
  if (!id) return '';
  return db.parties.find(party => party.id === id)?.name ?? 'Unknown party';
}

export function locationName(db: OpsDB, id: string | null | undefined): string {
  if (!id) return '';
  return db.locations.find(location => location.id === id)?.name ?? 'Unknown location';
}

export function employeeName(db: OpsDB, id: string | null | undefined): string {
  if (!id) return '';
  return db.employees.find(employee => employee.id === id)?.name ?? 'Unknown user';
}

/* ------------------------------------------------------------ Guards */

export function canAccessLocation(actor: Employee, locationId: string): boolean {
  return actor.role === 'system_admin' || actor.locationIds.includes(locationId);
}

export function assertLocationAccess(ctx: Ctx, locationId: string) {
  if (!canAccessLocation(ctx.actor, locationId)) {
    throw new OpsError('LOCATION_FORBIDDEN', `You are not authorised to operate at ${locationName(ctx.db, locationId)}.`);
  }
}

export function assertRole(ctx: Ctx, roles: Role[], action: string) {
  if (ctx.actor.role === 'system_admin') return;
  if (!roles.includes(ctx.actor.role)) throw new OpsError('FORBIDDEN', `Your role is not permitted to ${action}.`);
}

export function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new OpsError('VALIDATION', `${label} must be greater than zero.`);
}

export function assertVersion(current: number, expected: number | undefined, kind: string) {
  if (expected !== undefined && expected !== current) {
    throw new OpsError('CONFLICT', `${kind} was changed by someone else while you were editing. Reload and try again.`);
  }
}

export function requireText(value: string | undefined, label: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) throw new OpsError('VALIDATION', `${label} is required.`);
  return trimmed;
}

/* ------------------------------------------------------------ Cross-cutting records */

export function audit(ctx: Ctx, entry: Omit<AuditEntry, 'id' | 'actorId' | 'actorName' | 'orgId' | 'requestId' | 'timestamp'>) {
  ctx.db.audit.push({
    id: newId(),
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    orgId: ctx.actor.orgId,
    requestId: ctx.requestId,
    timestamp: ctx.at,
    ...entry,
  });
}

export function notify(ctx: Ctx, input: { type: NotificationType; severity: Severity; title: string; body: string; entity?: Notification['entity']; audience?: Role[] }) {
  ctx.db.notifications.push({
    id: newId(),
    type: input.type,
    severity: input.severity,
    title: input.title,
    body: input.body,
    entity: input.entity,
    audience: input.audience ?? [],
    createdAt: ctx.at,
    readBy: [],
  });
  // Transactional outbox: the event is written in the same transaction as the business change.
  ctx.db.outbox.push({ id: newId(), type: `notification.${input.type}`, payload: { title: input.title }, createdAt: ctx.at, status: 'pending', attempts: 0 });
}

export function publishEvent(ctx: Ctx, type: string, payload: Record<string, unknown>) {
  ctx.db.outbox.push({ id: newId(), type, payload, createdAt: ctx.at, status: 'pending', attempts: 0 });
}

/** Returns the earlier result for a key already processed, otherwise runs `fn` and records it. */
export function idempotent<T extends { id: string }>(ctx: Ctx, key: string | undefined, kind: keyof OpsDB, fn: () => T): { result: T; replayed: boolean } {
  if (key) {
    const existing = ctx.db.idempotency[key];
    if (existing) {
      const list = ctx.db[existing.resultKind as keyof OpsDB] as unknown as { id: string }[] | undefined;
      const found = Array.isArray(list) ? (list.find(item => item.id === existing.resultId) as T | undefined) : undefined;
      if (found) return { result: found, replayed: true };
    }
  }
  const result = fn();
  if (key) ctx.db.idempotency[key] = { key, resultKind: kind, resultId: result.id, at: ctx.at };
  return { result, replayed: false };
}

/* ------------------------------------------------------------ Charges */

export function addCharge(ctx: Ctx, input: {
  serviceCode: ServiceCode; partyId: string; quantity?: number; unitAmount: number; currency?: Currency; description?: string;
  containerId?: string; vesselCallId?: string; orderId?: string; transportJobId?: string; tokenId?: string;
}): Charge {
  const quantity = input.quantity ?? 1;
  const charge: Charge = {
    id: newId(),
    reference: nextReference(ctx.db, 'CHG', ctx.at),
    serviceCode: input.serviceCode,
    description: input.description ?? SERVICE_LABELS[input.serviceCode],
    partyId: input.partyId,
    containerId: input.containerId,
    vesselCallId: input.vesselCallId,
    orderId: input.orderId,
    transportJobId: input.transportJobId,
    tokenId: input.tokenId,
    quantity,
    unitAmount: Math.round(input.unitAmount * 100) / 100,
    amount: Math.round(input.unitAmount * quantity * 100) / 100,
    currency: input.currency ?? ctx.db.tariff.currency,
    invoiceId: null,
    createdBy: ctx.actor.id,
    createdAt: ctx.at,
  };
  ctx.db.charges.push(charge);
  return charge;
}
