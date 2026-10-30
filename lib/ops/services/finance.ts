/*
 * Finance services: manual charges, invoices per party, payments (online card is
 * the only accepted mode for cargo collection since March 2026), the container
 * cash-collection screen that settles a consignee's charges up to the expected
 * exit date, and tariff maintenance.
 */

import type { Charge, Container, Currency, Invoice, InvoiceStatus, ServiceCode, Tariff } from '../types';
import { INVOICE_STATUS_LABELS } from '../types';
import { addCharge, assertPositive, assertRole, assertVersion, audit, find, getContainer, getParty, newId, nextReference, notify, partyName, publishEvent, requireText, type Ctx, OpsError } from '../core';
import { quoteStorage } from '../tariff';
import { checkReady, recordEvent, releaseBlockers } from './terminal';

export function createCharge(ctx: Ctx, input: { serviceCode: ServiceCode; partyId: string; quantity: number; unitAmount: number; currency?: Currency; description: string; containerId?: string; vesselCallId?: string; orderId?: string; transportJobId?: string }): Charge {
  assertRole(ctx, ['finance_manager', 'customer_service'], 'add charges');
  getParty(ctx.db, input.partyId);
  assertPositive(input.quantity, 'Quantity');
  assertPositive(input.unitAmount, 'Unit amount');
  if (input.containerId) getContainer(ctx.db, input.containerId);
  const charge = addCharge(ctx, { ...input, description: input.description.trim() || undefined });
  audit(ctx, { locationId: null, action: 'charge.added', entityKind: 'charge', entityId: charge.id, entityRef: charge.reference, after: { service: charge.serviceCode, amount: charge.amount, party: partyName(ctx.db, charge.partyId) } });
  return charge;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function createInvoice(ctx: Ctx, input: { partyId: string; chargeIds: string[]; dueDays: number; issue?: boolean }): Invoice {
  assertRole(ctx, ['finance_manager'], 'create invoices');
  const party = getParty(ctx.db, input.partyId);
  const charges = input.chargeIds.map(id => find(ctx.db.charges, id, 'Charge'));
  if (charges.length === 0) throw new OpsError('VALIDATION', 'Select at least one charge.');
  const invoiced = charges.find(charge => charge.invoiceId);
  if (invoiced) throw new OpsError('DUPLICATE', `${invoiced.reference} is already on an invoice.`);
  if (charges.some(charge => charge.partyId !== party.id)) throw new OpsError('VALIDATION', 'All charges must belong to the same party.');
  if (charges.some(charge => charge.amount <= 0)) throw new OpsError('VALIDATION', 'Zero-value charges cannot be invoiced.');
  const currency = charges[0].currency;
  if (charges.some(charge => charge.currency !== currency)) throw new OpsError('VALIDATION', 'An invoice can only carry one currency.');
  const subtotal = round(charges.reduce((sum, charge) => sum + charge.amount, 0));
  const vat = round(subtotal * ctx.db.tariff.vatRate);
  const invoice: Invoice = {
    id: newId(), reference: nextReference(ctx.db, 'INV', ctx.at), partyId: party.id, chargeIds: charges.map(charge => charge.id), subtotal, vatRate: ctx.db.tariff.vatRate, vat,
    total: round(subtotal + vat), paid: 0, currency, status: 'draft', payments: [], history: [{ at: ctx.at, by: ctx.actor.id, from: null, to: 'draft' }], version: 1, createdAt: ctx.at,
  };
  charges.forEach(charge => { charge.invoiceId = invoice.id; });
  ctx.db.invoices.push(invoice);
  audit(ctx, { locationId: null, action: 'invoice.created', entityKind: 'invoice', entityId: invoice.id, entityRef: invoice.reference, after: { party: party.name, total: invoice.total, currency, charges: charges.length } });
  if (input.issue) issueInvoiceInternal(ctx, invoice, input.dueDays);
  return invoice;
}

function issueInvoiceInternal(ctx: Ctx, invoice: Invoice, dueDays: number) {
  const due = new Date(ctx.at);
  due.setUTCDate(due.getUTCDate() + Math.max(0, dueDays));
  invoice.issuedAt = ctx.at;
  invoice.dueAt = due.toISOString();
  transitionInvoice(ctx, invoice, 'issued');
  publishEvent(ctx, 'sap.invoice_posted', { invoiceId: invoice.id, reference: invoice.reference });
}

function transitionInvoice(ctx: Ctx, invoice: Invoice, to: InvoiceStatus, note?: string) {
  const from = invoice.status;
  invoice.status = to;
  invoice.history.push({ at: ctx.at, by: ctx.actor.id, from, to, note });
  invoice.version += 1;
  audit(ctx, { locationId: null, action: `invoice.${to}`, entityKind: 'invoice', entityId: invoice.id, entityRef: invoice.reference, before: { status: from }, after: { status: to, paid: invoice.paid }, reason: note });
}

export function issueInvoice(ctx: Ctx, input: { invoiceId: string; dueDays: number; expectedVersion?: number }): Invoice {
  assertRole(ctx, ['finance_manager'], 'issue invoices');
  const invoice = find(ctx.db.invoices, input.invoiceId, 'Invoice');
  assertVersion(invoice.version, input.expectedVersion, 'Invoice');
  if (invoice.status !== 'draft') throw new OpsError('INVALID_STATE', `${invoice.reference} is ${INVOICE_STATUS_LABELS[invoice.status].toLowerCase()}.`);
  issueInvoiceInternal(ctx, invoice, input.dueDays);
  return invoice;
}

export function recordPayment(ctx: Ctx, input: { invoiceId: string; amount: number; method: 'online_card' | 'bank_transfer' | 'credit_note'; reference: string; expectedVersion?: number; onBehalfOf?: string }): Invoice {
  assertRole(ctx, ['finance_manager', 'customer_service'], 'record payments');
  const invoice = find(ctx.db.invoices, input.invoiceId, 'Invoice');
  assertVersion(invoice.version, input.expectedVersion, 'Invoice');
  if (!['issued', 'partially_paid', 'overdue'].includes(invoice.status)) throw new OpsError('INVALID_STATE', `${invoice.reference} is ${INVOICE_STATUS_LABELS[invoice.status].toLowerCase()}; payments apply to issued invoices.`);
  assertPositive(input.amount, 'Amount');
  const outstanding = round(invoice.total - invoice.paid);
  if (input.amount > outstanding + 0.005) throw new OpsError('VALIDATION', `Payment exceeds the outstanding balance of ${invoice.currency} ${outstanding.toFixed(2)}.`);
  const reference = requireText(input.reference, 'Payment reference');
  if (invoice.payments.some(payment => payment.reference === reference)) throw new OpsError('DUPLICATE', `Payment ${reference} has already been recorded on this invoice.`);
  const payment = { id: newId(), receiptNumber: nextReference(ctx.db, 'RCP', ctx.at), amount: round(input.amount), method: input.method, reference, at: ctx.at, by: ctx.actor.id };
  invoice.payments.push(payment);
  invoice.paid = round(invoice.paid + payment.amount);
  transitionInvoice(ctx, invoice, invoice.paid >= invoice.total - 0.005 ? 'paid' : 'partially_paid', `${payment.receiptNumber}${input.onBehalfOf ? ` via ${input.onBehalfOf}` : ''}`);
  notify(ctx, { type: 'payment_received', severity: 'success', title: `Payment on ${invoice.reference}`, body: `${invoice.currency} ${payment.amount.toFixed(2)} received from ${partyName(ctx.db, invoice.partyId)} (${payment.receiptNumber}).`, entity: { kind: 'invoice', id: invoice.id }, audience: ['finance_manager'] });
  publishEvent(ctx, 'sap.payment_posted', { invoiceId: invoice.id, receipt: payment.receiptNumber });
  if (invoice.status === 'paid') settleContainersOnInvoice(ctx, invoice);
  return invoice;
}

/** When every charge on a container is paid, the container's release condition is met. */
function settleContainersOnInvoice(ctx: Ctx, invoice: Invoice) {
  const containerIds = new Set(invoice.chargeIds.map(id => ctx.db.charges.find(charge => charge.id === id)?.containerId).filter(Boolean) as string[]);
  for (const containerId of containerIds) {
    const container = getContainer(ctx.db, containerId);
    if (container.category !== 'import' || container.chargesSettled) continue;
    const consigneeCharges = ctx.db.charges.filter(charge => charge.containerId === container.id && charge.partyId === container.consigneeId && charge.amount > 0);
    const unpaid = consigneeCharges.some(charge => { const inv = ctx.db.invoices.find(entry => entry.id === charge.invoiceId); return !inv || inv.status !== 'paid'; });
    if (unpaid) continue;
    container.chargesSettled = true;
    recordEvent(ctx, container, 'charges_settled', `Charges settled on ${invoice.reference}`, { refKind: 'charge', refId: invoice.id });
    checkReady(ctx, container);
  }
}

export function cancelInvoice(ctx: Ctx, input: { invoiceId: string; reason: string; expectedVersion?: number }): Invoice {
  assertRole(ctx, ['finance_manager'], 'cancel invoices');
  const invoice = find(ctx.db.invoices, input.invoiceId, 'Invoice');
  assertVersion(invoice.version, input.expectedVersion, 'Invoice');
  if (invoice.paid > 0) throw new OpsError('INVALID_STATE', 'An invoice with payments cannot be cancelled; issue a credit note instead.');
  if (['paid', 'cancelled'].includes(invoice.status)) throw new OpsError('INVALID_STATE', `${invoice.reference} is ${INVOICE_STATUS_LABELS[invoice.status].toLowerCase()}.`);
  const reason = requireText(input.reason, 'Reason');
  for (const charge of ctx.db.charges) if (charge.invoiceId === invoice.id) charge.invoiceId = null;
  transitionInvoice(ctx, invoice, 'cancelled', reason);
  return invoice;
}

/**
 * The "Container Cash Collection – Online" screen: quotes storage up to the expected
 * exit date, invoices the consignee's open charges for the container and takes the
 * online payment in full or in part. Full payment settles the container.
 */
export interface CollectionQuote {
  container: Container;
  storage: ReturnType<typeof quoteStorage> | null;
  openCharges: Charge[];
  subtotal: number;
  vat: number;
  total: number;
  blockersAfterPayment: string[];
}

export function quoteCollection(db: import('../types').OpsDB, containerId: string, expectedExit: string, now: string): CollectionQuote {
  const container = getContainer(db, containerId);
  const payer = container.consigneeId ?? container.lineId;
  const storage = container.dischargedAt && container.category === 'import' ? quoteStorage(db.tariff, container, container.dischargedAt, expectedExit) : null;
  const settledStorage = db.charges.filter(charge => charge.containerId === container.id && charge.serviceCode === 'STORAGE_IMPORT').reduce((sum, charge) => sum + charge.amount, 0);
  const openCharges = db.charges.filter(charge => charge.containerId === container.id && charge.partyId === payer && !charge.invoiceId && charge.amount > 0);
  const storageDue = storage ? Math.max(0, round(storage.amount - settledStorage)) : 0;
  const subtotal = round(openCharges.reduce((sum, charge) => sum + charge.amount, 0) + storageDue);
  const vat = round(subtotal * db.tariff.vatRate);
  const blockers = releaseBlockers(container, now).filter(blocker => blocker !== 'Charges not settled');
  return { container, storage: storage ? { ...storage, amount: storageDue } : null, openCharges, subtotal, vat, total: round(subtotal + vat), blockersAfterPayment: blockers };
}

export function collectContainerCharges(ctx: Ctx, input: { containerId: string; expectedExit: string; haulierId?: string | null; payableAmount: number; cardReference: string; onBehalfOf?: string }): { invoice: Invoice | null; quote: CollectionQuote } {
  assertRole(ctx, ['customer_service', 'finance_manager'], 'collect container charges');
  const container = getContainer(ctx.db, input.containerId);
  if (container.category !== 'import' || container.status !== 'in_yard') throw new OpsError('INVALID_STATE', `${container.number} is not an import container in the yard.`);
  if (!container.consigneeId) throw new OpsError('VALIDATION', 'Assign a consignee before collecting charges.');
  if (!input.expectedExit || new Date(input.expectedExit) < new Date(ctx.at.slice(0, 10))) throw new OpsError('VALIDATION', 'Expected exit date must be today or later.');
  const consignee = getParty(ctx.db, container.consigneeId);
  if (!consignee.portalRegistered) throw new OpsError('NOT_READY', `${consignee.name} must register on the customer portal before paying online.`);
  const quote = quoteCollection(ctx.db, container.id, input.expectedExit, ctx.at);
  if (quote.storage && quote.storage.amount > 0) {
    addCharge(ctx, { serviceCode: 'STORAGE_IMPORT', partyId: consignee.id, quantity: quote.storage.days, unitAmount: quote.storage.amount / quote.storage.days, containerId: container.id, description: `Storage ${quote.storage.days} day(s) to expected exit ${input.expectedExit.slice(0, 10)} (${quote.storage.freeDays} free)` });
  }
  const chargeIds = ctx.db.charges.filter(charge => charge.containerId === container.id && charge.partyId === consignee.id && !charge.invoiceId && charge.amount > 0).map(charge => charge.id);
  if (input.haulierId) { getParty(ctx.db, input.haulierId); container.haulierId = input.haulierId; }
  if (chargeIds.length === 0) {
    // Inside the free storage period with every other charge billed to the line: nothing for the consignee to pay.
    container.chargesSettled = true;
    recordEvent(ctx, container, 'charges_settled', `No charges due to the consignee for exit on ${input.expectedExit.slice(0, 10)}`);
    audit(ctx, { locationId: container.locationId, action: 'container.charges_settled', entityKind: 'container', entityId: container.id, entityRef: container.number, after: { invoice: null } });
    checkReady(ctx, container);
    return { invoice: null, quote };
  }
  const invoice = createInvoice({ ...ctx, actor: { ...ctx.actor, role: ctx.actor.role === 'system_admin' ? 'system_admin' : 'finance_manager' } }, { partyId: consignee.id, chargeIds, dueDays: 0, issue: true });
  const payable = round(input.payableAmount);
  if (payable > 0) {
    recordPayment({ ...ctx, actor: { ...ctx.actor, role: ctx.actor.role === 'system_admin' ? 'system_admin' : 'finance_manager' } }, { invoiceId: invoice.id, amount: Math.min(payable, invoice.total), method: 'online_card', reference: requireText(input.cardReference, 'Card authorisation reference'), onBehalfOf: input.onBehalfOf });
  }
  if (invoice.status !== 'paid') {
    recordEvent(ctx, container, 'charges_settled', `Online collection ${invoice.reference}: ${invoice.currency} ${invoice.paid.toFixed(2)} of ${invoice.total.toFixed(2)} paid; balance outstanding`);
  }
  return { invoice, quote };
}

export function updateTariff(ctx: Ctx, input: { patch: Partial<Tariff> }): Tariff {
  assertRole(ctx, ['finance_manager'], 'edit the tariff');
  const before = { ...ctx.db.tariff };
  Object.assign(ctx.db.tariff, input.patch);
  const changed = Object.keys(input.patch);
  audit(ctx, { locationId: null, action: 'tariff.updated', entityKind: 'tariff', entityId: 'tariff', entityRef: 'KCT schedule of charges', before: Object.fromEntries(changed.map(key => [key, (before as unknown as Record<string, unknown>)[key]])), after: Object.fromEntries(changed.map(key => [key, (ctx.db.tariff as unknown as Record<string, unknown>)[key]])) });
  return ctx.db.tariff;
}

export function outstandingFor(db: import('../types').OpsDB, partyId: string): number {
  return round(db.invoices.filter(invoice => invoice.partyId === partyId && ['issued', 'partially_paid', 'overdue'].includes(invoice.status)).reduce((sum, invoice) => sum + invoice.total - invoice.paid, 0));
}
