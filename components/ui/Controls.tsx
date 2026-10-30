'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** 32px square icon button for table rows; `danger` turns it red. */
export function IconButton({ title, children, onClick, danger = false }: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <motion.button
      type="button"
      title={title}
      aria-label={title}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={`grid h-8 w-8 cursor-pointer place-items-center rounded-md border transition-colors ${
        danger
          ? 'border-red-100 bg-red-50/60 text-red-500 hover:border-red-200 hover:bg-red-50'
          : 'border-gray-200 bg-white text-gray-500 hover:border-primary/30 hover:bg-primary/[0.05] hover:text-primary'
      }`}
    >
      {children}
    </motion.button>
  );
}

/** Status pill. Variants match the .badge--* CSS classes. */
export function StatusBadge({ children, variant = 'info', dot = false }: {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  dot?: boolean;
}) {
  const styles = {
    success: 'bg-[rgba(52,189,152,0.10)] text-[#1F8F6E]',
    warning: 'bg-[rgba(214,158,46,0.12)] text-[#B7791F]',
    danger: 'bg-[#FDF1EF] text-[#C0352B]',
    info: 'bg-primary/[0.08] text-primary',
    neutral: 'bg-gray-100 text-gray-500',
  }[variant];
  const dotColor = { success: 'bg-[#1F8F6E]', warning: 'bg-[#B7791F]', danger: 'bg-[#C0352B]', info: 'bg-primary', neutral: 'bg-gray-400' }[variant];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold ${styles}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Circle with the first two letters of a name, indigo tint. */
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-primary/[0.08] font-bold text-primary ${large ? 'h-11 w-11 text-[14px]' : 'h-8 w-8 text-[11px]'}`} aria-hidden="true">
      {initials}
    </span>
  );
}

/** Bar shown above a table while rows are selected. */
export function BulkBar({ count, confirming, busy, onAction, onCancel, actionLabel = 'Delete selected' }: {
  count: number;
  confirming: boolean;
  busy: boolean;
  onAction: () => void;
  onCancel: () => void;
  actionLabel?: string;
}) {
  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 text-[14px]">
      <span className="font-semibold text-secondary">{count} selected</span>
      <button type="button" disabled={busy} onClick={onAction}
        className="inline-flex h-8 items-center rounded-md bg-red-600 px-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
        {busy ? 'Working...' : confirming ? `Confirm (${count})` : actionLabel}
      </button>
      <button type="button" disabled={busy} onClick={onCancel}
        className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-white px-3 font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
        {confirming ? 'Cancel' : 'Clear'}
      </button>
    </div>
  );
}

/** Labelled form field using the global .form-* styles. */
export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: ReactNode; id?: string }) {
  return (
    <div className="form-group">
      <label htmlFor={id} className="form-label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-[12px] text-gray-400">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-[12px] text-[#C0352B]">{error}</p>}
    </div>
  );
}
