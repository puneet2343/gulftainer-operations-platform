/*
 * Momentum contract-logistics services: SKU master data, inbound and outbound
 * orders, the immutable stock ledger with transactional balances, allocations,
 * holds, adjustments with second-person approval and compensating reversals.
 */

import type { Approval, ApprovalStatus, Bucket, MovementEffect, Sku, StockBalance, StockCategory, StockMovement, StockMovementType, StockUnit, WarehouseOperation, WarehouseOrder } from '../types';
import { BUCKETS, ORDER_STATUS_LABELS } from '../types';
import {
  addCharge, assertLocationAccess, assertPositive, assertRole, assertVersion, audit, find, getEmployee, getLocation, getParty, idempotent,
  locationName, newId, nextReference, notify, publishEvent, requireText, type Ctx, OpsError,
} from '../core';
import { createTaskInternal } from './terminal';

/* ============================================================ Ledger */

export function balanceKey(skuId: string, locationId: string) {
  return `${skuId}:${locationId}`;
}

export function getBalance(db: import('../types').OpsDB, skuId: string, locationId: string, create = true): StockBalance | undefined {
  const id = balanceKey(skuId, locationId);
  let balance = db.balances.find(entry => entry.id === id);
  if (!balance && create) {
    balance = { id, skuId, locationId, available: 0, reserved: 0, damaged: 0, held: 0, version: 0, updatedAt: '' };
    db.balances.push(balance);
  }
  return balance;
}

export function onHand(balance: Pick<StockBalance, Bucket>) {
  return BUCKETS.reduce((sum, bucket) => sum + balance[bucket], 0);
}

export const getSku = (db: import('../types').OpsDB, id: string): Sku => find(db.skus, id, 'SKU');

/**
 * Appends one ledger row and applies its effects. Any bucket that would go negative
 * throws, which aborts the surrounding transaction (SRS §5).
 */
export function applyMovement(ctx: Ctx, input: {
  skuId: string; type: StockMovementType; quantity: number; effects: MovementEffect[]; reason: string;
  sourceLocationId?: string | null; destinationLocationId?: string | null; orderId?: string; operationId?: string;
  approvalId?: string; idempotencyKey?: string; reversesMovementId?: string;
}): StockMovement {
  const sku = getSku(ctx.db, input.skuId);
  const effects = input.effects.filter(effect => effect.delta !== 0);
  for (const effect of effects) {
    const balance = getBalance(ctx.db, input.skuId, effect.locationId)!;
    const before = balance[effect.bucket];
    const after = before + effect.delta;
    if (after < 0) throw new OpsError('INSUFFICIENT_STOCK', `Not enough ${effect.bucket} stock of ${sku.name} at ${locationName(ctx.db, effect.locationId)}: needs ${-effect.delta}, has ${before}.`);
    balance[effect.bucket] = after;
    balance.version += 1;
    balance.updatedAt = ctx.at;
  }
  const movement: StockMovement = {
    id: newId(), reference: nextReference(ctx.db, 'MOV', ctx.at), skuId: input.skuId, type: input.type, quantity: input.quantity, unit: sku.unit,
    sourceLocationId: input.sourceLocationId ?? null, destinationLocationId: input.destinationLocationId ?? null, effects,
    orderId: input.orderId, operationId: input.operationId, approvalId: input.approvalId, employeeId: ctx.actor.id, timestamp: ctx.at,
    reason: input.reason, idempotencyKey: input.idempotencyKey, reversesMovementId: input.reversesMovementId,
  };
  ctx.db.movements.push(movement);
  return movement;
}

function checkLowStock(ctx: Ctx, skuId: string, locationId: string) {
  const balance = getBalance(ctx.db, skuId, locationId, false);
  if (!balance) return;
  const threshold = ctx.db.settings.lowStockThreshold;
  if (balance.available > 0 && balance.available < threshold) {
    const already = ctx.db.notifications.some(n => n.type === 'low_stock' && n.entity?.id === skuId && n.readBy.length === 0);
    if (!already) {
      const sku = getSku(ctx.db, skuId);
      notify(ctx, { type: 'low_stock', severity: 'warning', title: 'Low stock', body: `${sku.name} at ${locationName(ctx.db, locationId)} is down to ${balance.available} ${sku.unit}.`, entity: { kind: 'movement', id: skuId }, audience: ['inventory_manager', 'warehouse_supervisor'] });
    }
  }
}

