/*
 * Terminal services: vessel calls, container registration, discharge and load,
 * yard shifts, holds, customs, delivery orders, haulier assignment, e-tokens and
 * the gate. Mirrors the KCT process: vessel pre-arrival documents → discharge →
 * clearance (customs, delivery order, charges) → haulier assignment → e-token →
 * marshalling yard → gate-out with equipment interchange.
 */

import type {
  Container, ContainerCategory, ContainerEvent, ContainerEventType, ContainerSize, ContainerType, CustomsStatus,
  EToken, GateTransaction, HoldType, TokenType, VesselCall,
} from '../types';
import { CONTAINER_EVENT_LABELS, HOLD_LABELS, TOKEN_TYPE_LABELS, VESSEL_STATUS_LABELS } from '../types';
import {
  addCharge, assertLocationAccess, assertRole, assertVersion, audit, find, getContainer, getLocation, getParty, getVesselCall,
  idempotent, locationName, newId, nextReference, notify, partyName, publishEvent, requireText, type Ctx, OpsError,
} from '../core';
import { isOvertime, portReceivingRate, quoteStorage, shiftingRate, stevedoringRate } from '../tariff';
import { normaliseContainerNumber, validateContainerNumber } from '../iso6346';

/* ============================================================ Container helpers */

export function activeHolds(container: Container) {
  return container.holds.filter(hold => !hold.releasedAt);
}

export function recordEvent(ctx: Ctx, container: Container, type: ContainerEventType, note: string, extra: Partial<ContainerEvent> = {}): ContainerEvent {
  const event: ContainerEvent = {
    id: newId(), containerId: container.id, type, at: ctx.at, by: ctx.actor.id, locationId: container.locationId, note,
    ...extra,
  };
  ctx.db.containerEvents.push(event);
  container.version += 1;
  container.updatedAt = ctx.at;
  return event;
}

/** Why an import box cannot be collected yet; empty when it is ready. */
export function releaseBlockers(container: Container, now: string): string[] {
  const blockers: string[] = [];
  if (container.status !== 'in_yard') blockers.push('Not in the yard');
  if (container.category !== 'import' || !container.full) blockers.push('Only full import containers are released to consignees');
  if (container.customsStatus !== 'cleared') blockers.push('Customs clearance pending');
  const holds = activeHolds(container);
  if (holds.length) blockers.push(...holds.map(hold => HOLD_LABELS[hold.type]));
  if (!container.deliveryOrder) blockers.push('Delivery order not received');
  else if (new Date(container.deliveryOrder.validUntil) < new Date(now)) blockers.push('Delivery order expired');
  if (!container.chargesSettled) blockers.push('Charges not settled');
  return blockers;
}

export function isReadyForPickup(container: Container, now: string): boolean {
  return releaseBlockers(container, now).length === 0;
}

export function containerLabel(container: Pick<Container, 'number' | 'size' | 'type'>) {
  return `${container.number} (${container.size}${container.type})`;
}

/* ============================================================ Vessel calls */

export interface VesselCallInput {
  voyage: string; vessel: string; lineId: string; terminalId: string; berth: string; service: string;
  eta: string; etb: string; etd: string; plannedDischarge: number; plannedLoad: number; cranesAllocated: number;
}

export function createVesselCall(ctx: Ctx, input: VesselCallInput): VesselCall {
  assertRole(ctx, ['planner', 'terminal_ops'], 'create vessel calls');
  const voyage = requireText(input.voyage, 'Voyage').toUpperCase();
  const vessel = requireText(input.vessel, 'Vessel name');
  getParty(ctx.db, input.lineId);
  const terminal = getLocation(ctx.db, input.terminalId);
  if (terminal.type !== 'terminal') throw new OpsError('VALIDATION', `${terminal.name} is not a container terminal.`);
  assertLocationAccess(ctx, terminal.id);
  if (ctx.db.vesselCalls.some(call => call.voyage === voyage && call.terminalId === terminal.id)) throw new OpsError('DUPLICATE', `Voyage ${voyage} already exists at ${terminal.code}.`);
  if (!input.eta || !input.etb || !input.etd) throw new OpsError('VALIDATION', 'ETA, ETB and ETD are required.');
  if (new Date(input.etb) < new Date(input.eta)) throw new OpsError('VALIDATION', 'ETB cannot be before ETA.');
  if (new Date(input.etd) <= new Date(input.etb)) throw new OpsError('VALIDATION', 'ETD must be after ETB.');
  const etb = new Date(input.etb);
  const gateOpen = new Date(etb.getTime() - 4 * 24 * 3600 * 1000).toISOString();
  const gateClose = new Date(etb.getTime() - 24 * 3600 * 1000).toISOString();
  const call: VesselCall = {
    id: newId(), voyage, vessel, lineId: input.lineId, terminalId: terminal.id, berth: input.berth.trim(), service: input.service.trim(),
    eta: input.eta, etb: input.etb, etd: input.etd, gateOpen, gateClose, status: 'expected',
    plannedDischarge: Math.max(0, Math.round(input.plannedDischarge)), plannedLoad: Math.max(0, Math.round(input.plannedLoad)),
    discharged: 0, loaded: 0, restows: 0, cranesAllocated: Math.max(1, Math.round(input.cranesAllocated)),
    preArrival: { bayPlan: false, dischargeList: false, loadList: false, dgList: false, baplie: false },
    notices: { h72: false, h48: false, h24: false }, version: 1, createdAt: ctx.at, updatedAt: ctx.at,
  };
  ctx.db.vesselCalls.push(call);
  audit(ctx, { locationId: terminal.id, action: 'vessel_call.created', entityKind: 'vessel_call', entityId: call.id, entityRef: call.voyage, after: { vessel, etb: call.etb, plannedDischarge: call.plannedDischarge, plannedLoad: call.plannedLoad } });
  return call;
}

export function updateVesselCall(ctx: Ctx, input: { callId: string; expectedVersion?: number; patch: Partial<Pick<VesselCall, 'berth' | 'eta' | 'etb' | 'etd' | 'cranesAllocated' | 'plannedDischarge' | 'plannedLoad' | 'service'>> }): VesselCall {
  assertRole(ctx, ['planner', 'terminal_ops'], 'edit vessel calls');
  const call = getVesselCall(ctx.db, input.callId);
  assertVersion(call.version, input.expectedVersion, 'Vessel call');
  if (['completed', 'departed'].includes(call.status)) throw new OpsError('INVALID_STATE', 'Completed calls cannot be edited.');
  const before = { berth: call.berth, etb: call.etb, etd: call.etd };
  Object.assign(call, input.patch);
  if (input.patch.etb) {
    const etb = new Date(input.patch.etb);
    call.gateOpen = new Date(etb.getTime() - 4 * 24 * 3600 * 1000).toISOString();
    call.gateClose = new Date(etb.getTime() - 24 * 3600 * 1000).toISOString();
  }
  call.version += 1;
  call.updatedAt = ctx.at;
  audit(ctx, { locationId: call.terminalId, action: 'vessel_call.updated', entityKind: 'vessel_call', entityId: call.id, entityRef: call.voyage, before, after: { berth: call.berth, etb: call.etb, etd: call.etd } });
  return call;
}

