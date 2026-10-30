'use client';

/*
 * Small building blocks shared by the operations pages: status badges mapped from
 * domain states, a container number link, a party link, and the standard
 * "action error" line. Keeps the page files focused on their own workflow.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/ui/Controls';
import { formatContainerNumber } from '@/lib/ops/iso6346';
import type {
  Container, ContainerPhysicalStatus, CustomsStatus, InvoiceStatus, OpsDB, TaskStatus, TokenStatus, TransportJobStatus,
  VesselCallStatus, WarehouseOrderStatus, ApprovalStatus, InlandTransferStatus,
} from '@/lib/ops/types';
import {
  CONTAINER_STATUS_LABELS, CUSTOMS_LABELS, INVOICE_STATUS_LABELS, ORDER_STATUS_LABELS, TOKEN_STATUS_LABELS, TRANSPORT_STATUS_LABELS,
  VESSEL_STATUS_LABELS,
} from '@/lib/ops/types';
import { activeHolds } from '@/lib/ops/ops';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function VesselStatusBadge({ status }: { status: VesselCallStatus }) {
  const variant: Record<VesselCallStatus, Variant> = { expected: 'neutral', berthed: 'info', working: 'success', completed: 'warning', departed: 'neutral' };
  return <StatusBadge variant={variant[status]} dot>{VESSEL_STATUS_LABELS[status]}</StatusBadge>;
}

export function ContainerStatusBadge({ container, now }: { container: Container; now?: string }) {
  const holds = activeHolds(container);
  if (container.status === 'in_yard' && holds.length) return <StatusBadge variant="danger" dot>On hold</StatusBadge>;
  const variant: Record<ContainerPhysicalStatus, Variant> = { expected: 'neutral', in_yard: 'info', on_truck: 'warning', on_vessel: 'info', delivered: 'success' };
  void now;
  return <StatusBadge variant={variant[container.status]} dot>{CONTAINER_STATUS_LABELS[container.status]}</StatusBadge>;
}

export function CustomsBadge({ status }: { status: CustomsStatus }) {
  const variant: Record<CustomsStatus, Variant> = { not_required: 'neutral', pending: 'warning', inspection: 'danger', cleared: 'success' };
  return <StatusBadge variant={variant[status]}>{CUSTOMS_LABELS[status]}</StatusBadge>;
}

export function TokenStatusBadge({ status }: { status: TokenStatus }) {
  const variant: Record<TokenStatus, Variant> = { generated: 'info', at_marshalling_yard: 'warning', gated: 'success', completed: 'success', cancelled: 'neutral', expired: 'danger' };
  return <StatusBadge variant={variant[status]} dot>{TOKEN_STATUS_LABELS[status]}</StatusBadge>;
}

export function TransportStatusBadge({ status }: { status: TransportJobStatus }) {
  const variant: Record<TransportJobStatus, Variant> = { planned: 'neutral', assigned: 'info', en_route: 'warning', delivered: 'success', closed: 'neutral', cancelled: 'danger' };
  return <StatusBadge variant={variant[status]} dot>{TRANSPORT_STATUS_LABELS[status]}</StatusBadge>;
}

export function TransferStatusBadge({ status }: { status: InlandTransferStatus }) {
  const variant: Record<InlandTransferStatus, Variant> = { planned: 'neutral', in_transit: 'warning', received: 'success' };
  const label: Record<InlandTransferStatus, string> = { planned: 'Planned', in_transit: 'In transit', received: 'Received' };
  return <StatusBadge variant={variant[status]} dot>{label[status]}</StatusBadge>;
}

export function OrderStatusBadge({ status }: { status: WarehouseOrderStatus }) {
  const variant: Record<WarehouseOrderStatus, Variant> = { expected: 'neutral', received: 'success', allocated: 'info', picked: 'warning', dispatched: 'success', cancelled: 'danger' };
  return <StatusBadge variant={variant[status]} dot>{ORDER_STATUS_LABELS[status]}</StatusBadge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const variant: Record<InvoiceStatus, Variant> = { draft: 'neutral', issued: 'info', partially_paid: 'warning', paid: 'success', overdue: 'danger', cancelled: 'neutral' };
  return <StatusBadge variant={variant[status]} dot>{INVOICE_STATUS_LABELS[status]}</StatusBadge>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const variant: Record<TaskStatus, Variant> = { open: 'neutral', in_progress: 'info', done: 'success', cancelled: 'danger' };
  const label: Record<TaskStatus, string> = { open: 'Open', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' };
  return <StatusBadge variant={variant[status]} dot>{label[status]}</StatusBadge>;
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const variant: Record<ApprovalStatus, Variant> = { pending: 'warning', approved: 'success', rejected: 'danger' };
  return <StatusBadge variant={variant[status]} dot>{status.charAt(0).toUpperCase() + status.slice(1)}</StatusBadge>;
}

/** Container number as a link to its record, in the conventional spaced form. */
export function ContainerLink({ container, className = '' }: { container: Pick<Container, 'id' | 'number'>; className?: string }) {
  return <Link href={`/admin/containers/${container.id}`} className={`font-mono text-[13px] font-semibold text-primary hover:text-primary-dark ${className}`}>{formatContainerNumber(container.number)}</Link>;
}