/* ============================================================ SKUs */

export interface SkuInput { code?: string; name: string; description: string; customerId: string; category: StockCategory; unit: StockUnit; weightKg: number; handling: string[]; barcode?: string }

export function createSku(ctx: Ctx, input: SkuInput): Sku {
  assertRole(ctx, ['inventory_manager', 'warehouse_supervisor'], 'create SKUs');
  const name = requireText(input.name, 'Name');
  const customer = getParty(ctx.db, input.customerId);
  if (customer.type !== 'contract_customer') throw new OpsError('VALIDATION', `${customer.name} is not a contract logistics customer.`);
  const code = (input.code?.trim() || nextReference(ctx.db, 'SKU', ctx.at)).toUpperCase();
  if (ctx.db.skus.some(sku => sku.code.toLowerCase() === code.toLowerCase())) throw new OpsError('DUPLICATE', `SKU code ${code} already exists.`);
  const sku: Sku = {
    id: newId(), code, name, description: input.description.trim(), customerId: customer.id, category: input.category, unit: input.unit,
    weightKg: Math.max(0, input.weightKg), handling: input.handling, barcode: input.barcode?.trim() || `ML${code.replace(/\D/g, '').padStart(8, '0')}`,
    version: 1, createdAt: ctx.at, updatedAt: ctx.at,
  };
  ctx.db.skus.push(sku);
  audit(ctx, { locationId: null, action: 'sku.created', entityKind: 'sku', entityId: sku.id, entityRef: sku.code, after: { name, customer: customer.name } });
  return sku;
}

export function updateSku(ctx: Ctx, input: { skuId: string; expectedVersion?: number; patch: Partial<Pick<Sku, 'name' | 'description' | 'category' | 'handling' | 'weightKg'>> }): Sku {
  assertRole(ctx, ['inventory_manager', 'warehouse_supervisor'], 'edit SKUs');
  const sku = getSku(ctx.db, input.skuId);
  assertVersion(sku.version, input.expectedVersion, 'SKU');
  const before = { name: sku.name, category: sku.category };
  Object.assign(sku, input.patch);
  sku.version += 1;
  sku.updatedAt = ctx.at;
  audit(ctx, { locationId: null, action: 'sku.updated', entityKind: 'sku', entityId: sku.id, entityRef: sku.code, before, after: { name: sku.name, category: sku.category } });
  return sku;
}

/* ============================================================ Orders */

export interface OrderInput { type: WarehouseOrder['type']; customerId: string; locationId: string; customerReference: string; expectedAt: string; lines: { skuId: string; quantity: number }[] }

export function createWarehouseOrder(ctx: Ctx, input: OrderInput): WarehouseOrder {
  assertRole(ctx, ['inventory_manager', 'warehouse_supervisor', 'customer_service'], 'create warehouse orders');
  const customer = getParty(ctx.db, input.customerId);
  const location = getLocation(ctx.db, input.locationId);
  if (!['warehouse', 'logistics_centre', 'inland_depot'].includes(location.type)) throw new OpsError('VALIDATION', `${location.name} is not a warehouse.`);
  if (input.lines.length === 0) throw new OpsError('VALIDATION', 'Add at least one line.');
  if (!input.expectedAt) throw new OpsError('VALIDATION', 'Expected date is required.');
  const seen = new Set<string>();
  for (const line of input.lines) {
    assertPositive(line.quantity, 'Line quantity');
    const sku = getSku(ctx.db, line.skuId);
    if (sku.customerId !== customer.id) throw new OpsError('VALIDATION', `${sku.name} belongs to ${ctx.db.parties.find(p => p.id === sku.customerId)?.name}, not ${customer.name}.`);
    if (seen.has(sku.id)) throw new OpsError('VALIDATION', `${sku.name} appears twice.`);
    seen.add(sku.id);
  }
  const order: WarehouseOrder = {
    id: newId(), reference: nextReference(ctx.db, 'WO', ctx.at), type: input.type, customerId: customer.id, locationId: location.id, customerReference: input.customerReference.trim(),
    lines: input.lines.map(line => ({ skuId: line.skuId, quantity: line.quantity, receivedQty: 0, damagedQty: 0, pickedQty: 0 })), status: 'expected', expectedAt: input.expectedAt,
    transportJobId: null, exceptions: [], version: 1, createdBy: ctx.actor.id, createdAt: ctx.at, updatedAt: ctx.at,
  };
  ctx.db.warehouseOrders.push(order);
  createTaskInternal(ctx, { title: `${input.type === 'inbound' ? 'Receive' : 'Pick'} ${order.reference} for ${customer.name}`, type: input.type === 'inbound' ? 'receiving' : 'picking', locationId: location.id, priority: 'normal', dueAt: input.expectedAt, refKind: 'order', refId: order.id });
  audit(ctx, { locationId: location.id, action: 'order.created', entityKind: 'warehouse_order', entityId: order.id, entityRef: order.reference, after: { type: order.type, customer: customer.name, lines: order.lines.length } });
  return order;
}