export function recordPreArrival(ctx: Ctx, input: { callId: string; doc?: keyof VesselCall['preArrival']; notice?: keyof VesselCall['notices'] }): VesselCall {
  assertRole(ctx, ['planner', 'terminal_ops', 'customer_service'], 'record pre-arrival documents');
  const call = getVesselCall(ctx.db, input.callId);
  if (input.doc) call.preArrival[input.doc] = true;
  if (input.notice) call.notices[input.notice] = true;
  call.version += 1;
  call.updatedAt = ctx.at;
  audit(ctx, { locationId: call.terminalId, action: 'vessel_call.pre_arrival', entityKind: 'vessel_call', entityId: call.id, entityRef: call.voyage, after: { doc: input.doc, notice: input.notice } });
  return call;
}

function vesselTransition(ctx: Ctx, call: VesselCall, to: VesselCall['status'], note?: string) {
  const from = call.status;
  call.status = to;
  call.version += 1;
  call.updatedAt = ctx.at;
  audit(ctx, { locationId: call.terminalId, action: `vessel_call.${to}`, entityKind: 'vessel_call', entityId: call.id, entityRef: call.voyage, before: { status: from }, after: { status: to }, reason: note });
}

export function berthVessel(ctx: Ctx, input: { callId: string; berth?: string; expectedVersion?: number }): VesselCall {
  assertRole(ctx, ['planner', 'terminal_ops'], 'berth vessels');
  const call = getVesselCall(ctx.db, input.callId);
  assertVersion(call.version, input.expectedVersion, 'Vessel call');
  if (call.status !== 'expected') throw new OpsError('INVALID_STATE', `${call.vessel} ${call.voyage} is already ${VESSEL_STATUS_LABELS[call.status].toLowerCase()}.`);
  if (input.berth) call.berth = input.berth;
  call.ata = call.ata ?? ctx.at;
  call.atb = ctx.at;
  vesselTransition(ctx, call, 'berthed');
  notify(ctx, { type: 'vessel_berthed', severity: 'info', title: 'Vessel on berth', body: `${call.vessel} ${call.voyage} is alongside berth ${call.berth} at ${locationName(ctx.db, call.terminalId)}. Export gate is now closed.`, entity: { kind: 'vessel_call', id: call.id }, audience: ['terminal_ops', 'planner', 'gate_officer', 'customer_service'] });
  return call;
}

/** Operations may only start once the carrier's 48-hour documents are on file (tariff clause 8). */
export function startVesselOperations(ctx: Ctx, input: { callId: string; expectedVersion?: number }): VesselCall {
  assertRole(ctx, ['planner', 'terminal_ops'], 'start vessel operations');
  const call = getVesselCall(ctx.db, input.callId);
  assertVersion(call.version, input.expectedVersion, 'Vessel call');
  if (call.status !== 'berthed') throw new OpsError('INVALID_STATE', 'The vessel must be on berth before operations start.');
  const missing: string[] = [];
  if (!call.preArrival.bayPlan) missing.push('bay plan');
  if (call.plannedDischarge > 0 && !call.preArrival.dischargeList) missing.push('discharge list');
  if (call.plannedLoad > 0 && !call.preArrival.loadList) missing.push('load list');
  const hasDg = ctx.db.containers.some(container => (container.inboundCallId === call.id || container.outboundCallId === call.id) && container.dg);
  if (hasDg && !call.preArrival.dgList) missing.push('dangerous cargo list');
  if (missing.length) throw new OpsError('NOT_READY', `Pre-arrival documents missing: ${missing.join(', ')}. The carrier must provide them before operations start.`);
  vesselTransition(ctx, call, 'working');
  createTaskInternal(ctx, { title: `Discharge ${call.vessel} ${call.voyage}: ${call.plannedDischarge} moves`, type: 'discharge', locationId: call.terminalId, priority: 'high', dueAt: call.etd, refKind: 'vessel_call', refId: call.id });
  if (call.plannedLoad > 0) createTaskInternal(ctx, { title: `Load ${call.vessel} ${call.voyage}: ${call.plannedLoad} moves`, type: 'load', locationId: call.terminalId, priority: 'high', dueAt: call.etd, refKind: 'vessel_call', refId: call.id });
  return call;
}

export function completeVesselOperations(ctx: Ctx, input: { callId: string; note?: string; expectedVersion?: number }): VesselCall {
  assertRole(ctx, ['planner', 'terminal_ops'], 'complete vessel operations');
  const call = getVesselCall(ctx.db, input.callId);
  assertVersion(call.version, input.expectedVersion, 'Vessel call');
  if (call.status !== 'working') throw new OpsError('INVALID_STATE', 'Operations have not started.');
  const pendingDischarge = ctx.db.containers.filter(container => container.inboundCallId === call.id && container.status === 'expected');
  if (pendingDischarge.length) throw new OpsError('INVALID_STATE', `${pendingDischarge.length} container(s) on the discharge list are still on board. Discharge them or remove them from the call before completing.`);
  call.opsCompletedAt = ctx.at;
  vesselTransition(ctx, call, 'completed', input.note);
  for (const task of ctx.db.tasks) {
    if (task.refKind === 'vessel_call' && task.refId === call.id && ['open', 'in_progress'].includes(task.status)) { task.status = 'done'; task.updatedAt = ctx.at; }
  }
  notify(ctx, { type: 'vessel_completed', severity: 'success', title: 'Vessel operations completed', body: `${call.vessel} ${call.voyage}: ${call.discharged} discharged, ${call.loaded} loaded. Import boxes not collected within ${ctx.db.tariff.uncollectedTransferDays} days move to an inland depot.`, entity: { kind: 'vessel_call', id: call.id }, audience: ['terminal_ops', 'customer_service', 'transport_manager', 'finance_manager'] });
  publishEvent(ctx, 'vessel.completed', { callId: call.id });
  return call;
}

export function departVessel(ctx: Ctx, input: { callId: string; expectedVersion?: number }): VesselCall {
  assertRole(ctx, ['planner', 'terminal_ops'], 'record vessel departures');
  const call = getVesselCall(ctx.db, input.callId);
  assertVersion(call.version, input.expectedVersion, 'Vessel call');
  if (call.status !== 'completed') throw new OpsError('INVALID_STATE', 'Operations must be completed before departure.');
  call.atd = ctx.at;
  vesselTransition(ctx, call, 'departed');
  for (const container of ctx.db.containers) {
    if (container.outboundCallId === call.id && container.status === 'on_vessel') {
      container.status = 'delivered';
      container.deliveredAt = ctx.at;
      recordEvent(ctx, container, 'delivered', `Sailed on ${call.vessel} ${call.voyage}`, { refKind: 'vessel_call', refId: call.id });
    }
  }
  return call;
}

/* ============================================================ Containers */

export interface ContainerInput {
  number: string; size: ContainerSize; type: ContainerType; category: ContainerCategory; full: boolean; lineId: string;
  consigneeId?: string | null; clearingAgentId?: string | null; shipperName?: string; commodity?: string; grossWeightKg: number;
  sealNumber?: string; dg?: { imoClass: string; unNumber: string } | null; oog?: boolean; reefer?: { setpointC: number } | null;
  inboundCallId?: string | null; outboundCallId?: string | null;
}

