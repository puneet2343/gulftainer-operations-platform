'use client';

/*
 * One invoice: lines, VAT, payments and history, with issue, payment and
 * cancellation actions for the finance manager.
 */

import { use, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import PageHeader from '@/components/ui/PageHeader';
import { Panel, SectionHeader } from '@/components/ui/Panel';
import { KeyValueList } from '@/components/ui/KeyValue';
import Timeline from '@/components/ui/Timeline';
import FormDialog from '@/components/ui/FormDialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Controls';
import { PageSkeleton } from '@/components/ui/Skeletons';
import { INPUT, SELECT } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { InvoiceStatusBadge, PartyName, ContainerLink, EmployeeName, PanelButton, PanelBody, ActionError } from '@/components/admin/Shared';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { formatMoney, formatDate, formatDateTime } from '@/lib/format';
import { SERVICE_LABELS, INVOICE_STATUS_LABELS, type Invoice, type Payment } from '@/lib/ops/types';

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { db, actor } = useOps();
  const toast = useToast();
  const { run, busy, error, clear } = useAction();
  const [paying, setPaying] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  if (!db || !actor) return <PageSkeleton />;
  const invoice = db.invoices.find(entry => entry.id === id);
  if (!invoice) return <EmptyState title="Invoice not found" description="It may have been removed in another session." action={<Link href="/admin/finance" className="btn btn-secondary">Back to finance</Link>} />;
  const charges = invoice.chargeIds.map(chargeId => db.charges.find(charge => charge.id === chargeId)).filter(Boolean) as NonNullable<ReturnType<typeof db.charges.find>>[];
  const balance = Math.round((invoice.total - invoice.paid) * 100) / 100;
  const canFinance = ['finance_manager', 'system_admin'].includes(actor.role);
  const canPay = canFinance || actor.role === 'customer_service';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <PageHeader eyebrow={<Link href="/admin/finance" className="hover:text-primary">Finance</Link>} title={invoice.reference} subtitle={`${db.parties.find(p => p.id === invoice.partyId)?.name}. ${INVOICE_STATUS_LABELS[invoice.status]}${invoice.dueAt ? `, due ${formatDate(invoice.dueAt)}` : ''}.`}
        action={<div className="flex flex-wrap items-center gap-2"><InvoiceStatusBadge status={invoice.status} />
          {invoice.status === 'draft' && canFinance && <PanelButton primary onClick={() => { clear(); setIssuing(true); }}>Issue</PanelButton>}
          {['issued', 'partially_paid', 'overdue'].includes(invoice.status) && canPay && <PanelButton primary onClick={() => { clear(); setPaying(true); }}>Record payment</PanelButton>}
          {['draft', 'issued', 'overdue'].includes(invoice.status) && invoice.paid === 0 && canFinance && <PanelButton danger onClick={() => { clear(); setCancelling(true); }}>Cancel</PanelButton>}
        </div>} />
      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SectionHeader title="Service lines" description={`${charges.length} line${charges.length === 1 ? '' : 's'} · VAT ${Math.round(invoice.vatRate * 100)}%`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead><tr className="border-b border-gray-100 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-400"><th className="px-4 py-3">Service</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Unit</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
              <tbody>
                {charges.map(charge => { const container = db.containers.find(c => c.id === charge.containerId); return (
                  <tr key={charge.id} className="border-b border-gray-100 last:border-0"><td className="px-4 py-3"><p className="!text-[13px] !text-secondary">{charge.description}</p><p className="!text-[12px] !text-gray-400">{SERVICE_LABELS[charge.serviceCode]} · {charge.reference} · {formatDate(charge.createdAt)}</p></td><td className="px-4 py-3">{container ? <ContainerLink container={container} /> : charge.transportJobId ? db.transportJobs.find(j => j.id === charge.transportJobId)?.reference : charge.orderId ? db.warehouseOrders.find(o => o.id === charge.orderId)?.reference : '—'}</td><td className="px-4 py-3 text-right tabular-nums">{charge.quantity}</td><td className="px-4 py-3 text-right tabular-nums">{charge.unitAmount.toFixed(2)}</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(charge.amount, charge.currency)}</td></tr>
                ); })}
                <tr className="border-t border-gray-200"><td className="px-4 py-2 text-gray-500" colSpan={4}>Subtotal</td><td className="px-4 py-2 text-right tabular-nums">{formatMoney(invoice.subtotal, invoice.currency)}</td></tr>
                <tr><td className="px-4 py-2 text-gray-500" colSpan={4}>VAT</td><td className="px-4 py-2 text-right tabular-nums">{formatMoney(invoice.vat, invoice.currency)}</td></tr>
                <tr className="bg-gray-50 font-semibold text-secondary"><td className="px-4 py-2" colSpan={4}>Total</td><td className="px-4 py-2 text-right tabular-nums">{formatMoney(invoice.total, invoice.currency)}</td></tr>
                <tr><td className="px-4 py-2 text-gray-500" colSpan={4}>Paid</td><td className="px-4 py-2 text-right tabular-nums">{formatMoney(invoice.paid, invoice.currency)}</td></tr>
                <tr className="font-semibold text-secondary"><td className="px-4 py-2" colSpan={4}>Balance</td><td className="px-4 py-2 text-right tabular-nums">{formatMoney(invoice.status === 'cancelled' ? 0 : balance, invoice.currency)}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="space-y-4 sm:space-y-5">
          <Panel delay={0.1}>
            <SectionHeader title="Details" />
            <PanelBody>
              <KeyValueList columns={1} items={[
                { label: 'Party', value: <PartyName db={db} id={invoice.partyId} /> },
                { label: 'Created', value: formatDateTime(invoice.createdAt) },
                { label: 'Issued', value: invoice.issuedAt ? formatDateTime(invoice.issuedAt) : '' },
                { label: 'Due', value: invoice.dueAt ? formatDate(invoice.dueAt) : '' },
                { label: 'Currency', value: invoice.currency },
                { label: 'Version', value: String(invoice.version) },
              ]} />
              <div className="mt-3"><ActionError message={error} /></div>
            </PanelBody>
          </Panel>
          <Panel delay={0.14}>
            <SectionHeader title="Payments" description={`${invoice.payments.length} receipt${invoice.payments.length === 1 ? '' : 's'}`} />
            {invoice.payments.length === 0 ? <p className="px-4 py-5 text-center !text-[13px] !text-gray-400">No payments yet.</p> : (
              <ul className="divide-y divide-gray-100">{invoice.payments.map((payment: Payment) => <li key={payment.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="font-mono text-[13px] font-semibold text-secondary">{payment.receiptNumber}</span><span className="text-[13px] font-semibold text-[#1F8F6E]">{formatMoney(payment.amount, invoice.currency)}</span></div><p className="!text-[12px] !text-gray-400">{payment.method.replace('_', ' ')} · {payment.reference} · {formatDateTime(payment.at)} · <EmployeeName db={db} id={payment.by} /></p></li>)}</ul>
            )}
          </Panel>
          <Panel delay={0.18}>
            <SectionHeader title="History" />
            <PanelBody><Timeline items={[...invoice.history].reverse().map((entry, index) => ({ id: String(index), title: <>{entry.from ? `${INVOICE_STATUS_LABELS[entry.from]} to ` : ''}{INVOICE_STATUS_LABELS[entry.to]}{entry.note ? ` — ${entry.note}` : ''}</>, meta: <><EmployeeName db={db} id={entry.by} /> · {formatDateTime(entry.at)}</> }))} /></PanelBody>
          </Panel>
        </div>
      </div>
      {paying && <PaymentDialog invoice={invoice} onClose={() => setPaying(false)} onDone={message => { setPaying(false); toast.success(message); }} />}
      {issuing && <IssueDialog invoice={invoice} onClose={() => setIssuing(false)} onDone={() => { setIssuing(false); toast.success(`${invoice.reference} issued`); }} />}
      <ConfirmDialog open={cancelling} danger busy={busy} error={error} title="Cancel invoice?" description="The charges return to the uninvoiced pool and can be invoiced again." confirmLabel="Cancel invoice" onConfirm={() => void run(() => ops.cancelInvoice(actor, { invoiceId: invoice.id, reason: 'Cancelled by finance', expectedVersion: invoice.version }), () => { setCancelling(false); toast.success('Invoice cancelled'); })} onClose={() => setCancelling(false)} />
    </motion.div>
  );
}

