/*
 * GT Logistics services: inland transfers from the terminal to the depots (the
 * three-day uncollected rule from the April 2026 advisory) and Momentum transport
 * jobs for the truck fleet.
 */

import type { InlandTransfer, TransportJob, TransportJobType } from '../types';
import { TRANSPORT_STATUS_LABELS } from '../types';
import {
  addCharge, assertLocationAccess, assertRole, assertVersion, audit, find, getContainer, getLocation, getParty, locationName, newId,
  nextReference, notify, partyName, publishEvent, requireText, type Ctx, OpsError,
} from '../core';
import { activeHolds, createTaskInternal, recordEvent } from './terminal';
import { sizeIndex } from '../tariff';

/* ============================================================ Uncollected containers */

/** Import boxes still in a terminal yard beyond the free collection window after vessel completion. */
export function uncollectedContainers(db: import('../types').OpsDB, now: string) {
  const limit = db.tariff.uncollectedTransferDays * 24 * 3600 * 1000;
  return db.containers.filter(container => {
    if (container.category !== 'import' || container.status !== 'in_yard' || !container.locationId) return false;
    const location = db.locations.find(entry => entry.id === container.locationId);
    if (!location || location.type !== 'terminal') return false;
    const call = db.vesselCalls.find(entry => entry.id === container.inboundCallId);
    const reference = call?.opsCompletedAt ?? container.dischargedAt;
    if (!reference) return false;
    return new Date(now).getTime() - new Date(reference).getTime() > limit;
  });
}

/* ============================================================ Inland transfers */

export function createInlandTransfer(ctx: Ctx, input: { fromLocationId: string; toLocationId: string; containerIds: string[]; reason: InlandTransfer['reason']; tractor?: string; trailer?: string; driverName?: string }): InlandTransfer {
  assertRole(ctx, ['terminal_ops', 'transport_manager', 'planner'], 'create inland transfers');
  const from = getLocation(ctx.db, input.fromLocationId);
  const to = getLocation(ctx.db, input.toLocationId);
  if (from.id === to.id) throw new OpsError('VALIDATION', 'Source and destination must differ.');
  if (!['inland_depot', 'logistics_centre'].includes(to.type)) throw new OpsError('VALIDATION', `${to.name} is not an inland depot.`);
  if (!to.active) throw new OpsError('INVALID_STATE', `${to.name} is inactive.`);
  assertLocationAccess(ctx, from.id);
  if (input.containerIds.length === 0) throw new OpsError('VALIDATION', 'Select at least one container.');
  const containers = input.containerIds.map(id => getContainer(ctx.db, id));
  for (const container of containers) {
    if (container.status !== 'in_yard' || container.locationId !== from.id) throw new OpsError('INVALID_STATE', `${container.number} is not in the yard at ${from.name}.`);
    if (container.tokenId) throw new OpsError('INVALID_STATE', `${container.number} has an active e-token; cancel it or let the haulier collect it.`);
    if (ctx.db.inlandTransfers.some(transfer => transfer.status !== 'received' && transfer.containerIds.includes(container.id))) throw new OpsError('DUPLICATE', `${container.number} is already on an open transfer.`);
  }
  const transfer: InlandTransfer = {
    id: newId(), reference: nextReference(ctx.db, 'TR', ctx.at), fromLocationId: from.id, toLocationId: to.id, containerIds: containers.map(container => container.id),
    receivedContainerIds: [], reason: input.reason, status: 'planned', transportJobId: null, createdBy: ctx.actor.id, createdAt: ctx.at,
  };
  ctx.db.inlandTransfers.push(transfer);
  const job = createTransportJobInternal(ctx, {
    type: 'inland_transfer', fromLocationId: from.id, toLocationId: to.id, customerId: null, destinationAddress: to.name, containerIds: transfer.containerIds,
    tractor: input.tractor ?? '', trailer: input.trailer ?? '', driverName: input.driverName ?? '', scheduledAt: ctx.at, inlandTransferId: transfer.id,
  });
  transfer.transportJobId = job.id;
  for (const container of containers) {
    container.transportJobId = job.id;
    recordEvent(ctx, container, 'inland_transfer_out', `Planned for transfer ${transfer.reference} to ${to.name} (${input.reason.replace(/_/g, ' ')})`, { refKind: 'transfer', refId: transfer.id });
  }
  createTaskInternal(ctx, { title: `Receive transfer ${transfer.reference}: ${containers.length} container(s) from ${from.code}`, type: 'transfer', locationId: to.id, priority: 'normal', dueAt: ctx.at, refKind: 'transfer', refId: transfer.id });
  audit(ctx, { locationId: from.id, action: 'transfer.created', entityKind: 'inland_transfer', entityId: transfer.id, entityRef: transfer.reference, after: { to: to.code, containers: containers.length, reason: input.reason } });
  notify(ctx, { type: 'inland_transfer', severity: 'info', title: `Inland transfer ${transfer.reference}`, body: `${containers.length} container(s) planned from ${from.name} to ${to.name}. Costs are for the account of the cargo interests.`, entity: { kind: 'transfer', id: transfer.id }, audience: ['transport_manager', 'customer_service', 'finance_manager'] });
  return transfer;
}