export function registerContainer(ctx: Ctx, input: ContainerInput): Container {
  assertRole(ctx, ['planner', 'terminal_ops', 'customer_service', 'gate_officer'], 'register containers');
  const number = normaliseContainerNumber(input.number);
  const problem = validateContainerNumber(number);
  if (problem) throw new OpsError('VALIDATION', problem);
  const open = ctx.db.containers.find(container => container.number === number && !['delivered'].includes(container.status));
  if (open) throw new OpsError('DUPLICATE', `${number} is already active in the system (${CONTAINER_EVENT_LABELS.registered.toLowerCase()} ${open.createdAt.slice(0, 10)}).`);
  getParty(ctx.db, input.lineId);
  if (input.consigneeId) getParty(ctx.db, input.consigneeId);
  if (input.clearingAgentId) getParty(ctx.db, input.clearingAgentId);
  if (input.category === 'empty' && input.full) throw new OpsError('VALIDATION', 'An empty container cannot be marked full.');
  if (input.category !== 'empty' && !input.full) throw new OpsError('VALIDATION', 'Import, export and transhipment containers must be full. Use the empty category otherwise.');
  if (input.type === 'RF' && !input.reefer) throw new OpsError('VALIDATION', 'Reefer containers need a temperature setpoint.');
  let locationId: string | null = null;
  if (input.inboundCallId) { const call = getVesselCall(ctx.db, input.inboundCallId); locationId = call.terminalId; }
  else if (input.outboundCallId) { const call = getVesselCall(ctx.db, input.outboundCallId); locationId = call.terminalId; }
  if ((input.category === 'import' || input.category === 'transhipment') && !input.inboundCallId) throw new OpsError('VALIDATION', 'Import and transhipment containers must be on an inbound vessel call.');
  if (input.category === 'export' && !input.outboundCallId) throw new OpsError('VALIDATION', 'Export containers must be booked on an outbound vessel call.');
  const container: Container = {
    id: newId(), number, size: input.size, type: input.type, category: input.category, full: input.full, lineId: input.lineId,
    consigneeId: input.consigneeId ?? null, clearingAgentId: input.clearingAgentId ?? null, shipperName: input.shipperName?.trim() ?? '',
    commodity: input.commodity?.trim() ?? '', grossWeightKg: Math.max(0, input.grossWeightKg), vgmKg: null, sealNumber: input.sealNumber?.trim() ?? '',
    dg: input.dg ?? null, oog: !!input.oog, reefer: input.reefer ? { setpointC: input.reefer.setpointC, plugged: false } : null,
    status: 'expected', locationId, yardPosition: null, inboundCallId: input.inboundCallId ?? null, outboundCallId: input.outboundCallId ?? null,
    dischargedAt: null, gateInAt: null, gateOutAt: null, loadedAt: null, deliveredAt: null,
    customsStatus: input.category === 'transhipment' || input.category === 'empty' ? 'not_required' : 'pending',
    deliveryOrder: null, holds: [], chargesSettled: false, haulierId: null, tokenId: null, transportJobId: null,
    version: 1, createdAt: ctx.at, updatedAt: ctx.at,
  };
  if (container.dg) container.holds.push({ id: newId(), type: 'dg', reason: `IMO class ${container.dg.imoClass}: placards and declaration to be verified`, placedBy: ctx.actor.id, placedAt: ctx.at });
  ctx.db.containers.push(container);
  recordEvent(ctx, container, 'registered', `Registered as ${input.category} ${input.full ? 'full' : 'empty'} for ${partyName(ctx.db, input.lineId)}`);
  audit(ctx, { locationId, action: 'container.registered', entityKind: 'container', entityId: container.id, entityRef: container.number, after: { category: container.category, size: container.size, type: container.type, line: container.lineId } });
  return container;
}

export function updateContainer(ctx: Ctx, input: { containerId: string; expectedVersion?: number; patch: Partial<Pick<Container, 'consigneeId' | 'clearingAgentId' | 'shipperName' | 'commodity' | 'grossWeightKg' | 'sealNumber' | 'outboundCallId'>> }): Container {
  assertRole(ctx, ['customer_service', 'planner', 'terminal_ops'], 'edit containers');
  const container = getContainer(ctx.db, input.containerId);
  assertVersion(container.version, input.expectedVersion, 'Container');
  if (container.status === 'delivered') throw new OpsError('INVALID_STATE', 'Closed containers cannot be edited.');
  if (input.patch.outboundCallId) {
    const call = getVesselCall(ctx.db, input.patch.outboundCallId);
    if (['completed', 'departed'].includes(call.status)) throw new OpsError('INVALID_STATE', `${call.vessel} ${call.voyage} has finished operations.`);
  }
  const before = { consignee: container.consigneeId, agent: container.clearingAgentId, outbound: container.outboundCallId };
  Object.assign(container, input.patch);
  container.version += 1;
  container.updatedAt = ctx.at;
  audit(ctx, { locationId: container.locationId, action: 'container.updated', entityKind: 'container', entityId: container.id, entityRef: container.number, before, after: { consignee: container.consigneeId, agent: container.clearingAgentId, outbound: container.outboundCallId } });
  return container;
}

export function dischargeContainer(ctx: Ctx, input: { callId: string; containerId: string; yardPosition: string; idempotencyKey: string }): { event: ContainerEvent; replayed: boolean } {
  assertRole(ctx, ['planner', 'terminal_ops'], 'discharge containers');
  const { result, replayed } = idempotent(ctx, input.idempotencyKey, 'containerEvents', () => {
    const call = getVesselCall(ctx.db, input.callId);
    if (call.status !== 'working') throw new OpsError('INVALID_STATE', `Operations on ${call.vessel} ${call.voyage} are not running.`);
    assertLocationAccess(ctx, call.terminalId);
    const container = getContainer(ctx.db, input.containerId);
    if (container.inboundCallId !== call.id) throw new OpsError('VALIDATION', `${container.number} is not on the discharge list of ${call.voyage}.`);
    if (container.status !== 'expected') throw new OpsError('INVALID_STATE', `${container.number} has already been discharged.`);
    const position = requireText(input.yardPosition, 'Yard position').toUpperCase();
    container.status = 'in_yard';
    container.locationId = call.terminalId;
    container.yardPosition = position;
    container.dischargedAt = ctx.at;
    if (container.reefer) container.reefer.plugged = true;
    call.discharged += 1;
    call.version += 1;
    const rate = stevedoringRate(ctx.db.tariff, container);
    addCharge(ctx, { serviceCode: container.category === 'transhipment' ? (container.full ? 'STEV_TS_FULL' : 'STEV_TS_EMPTY') : (container.full ? 'STEV_FULL' : 'STEV_EMPTY'), partyId: container.lineId, unitAmount: rate.base, containerId: container.id, vesselCallId: call.id });
    if (rate.surcharge) addCharge(ctx, { serviceCode: 'DG_SURCHARGE', partyId: container.lineId, unitAmount: rate.surcharge, containerId: container.id, vesselCallId: call.id, description: `Dangerous goods surcharge (${ctx.db.tariff.dgSurchargePct}% of stevedoring)` });
    const event = recordEvent(ctx, container, 'discharged', `Discharged from ${call.vessel} ${call.voyage} to ${position}`, { toPosition: position, refKind: 'vessel_call', refId: call.id, idempotencyKey: input.idempotencyKey });
    audit(ctx, { locationId: call.terminalId, action: 'container.discharged', entityKind: 'container', entityId: container.id, entityRef: container.number, after: { position, call: call.voyage } });
    return event;
  });
  return { event: result, replayed };
}