export interface ReceivingInput { orderId: string; lines: { skuId: string; actualQty: number; damagedQty: number }[]; notes?: string; idempotencyKey: string; syncedFromClientId?: string }

export function receiveOrder(ctx: Ctx, input: ReceivingInput): { operation: WarehouseOperation; replayed: boolean } {
  assertRole(ctx, ['warehouse_worker', 'warehouse_supervisor', 'inventory_manager'], 'receive stock');
  const { result, replayed } = idempotent(ctx, input.idempotencyKey, 'operations', () => {
    const order = find(ctx.db.warehouseOrders, input.orderId, 'Warehouse order');
    if (order.type !== 'inbound') throw new OpsError('VALIDATION', `${order.reference} is an outbound order.`);
    if (order.status !== 'expected') throw new OpsError('INVALID_STATE', `${order.reference} is ${ORDER_STATUS_LABELS[order.status].toLowerCase()}.`);
    assertLocationAccess(ctx, order.locationId);
    if (input.lines.length === 0) throw new OpsError('VALIDATION', 'Enter the quantities received.');
    const operation: WarehouseOperation = {
      id: newId(), reference: nextReference(ctx.db, 'OP', ctx.at), type: 'receiving', status: 'completed', locationId: order.locationId, orderId: order.id,
      lines: [], exceptions: [], movementIds: [], employeeId: ctx.actor.id, completedAt: ctx.at, idempotencyKey: input.idempotencyKey, notes: input.notes ?? '', syncedFromClientId: input.syncedFromClientId,
    };
    let totalReceived = 0;
    for (const line of input.lines) {
      const orderLine = order.lines.find(entry => entry.skuId === line.skuId);
      const sku = getSku(ctx.db, line.skuId);
      if (!orderLine) throw new OpsError('VALIDATION', `${sku.name} is not on ${order.reference}.`);
      if (line.actualQty < 0 || line.damagedQty < 0) throw new OpsError('VALIDATION', 'Quantities cannot be negative.');
      if (line.damagedQty > line.actualQty) throw new OpsError('VALIDATION', `${sku.name}: damaged quantity cannot exceed the received quantity.`);
      const good = line.actualQty - line.damagedQty;
      if (good > 0) operation.movementIds.push(applyMovement(ctx, { skuId: sku.id, type: 'receipt', quantity: good, effects: [{ locationId: order.locationId, bucket: 'available', delta: good }], destinationLocationId: order.locationId, orderId: order.id, operationId: operation.id, reason: `Received against ${order.reference}${order.customerReference ? ` (${order.customerReference})` : ''}`, idempotencyKey: input.idempotencyKey }).id);
      if (line.damagedQty > 0) {
        operation.movementIds.push(applyMovement(ctx, { skuId: sku.id, type: 'damage', quantity: line.damagedQty, effects: [{ locationId: order.locationId, bucket: 'damaged', delta: line.damagedQty }], destinationLocationId: order.locationId, orderId: order.id, operationId: operation.id, reason: 'Damaged on receipt', idempotencyKey: input.idempotencyKey }).id);
        operation.exceptions.push(`${sku.name}: ${line.damagedQty} ${sku.unit} damaged on receipt.`);
        notify(ctx, { type: 'cargo_damaged', severity: 'danger', title: 'Stock damaged on receipt', body: `${line.damagedQty} ${sku.unit} of ${sku.name} arrived damaged at ${locationName(ctx.db, order.locationId)} (${order.reference}).`, entity: { kind: 'order', id: order.id }, audience: ['warehouse_supervisor', 'inventory_manager'] });
      }
      if (line.actualQty !== orderLine.quantity) {
        operation.exceptions.push(`${sku.name}: expected ${orderLine.quantity}, received ${line.actualQty} ${sku.unit}.`);
        notify(ctx, { type: 'inventory_discrepancy', severity: 'warning', title: 'Receiving discrepancy', body: `${order.reference}: ${sku.name} expected ${orderLine.quantity}, received ${line.actualQty} ${sku.unit}.`, entity: { kind: 'order', id: order.id }, audience: ['inventory_manager', 'warehouse_supervisor'] });
      }
      operation.lines.push({ skuId: sku.id, expectedQty: orderLine.quantity, actualQty: line.actualQty, damagedQty: line.damagedQty });
      orderLine.receivedQty += line.actualQty;
      orderLine.damagedQty += line.damagedQty;
      totalReceived += line.actualQty;
    }
    if (operation.exceptions.length) { operation.status = 'completed_with_exceptions'; order.exceptions.push(...operation.exceptions); }
    ctx.db.operations.push(operation);
    order.status = 'received';
    order.version += 1;
    order.updatedAt = ctx.at;
    if (totalReceived > 0) addCharge(ctx, { serviceCode: 'WH_HANDLING', partyId: order.customerId, quantity: totalReceived, unitAmount: ctx.db.tariff.warehouseHandlingPerUnit, orderId: order.id, description: `Inbound handling ${order.reference}` });
    for (const task of ctx.db.tasks) if (task.refKind === 'order' && task.refId === order.id && ['open', 'in_progress'].includes(task.status)) { task.status = 'done'; task.updatedAt = ctx.at; if (!task.assigneeId) task.assigneeId = ctx.actor.id; }
    notify(ctx, { type: 'stock_received', severity: 'success', title: `${order.reference} received`, body: `${totalReceived} units received at ${locationName(ctx.db, order.locationId)}${operation.exceptions.length ? ` with ${operation.exceptions.length} exception(s)` : ''}.`, entity: { kind: 'order', id: order.id }, audience: ['inventory_manager', 'customer_service'] });
    audit(ctx, { locationId: order.locationId, action: 'operation.receiving', entityKind: 'operation', entityId: operation.id, entityRef: operation.reference, after: { order: order.reference, received: totalReceived, exceptions: operation.exceptions.length } });
    publishEvent(ctx, 'stock.received', { operationId: operation.id, orderId: order.id });
    return operation;
  });
  return { operation: result, replayed };
}

