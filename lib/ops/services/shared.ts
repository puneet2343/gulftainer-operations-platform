/*
 * Cross-module services: work tasks, documents, notifications, the outbox worker,
 * the offline queue for gate and warehouse devices, external integrations
 * (shipping-line EDI, customs, carrier tracking, SAP postings), organisation and
 * user maintenance, and the housekeeping sweep (expired tokens, uncollected boxes,
 * overdue invoices, unplugged reefers).
 */

import type {
  DocumentRecord, DocumentType, DocumentVersion, Employee, IntegrationEvent, IntegrationEventType, Location, LocationType, Notification,
  OpsDB, Party, PartyType, QueuedKind, QueuedOperation, Role, TaskPriority, TaskStatus, TaskType, WorkTask,
} from '../types';
import { assertRole, audit, canAccessLocation, find, getContainer, getEmployee, getLocation, getParty, getVesselCall, locationName, newId, nextReference, notify, requireText, type Ctx, OpsError } from '../core';
import { applyCustoms, createTaskInternal, gateIn, gateOut, recordEvent, shiftContainer, type GateInInput, type GateOutInput } from './terminal';
import { pickOrder, receiveOrder, transferStock, type PickingInput, type ReceivingInput, type StockTransferInput } from './warehouse';
import { uncollectedContainers } from './logistics';
import { normaliseContainerNumber } from '../iso6346';

/* ============================================================ Tasks */

export function createTask(ctx: Ctx, input: { title: string; type: TaskType; locationId: string; assigneeId?: string | null; priority: TaskPriority; dueAt: string; refKind?: WorkTask['refKind']; refId?: string }): WorkTask {
  assertRole(ctx, ['warehouse_supervisor', 'terminal_ops', 'planner', 'transport_manager', 'inventory_manager', 'gate_officer'], 'create tasks');
  const title = requireText(input.title, 'Task title');
  const location = getLocation(ctx.db, input.locationId);
  if (!input.dueAt) throw new OpsError('VALIDATION', 'Due time is required.');
  if (input.assigneeId) {
    const assignee = getEmployee(ctx.db, input.assigneeId);
    if (!canAccessLocation(assignee, location.id)) throw new OpsError('VALIDATION', `${assignee.name} is not assigned to ${location.name}.`);
  }
  const task = createTaskInternal(ctx, { ...input, title });
  audit(ctx, { locationId: location.id, action: 'task.created', entityKind: 'task', entityId: task.id, entityRef: task.reference, after: { title: task.title, assignee: task.assigneeId } });
  return task;
}

export function assignTask(ctx: Ctx, input: { taskId: string; assigneeId: string | null }): WorkTask {
  assertRole(ctx, ['warehouse_supervisor', 'terminal_ops', 'planner', 'transport_manager', 'inventory_manager'], 'assign tasks');
  const task = find(ctx.db.tasks, input.taskId, 'Task');
  if (input.assigneeId) {
    const assignee = getEmployee(ctx.db, input.assigneeId);
    if (!canAccessLocation(assignee, task.locationId)) throw new OpsError('VALIDATION', `${assignee.name} is not assigned to this location.`);
  }
  const before = { assignee: task.assigneeId };
  task.assigneeId = input.assigneeId;
  task.updatedAt = ctx.at;
  audit(ctx, { locationId: task.locationId, action: 'task.assigned', entityKind: 'task', entityId: task.id, entityRef: task.reference, before, after: { assignee: task.assigneeId } });
  return task;
}

export function setTaskStatus(ctx: Ctx, input: { taskId: string; status: TaskStatus }): WorkTask {
  const task = find(ctx.db.tasks, input.taskId, 'Task');
  const supervisor = ['warehouse_supervisor', 'terminal_ops', 'planner', 'transport_manager', 'inventory_manager', 'system_admin'].includes(ctx.actor.role);
  if (!supervisor && task.assigneeId && task.assigneeId !== ctx.actor.id) throw new OpsError('FORBIDDEN', 'Only the assignee or a supervisor can update this task.');
  if (!supervisor && !canAccessLocation(ctx.actor, task.locationId)) throw new OpsError('LOCATION_FORBIDDEN', 'This task belongs to another location.');
  if (task.status === 'done' || task.status === 'cancelled') throw new OpsError('INVALID_STATE', 'This task is closed.');
  const before = { status: task.status };
  task.status = input.status;
  task.updatedAt = ctx.at;
  if (input.status === 'in_progress' && !task.assigneeId) task.assigneeId = ctx.actor.id;
  audit(ctx, { locationId: task.locationId, action: `task.${input.status}`, entityKind: 'task', entityId: task.id, entityRef: task.reference, before, after: { status: task.status } });
  return task;
}