export function loadContainer(ctx: Ctx, input: { callId: string; containerId: string; idempotencyKey: string }): { event: ContainerEvent; replayed: boolean } {
  assertRole(ctx, ['planner', 'terminal_ops'], 'load containers');
  const { result, replayed } = idempotent(ctx, input.idempotencyKey, 'containerEvents', () => {
    const call = getVesselCall(ctx.db, input.callId);
    if (call.status !== 'working') throw new OpsError('INVALID_STATE', `Operations on ${call.vessel} ${call.voyage} are not running.`);
    assertLocationAccess(ctx, call.terminalId);
    const container = getContainer(ctx.db, input.containerId);
    if (container.outboundCallId !== call.id) throw new OpsError('VALIDATION', `${container.number} is not on the load list of ${call.voyage}.`);
    if (container.status !== 'in_yard' || container.locationId !== call.terminalId) throw new OpsError('INVALID_STATE', `${container.number} is not in the yard at ${locationName(ctx.db, call.terminalId)}.`);
    const holds = activeHolds(container);
    if (holds.length) throw new OpsError('NOT_READY', `${container.number} is on hold: ${holds.map(hold => HOLD_LABELS[hold.type]).join(', ')}.`);
    if (container.category === 'export') {
      if (container.vgmKg === null) throw new OpsError('NOT_READY', `${container.number} has no verified gross mass. Weigh it before loading.`);
      if (container.customsStatus !== 'cleared') throw new OpsError('NOT_READY', `${container.number} has no customs export clearance.`);
    }
    const from = container.yardPosition;
    container.status = 'on_vessel';
    container.yardPosition = null;
    container.loadedAt = ctx.at;
    if (container.reefer) container.reefer.plugged = false;
    call.loaded += 1;
    call.version += 1;
    const rate = stevedoringRate(ctx.db.tariff, container);
    if (container.category !== 'transhipment') {
      addCharge(ctx, { serviceCode: container.full ? 'STEV_FULL' : 'STEV_EMPTY', partyId: container.lineId, unitAmount: rate.base, containerId: container.id, vesselCallId: call.id });
      if (rate.surcharge) addCharge(ctx, { serviceCode: 'DG_SURCHARGE', partyId: container.lineId, unitAmount: rate.surcharge, containerId: container.id, vesselCallId: call.id });
    }
    const storageFrom = container.gateInAt ?? container.dischargedAt;
    if (storageFrom) {
      const quote = quoteStorage(ctx.db.tariff, container, storageFrom, ctx.at);
      if (quote.amount > 0) addCharge(ctx, { serviceCode: container.category === 'transhipment' ? 'STORAGE_TS' : container.category === 'empty' ? 'STORAGE_EMPTY' : 'STORAGE_EXPORT', partyId: container.lineId, quantity: quote.days, unitAmount: quote.amount / quote.days, containerId: container.id, vesselCallId: call.id, description: `Storage ${quote.days} day(s) to loading` });
    }
    const event = recordEvent(ctx, container, 'loaded', `Loaded on ${call.vessel} ${call.voyage} from ${from}`, { fromPosition: from, refKind: 'vessel_call', refId: call.id, idempotencyKey: input.idempotencyKey });
    audit(ctx, { locationId: call.terminalId, action: 'container.loaded', entityKind: 'container', entityId: container.id, entityRef: container.number, after: { call: call.voyage } });
    return event;
  });
  return { event: result, replayed };
}

export function shiftContainer(ctx: Ctx, input: { containerId: string; toPosition: string; purpose: 'cfs' | 'scan' | 'other' | 'inspection'; note?: string; idempotencyKey: string; syncedFromClientId?: string }): { event: ContainerEvent; replayed: boolean } {
  assertRole(ctx, ['planner', 'terminal_ops', 'gate_officer'], 'shift containers');
  const { result, replayed } = idempotent(ctx, input.idempotencyKey, 'containerEvents', () => {
    const container = getContainer(ctx.db, input.containerId);
    if (container.status !== 'in_yard' || !container.locationId) throw new OpsError('INVALID_STATE', `${container.number} is not in a yard.`);
    assertLocationAccess(ctx, container.locationId);
    const to = requireText(input.toPosition, 'Destination position').toUpperCase();
    if (to === container.yardPosition) throw new OpsError('VALIDATION', 'The container is already at that position.');
    const from = container.yardPosition;
    container.yardPosition = to;
    const purpose = input.purpose === 'inspection' ? 'other' : input.purpose;
    const payer = input.purpose === 'scan' || input.purpose === 'inspection' ? (container.consigneeId ?? container.lineId) : container.lineId;
    const location = getLocation(ctx.db, container.locationId);
    if (location.type === 'terminal') addCharge(ctx, { serviceCode: purpose === 'cfs' ? 'SHIFT_CFS' : purpose === 'scan' ? 'SHIFT_SCAN' : 'SHIFT_OTHER', partyId: payer, unitAmount: shiftingRate(ctx.db.tariff, container, purpose), containerId: container.id });
    const label = { cfs: 'to CFS', scan: 'for scanning', other: 'within the yard', inspection: 'for inspection' }[input.purpose];
    const event = recordEvent(ctx, container, 'shifted', `Shifted ${label}: ${from} to ${to}${input.note ? `. ${input.note.trim()}` : ''}`, { fromPosition: from, toPosition: to, idempotencyKey: input.idempotencyKey });
    audit(ctx, { locationId: container.locationId, action: 'container.shifted', entityKind: 'container', entityId: container.id, entityRef: container.number, before: { position: from }, after: { position: to, purpose: input.purpose } });
    return event;
  });
  return { event: result, replayed };
}

export function recordVgm(ctx: Ctx, input: { containerId: string; vgmKg: number }): Container {
  assertRole(ctx, ['gate_officer', 'terminal_ops', 'planner'], 'record verified gross mass');
  const container = getContainer(ctx.db, input.containerId);
  if (!Number.isFinite(input.vgmKg) || input.vgmKg <= 0) throw new OpsError('VALIDATION', 'Enter the weighed mass in kilograms.');
  if (container.vgmKg === null) addCharge(ctx, { serviceCode: 'VGM', partyId: container.lineId, unitAmount: ctx.db.tariff.vgm, containerId: container.id });
  container.vgmKg = Math.round(input.vgmKg);
  recordEvent(ctx, container, 'inspection', `Verified gross mass recorded: ${container.vgmKg.toLocaleString()} kg`);
  if (Math.abs(container.vgmKg - container.grossWeightKg) > Math.max(1000, container.grossWeightKg * 0.05)) {
    notify(ctx, { type: 'inventory_discrepancy', severity: 'warning', title: 'Weight misdeclaration', body: `${container.number}: declared ${container.grossWeightKg.toLocaleString()} kg, weighed ${container.vgmKg.toLocaleString()} kg (tariff clause 26).`, entity: { kind: 'container', id: container.id }, audience: ['terminal_ops', 'customer_service', 'finance_manager'] });
  }
  return container;
}