/** Allocates every outbound line from available stock. Fails as a whole if any line is short (acceptance criterion 5). */
export function allocateOrder(ctx: Ctx, input: { orderId: string; expectedVersion?: number }): WarehouseOrder {
  assertRole(ctx, ['inventory_manager', 'warehouse_supervisor'], 'allocate orders');
  const order = find(ctx.db.warehouseOrders, input.orderId, 'Warehouse order');
  assertVersion(order.version, input.expectedVersion, 'Order');
  if (order.type !== 'outbound') throw new OpsError('VALIDATION', 'Only outbound orders are allocated.');
  if (order.status !== 'expected') throw new OpsError('INVALID_STATE', `${order.reference} is ${ORDER_STATUS_LABELS[order.status].toLowerCase()}.`);
  for (const line of order.lines) {
    const sku = getSku(ctx.db, line.skuId);
    const balance = getBalance(ctx.db, sku.id, order.locationId)!;
    if (balance.available < line.quantity) throw new OpsError('INSUFFICIENT_STOCK', `Cannot allocate ${line.quantity} ${sku.unit} of ${sku.name}: only ${balance.available} available at ${locationName(ctx.db, order.locationId)}.`);
  }
  for (const line of order.lines) {
    applyMovement(ctx, { skuId: line.skuId, type: 'reserve', quantity: line.quantity, effects: [{ locationId: order.locationId, bucket: 'available', delta: -line.quantity }, { locationId: order.locationId, bucket: 'reserved', delta: line.quantity }], sourceLocationId: order.locationId, orderId: order.id, reason: `Allocated to ${order.reference}` });
    checkLowStock(ctx, line.skuId, order.locationId);
  }
  order.status = 'allocated';
  order.version += 1;
  order.updatedAt = ctx.at;
  audit(ctx, { locationId: order.locationId, action: 'order.allocated', entityKind: 'warehouse_order', entityId: order.id, entityRef: order.reference, after: { lines: order.lines.length } });
  return order;
}