/* ============================================================ Documents */

export interface DocumentFile { fileName: string; sizeBytes: number; mimeType: string; checksum: string }

export function addDocument(ctx: Ctx, input: { type: DocumentType; title: string; containerId?: string; vesselCallId?: string; orderId?: string; transportJobId?: string; partyId?: string; file: DocumentFile; note: string; legallySignificant: boolean; retentionYears: number; access: Role[] }): DocumentRecord {
  if (ctx.actor.role === 'auditor') throw new OpsError('FORBIDDEN', 'Auditors have read-only access to documents.');
  const title = requireText(input.title, 'Document title');
  if (!input.file.fileName) throw new OpsError('VALIDATION', 'Choose a file to upload.');
  if (input.containerId) getContainer(ctx.db, input.containerId);
  if (input.vesselCallId) getVesselCall(ctx.db, input.vesselCallId);
  if (input.orderId) find(ctx.db.warehouseOrders, input.orderId, 'Warehouse order');
  if (input.transportJobId) find(ctx.db.transportJobs, input.transportJobId, 'Transport job');
  if (input.partyId) getParty(ctx.db, input.partyId);
  const version: DocumentVersion = { version: 1, ...input.file, uploadedBy: ctx.actor.id, uploadedAt: ctx.at, note: input.note.trim() };
  const document: DocumentRecord = {
    id: newId(), reference: nextReference(ctx.db, 'DOC', ctx.at), type: input.type, title, containerId: input.containerId, vesselCallId: input.vesselCallId, orderId: input.orderId,
    transportJobId: input.transportJobId, partyId: input.partyId, versions: [version], retentionYears: input.retentionYears, access: input.access, legallySignificant: input.legallySignificant,
    createdAt: ctx.at, updatedAt: ctx.at,
  };
  ctx.db.documents.push(document);
  if (input.vesselCallId) {
    const call = getVesselCall(ctx.db, input.vesselCallId);
    if (input.type === 'Bay plan') call.preArrival.bayPlan = true;
    if (input.type === 'BAPLIE') { call.preArrival.baplie = true; call.preArrival.bayPlan = true; }
    if (input.type === 'Dangerous goods declaration') call.preArrival.dgList = true;
  }
  if (input.containerId) {
    const container = getContainer(ctx.db, input.containerId);
    recordEvent(ctx, container, 'inspection', `${input.type} ${document.reference} filed: ${title}`, { refKind: 'document', refId: document.id });
    if (input.type === 'Dangerous goods declaration') {
      for (const hold of container.holds) if (hold.type === 'dg' && !hold.releasedAt) { hold.releasedAt = ctx.at; hold.releasedBy = ctx.actor.id; recordEvent(ctx, container, 'hold_released', 'DG hold released: declaration on file', { refKind: 'hold', refId: hold.id }); }
    }
  }
  audit(ctx, { locationId: null, action: 'document.uploaded', entityKind: 'document', entityId: document.id, entityRef: document.reference, after: { type: document.type, file: version.fileName, checksum: version.checksum } });
  return document;
}

export function addDocumentVersion(ctx: Ctx, input: { documentId: string; file: DocumentFile; note: string }): DocumentRecord {
  if (ctx.actor.role === 'auditor') throw new OpsError('FORBIDDEN', 'Auditors have read-only access to documents.');
  const document = find(ctx.db.documents, input.documentId, 'Document');
  if (!input.file.fileName) throw new OpsError('VALIDATION', 'Choose a file to upload.');
  const latest = document.versions[document.versions.length - 1];
  if (latest.checksum === input.file.checksum) throw new OpsError('DUPLICATE', 'This file is identical to the current version.');
  // Versions are append-only: the earlier file stays on record (SRS §4.6).
  const version: DocumentVersion = { version: latest.version + 1, ...input.file, uploadedBy: ctx.actor.id, uploadedAt: ctx.at, note: input.note.trim() };
  document.versions.push(version);
  document.updatedAt = ctx.at;
  audit(ctx, { locationId: null, action: 'document.new_version', entityKind: 'document', entityId: document.id, entityRef: document.reference, before: { version: latest.version, checksum: latest.checksum }, after: { version: version.version, checksum: version.checksum } });
  return document;
}