export function placeHold(ctx: Ctx, input: { containerId: string; type: HoldType; reason: string }): Container {
  assertRole(ctx, ['customer_service', 'terminal_ops', 'planner'], 'place holds');
  const container = getContainer(ctx.db, input.containerId);
  const reason = requireText(input.reason, 'Reason');
  if (activeHolds(container).some(hold => hold.type === input.type)) throw new OpsError('DUPLICATE', `${HOLD_LABELS[input.type]} is already active on ${container.number}.`);
  const hold = { id: newId(), type: input.type, reason, placedBy: ctx.actor.id, placedAt: ctx.at };
  container.holds.push(hold);
  if (container.tokenId) cancelTokenInternal(ctx, container, `${HOLD_LABELS[input.type]} placed`);
  recordEvent(ctx, container, 'hold_placed', `${HOLD_LABELS[input.type]}: ${reason}`, { refKind: 'hold', refId: hold.id });
  audit(ctx, { locationId: container.locationId, action: 'container.hold_placed', entityKind: 'container', entityId: container.id, entityRef: container.number, after: { hold: input.type }, reason });
  notify(ctx, { type: 'hold_placed', severity: 'warning', title: `${HOLD_LABELS[input.type]} on ${container.number}`, body: reason, entity: { kind: 'container', id: container.id }, audience: ['customer_service', 'terminal_ops', 'gate_officer'] });
  return container;
}

export function releaseHold(ctx: Ctx, input: { containerId: string; holdId: string; note: string }): Container {
  assertRole(ctx, ['customer_service', 'terminal_ops', 'planner'], 'release holds');
  const container = getContainer(ctx.db, input.containerId);
  const hold = find(container.holds, input.holdId, 'Hold');
  if (hold.releasedAt) throw new OpsError('INVALID_STATE', 'This hold has already been released.');
  if (hold.type === 'customs' && container.customsStatus !== 'cleared') throw new OpsError('NOT_READY', 'A customs hold is released by the customs clearance message, not manually.');
  hold.releasedAt = ctx.at;
  hold.releasedBy = ctx.actor.id;
  recordEvent(ctx, container, 'hold_released', `${HOLD_LABELS[hold.type]} released${input.note ? `: ${input.note.trim()}` : ''}`, { refKind: 'hold', refId: hold.id });
  audit(ctx, { locationId: container.locationId, action: 'container.hold_released', entityKind: 'container', entityId: container.id, entityRef: container.number, after: { hold: hold.type }, reason: input.note });
  checkReady(ctx, container);
  return container;
}

export function updateCustoms(ctx: Ctx, input: { containerId: string; status: CustomsStatus; reference?: string }): Container {
  assertRole(ctx, ['customer_service', 'terminal_ops'], 'update customs status');
  const container = getContainer(ctx.db, input.containerId);
  applyCustoms(ctx, container, input.status, input.reference ?? '');
  return container;
}

/** Shared by the customer-service screen and the customs integration. */
export function applyCustoms(ctx: Ctx, container: Container, status: CustomsStatus, reference: string) {
  const before = container.customsStatus;
  if (before === status) throw new OpsError('INVALID_STATE', `Customs status is already ${status.replace('_', ' ')}.`);
  container.customsStatus = status;
  if (status === 'inspection' && !activeHolds(container).some(hold => hold.type === 'customs')) {
    container.holds.push({ id: newId(), type: 'customs', reason: reference || 'Selected for customs inspection', placedBy: ctx.actor.id, placedAt: ctx.at });
    if (container.tokenId) cancelTokenInternal(ctx, container, 'Customs inspection');
  }
  if (status === 'cleared') {
    for (const hold of container.holds) if (hold.type === 'customs' && !hold.releasedAt) { hold.releasedAt = ctx.at; hold.releasedBy = ctx.actor.id; }
  }
  recordEvent(ctx, container, 'customs_update', `Customs ${status.replace('_', ' ')}${reference ? ` (${reference})` : ''}`);
  audit(ctx, { locationId: container.locationId, action: 'container.customs', entityKind: 'container', entityId: container.id, entityRef: container.number, before: { customs: before }, after: { customs: status, reference } });
  checkReady(ctx, container);
}

export function recordDeliveryOrder(ctx: Ctx, input: { containerId: string; number: string; validUntil: string; issuedBy: string; consigneeId?: string; clearingAgentId?: string }): Container {
  assertRole(ctx, ['customer_service', 'terminal_ops'], 'record delivery orders');
  const container = getContainer(ctx.db, input.containerId);
  if (container.category !== 'import') throw new OpsError('VALIDATION', 'Delivery orders apply to import containers.');
  const number = requireText(input.number, 'Delivery order number');
  if (!input.validUntil) throw new OpsError('VALIDATION', 'Validity date is required.');
  if (new Date(input.validUntil) < new Date(ctx.at)) throw new OpsError('VALIDATION', 'The delivery order has already expired.');
  if (input.consigneeId) { getParty(ctx.db, input.consigneeId); container.consigneeId = input.consigneeId; }
  if (input.clearingAgentId) { getParty(ctx.db, input.clearingAgentId); container.clearingAgentId = input.clearingAgentId; }
  if (!container.consigneeId) throw new OpsError('VALIDATION', 'Assign a consignee before recording the delivery order.');
  container.deliveryOrder = { number, validUntil: input.validUntil, issuedBy: requireText(input.issuedBy, 'Issuing line or agent'), receivedAt: ctx.at };
  for (const hold of container.holds) if (hold.type === 'documentation' && !hold.releasedAt) { hold.releasedAt = ctx.at; hold.releasedBy = ctx.actor.id; }
  recordEvent(ctx, container, 'delivery_order', `Delivery order ${number} from ${container.deliveryOrder.issuedBy}, valid until ${input.validUntil.slice(0, 10)}`);
  audit(ctx, { locationId: container.locationId, action: 'container.delivery_order', entityKind: 'container', entityId: container.id, entityRef: container.number, after: { deliveryOrder: number, validUntil: input.validUntil } });
  checkReady(ctx, container);
  return container;
}

/** Fires the "ready for pick-up" notification exactly once per container. */
export function checkReady(ctx: Ctx, container: Container) {
  if (!isReadyForPickup(container, ctx.at)) return;
  const already = ctx.db.notifications.some(notification => notification.type === 'container_ready' && notification.entity?.id === container.id);
  if (already) return;
  notify(ctx, { type: 'container_ready', severity: 'success', title: `${container.number} ready for pick-up`, body: `${partyName(ctx.db, container.consigneeId)} may assign a haulier and generate an e-token at ${locationName(ctx.db, container.locationId)}.`, entity: { kind: 'container', id: container.id }, audience: ['customer_service', 'gate_officer'] });
  publishEvent(ctx, 'container.ready', { containerId: container.id });
}

export function assignHaulier(ctx: Ctx, input: { containerId: string; haulierId: string | null; onBehalfOf?: string }): Container {
  assertRole(ctx, ['customer_service'], 'assign hauliers');
  const container = getContainer(ctx.db, input.containerId);
  if (container.category === 'import') {
    const blockers = releaseBlockers(container, ctx.at);
    if (blockers.length) throw new OpsError('NOT_READY', `${container.number} cannot be assigned yet: ${blockers.join('; ')}.`);
  }
  if (container.tokenId) throw new OpsError('INVALID_STATE', 'An e-token already exists for this container. Cancel it before changing the haulier.');
  if (input.haulierId) {
    const haulier = getParty(ctx.db, input.haulierId);
    if (haulier.type !== 'haulier') throw new OpsError('VALIDATION', `${haulier.name} is not a haulier.`);
  }
  const before = container.haulierId;
  container.haulierId = input.haulierId;
  recordEvent(ctx, container, 'haulier_assigned', input.haulierId ? `Haulier ${partyName(ctx.db, input.haulierId)} assigned${input.onBehalfOf ? ` by ${input.onBehalfOf}` : ''}` : 'Haulier unassigned');
  audit(ctx, { locationId: container.locationId, action: 'container.haulier', entityKind: 'container', entityId: container.id, entityRef: container.number, before: { haulier: before }, after: { haulier: input.haulierId } });
  return container;
}

