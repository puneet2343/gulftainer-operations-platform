'use client';

/*
 * The service façade pages call. Every function runs inside `commit()`, so a thrown
 * OpsError leaves the database untouched. The underlying services live in
 * services/*.ts and are written against a `Ctx`, which the seed also uses.
 */

import type { Employee, IntegrationEvent, QueuedOperation } from './types';
import { commit } from './store';
import { makeCtx, notify, type Ctx } from './core';
import * as terminal from './services/terminal';
import * as logistics from './services/logistics';
import * as warehouse from './services/warehouse';
import * as finance from './services/finance';
import * as shared from './services/shared';

type Core<I, R> = (ctx: Ctx, input: I) => R;
function wrap<I, R>(fn: Core<I, R>) {
  return (actor: Employee, input: I): R => commit(db => fn(makeCtx(db, actor), input));
}

export const ops = {
  // Vessel calls
  createVesselCall: wrap(terminal.createVesselCall),
  updateVesselCall: wrap(terminal.updateVesselCall),
  recordPreArrival: wrap(terminal.recordPreArrival),
  berthVessel: wrap(terminal.berthVessel),
  startVesselOperations: wrap(terminal.startVesselOperations),
  completeVesselOperations: wrap(terminal.completeVesselOperations),
  departVessel: wrap(terminal.departVessel),
  // Containers
  registerContainer: wrap(terminal.registerContainer),
  updateContainer: wrap(terminal.updateContainer),
  dischargeContainer: wrap(terminal.dischargeContainer),
  loadContainer: wrap(terminal.loadContainer),
  shiftContainer: wrap(terminal.shiftContainer),
  recordVgm: wrap(terminal.recordVgm),
  placeHold: wrap(terminal.placeHold),
  releaseHold: wrap(terminal.releaseHold),
  updateCustoms: wrap(terminal.updateCustoms),
  recordDeliveryOrder: wrap(terminal.recordDeliveryOrder),
  assignHaulier: wrap(terminal.assignHaulier),
  reeferCheck: wrap(terminal.reeferCheck),
  // E-tokens and gate
  generateToken: wrap(terminal.generateToken),
  amendToken: wrap(terminal.amendToken),
  cancelToken: wrap(terminal.cancelToken),
  marshallingYardArrival: wrap(terminal.marshallingYardArrival),
  gateOut: wrap(terminal.gateOut),
  gateIn: wrap(terminal.gateIn),
  // Logistics
  createInlandTransfer: wrap(logistics.createInlandTransfer),
  dispatchInlandTransfer: wrap(logistics.dispatchInlandTransfer),
  receiveInlandTransfer: wrap(logistics.receiveInlandTransfer),
  createTransportJob: wrap(logistics.createTransportJob),
  assignTransportJob: wrap(logistics.assignTransportJob),
  startTransportJob: wrap(logistics.startTransportJob),
  completeTransportJob: wrap(logistics.completeTransportJob),
  cancelTransportJob: wrap(logistics.cancelTransportJob),
  recordTransportDelay: wrap(logistics.recordTransportDelay),
  // Warehouse
  createSku: wrap(warehouse.createSku),
  updateSku: wrap(warehouse.updateSku),
  createWarehouseOrder: wrap(warehouse.createWarehouseOrder),
  receiveOrder: wrap(warehouse.receiveOrder),
  allocateOrder: wrap(warehouse.allocateOrder),
  pickOrder: wrap(warehouse.pickOrder),
  cancelOrder: wrap(warehouse.cancelOrder),
  transferStock: wrap(warehouse.transferStock),
  holdStock: wrap(warehouse.holdStock),
  requestAdjustment: wrap(warehouse.requestAdjustment),
  decideApproval: wrap(warehouse.decideApproval),
  reverseMovement: wrap(warehouse.reverseMovement),
  // Finance
  createCharge: wrap(finance.createCharge),
  createInvoice: wrap(finance.createInvoice),
  issueInvoice: wrap(finance.issueInvoice),
  recordPayment: wrap(finance.recordPayment),
  cancelInvoice: wrap(finance.cancelInvoice),
  collectContainerCharges: wrap(finance.collectContainerCharges),
  updateTariff: wrap(finance.updateTariff),
  // Shared
  createTask: wrap(shared.createTask),
  assignTask: wrap(shared.assignTask),
  setTaskStatus: wrap(shared.setTaskStatus),
  addDocument: wrap(shared.addDocument),
  addDocumentVersion: wrap(shared.addDocumentVersion),
  markNotificationsRead: wrap(shared.markNotificationsRead),
  enqueueOffline: wrap(shared.enqueueOffline),
  discardQueued: wrap(shared.discardQueued),
  requeue: wrap(shared.requeue),
  upsertLocation: wrap(shared.upsertLocation),
  upsertEmployee: wrap(shared.upsertEmployee),
  upsertParty: wrap(shared.upsertParty),
  registerPortalAccount: wrap(shared.registerPortalAccount),
  runHousekeeping: (actor: Employee) => commit(db => shared.runHousekeeping(makeCtx(db, actor))),

  /** Replays one queued operation. A rejection is recorded on the queue entry in its own transaction. */
  syncQueued(actor: Employee, clientId: string): QueuedOperation {
    try {
      return commit(db => shared.syncQueued(makeCtx(db, actor), clientId));
    } catch (error) {
      if (error instanceof shared.QueuedRejection) {
        return commit(db => {
          const queued = db.offlineQueue.find(item => item.clientId === clientId)!;
          queued.attempts += 1;
          queued.status = 'rejected';
          queued.error = error.message;
          return queued;
        });
      }
      throw error;
    }
  },

  /** Records an inbound integration message. Failures are logged and notified without touching committed data. */
  ingestIntegrationEvent(actor: Employee, input: shared.InboundEvent): IntegrationEvent {
    try {
      return commit(db => shared.ingestIntegrationEvent(makeCtx(db, actor), input));
    } catch (error) {
      if (error instanceof shared.IntegrationFailure) {
        return commit(db => {
          const ctx = makeCtx(db, actor);
          const record = { ...error.record, status: 'failed' as const, detail: error.message };
          db.integrations.push(record);
          notify(ctx, { type: 'integration_failed', severity: 'danger', title: `${input.provider} message failed`, body: `${input.type} for ${input.subject}: ${error.message}`, audience: ['customer_service', 'terminal_ops', 'system_admin'] });
          return record;
        });
      }
      throw error;
    }
  },

  setOffline(offline: boolean) {
    commit(db => { db.settings.offline = offline; });
  },

  updateSettings(actor: Employee, patch: Partial<Pick<import('./types').OpsSettings, 'lowStockThreshold' | 'adjustmentApprovalThreshold'>>) {
    commit(db => {
      const ctx = makeCtx(db, actor);
      if (ctx.actor.role !== 'system_admin') throw new Error('Only system administrators can change settings.');
      Object.assign(db.settings, patch);
    });
  },

  processOutbox(): number {
    return commit(db => shared.processOutbox(db, new Date().toISOString()));
  },
};

export { OpsError } from './core';
export { releaseBlockers, isReadyForPickup, activeHolds, containerLabel } from './services/terminal';
export { uncollectedContainers } from './services/logistics';
export { getBalance, onHand } from './services/warehouse';
export { quoteCollection, outstandingFor } from './services/finance';
export { notificationsFor, canOpenDocument } from './services/shared';