export interface PickingInput { orderId: string; lines: { skuId: string; pickedQty: number }[]; notes?: string; idempotencyKey: string; syncedFromClientId?: string }

export function pickOrder(ctx: Ctx, input: PickingInput): { operation: WarehouseOperation; replayed: boolean } {
  assertRole(ctx, ['warehouse_worker', 'warehouse_supervisor', 'inventory_manager'], 'pick orders');
  const { result, replayed } = idempotent(ctx, input.idempotencyKey, 'operations', () => {
    const order = find(ctx.db.warehouseOrders, input.orderId, 'Warehouse order');
    if (order.type !== 'outbound') throw new OpsError('VALIDATION', `${order.reference} is an inbound order.`);
    if (order.status !== 'allocated') throw new OpsError('INVALID_STATE', order.status === 'expected' ? `${order.reference} has not been allocated yet.` : `${order.reference} is ${ORDER_STATUS_LABELS[order.status].toLowerCase()}.`);
    assertLocationAccess(ctx, order.locationId);
    const operation: WarehouseOperation = {
      id: newId(), reference: nextReference(ctx.db, 'OP', ctx.at), type: 'picking', status: 'completed', locationId: order.locationId, orderId: order.id,
      lines: [], exceptions: [], movementIds: [], employeeId: ctx.actor.id, completedAt: ctx.at, idempotencyKey: input.idempotencyKey, notes: input.notes ?? '', syncedFromClientId: input.syncedFromClientId,
    };
    let total = 0;
    for (const orderLine of order.lines) {
      const line = input.lines.find(entry => entry.skuId === orderLine.skuId);
      const picked = line?.pickedQty ?? 0;
      const sku = getSku(ctx.db, orderLine.skuId);
      if (picked < 0 || picked > orderLine.quantity) throw new OpsError('VALIDATION', `${sku.name}: pick between 0 and ${orderLine.quantity} ${sku.unit}.`);
      const shortfall = orderLine.quantity - picked;
      if (picked > 0) operation.movementIds.push(applyMovement(ctx, { skuId: sku.id, type: 'pick', quantity: picked, effects: [{ locationId: order.locationId, bucket: 'reserved', delta: -picked }], sourceLocationId: order.locationId, orderId: order.id, operationId: operation.id, reason: `Picked and dispatched on ${order.reference}`, idempotencyKey: input.idempotencyKey }).id);
      if (shortfall > 0) {
        operation.movementIds.push(applyMovement(ctx, { skuId: sku.id, type: 'release', quantity: shortfall, effects: [{ locationId: order.locationId, bucket: 'reserved', delta: -shortfall }, { locationId: order.locationId, bucket: 'available', delta: shortfall }], sourceLocationId: order.locationId, orderId: order.id, operationId: operation.id, reason: `Short pick released on ${order.reference}`, idempotencyKey: input.idempotencyKey }).id);
        operation.exceptions.push(`${sku.name}: short picked ${picked} of ${orderLine.quantity} ${sku.unit}.`);
      }
      operation.lines.push({ skuId: sku.id, expectedQty: orderLine.quantity, actualQty: picked, damagedQty: 0 });
      orderLine.pickedQty = picked;
      total += picked;
    }
    if (total === 0) throw new OpsError('VALIDATION', 'Nothing was picked.');
    if (operation.exceptions.length) { operation.status = 'completed_with_exceptions'; order.exceptions.push(...operation.exceptions); }
    ctx.db.operations.push(operation);
    order.status = 'picked';
    order.version += 1;
    order.updatedAt = ctx.at;
    addCharge(ctx, { serviceCode: 'WH_HANDLING', partyId: order.customerId, quantity: total, unitAmount: ctx.db.tariff.warehouseHandlingPerUnit, orderId: order.id, description: `Outbound handling ${order.reference}` });
    for (const task of ctx.db.tasks) if (task.refKind === 'order' && task.refId === order.id && ['open', 'in_progress'].includes(task.status)) { task.status = 'done'; task.updatedAt = ctx.at; if (!task.assigneeId) task.assigneeId = ctx.actor.id; }
    notify(ctx, { type: 'stock_dispatched', severity: 'success', title: `${order.reference} picked`, body: `${total} units picked at ${locationName(ctx.db, order.locationId)}; ready for transport.`, entity: { kind: 'order', id: order.id }, audience: ['transport_manager', 'inventory_manager'] });
    audit(ctx, { locationId: order.locationId, action: 'operation.picking', entityKind: 'operation', entityId: operation.id, entityRef: operation.reference, after: { order: order.reference, picked: total, exceptions: operation.exceptions.length } });
    publishEvent(ctx, 'stock.picked', { operationId: operation.id, orderId: order.id });
    return operation;
  });
  return { operation: result, replayed };
}