export function PartyName({ db, id, fallback = '—' }: { db: OpsDB; id: string | null | undefined; fallback?: string }) {
  if (!id) return <span className="text-gray-400">{fallback}</span>;
  const party = db.parties.find(entry => entry.id === id);
  return <span>{party?.name ?? 'Unknown party'}</span>;
}

export function LocationName({ db, id, code = false }: { db: OpsDB; id: string | null | undefined; code?: boolean }) {
  if (!id) return <span className="text-gray-400">—</span>;
  const location = db.locations.find(entry => entry.id === id);
  if (!location) return <span>Unknown location</span>;
  return <span>{code ? location.code : location.name}</span>;
}

export function EmployeeName({ db, id }: { db: OpsDB; id: string | null | undefined }) {
  if (!id) return <span className="text-gray-400">Unassigned</span>;
  return <span>{db.employees.find(entry => entry.id === id)?.name ?? 'Unknown user'}</span>;
}

/** Small flag chips: DG, reefer, OOG. */
export function ContainerFlags({ container }: { container: Pick<Container, 'dg' | 'reefer' | 'oog' | 'full'> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {container.dg && <span className="rounded bg-[#FDF1EF] px-1.5 text-[11px] font-semibold text-[#C0352B]">DG {container.dg.imoClass}</span>}
      {container.reefer && <span className="rounded bg-primary/[0.08] px-1.5 text-[11px] font-semibold text-primary">Reefer {container.reefer.setpointC} °C</span>}
      {container.oog && <span className="rounded bg-[rgba(214,158,46,0.12)] px-1.5 text-[11px] font-semibold text-[#B7791F]">OOG</span>}
      {!container.full && <span className="rounded bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-500">Empty</span>}
    </span>
  );
}

export function ActionError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg bg-[#FDF1EF] px-3 py-2 text-[13px] text-[#C0352B]">{message}</p>;
}

/** Secondary action in panels: white, hairline, 36px. */
export function PanelButton({ children, onClick, disabled = false, danger = false, primary = false, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; primary?: boolean; title?: string }) {
  const style = primary
    ? 'bg-primary text-white hover:bg-primary-dark'
    : danger
      ? 'border border-red-200 bg-white text-red-600 hover:bg-red-50'
      : 'border border-gray-200 bg-white text-secondary hover:border-primary/30 hover:text-primary';
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px] ${style}`}>
      {children}
    </button>
  );
}

/** Panel body padding helper. */
export function PanelBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

/** Three small chips: customs, delivery order, charges. Green when satisfied. */
export function ClearanceChips({ container, now }: { container: Container; now: string }) {
  const doValid = !!container.deliveryOrder && new Date(container.deliveryOrder.validUntil) >= new Date(now);
  const chip = (ok: boolean, label: string, warn = false) => <span key={label} className={`rounded px-1.5 text-[11px] font-semibold ${ok ? 'bg-[rgba(52,189,152,0.12)] text-[#1F8F6E]' : warn ? 'bg-[#FDF1EF] text-[#C0352B]' : 'bg-gray-100 text-gray-500'}`}>{label}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {chip(container.customsStatus === 'cleared', 'Customs', container.customsStatus === 'inspection')}
      {chip(doValid, 'DO')}
      {chip(container.chargesSettled, 'Paid')}
      {activeHolds(container).length > 0 && chip(false, 'Hold', true)}
    </span>
  );
}