export function dispatchInlandTransfer(ctx: Ctx, input: { transferId: string }): InlandTransfer {
  assertRole(ctx, ['terminal_ops', 'transport_manager', 'gate_officer'], 'dispatch inland transfers');
  const transfer = find(ctx.db.inlandTransfers, input.transferId, 'Inland transfer');
  if (transfer.status !== 'planned') throw new OpsError('INVALID_STATE', `${transfer.reference} has already left.`);
  assertLocationAccess(ctx, transfer.fromLocationId);
  const job = transfer.transportJobId ? find(ctx.db.transportJobs, transfer.transportJobId, 'Transport job') : null;
  if (job && !job.tractor) throw new OpsError('NOT_READY', `Assign a tractor and driver to ${job.reference} before dispatch.`);
  transfer.status = 'in_transit';
  transfer.dispatchedAt = ctx.at;
  if (job) { job.status = 'en_route'; job.startedAt = ctx.at; job.version += 1; job.updatedAt = ctx.at; }
  for (const id of transfer.containerIds) {
    const container = getContainer(ctx.db, id);
    const from = container.yardPosition;
    container.status = 'on_truck';
    container.yardPosition = null;
    container.gateOutAt = ctx.at;
    if (container.reefer) container.reefer.plugged = false;
    recordEvent(ctx, container, 'inland_transfer_out', `Left ${locationName(ctx.db, transfer.fromLocationId)} on transfer ${transfer.reference}${job?.tractor ? `, tractor ${job.tractor}` : ''}`, { fromPosition: from, refKind: 'transfer', refId: transfer.id });
  }
  audit(ctx, { locationId: transfer.fromLocationId, action: 'transfer.dispatched', entityKind: 'inland_transfer', entityId: transfer.id, entityRef: transfer.reference, after: { containers: transfer.containerIds.length } });
  publishEvent(ctx, 'transfer.dispatched', { transferId: transfer.id });
  return transfer;
}