function PaymentDialog({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: (message: string) => void }) {
  const { actor } = useOps();
  const { run, busy, error } = useAction();
  const balance = Math.round((invoice.total - invoice.paid) * 100) / 100;
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<Payment['method']>('online_card');
  const [reference, setReference] = useState('');
  return (
    <FormDialog open title={`Payment on ${invoice.reference}`} description={`${formatMoney(balance, invoice.currency)} outstanding. Full payment settles any import containers on the invoice for release.`} submitLabel="Record payment" busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(() => ops.recordPayment(actor!, { invoiceId: invoice.id, amount: Number(amount), method, reference, expectedVersion: invoice.version }), result => onDone(result?.status === 'paid' ? 'Paid in full' : 'Partial payment recorded'))}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Amount" id="pay-amount"><input id="pay-amount" type="number" min={0.01} step="0.01" max={balance} className={INPUT} value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="Method" id="pay-method"><select id="pay-method" className={SELECT} value={method} onChange={e => setMethod(e.target.value as Payment['method'])}><option value="online_card">Online card (gateway)</option><option value="bank_transfer">Bank transfer</option><option value="credit_note">Credit note</option></select></Field>
      </div>
      <Field label="Payment reference" id="pay-ref" hint="Gateway authorisation, bank reference or credit note number"><input id="pay-ref" autoFocus className={`${INPUT} font-mono`} value={reference} onChange={e => setReference(e.target.value)} /></Field>
    </FormDialog>
  );
}

function IssueDialog({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const { actor, db } = useOps();
  const { run, busy, error } = useAction();
  const [dueDays, setDueDays] = useState(db?.parties.find(p => p.id === invoice.partyId)?.creditTerms ?? 30);
  return (
    <FormDialog open title={`Issue ${invoice.reference}`} description="Issuing posts the invoice to SAP S/4HANA through the outbox and starts the credit period." submitLabel="Issue invoice" busy={busy} error={error} onClose={onClose} onSubmit={() => void run(() => ops.issueInvoice(actor!, { invoiceId: invoice.id, dueDays, expectedVersion: invoice.version }), onDone)}>
      <Field label="Credit terms (days)" id="issue-days"><input id="issue-days" type="number" min={0} className={INPUT} value={dueDays} onChange={e => setDueDays(Number(e.target.value))} /></Field>
    </FormDialog>
  );
}