export function canOpenDocument(document: DocumentRecord, actor: Employee): boolean {
  return actor.role === 'system_admin' || actor.role === 'auditor' || document.access.length === 0 || document.access.includes(actor.role);
}

/* ============================================================ Notifications & outbox */

export function markNotificationsRead(ctx: Ctx, ids: string[] | 'all') {
  for (const notification of ctx.db.notifications) {
    if ((ids === 'all' || ids.includes(notification.id)) && !notification.readBy.includes(ctx.actor.id)) notification.readBy.push(ctx.actor.id);
  }
}

export function notificationsFor(db: OpsDB, actor: Employee): Notification[] {
  return db.notifications.filter(notification => notification.audience.length === 0 || actor.role === 'system_admin' || notification.audience.includes(actor.role));
}

/** The outbox worker: publishes pending events. Runs after commits (see OutboxWorker component). */
export function processOutbox(db: OpsDB, at: string): number {
  let published = 0;
  for (const event of db.outbox) {
    if (event.status !== 'pending') continue;
    event.attempts += 1;
    event.status = 'published';
    event.publishedAt = at;
    published += 1;
  }
  return published;
}

/* ============================================================ Offline queue (SRS §6) */

export function enqueueOffline(ctx: Ctx, input: { kind: QueuedKind; summary: string; payload: Record<string, unknown> }): QueuedOperation {
  const clientId = (input.payload.idempotencyKey as string) || newId();
  const queued: QueuedOperation = { clientId, kind: input.kind, summary: input.summary, payload: { ...input.payload, idempotencyKey: clientId }, queuedAt: ctx.at, queuedBy: ctx.actor.id, status: 'queued', attempts: 0 };
  ctx.db.offlineQueue.push(queued);
  return queued;
}

export class QueuedRejection extends Error {
  clientId: string;
  constructor(clientId: string, message: string) {
    super(message);
    this.name = 'QueuedRejection';
    this.clientId = clientId;
  }
}

/** Replays one queued operation through the normal services. Validation failures surface as a rejection for reconciliation. */
export function syncQueued(ctx: Ctx, clientId: string): QueuedOperation {
  const queued = ctx.db.offlineQueue.find(item => item.clientId === clientId);
  if (!queued) throw new OpsError('NOT_FOUND', 'Queued operation not found.');
  if (queued.status === 'synced') return queued;
  queued.attempts += 1;
  const actor = ctx.db.employees.find(employee => employee.id === queued.queuedBy) ?? ctx.actor;
  const replayCtx: Ctx = { ...ctx, actor };
  const payload = { ...queued.payload, idempotencyKey: clientId, syncedFromClientId: clientId };
  try {
    let reference = '';
    if (queued.kind === 'gate_out') reference = gateOut(replayCtx, payload as unknown as GateOutInput).transaction.reference;
    else if (queued.kind === 'gate_in') reference = gateIn(replayCtx, payload as unknown as GateInInput).transaction.reference;
    else if (queued.kind === 'yard_shift') { const { event } = shiftContainer(replayCtx, payload as unknown as Parameters<typeof shiftContainer>[1]); const container = ctx.db.containers.find(entry => entry.id === event.containerId); reference = `${container?.number ?? 'container'} at ${event.toPosition}`; }
    else if (queued.kind === 'receiving') reference = receiveOrder(replayCtx, payload as unknown as ReceivingInput).operation.reference;
    else if (queued.kind === 'picking') reference = pickOrder(replayCtx, payload as unknown as PickingInput).operation.reference;
    else reference = transferStock(replayCtx, payload as unknown as StockTransferInput).operation.reference;
    queued.status = 'synced';
    queued.serverReference = reference;
    queued.syncedAt = ctx.at;
    queued.error = undefined;
  } catch (error) {
    throw new QueuedRejection(clientId, error instanceof Error ? error.message : 'Rejected by validation.');
  }
  return queued;
}

export function discardQueued(ctx: Ctx, clientId: string) {
  const index = ctx.db.offlineQueue.findIndex(item => item.clientId === clientId);
  if (index === -1) throw new OpsError('NOT_FOUND', 'Queued operation not found.');
  const [queued] = ctx.db.offlineQueue.splice(index, 1);
  audit(ctx, { locationId: null, action: 'offline.discarded', entityKind: 'queued_operation', entityId: queued.clientId, entityRef: queued.summary, reason: queued.error });
}