export function receiveInlandTransfer(ctx: Ctx, input: { transferId: string; lines: { containerId: string; yardPosition: string; damageRemarks?: string }[] }): InlandTransfer {
  assertRole(ctx, ['terminal_ops', 'gate_officer', 'warehouse_supervisor', 'transport_manager'], 'receive inland transfers');
  const transfer = find(ctx.db.inlandTransfers, input.transferId, 'Inland transfer');
  if (transfer.status !== 'in_transit') throw new OpsError('INVALID_STATE', `${transfer.reference} is ${transfer.status.replace('_', ' ')}.`);
  assertLocationAccess(ctx, transfer.toLocationId);
  if (input.lines.length === 0) throw new OpsError('VALIDATION', 'Record at least one container.');
  const to = getLocation(ctx.db, transfer.toLocationId);
  for (const line of input.lines) {
    if (!transfer.containerIds.includes(line.containerId)) throw new OpsError('VALIDATION', 'That container is not on this transfer.');
    if (transfer.receivedContainerIds.includes(line.containerId)) continue;
    const container = getContainer(ctx.db, line.containerId);
    const position = requireText(line.yardPosition, 'Yard position').toUpperCase();
    container.status = 'in_yard';
    container.locationId = to.id;
    container.yardPosition = position;
    container.gateInAt = ctx.at;
    container.transportJobId = null;
    if (container.reefer) container.reefer.plugged = true;
    transfer.receivedContainerIds.push(container.id);
    addCharge(ctx, { serviceCode: 'INLAND_TRANSFER', partyId: container.consigneeId ?? container.lineId, unitAmount: ctx.db.tariff.inlandTransfer[sizeIndex(container)], containerId: container.id, description: `Inland transfer ${transfer.reference} to ${to.name}` });
    recordEvent(ctx, container, 'inland_transfer_in', `Received at ${to.name}, stacked at ${position}${line.damageRemarks ? `. Remarks: ${line.damageRemarks.trim()}` : ''}`, { toPosition: position, refKind: 'transfer', refId: transfer.id });
  }
  if (transfer.receivedContainerIds.length === transfer.containerIds.length) {
    transfer.status = 'received';
    transfer.receivedAt = ctx.at;
    if (transfer.transportJobId) { const job = find(ctx.db.transportJobs, transfer.transportJobId, 'Transport job'); job.status = 'delivered'; job.deliveredAt = ctx.at; job.version += 1; job.updatedAt = ctx.at; }
    for (const task of ctx.db.tasks) if (task.refKind === 'transfer' && task.refId === transfer.id && ['open', 'in_progress'].includes(task.status)) { task.status = 'done'; task.updatedAt = ctx.at; }
  }
  audit(ctx, { locationId: to.id, action: 'transfer.received', entityKind: 'inland_transfer', entityId: transfer.id, entityRef: transfer.reference, after: { received: transfer.receivedContainerIds.length, of: transfer.containerIds.length } });
  return transfer;
}

/* ============================================================ Transport jobs */

export interface TransportJobInput {
  type: TransportJobType; fromLocationId: string | null; toLocationId: string | null; customerId: string | null; destinationAddress: string;
  containerIds: string[]; warehouseOrderId?: string | null; inlandTransferId?: string | null; tractor: string; trailer: string; driverName: string; scheduledAt: string;
}

export function createTransportJobInternal(ctx: Ctx, input: TransportJobInput): TransportJob {
  const job: TransportJob = {
    id: newId(), reference: nextReference(ctx.db, 'TJ', ctx.at), type: input.type, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId,
    customerId: input.customerId, destinationAddress: input.destinationAddress.trim(), containerIds: [...input.containerIds], warehouseOrderId: input.warehouseOrderId ?? null,
    inlandTransferId: input.inlandTransferId ?? null, tractor: input.tractor.trim().toUpperCase(), trailer: input.trailer.trim().toUpperCase(), driverName: input.driverName.trim(),
    scheduledAt: input.scheduledAt, status: input.tractor.trim() ? 'assigned' : 'planned', version: 1, createdBy: ctx.actor.id, createdAt: ctx.at, updatedAt: ctx.at,
  };
  ctx.db.transportJobs.push(job);
  return job;
}