/* ============================================================ E-tokens */

export function generateToken(ctx: Ctx, input: { containerId: string; type: TokenType; haulierId?: string; truckPlate: string; driverName: string; slotStart: string; onBehalfOf?: string }): EToken {
  assertRole(ctx, ['customer_service', 'gate_officer'], 'generate e-tokens');
  const container = getContainer(ctx.db, input.containerId);
  const haulierId = input.haulierId ?? container.haulierId;
  if (!haulierId) throw new OpsError('VALIDATION', 'Assign a haulier first.');
  const haulier = getParty(ctx.db, haulierId);
  if (haulier.type !== 'haulier') throw new OpsError('VALIDATION', `${haulier.name} is not a haulier.`);
  if (!haulier.portalRegistered) throw new OpsError('NOT_READY', `${haulier.name} is not registered on the customer portal.`);
  if (container.tokenId) throw new OpsError('DUPLICATE', `${container.number} already has an active e-token.`);
  const truckPlate = requireText(input.truckPlate, 'Truck plate').toUpperCase();
  const driverName = requireText(input.driverName, 'Driver name');
  if (!input.slotStart) throw new OpsError('VALIDATION', 'Choose an appointment slot.');
  const slotStart = new Date(input.slotStart);
  if (slotStart.getTime() < new Date(ctx.at).getTime() - 15 * 60000) throw new OpsError('VALIDATION', 'The appointment slot is in the past.');
  let locationId: string;
  if (input.type === 'import_pickup') {
    const blockers = releaseBlockers(container, ctx.at);
    if (blockers.length) throw new OpsError('NOT_READY', `${container.number} is not ready for pick-up: ${blockers.join('; ')}.`);
    locationId = container.locationId!;
  } else if (input.type === 'export_dropoff') {
    if (container.category !== 'export' || container.status !== 'expected' || !container.outboundCallId) throw new OpsError('INVALID_STATE', `${container.number} is not an export booking awaiting drop-off.`);
    const call = getVesselCall(ctx.db, container.outboundCallId);
    if (slotStart < new Date(call.gateOpen) || slotStart > new Date(call.gateClose)) throw new OpsError('VALIDATION', `Export gate for ${call.vessel} ${call.voyage} is open ${call.gateOpen.slice(0, 16).replace('T', ' ')} to ${call.gateClose.slice(0, 16).replace('T', ' ')} UTC.`);
    locationId = call.terminalId;
  } else if (input.type === 'empty_return') {
    if (container.status !== 'on_truck' && container.status !== 'delivered') throw new OpsError('INVALID_STATE', `${container.number} has not been gated out, so it cannot be returned.`);
    locationId = container.locationId!;
  } else {
    if (container.category !== 'empty' || container.status !== 'in_yard') throw new OpsError('INVALID_STATE', `${container.number} is not an empty container in the yard.`);
    locationId = container.locationId!;
  }
  const token: EToken = {
    id: newId(), number: nextReference(ctx.db, 'ET', ctx.at), type: input.type, containerId: container.id, haulierId, truckPlate, driverName,
    locationId, slotStart: slotStart.toISOString(), slotEnd: new Date(slotStart.getTime() + 2 * 3600 * 1000).toISOString(), status: 'generated',
    feeAed: input.type === 'import_pickup' ? ctx.db.tariff.etoken : 0, amendments: 0, createdBy: ctx.actor.id, createdAt: ctx.at, updatedAt: ctx.at,
  };
  ctx.db.tokens.push(token);
  container.tokenId = token.id;
  container.haulierId = haulierId;
  if (token.feeAed > 0) addCharge(ctx, { serviceCode: 'ETOKEN', partyId: haulierId, unitAmount: token.feeAed, containerId: container.id, tokenId: token.id, description: `E-token ${token.number}, import pick-up (incl. VAT)` });
  recordEvent(ctx, container, 'token_generated', `${TOKEN_TYPE_LABELS[input.type]} e-token ${token.number} for ${haulier.name}, truck ${truckPlate}, slot ${token.slotStart.slice(11, 16)}–${token.slotEnd.slice(11, 16)} UTC${input.onBehalfOf ? ` (${input.onBehalfOf})` : ''}`, { refKind: 'token', refId: token.id });
  audit(ctx, { locationId, action: 'token.generated', entityKind: 'token', entityId: token.id, entityRef: token.number, after: { container: container.number, haulier: haulier.name, slot: token.slotStart } });
  notify(ctx, { type: 'token_generated', severity: 'info', title: `E-token ${token.number}`, body: `${haulier.name} booked ${container.number} (${TOKEN_TYPE_LABELS[input.type].toLowerCase()}) for ${token.slotStart.slice(0, 16).replace('T', ' ')} UTC.`, entity: { kind: 'token', id: token.id }, audience: ['gate_officer'] });
  return token;
}

export function amendToken(ctx: Ctx, input: { tokenId: string; truckPlate?: string; driverName?: string; slotStart?: string }): EToken {
  assertRole(ctx, ['customer_service', 'gate_officer'], 'amend e-tokens');
  const token = find(ctx.db.tokens, input.tokenId, 'E-token');
  if (token.status !== 'generated') throw new OpsError('INVALID_STATE', 'Only tokens that have not reached the marshalling yard can be amended.');
  if (input.truckPlate) token.truckPlate = requireText(input.truckPlate, 'Truck plate').toUpperCase();
  if (input.driverName) token.driverName = requireText(input.driverName, 'Driver name');
  if (input.slotStart) {
    const start = new Date(input.slotStart);
    if (start.getTime() < Date.parse(ctx.at) - 15 * 60000) throw new OpsError('VALIDATION', 'The appointment slot is in the past.');
    token.slotStart = start.toISOString();
    token.slotEnd = new Date(start.getTime() + 2 * 3600 * 1000).toISOString();
  }
  token.amendments += 1;
  token.updatedAt = ctx.at;
  if (token.type === 'import_pickup') addCharge(ctx, { serviceCode: 'ETOKEN_AMEND', partyId: token.haulierId, unitAmount: ctx.db.tariff.etokenAmendment, containerId: token.containerId, tokenId: token.id, description: `E-token ${token.number} amendment (incl. VAT)` });
  const container = getContainer(ctx.db, token.containerId);
  recordEvent(ctx, container, 'token_generated', `E-token ${token.number} amended: truck ${token.truckPlate}, slot ${token.slotStart.slice(0, 16).replace('T', ' ')} UTC`, { refKind: 'token', refId: token.id });
  audit(ctx, { locationId: token.locationId, action: 'token.amended', entityKind: 'token', entityId: token.id, entityRef: token.number, after: { truck: token.truckPlate, slot: token.slotStart } });
  return token;
}

function cancelTokenInternal(ctx: Ctx, container: Container, reason: string) {
  if (!container.tokenId) return;
  const token = ctx.db.tokens.find(entry => entry.id === container.tokenId);
  container.tokenId = null;
  if (!token || ['completed', 'cancelled', 'expired'].includes(token.status)) return;
  token.status = 'cancelled';
  token.updatedAt = ctx.at;
  recordEvent(ctx, container, 'token_cancelled', `E-token ${token.number} cancelled: ${reason}`, { refKind: 'token', refId: token.id });
}