export function requeue(ctx: Ctx, clientId: string): QueuedOperation {
  const queued = ctx.db.offlineQueue.find(item => item.clientId === clientId);
  if (!queued) throw new OpsError('NOT_FOUND', 'Queued operation not found.');
  if (queued.status !== 'rejected') throw new OpsError('INVALID_STATE', 'Only rejected operations can be retried.');
  queued.status = 'queued';
  queued.error = undefined;
  return queued;
}

/* ============================================================ Integrations (SRS §13) */

export class IntegrationFailure extends Error {
  record: IntegrationEvent;
  constructor(record: IntegrationEvent, message: string) {
    super(message);
    this.name = 'IntegrationFailure';
    this.record = record;
  }
}

export interface InboundEvent { provider: string; eventId: string; type: IntegrationEventType; subject: string; payload?: Record<string, unknown> }

/**
 * Applies an inbound message. Duplicates (same provider + event id) are recorded and
 * ignored; anything that fails validation is recorded as failed without touching
 * committed data.
 */
export function ingestIntegrationEvent(ctx: Ctx, input: InboundEvent): IntegrationEvent {
  const duplicate = ctx.db.integrations.find(event => event.provider === input.provider && event.eventId === input.eventId);
  const record: IntegrationEvent = { id: newId(), provider: input.provider, eventId: input.eventId, type: input.type, subject: input.subject, receivedAt: ctx.at, status: 'applied', detail: '' };
  if (duplicate) {
    record.status = 'duplicate';
    record.detail = `Already processed at ${duplicate.receivedAt.slice(0, 16).replace('T', ' ')} UTC; ignored.`;
    ctx.db.integrations.push(record);
    return record;
  }
  const systemCtx: Ctx = { ...ctx, actor: ctx.db.employees.find(employee => employee.username === 'integration') ?? ctx.actor };
  try {
    if (input.type === 'CUSTOMS_CLEARANCE') {
      const number = normaliseContainerNumber(input.subject);
      const container = ctx.db.containers.find(entry => entry.number === number && entry.status !== 'delivered');
      if (!container) throw new OpsError('NOT_FOUND', `No active container ${number}.`);
      const status = (input.payload?.status as 'cleared' | 'inspection' | undefined) ?? 'cleared';
      applyCustoms(systemCtx, container, status, `${input.provider} ${input.eventId}`);
      record.detail = `${container.number} customs ${status}.`;
    } else if (input.type === 'BAPLIE' || input.type === 'COPRAR') {
      const call = ctx.db.vesselCalls.find(entry => entry.voyage === input.subject.toUpperCase());
      if (!call) throw new OpsError('NOT_FOUND', `No vessel call with voyage ${input.subject}.`);
      if (['completed', 'departed'].includes(call.status)) throw new OpsError('INVALID_STATE', `${call.vessel} ${call.voyage} has completed operations.`);
      if (input.type === 'BAPLIE') { call.preArrival.baplie = true; call.preArrival.bayPlan = true; call.preArrival.dischargeList = true; }
      else call.preArrival.loadList = true;
      call.version += 1;
      call.updatedAt = ctx.at;
      record.detail = `${input.type} applied to ${call.vessel} ${call.voyage}.`;
    } else if (input.type === 'CARRIER_TRACKING') {
      const call = ctx.db.vesselCalls.find(entry => entry.voyage === input.subject.toUpperCase());
      if (!call) throw new OpsError('NOT_FOUND', `No vessel call with voyage ${input.subject}.`);
      if (call.status !== 'expected') throw new OpsError('INVALID_STATE', `${call.vessel} ${call.voyage} is already ${call.status}.`);
      const eta = input.payload?.eta as string | undefined;
      if (!eta) throw new OpsError('VALIDATION', 'Tracking message has no ETA.');
      const before = call.eta;
      call.eta = eta;
      if (new Date(eta) > new Date(call.etb)) { const shift = new Date(eta).getTime() - new Date(call.etb).getTime(); call.etb = eta; call.etd = new Date(new Date(call.etd).getTime() + shift).toISOString(); call.gateOpen = new Date(new Date(eta).getTime() - 4 * 86400000).toISOString(); call.gateClose = new Date(new Date(eta).getTime() - 86400000).toISOString(); }
      call.version += 1;
      call.updatedAt = ctx.at;
      audit(systemCtx, { locationId: call.terminalId, action: 'vessel_call.eta_updated', entityKind: 'vessel_call', entityId: call.id, entityRef: call.voyage, before: { eta: before }, after: { eta } });
      record.detail = `ETA of ${call.vessel} ${call.voyage} updated to ${eta.slice(0, 16).replace('T', ' ')} UTC.`;
    } else {
      const invoice = ctx.db.invoices.find(entry => entry.reference === input.subject);
      if (!invoice) throw new OpsError('NOT_FOUND', `No invoice ${input.subject}.`);
      record.detail = `${invoice.reference} acknowledged by SAP S/4HANA.`;
    }
  } catch (error) {
    throw new IntegrationFailure(record, error instanceof Error ? error.message : 'Failed to apply event.');
  }
  ctx.db.integrations.push(record);
  return record;
}