export function cancelOrder(ctx: Ctx, input: { orderId: string; reason: string }): WarehouseOrder {
  assertRole(ctx, ['inventory_manager', 'warehouse_supervisor'], 'cancel orders');
  const order = find(ctx.db.warehouseOrders, input.orderId, 'Warehouse order');
  if (!['expected', 'allocated'].includes(order.status)) throw new OpsError('INVALID_STATE', `${order.reference} can no longer be cancelled.`);
  const reason = requireText(input.reason, 'Reason');
  if (order.status === 'allocated') {
    for (const line of order.lines) applyMovement(ctx, { skuId: line.skuId, type: 'release', quantity: line.quantity, effects: [{ locationId: order.locationId, bucket: 'reserved', delta: -line.quantity }, { locationId: order.locationId, bucket: 'available', delta: line.quantity }], sourceLocationId: order.locationId, orderId: order.id, reason: `Released on cancellation of ${order.reference}` });
  }
  order.status = 'cancelled';
  order.version += 1;
  order.updatedAt = ctx.at;
  for (const task of ctx.db.tasks) if (task.refKind === 'order' && task.refId === order.id && ['open', 'in_progress'].includes(task.status)) { task.status = 'cancelled'; task.updatedAt = ctx.at; }
  audit(ctx, { locationId: order.locationId, action: 'order.cancelled', entityKind: 'warehouse_order', entityId: order.id, entityRef: order.reference, reason });
  return order;
}

/* ============================================================ Transfers, holds, adjustments, reversals */

export interface StockTransferInput { skuId: string; fromLocationId: string; toLocationId: string; qty: number; reason: string; idempotencyKey: string; syncedFromClientId?: string }

export function transferStock(ctx: Ctx, input: StockTransferInput): { operation: WarehouseOperation; replayed: boolean } {
  assertRole(ctx, ['inventory_manager', 'warehouse_supervisor', 'warehouse_worker'], 'transfer stock');
  const { result, replayed } = idempotent(ctx, input.idempotencyKey, 'operations', () => {
    if (input.fromLocationId === input.toLocationId) throw new OpsError('VALIDATION', 'Source and destination must differ.');
    assertPositive(input.qty, 'Quantity');
    const from = getLocation(ctx.db, input.fromLocationId);
    const to = getLocation(ctx.db, input.toLocationId);
    assertLocationAccess(ctx, from.id);
    if (!to.active) throw new OpsError('INVALID_STATE', `${to.name} is inactive.`);
    const sku = getSku(ctx.db, input.skuId);
    const operation: WarehouseOperation = {
      id: newId(), reference: nextReference(ctx.db, 'OP', ctx.at), type: 'transfer', status: 'completed', locationId: from.id, destinationLocationId: to.id,
      lines: [{ skuId: sku.id, expectedQty: input.qty, actualQty: input.qty, damagedQty: 0 }], exceptions: [], movementIds: [], employeeId: ctx.actor.id, completedAt: ctx.at,
      idempotencyKey: input.idempotencyKey, notes: input.reason, syncedFromClientId: input.syncedFromClientId,
    };
    operation.movementIds.push(applyMovement(ctx, { skuId: sku.id, type: 'transfer', quantity: input.qty, effects: [{ locationId: from.id, bucket: 'available', delta: -input.qty }, { locationId: to.id, bucket: 'available', delta: input.qty }], sourceLocationId: from.id, destinationLocationId: to.id, operationId: operation.id, reason: input.reason.trim() || `Transfer ${from.code} to ${to.code}`, idempotencyKey: input.idempotencyKey }).id);
    ctx.db.operations.push(operation);
    checkLowStock(ctx, sku.id, from.id);
    audit(ctx, { locationId: from.id, action: 'operation.transfer', entityKind: 'operation', entityId: operation.id, entityRef: operation.reference, after: { sku: sku.code, qty: input.qty, to: to.code }, reason: input.reason });
    return operation;
  });
  return { operation: result, replayed };
}