export function createTransportJob(ctx: Ctx, input: TransportJobInput): TransportJob {
  assertRole(ctx, ['transport_manager', 'customer_service'], 'create transport jobs');
  if (input.type === 'inland_transfer') throw new OpsError('VALIDATION', 'Inland transfers are created from the Inland transfers screen.');
  if (input.customerId) getParty(ctx.db, input.customerId);
  if (input.fromLocationId) getLocation(ctx.db, input.fromLocationId);
  if (input.toLocationId) getLocation(ctx.db, input.toLocationId);
  if (!input.destinationAddress.trim() && !input.toLocationId) throw new OpsError('VALIDATION', 'A destination is required.');
  if (!input.scheduledAt) throw new OpsError('VALIDATION', 'Scheduled time is required.');
  for (const id of input.containerIds) {
    const container = getContainer(ctx.db, id);
    if (input.type === 'import_delivery' && container.status !== 'on_truck') throw new OpsError('INVALID_STATE', `${container.number} has not been gated out yet.`);
    if (ctx.db.transportJobs.some(job => !['closed', 'cancelled', 'delivered'].includes(job.status) && job.containerIds.includes(id))) throw new OpsError('DUPLICATE', `${container.number} is already on an open transport job.`);
  }
  if (input.warehouseOrderId) {
    const order = find(ctx.db.warehouseOrders, input.warehouseOrderId, 'Warehouse order');
    if (order.type !== 'outbound') throw new OpsError('VALIDATION', 'Only outbound orders are delivered by transport.');
  }
  const job = createTransportJobInternal(ctx, input);
  for (const id of job.containerIds) { const container = getContainer(ctx.db, id); container.transportJobId = job.id; recordEvent(ctx, container, 'haulier_assigned', `Momentum transport job ${job.reference} (${input.type.replace(/_/g, ' ')})`, { refKind: 'transport_job', refId: job.id }); }
  if (job.warehouseOrderId) { const order = find(ctx.db.warehouseOrders, job.warehouseOrderId, 'Warehouse order'); order.transportJobId = job.id; }
  if (job.customerId) addCharge(ctx, { serviceCode: 'TRANSPORT', partyId: job.customerId, unitAmount: ctx.db.tariff.transportPerTrip, transportJobId: job.id, description: `${job.reference} ${input.type.replace(/_/g, ' ')} to ${job.destinationAddress || locationName(ctx.db, job.toLocationId)}` });
  audit(ctx, { locationId: job.fromLocationId, action: 'transport_job.created', entityKind: 'transport_job', entityId: job.id, entityRef: job.reference, after: { type: job.type, containers: job.containerIds.length, customer: job.customerId } });
  return job;
}

export function assignTransportJob(ctx: Ctx, input: { jobId: string; tractor: string; trailer: string; driverName: string; expectedVersion?: number }): TransportJob {
  assertRole(ctx, ['transport_manager'], 'assign vehicles to transport jobs');
  const job = find(ctx.db.transportJobs, input.jobId, 'Transport job');
  assertVersion(job.version, input.expectedVersion, 'Transport job');
  if (!['planned', 'assigned'].includes(job.status)) throw new OpsError('INVALID_STATE', `${job.reference} is ${TRANSPORT_STATUS_LABELS[job.status].toLowerCase()}.`);
  const tractor = requireText(input.tractor, 'Tractor').toUpperCase();
  const busy = ctx.db.transportJobs.find(other => other.id !== job.id && other.tractor === tractor && other.status === 'en_route');
  if (busy) throw new OpsError('CONFLICT', `Tractor ${tractor} is en route on ${busy.reference}.`);
  const before = { tractor: job.tractor, driver: job.driverName };
  job.tractor = tractor;
  job.trailer = input.trailer.trim().toUpperCase();
  job.driverName = requireText(input.driverName, 'Driver name');
  job.status = 'assigned';
  job.version += 1;
  job.updatedAt = ctx.at;
  audit(ctx, { locationId: job.fromLocationId, action: 'transport_job.assigned', entityKind: 'transport_job', entityId: job.id, entityRef: job.reference, before, after: { tractor: job.tractor, driver: job.driverName } });
  return job;
}

export function startTransportJob(ctx: Ctx, input: { jobId: string; expectedVersion?: number }): TransportJob {
  assertRole(ctx, ['transport_manager', 'warehouse_supervisor', 'gate_officer'], 'start transport jobs');
  const job = find(ctx.db.transportJobs, input.jobId, 'Transport job');
  assertVersion(job.version, input.expectedVersion, 'Transport job');
  if (job.status !== 'assigned') throw new OpsError('INVALID_STATE', job.status === 'planned' ? 'Assign a tractor and driver first.' : `${job.reference} is ${TRANSPORT_STATUS_LABELS[job.status].toLowerCase()}.`);
  if (job.inlandTransferId) throw new OpsError('VALIDATION', 'Inland transfers are dispatched from the Inland transfers screen.');
  job.status = 'en_route';
  job.startedAt = ctx.at;
  job.version += 1;
  job.updatedAt = ctx.at;
  for (const id of job.containerIds) { const container = getContainer(ctx.db, id); recordEvent(ctx, container, 'haulier_assigned', `En route on ${job.reference}, tractor ${job.tractor}`, { refKind: 'transport_job', refId: job.id }); }
  audit(ctx, { locationId: job.fromLocationId, action: 'transport_job.started', entityKind: 'transport_job', entityId: job.id, entityRef: job.reference });
  return job;
}