/** A token can only be deleted while the truck has not entered the marshalling yard (portal manual, §4). */
export function cancelToken(ctx: Ctx, input: { tokenId: string; reason: string }): EToken {
  assertRole(ctx, ['customer_service', 'gate_officer'], 'cancel e-tokens');
  const token = find(ctx.db.tokens, input.tokenId, 'E-token');
  if (token.status !== 'generated') throw new OpsError('INVALID_STATE', `E-token ${token.number} cannot be cancelled: the truck has already entered the marshalling yard.`);
  const container = getContainer(ctx.db, token.containerId);
  cancelTokenInternal(ctx, container, requireText(input.reason, 'Reason'));
  audit(ctx, { locationId: token.locationId, action: 'token.cancelled', entityKind: 'token', entityId: token.id, entityRef: token.number, reason: input.reason });
  return token;
}

export function marshallingYardArrival(ctx: Ctx, input: { tokenId: string }): EToken {
  assertRole(ctx, ['gate_officer', 'terminal_ops'], 'record marshalling yard arrivals');
  const token = find(ctx.db.tokens, input.tokenId, 'E-token');
  assertLocationAccess(ctx, token.locationId);
  if (token.status !== 'generated') throw new OpsError('INVALID_STATE', `E-token ${token.number} is ${token.status.replace(/_/g, ' ')}.`);
  if (new Date(ctx.at) > new Date(token.slotEnd)) { token.status = 'expired'; token.updatedAt = ctx.at; throw new OpsError('INVALID_STATE', `E-token ${token.number} expired at ${token.slotEnd.slice(11, 16)} UTC. The haulier must generate a new token.`); }
  token.status = 'at_marshalling_yard';
  token.updatedAt = ctx.at;
  const container = getContainer(ctx.db, token.containerId);
  recordEvent(ctx, container, 'gate_in', `Truck ${token.truckPlate} entered the marshalling yard on e-token ${token.number}`, { refKind: 'token', refId: token.id });
  return token;
}

/* ============================================================ Gate */

export interface GateOutInput {
  tokenId: string; truckPlate?: string; sealVerified: boolean; damageRemarks: string; idempotencyKey: string; syncedFromClientId?: string;
}

/** Import pick-up or empty release: equipment interchange at the gate, custody passes to the haulier. */
export function gateOut(ctx: Ctx, input: GateOutInput): { transaction: GateTransaction; replayed: boolean } {
  assertRole(ctx, ['gate_officer', 'terminal_ops'], 'process gate-out');
  const { result, replayed } = idempotent(ctx, input.idempotencyKey, 'gateTransactions', () => {
    const token = find(ctx.db.tokens, input.tokenId, 'E-token');
    assertLocationAccess(ctx, token.locationId);
    if (!['generated', 'at_marshalling_yard'].includes(token.status)) throw new OpsError('INVALID_STATE', `E-token ${token.number} is ${token.status.replace(/_/g, ' ')}.`);
    if (!['import_pickup', 'empty_release'].includes(token.type)) throw new OpsError('VALIDATION', `E-token ${token.number} is for ${TOKEN_TYPE_LABELS[token.type].toLowerCase()}, not a gate-out.`);
    const container = getContainer(ctx.db, token.containerId);
    if (token.type === 'import_pickup') {
      const blockers = releaseBlockers(container, ctx.at);
      if (blockers.length) throw new OpsError('NOT_READY', `${container.number} cannot leave: ${blockers.join('; ')}.`);
    } else if (container.status !== 'in_yard') throw new OpsError('INVALID_STATE', `${container.number} is not in the yard.`);
    if (!input.sealVerified && container.full) throw new OpsError('VALIDATION', 'Confirm the seal check before releasing a full container.');
    const location = getLocation(ctx.db, token.locationId);
    const overtime = isOvertime(ctx.at, location.timezone);
    const transaction: GateTransaction = {
      id: newId(), reference: nextReference(ctx.db, 'GT', ctx.at), direction: 'out', locationId: location.id, containerId: container.id, tokenId: token.id,
      truckPlate: (input.truckPlate ?? token.truckPlate).toUpperCase(), haulierId: token.haulierId, at: ctx.at, sealVerified: input.sealVerified,
      damageRemarks: input.damageRemarks.trim(), overtime, operatorId: ctx.actor.id, idempotencyKey: input.idempotencyKey, syncedFromClientId: input.syncedFromClientId,
    };
    ctx.db.gateTransactions.push(transaction);
    // Storage was settled up to the expected exit date; charge any further days now.
    if (container.dischargedAt && container.category === 'import') {
      const quote = quoteStorage(ctx.db.tariff, container, container.dischargedAt, ctx.at);
      const settled = ctx.db.charges.filter(charge => charge.containerId === container.id && charge.serviceCode === 'STORAGE_IMPORT').reduce((sum, charge) => sum + charge.amount, 0);
      const outstanding = Math.round((quote.amount - settled) * 100) / 100;
      if (outstanding > 0) addCharge(ctx, { serviceCode: 'STORAGE_IMPORT', partyId: container.consigneeId ?? container.lineId, unitAmount: outstanding, containerId: container.id, description: `Additional storage to gate-out (${quote.days} days in total)` });
    }
    if (overtime) addCharge(ctx, { serviceCode: 'OVERTIME_GATE', partyId: token.haulierId, unitAmount: ctx.db.tariff.overtimeGate, containerId: container.id, tokenId: token.id, description: 'Gate delivery between 22:00 and 06:00' });
    if (token.type === 'empty_release') addCharge(ctx, { serviceCode: 'EMPTY_RELEASE', partyId: container.lineId, unitAmount: shiftingRate(ctx.db.tariff, container, 'emptyRelease'), containerId: container.id });
    const from = container.yardPosition;
    container.status = 'on_truck';
    container.yardPosition = null;
    container.gateOutAt = ctx.at;
    container.tokenId = null;
    if (container.reefer) container.reefer.plugged = false;
    token.status = 'completed';
    token.updatedAt = ctx.at;
    recordEvent(ctx, container, 'gate_out', `Gated out from ${from} on truck ${transaction.truckPlate} (${partyName(ctx.db, token.haulierId)}), e-token ${token.number}${transaction.damageRemarks ? `. EIR remarks: ${transaction.damageRemarks}` : ''}`, { fromPosition: from, refKind: 'gate', refId: transaction.id, idempotencyKey: input.idempotencyKey });
    audit(ctx, { locationId: location.id, action: 'gate.out', entityKind: 'gate_transaction', entityId: transaction.id, entityRef: transaction.reference, after: { container: container.number, truck: transaction.truckPlate, overtime } });
    notify(ctx, { type: 'gate_out', severity: 'success', title: `${container.number} gated out`, body: `Collected by ${partyName(ctx.db, token.haulierId)} on ${transaction.truckPlate} at ${location.name}.`, entity: { kind: 'container', id: container.id }, audience: ['customer_service', 'finance_manager', 'transport_manager'] });
    publishEvent(ctx, 'gate.out', { transactionId: transaction.id, containerId: container.id });
    for (const task of ctx.db.tasks) if (task.refKind === 'container' && task.refId === container.id && task.type === 'gate' && ['open', 'in_progress'].includes(task.status)) { task.status = 'done'; task.updatedAt = ctx.at; }
    return transaction;
  });
  return { transaction: result, replayed };
}