export function holdStock(ctx: Ctx, input: { skuId: string; locationId: string; qty: number; reason: string; release?: boolean }): StockMovement {
  assertRole(ctx, ['inventory_manager', 'warehouse_supervisor'], 'place or release holds');
  assertPositive(input.qty, 'Quantity');
  const sku = getSku(ctx.db, input.skuId);
  const location = getLocation(ctx.db, input.locationId);
  const reason = requireText(input.reason, 'Reason');
  const effects: MovementEffect[] = input.release
    ? [{ locationId: location.id, bucket: 'held', delta: -input.qty }, { locationId: location.id, bucket: 'available', delta: input.qty }]
    : [{ locationId: location.id, bucket: 'available', delta: -input.qty }, { locationId: location.id, bucket: 'held', delta: input.qty }];
  const movement = applyMovement(ctx, { skuId: sku.id, type: input.release ? 'unhold' : 'hold', quantity: input.qty, effects, sourceLocationId: location.id, reason });
  audit(ctx, { locationId: location.id, action: input.release ? 'stock.hold_released' : 'stock.held', entityKind: 'movement', entityId: movement.id, entityRef: movement.reference, after: { sku: sku.code, qty: input.qty }, reason });
  return movement;
}

export function requestAdjustment(ctx: Ctx, input: { skuId: string; locationId: string; bucket: Bucket; delta: number; reason: string }): Approval {
  assertRole(ctx, ['inventory_manager', 'warehouse_supervisor', 'warehouse_worker'], 'request stock adjustments');
  if (!Number.isFinite(input.delta) || input.delta === 0) throw new OpsError('VALIDATION', 'Enter a non-zero adjustment quantity.');
  const reason = requireText(input.reason, 'Reason');
  const sku = getSku(ctx.db, input.skuId);
  const location = getLocation(ctx.db, input.locationId);
  assertLocationAccess(ctx, location.id);
  const balance = getBalance(ctx.db, sku.id, location.id)!;
  if (balance[input.bucket] + input.delta < 0) throw new OpsError('INSUFFICIENT_STOCK', `${sku.name} has only ${balance[input.bucket]} ${sku.unit} in the ${input.bucket} bucket at ${location.name}.`);
  const approval: Approval = {
    id: newId(), reference: nextReference(ctx.db, 'APR', ctx.at), kind: 'stock_adjustment', status: 'pending', requestedBy: ctx.actor.id, requestedAt: ctx.at,
    payload: { skuId: sku.id, locationId: location.id, bucket: input.bucket, delta: input.delta, reason },
  };
  ctx.db.approvals.push(approval);
  audit(ctx, { locationId: location.id, action: 'adjustment.requested', entityKind: 'approval', entityId: approval.id, entityRef: approval.reference, approvalId: approval.id, after: { sku: sku.code, bucket: input.bucket, delta: input.delta }, reason });
  const needsSecondPerson = Math.abs(input.delta) >= ctx.db.settings.adjustmentApprovalThreshold || !['inventory_manager', 'system_admin'].includes(ctx.actor.role);
  if (!needsSecondPerson) applyApproval(ctx, approval, 'Approved on request: below the second-approver threshold.');
  else notify(ctx, { type: 'pending_approval', severity: 'warning', title: 'Stock adjustment awaiting approval', body: `${ctx.actor.name} requested ${input.delta > 0 ? '+' : ''}${input.delta} ${sku.unit} (${input.bucket}) for ${sku.name} at ${location.name}: ${reason}`, entity: { kind: 'approval', id: approval.id }, audience: ['inventory_manager', 'warehouse_supervisor'] });
  return approval;
}

