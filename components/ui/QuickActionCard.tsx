'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { EASE } from '@/lib/motion';
import { ArrowIcon } from './Icons';

/**
 * One tile in the dashboard's quick-actions strip: tinted icon square, 13–14px title,
 * 12px grey description and an arrow that slides right on hover.
 * Lay several out in a `grid divide-x divide-y divide-gray-100` inside a rounded white panel.
 */
export default function QuickActionCard({ href, title, description, icon, index }: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 + index * 0.05, duration: 0.4, ease: EASE }}
      className="min-w-0"
    >
      <Link
        href={href}
        className="group flex min-h-[92px] min-w-0 items-center gap-3 px-3.5 py-3.5 transition-all duration-200 hover:bg-primary/[0.025] sm:min-h-[105px] sm:px-4 sm:py-4"
      >
        <motion.span
          whileHover={{ scale: 1.06, rotate: -2 }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/10 bg-primary/[0.07] text-primary transition-colors group-hover:border-primary/20 group-hover:bg-primary/[0.1] sm:h-11 sm:w-11"
        >
          {icon}
        </motion.span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h3 className="truncate text-[13px] font-semibold text-secondary sm:text-[14px]">{title}</h3>
            <span className="shrink-0 text-gray-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary">
              <ArrowIcon />
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-4 text-gray-400">{description}</p>
        </div>
      </Link>
    </motion.div>
  );
}
