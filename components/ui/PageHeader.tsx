'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { EASE } from '@/lib/motion';
import { RefreshIcon } from './Icons';

/**
 * Admin page heading: optional eyebrow (the module name), a 23–28px bold title,
 * a one-line description and an action slot on the right (a RefreshButton, a primary button).
 */
export default function PageHeader({ eyebrow, title, subtitle, action, animate = true }: {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  animate?: boolean;
}) {
  return (
    <motion.section
      initial={animate ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-400">{eyebrow}</p>}
        <h1 className={`font-heading text-[23px] font-bold tracking-[-0.035em] text-secondary sm:text-[26px] lg:text-[28px] ${eyebrow ? 'mt-0.5' : ''}`}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 max-w-[720px] text-[13px] leading-[18px] text-gray-500 sm:text-[14px] sm:leading-5">{subtitle}</p>
        )}
      </div>
      {action}
    </motion.section>
  );
}

/** The white "Refresh Data" button that sits beside page titles. */
export function RefreshButton({ refreshing, onClick, label = 'Refresh Data' }: { refreshing: boolean; onClick: () => void; label?: string }) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      disabled={refreshing}
      onClick={onClick}
      className="flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3.5 text-[12px] font-semibold text-secondary shadow-[0_3px_12px_rgba(15,23,41,0.04)] transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px]"
    >
      <RefreshIcon spinning={refreshing} />
      {refreshing ? 'Refreshing' : label}
    </motion.button>
  );
}

/** Compact solid action button used in page headers and toolbars (10px radius, 12–13px semibold). */
export function ToolbarButton({ children, onClick, variant = 'primary', disabled = false, type = 'button' }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'bg-primary text-white hover:bg-primary-dark shadow-[0_6px_18px_rgba(40,63,143,0.22)]',
    secondary: 'border border-gray-200 bg-white text-secondary hover:border-primary/30 hover:text-primary shadow-[0_3px_12px_rgba(15,23,41,0.04)]',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }[variant];
  return (
    <motion.button
      type={type}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg px-3.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px] ${styles}`}
    >
      {children}
    </motion.button>
  );
}