/* ============================================================ Organisation & people */

export function upsertLocation(ctx: Ctx, input: Omit<Location, 'id'> & { id?: string }): Location {
  assertRole(ctx, [], 'manage locations');
  const code = requireText(input.code, 'Code').toUpperCase();
  const name = requireText(input.name, 'Name');
  find(ctx.db.organizations, input.orgId, 'Organisation');
  const clash = ctx.db.locations.find(location => location.code.toLowerCase() === code.toLowerCase() && location.id !== input.id);
  if (clash) throw new OpsError('DUPLICATE', `Location code ${code} is already used by ${clash.name}.`);
  if (input.id) {
    const location = getLocation(ctx.db, input.id);
    const before = { name: location.name, active: location.active, type: location.type };
    Object.assign(location, { ...input, code, name });
    audit(ctx, { locationId: location.id, action: 'location.updated', entityKind: 'location', entityId: location.id, entityRef: location.code, before, after: { name: location.name, active: location.active, type: location.type } });
    return location;
  }
  const location: Location = { ...input, id: newId(), code, name };
  ctx.db.locations.push(location);
  audit(ctx, { locationId: location.id, action: 'location.created', entityKind: 'location', entityId: location.id, entityRef: location.code, after: { name: location.name, type: location.type } });
  return location;
}

export function upsertEmployee(ctx: Ctx, input: { id?: string; username: string; name: string; email: string; role: Role; orgId: string; locationIds: string[]; active: boolean }): Employee {
  assertRole(ctx, [], 'manage users');
  const username = requireText(input.username, 'Login ID').toLowerCase();
  const name = requireText(input.name, 'Name');
  const clash = ctx.db.employees.find(employee => employee.username === username && employee.id !== input.id);
  if (clash) throw new OpsError('DUPLICATE', `Login ID ${username} is already taken.`);
  if (input.id) {
    const employee = getEmployee(ctx.db, input.id);
    if (employee.id === ctx.actor.id && (input.role !== 'system_admin' || !input.active)) throw new OpsError('VALIDATION', 'You cannot remove your own administrator access.');
    const before = { role: employee.role, locations: employee.locationIds.length, active: employee.active };
    Object.assign(employee, { username, name, email: input.email.trim(), role: input.role, orgId: input.orgId, locationIds: input.locationIds, active: input.active });
    audit(ctx, { locationId: null, action: 'user.updated', entityKind: 'employee', entityId: employee.id, entityRef: employee.username, before, after: { role: employee.role, locations: employee.locationIds.length, active: employee.active } });
    return employee;
  }
  const employee: Employee = { id: newId(), username, name, email: input.email.trim(), role: input.role, orgId: input.orgId, locationIds: input.locationIds, active: input.active, createdAt: ctx.at };
  ctx.db.employees.push(employee);
  audit(ctx, { locationId: null, action: 'user.created', entityKind: 'employee', entityId: employee.id, entityRef: employee.username, after: { role: employee.role } });
  return employee;
}

