'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { EASE } from '@/lib/motion';

/**
 * Dashboard stat: uppercase 12px label, 27–34px bold number, 12px description,
 * and a tinted indigo icon tile on the right. Lifts 3px on hover.
 */
export function DashboardStat({ index, label, value, description, loading = false, icon, highlight = false }: {
  index: number;
  label: string;
  value: number | string;
  description: string;
  loading?: boolean;
  icon: ReactNode;
  highlight?: boolean;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 + index * 0.045, duration: 0.45, ease: EASE }}
      whileHover={{ y: -3 }}
      className="group min-w-0 overflow-hidden rounded-[15px] border border-gray-200 bg-white p-3.5 shadow-[0_5px_20px_rgba(15,23,41,0.035)] transition-shadow hover:shadow-[0_10px_28px_rgba(15,23,41,0.07)] sm:p-4 lg:p-5"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold uppercase tracking-[0.06em] text-gray-400">{label}</p>

          {loading ? (
            <StatSkeleton />
          ) : (
            <>
              <motion.p
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 + index * 0.05 }}
                className={`mt-1.5 font-heading text-[27px] font-bold tracking-[-0.045em] sm:text-[31px] lg:text-[34px] ${highlight ? 'text-primary' : 'text-secondary'}`}
              >
                {typeof value === 'number' ? value.toLocaleString() : value}
              </motion.p>
              <p className="mt-1 truncate text-[12px] text-gray-400">{description}</p>
            </>
          )}
        </div>

        <motion.div
          whileHover={{ scale: 1.08, rotate: 2 }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/10 bg-primary/[0.065] text-primary transition-colors group-hover:bg-primary/[0.1] sm:h-10 sm:w-10"
        >
          {icon}
        </motion.div>
      </div>
    </motion.article>
  );
}

/** Compact stat for list pages: icon tile on the left, label above a 22px number and inline description. */
export function StatCard({ icon, label, value, description, loading = false }: {
  icon: ReactNode;
  label: string;
  value: number | string;
  description?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/[0.07] text-primary">{icon}</span>
        <div className="min-w-0">
          <p className="!text-[13px] !font-medium !text-gray-500">{label}</p>
          {loading ? (
            <div className="mt-1.5 h-6 w-20 animate-pulse rounded bg-gray-100" />
          ) : (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="font-heading text-[22px] font-bold tracking-[-0.03em] text-secondary">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </span>
              {description && <span className="text-[13px] text-gray-400">{description}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="mt-2 space-y-2">
      <div className="h-8 w-20 animate-pulse rounded-md bg-gray-100 sm:h-9 sm:w-24" />
      <div className="h-3 w-28 animate-pulse rounded bg-gray-100" />
    </div>
  );
}