export function completeTransportJob(ctx: Ctx, input: { jobId: string; receivedBy: string; note: string; expectedVersion?: number }): TransportJob {
  assertRole(ctx, ['transport_manager', 'warehouse_supervisor'], 'complete transport jobs');
  const job = find(ctx.db.transportJobs, input.jobId, 'Transport job');
  assertVersion(job.version, input.expectedVersion, 'Transport job');
  if (job.status !== 'en_route') throw new OpsError('INVALID_STATE', `${job.reference} is not en route.`);
  if (job.inlandTransferId) throw new OpsError('VALIDATION', 'Inland transfers are received at the depot from the Inland transfers screen.');
  const receivedBy = requireText(input.receivedBy, 'Received by');
  job.status = 'delivered';
  job.deliveredAt = ctx.at;
  job.proofOfDelivery = { receivedBy, at: ctx.at, note: input.note.trim() };
  job.version += 1;
  job.updatedAt = ctx.at;
  for (const id of job.containerIds) {
    const container = getContainer(ctx.db, id);
    if (job.type === 'import_delivery') { container.status = 'delivered'; container.deliveredAt = ctx.at; recordEvent(ctx, container, 'delivered', `Delivered to ${job.destinationAddress || partyName(ctx.db, job.customerId)}, received by ${receivedBy}`, { refKind: 'transport_job', refId: job.id }); }
    container.transportJobId = null;
  }
  if (job.warehouseOrderId) { const order = find(ctx.db.warehouseOrders, job.warehouseOrderId, 'Warehouse order'); if (order.status === 'picked') { order.status = 'dispatched'; order.version += 1; order.updatedAt = ctx.at; } }
  audit(ctx, { locationId: job.toLocationId, action: 'transport_job.delivered', entityKind: 'transport_job', entityId: job.id, entityRef: job.reference, after: { receivedBy } });
  publishEvent(ctx, 'transport.delivered', { jobId: job.id });
  return job;
}

export function cancelTransportJob(ctx: Ctx, input: { jobId: string; reason: string }): TransportJob {
  assertRole(ctx, ['transport_manager'], 'cancel transport jobs');
  const job = find(ctx.db.transportJobs, input.jobId, 'Transport job');
  if (!['planned', 'assigned'].includes(job.status)) throw new OpsError('INVALID_STATE', 'Jobs already en route cannot be cancelled; complete them instead.');
  if (job.inlandTransferId) throw new OpsError('VALIDATION', 'Cancel the inland transfer instead.');
  const reason = requireText(input.reason, 'Reason');
  job.status = 'cancelled';
  job.version += 1;
  job.updatedAt = ctx.at;
  for (const id of job.containerIds) { const container = getContainer(ctx.db, id); container.transportJobId = null; }
  for (const charge of ctx.db.charges) if (charge.transportJobId === job.id && !charge.invoiceId) charge.amount = 0;
  audit(ctx, { locationId: job.fromLocationId, action: 'transport_job.cancelled', entityKind: 'transport_job', entityId: job.id, entityRef: job.reference, reason });
  return job;
}

export function recordTransportDelay(ctx: Ctx, input: { jobId: string; reason: string }): TransportJob {
  assertRole(ctx, ['transport_manager'], 'record transport delays');
  const job = find(ctx.db.transportJobs, input.jobId, 'Transport job');
  if (!['assigned', 'en_route'].includes(job.status)) throw new OpsError('INVALID_STATE', 'Delays apply to assigned or en-route jobs.');
  const reason = requireText(input.reason, 'Reason');
  audit(ctx, { locationId: job.fromLocationId, action: 'transport_job.delayed', entityKind: 'transport_job', entityId: job.id, entityRef: job.reference, reason });
  notify(ctx, { type: 'transport_delayed', severity: 'warning', title: `${job.reference} delayed`, body: reason, entity: { kind: 'transport_job', id: job.id }, audience: ['transport_manager', 'customer_service'] });
  return job;
}

export { activeHolds };