export function upsertParty(ctx: Ctx, input: { id?: string; code: string; name: string; type: PartyType; country: string; email: string; portalRegistered: boolean; creditTerms: number; active: boolean }): Party {
  assertRole(ctx, ['customer_service', 'finance_manager'], 'manage customers');
  const code = requireText(input.code, 'Code').toUpperCase();
  const name = requireText(input.name, 'Name');
  const clash = ctx.db.parties.find(party => party.code === code && party.id !== input.id);
  if (clash) throw new OpsError('DUPLICATE', `Code ${code} is already used by ${clash.name}.`);
  if (input.id) {
    const party = getParty(ctx.db, input.id);
    const before = { name: party.name, portalRegistered: party.portalRegistered, active: party.active };
    Object.assign(party, { ...input, code, name, email: input.email.trim() });
    audit(ctx, { locationId: null, action: 'party.updated', entityKind: 'party', entityId: party.id, entityRef: party.code, before, after: { name: party.name, portalRegistered: party.portalRegistered, active: party.active } });
    return party;
  }
  const party: Party = { id: newId(), ...input, code, name, email: input.email.trim() };
  ctx.db.parties.push(party);
  audit(ctx, { locationId: null, action: 'party.created', entityKind: 'party', entityId: party.id, entityRef: party.code, after: { name: party.name, type: party.type } });
  return party;
}

export function registerPortalAccount(ctx: Ctx, input: { partyId: string }): Party {
  const party = getParty(ctx.db, input.partyId);
  if (party.portalRegistered) throw new OpsError('DUPLICATE', `${party.name} is already registered.`);
  party.portalRegistered = true;
  audit(ctx, { locationId: null, action: 'party.portal_registered', entityKind: 'party', entityId: party.id, entityRef: party.code });
  return party;
}

/* ============================================================ Housekeeping */

/** Time-based rules that a scheduler would run: token expiry, uncollected boxes, overdue invoices, unplugged reefers. */
export function runHousekeeping(ctx: Ctx): { expiredTokens: number; uncollected: number; overdue: number; reeferAlerts: number } {
  const now = new Date(ctx.at);
  let expiredTokens = 0;
  for (const token of ctx.db.tokens) {
    if (token.status === 'generated' && new Date(token.slotEnd) < now) {
      token.status = 'expired';
      token.updatedAt = ctx.at;
      const container = ctx.db.containers.find(entry => entry.id === token.containerId);
      if (container) { if (container.tokenId === token.id) container.tokenId = null; recordEvent(ctx, container, 'token_cancelled', `E-token ${token.number} expired unused`, { refKind: 'token', refId: token.id }); }
      expiredTokens += 1;
    }
  }
  const uncollected = uncollectedContainers(ctx.db, ctx.at);
  let flagged = 0;
  for (const container of uncollected) {
    const already = ctx.db.notifications.some(notification => notification.type === 'uncollected' && notification.entity?.id === container.id);
    if (already) continue;
    notify(ctx, { type: 'uncollected', severity: 'warning', title: `${container.number} not collected`, body: `Still in the yard at ${locationName(ctx.db, container.locationId)} more than ${ctx.db.tariff.uncollectedTransferDays} days after vessel completion. Plan an inland transfer.`, entity: { kind: 'container', id: container.id }, audience: ['terminal_ops', 'transport_manager', 'customer_service'] });
    flagged += 1;
  }
  let overdue = 0;
  for (const invoice of ctx.db.invoices) {
    if (['issued', 'partially_paid'].includes(invoice.status) && invoice.dueAt && new Date(invoice.dueAt) < now) {
      invoice.status = 'overdue';
      invoice.history.push({ at: ctx.at, by: ctx.actor.id, from: 'issued', to: 'overdue', note: 'Past due date' });
      invoice.version += 1;
      notify(ctx, { type: 'invoice_overdue', severity: 'danger', title: `${invoice.reference} overdue`, body: `${invoice.currency} ${(invoice.total - invoice.paid).toFixed(2)} outstanding from ${ctx.db.parties.find(party => party.id === invoice.partyId)?.name}.`, entity: { kind: 'invoice', id: invoice.id }, audience: ['finance_manager'] });
      overdue += 1;
    }
  }
  let reeferAlerts = 0;
  for (const container of ctx.db.containers) {
    if (container.reefer && container.status === 'in_yard' && !container.reefer.plugged) {
      const already = ctx.db.notifications.some(notification => notification.type === 'reefer_alert' && notification.entity?.id === container.id && notification.readBy.length === 0);
      if (already) continue;
      notify(ctx, { type: 'reefer_alert', severity: 'danger', title: `Reefer ${container.number} unplugged`, body: `Setpoint ${container.reefer.setpointC} °C at ${locationName(ctx.db, container.locationId)}, position ${container.yardPosition}.`, entity: { kind: 'container', id: container.id }, audience: ['terminal_ops'] });
      reeferAlerts += 1;
    }
  }
  return { expiredTokens, uncollected: flagged, overdue, reeferAlerts };
}

export { createTaskInternal };
export type { LocationType };