function applyApproval(ctx: Ctx, approval: Approval, note: string) {
  const { skuId, locationId, bucket, delta, reason } = approval.payload;
  const movement = applyMovement(ctx, { skuId: skuId!, type: 'adjustment', quantity: Math.abs(delta!), effects: [{ locationId: locationId!, bucket: bucket!, delta: delta! }], sourceLocationId: delta! < 0 ? locationId : null, destinationLocationId: delta! > 0 ? locationId : null, approvalId: approval.id, reason });
  approval.status = 'approved';
  approval.decidedBy = ctx.actor.id;
  approval.decidedAt = ctx.at;
  approval.decisionNote = note;
  approval.movementId = movement.id;
  checkLowStock(ctx, skuId!, locationId!);
}

export function decideApproval(ctx: Ctx, input: { approvalId: string; decision: 'approved' | 'rejected'; note: string }): Approval {
  assertRole(ctx, ['inventory_manager', 'warehouse_supervisor'], 'approve adjustments');
  const approval = find(ctx.db.approvals, input.approvalId, 'Approval');
  if (approval.status !== 'pending') throw new OpsError('INVALID_STATE', 'This request has already been decided.');
  if (approval.requestedBy === ctx.actor.id) throw new OpsError('SEPARATION_OF_DUTIES', 'You cannot approve your own request. A second person must decide it.');
  const sku = getSku(ctx.db, approval.payload.skuId!);
  if (input.decision === 'approved') applyApproval(ctx, approval, input.note.trim() || 'Approved');
  else { approval.status = 'rejected'; approval.decidedBy = ctx.actor.id; approval.decidedAt = ctx.at; approval.decisionNote = input.note.trim() || 'Rejected'; }
  const requester = getEmployee(ctx.db, approval.requestedBy);
  const decided: ApprovalStatus = input.decision;
  audit(ctx, { locationId: approval.payload.locationId ?? null, action: `adjustment.${decided}`, entityKind: 'approval', entityId: approval.id, entityRef: approval.reference, approvalId: approval.id, before: { status: 'pending' }, after: { status: decided, movement: approval.movementId }, reason: input.note });
  notify(ctx, { type: 'approval_decided', severity: decided === 'approved' ? 'success' : 'warning', title: `Adjustment ${decided}`, body: `${approval.reference} for ${sku.name} was ${decided} by ${ctx.actor.name}.`, entity: { kind: 'approval', id: approval.id }, audience: [requester.role] });
  return approval;
}

export function reverseMovement(ctx: Ctx, input: { movementId: string; reason: string }): StockMovement {
  assertRole(ctx, ['inventory_manager'], 'reverse ledger entries');
  const original = find(ctx.db.movements, input.movementId, 'Movement');
  if (original.reversedByMovementId) throw new OpsError('INVALID_STATE', `${original.reference} has already been reversed.`);
  if (original.type === 'reversal') throw new OpsError('INVALID_STATE', 'A reversal cannot itself be reversed; post a new adjustment instead.');
  const reason = requireText(input.reason, 'Reason');
  const reversal = applyMovement(ctx, {
    skuId: original.skuId, type: 'reversal', quantity: original.quantity, effects: original.effects.map(effect => ({ ...effect, delta: -effect.delta })),
    sourceLocationId: original.destinationLocationId, destinationLocationId: original.sourceLocationId, orderId: original.orderId, operationId: original.operationId,
    reason: `Reversal of ${original.reference}: ${reason}`, reversesMovementId: original.id,
  });
  original.reversedByMovementId = reversal.id;
  audit(ctx, { locationId: original.sourceLocationId ?? original.destinationLocationId, action: 'stock.reversed', entityKind: 'movement', entityId: reversal.id, entityRef: reversal.reference, before: { reverses: original.reference }, reason });
  return reversal;
}