export interface GateInInput {
  tokenId: string; truckPlate?: string; yardPosition: string; sealVerified: boolean; damageRemarks: string; vgmKg?: number | null; idempotencyKey: string; syncedFromClientId?: string;
}

/** Export drop-off during the gate window, or an empty return. */
export function gateIn(ctx: Ctx, input: GateInInput): { transaction: GateTransaction; replayed: boolean } {
  assertRole(ctx, ['gate_officer', 'terminal_ops'], 'process gate-in');
  const { result, replayed } = idempotent(ctx, input.idempotencyKey, 'gateTransactions', () => {
    const token = find(ctx.db.tokens, input.tokenId, 'E-token');
    assertLocationAccess(ctx, token.locationId);
    if (!['generated', 'at_marshalling_yard'].includes(token.status)) throw new OpsError('INVALID_STATE', `E-token ${token.number} is ${token.status.replace(/_/g, ' ')}.`);
    if (!['export_dropoff', 'empty_return'].includes(token.type)) throw new OpsError('VALIDATION', `E-token ${token.number} is for ${TOKEN_TYPE_LABELS[token.type].toLowerCase()}, not a gate-in.`);
    const container = getContainer(ctx.db, token.containerId);
    const position = requireText(input.yardPosition, 'Yard position').toUpperCase();
    const location = getLocation(ctx.db, token.locationId);
    if (token.type === 'export_dropoff') {
      const call = getVesselCall(ctx.db, container.outboundCallId!);
      if (new Date(ctx.at) < new Date(call.gateOpen) || new Date(ctx.at) > new Date(call.gateClose)) throw new OpsError('INVALID_STATE', `The export gate for ${call.vessel} ${call.voyage} is closed (window ${call.gateOpen.slice(0, 16).replace('T', ' ')} to ${call.gateClose.slice(0, 16).replace('T', ' ')} UTC).`);
      if (!input.sealVerified) throw new OpsError('VALIDATION', 'Confirm the seal check for the export container.');
      if (container.dg && !ctx.db.documents.some(document => document.containerId === container.id && document.type === 'Dangerous goods declaration')) throw new OpsError('NOT_READY', `${container.number} is dangerous goods: the DG declaration must be on file before gate-in.`);
    } else if (container.full) throw new OpsError('VALIDATION', 'An empty return must be an empty container.');
    const overtime = isOvertime(ctx.at, location.timezone);
    const transaction: GateTransaction = {
      id: newId(), reference: nextReference(ctx.db, 'GT', ctx.at), direction: 'in', locationId: location.id, containerId: container.id, tokenId: token.id,
      truckPlate: (input.truckPlate ?? token.truckPlate).toUpperCase(), haulierId: token.haulierId, at: ctx.at, sealVerified: input.sealVerified,
      damageRemarks: input.damageRemarks.trim(), overtime, operatorId: ctx.actor.id, idempotencyKey: input.idempotencyKey, syncedFromClientId: input.syncedFromClientId,
    };
    ctx.db.gateTransactions.push(transaction);
    if (token.type === 'empty_return') { container.category = 'empty'; container.full = false; container.customsStatus = 'not_required'; container.consigneeId = null; container.deliveryOrder = null; container.chargesSettled = false; container.gateOutAt = null; container.dischargedAt = null; }
    container.status = 'in_yard';
    container.locationId = location.id;
    container.yardPosition = position;
    container.gateInAt = ctx.at;
    container.tokenId = null;
    container.haulierId = null;
    if (container.reefer) container.reefer.plugged = true;
    if (typeof input.vgmKg === 'number' && input.vgmKg > 0) {
      container.vgmKg = Math.round(input.vgmKg);
      addCharge(ctx, { serviceCode: 'VGM', partyId: container.lineId, unitAmount: ctx.db.tariff.vgm, containerId: container.id });
    }
    if (location.type === 'terminal') addCharge(ctx, { serviceCode: container.full ? 'PRC_FULL' : 'PRC_EMPTY', partyId: container.lineId, unitAmount: portReceivingRate(ctx.db.tariff, container), containerId: container.id, vesselCallId: container.outboundCallId ?? undefined });
    if (overtime) addCharge(ctx, { serviceCode: 'OVERTIME_GATE', partyId: token.haulierId, unitAmount: ctx.db.tariff.overtimeGate, containerId: container.id, tokenId: token.id });
    token.status = 'completed';
    token.updatedAt = ctx.at;
    recordEvent(ctx, container, 'gate_in', `${TOKEN_TYPE_LABELS[token.type]} on truck ${transaction.truckPlate} (${partyName(ctx.db, token.haulierId)}), stacked at ${position}${transaction.damageRemarks ? `. EIR remarks: ${transaction.damageRemarks}` : ''}`, { toPosition: position, refKind: 'gate', refId: transaction.id, idempotencyKey: input.idempotencyKey });
    audit(ctx, { locationId: location.id, action: 'gate.in', entityKind: 'gate_transaction', entityId: transaction.id, entityRef: transaction.reference, after: { container: container.number, truck: transaction.truckPlate, position } });
    publishEvent(ctx, 'gate.in', { transactionId: transaction.id, containerId: container.id });
    return transaction;
  });
  return { transaction: result, replayed };
}

export function reeferCheck(ctx: Ctx, input: { containerId: string; temperatureC: number; plugged: boolean; note?: string }): Container {
  assertRole(ctx, ['terminal_ops', 'gate_officer', 'planner'], 'record reefer checks');
  const container = getContainer(ctx.db, input.containerId);
  if (!container.reefer) throw new OpsError('VALIDATION', `${container.number} is not a reefer.`);
  if (container.status !== 'in_yard') throw new OpsError('INVALID_STATE', 'Reefer checks apply to containers in the yard.');
  container.reefer.plugged = input.plugged;
  const deviation = Math.abs(input.temperatureC - container.reefer.setpointC);
  recordEvent(ctx, container, 'reefer_check', `Reefer check: ${input.temperatureC} °C against setpoint ${container.reefer.setpointC} °C, ${input.plugged ? 'plugged' : 'not plugged'}${input.note ? `. ${input.note.trim()}` : ''}`);
  if (deviation > 2 || !input.plugged) {
    notify(ctx, { type: 'reefer_alert', severity: 'danger', title: `Reefer alert ${container.number}`, body: `${input.temperatureC} °C against setpoint ${container.reefer.setpointC} °C${input.plugged ? '' : ', unplugged'} at ${locationName(ctx.db, container.locationId)}.`, entity: { kind: 'container', id: container.id }, audience: ['terminal_ops', 'customer_service'] });
  }
  return container;
}

/* ============================================================ Task helper shared with shared.ts */

export function createTaskInternal(ctx: Ctx, input: { title: string; type: import('../types').TaskType; locationId: string; priority: import('../types').TaskPriority; dueAt: string; refKind?: import('../types').WorkTask['refKind']; refId?: string; assigneeId?: string | null }) {
  const task: import('../types').WorkTask = {
    id: newId(), reference: nextReference(ctx.db, 'TSK', ctx.at), title: input.title, type: input.type, locationId: input.locationId,
    assigneeId: input.assigneeId ?? null, createdBy: ctx.actor.id, status: 'open', priority: input.priority, dueAt: input.dueAt,
    refKind: input.refKind, refId: input.refId, createdAt: ctx.at, updatedAt: ctx.at,
  };
  ctx.db.tasks.push(task);
  return task;
}
