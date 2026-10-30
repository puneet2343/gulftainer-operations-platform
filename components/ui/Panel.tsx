'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { EASE } from '@/lib/motion';
import { ArrowIcon } from './Icons';

/**
 * White panel with a 16px radius, hairline border and a soft shadow. Every dashboard
 * section (quick actions, tables, lists) sits in one of these.
 */
export function Panel({ children, className = '', delay = 0.05 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className={`min-w-0 overflow-hidden rounded-[16px] border border-gray-200 bg-white shadow-[0_6px_24px_rgba(15,23,41,0.045)] ${className}`}
    >
      {children}
    </motion.section>
  );
}

/** Panel heading row: 14px semibold title, 12px grey description and an optional "View all" link. */
export function SectionHeader({ title, description, href, linkText, action }: {
  title: string;
  description?: string;
  href?: string;
  linkText?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-gray-100 px-3.5 py-3.5 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold text-secondary">{title}</h2>
        {description && <p className="mt-0.5 truncate text-[12px] text-gray-400">{description}</p>}
      </div>
      {action}
      {href && linkText && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-primary transition-colors hover:text-primary-dark">
          {linkText}
          <span className="transition-transform group-hover:translate-x-0.5"><ArrowIcon /></span>
        </Link>
      )}
    </div>
  );
}

/** Public-site section heading: 22–28px semibold with an optional 14–16px subtitle. */
export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 md:mb-4">
      <h2 className="font-heading text-[22px] font-semibold tracking-[-0.02em] text-secondary md:text-[28px]">{title}</h2>
      {subtitle && <p className="mt-1 text-[14px] text-gray-500 md:text-[16px]">{subtitle}</p>}
    </div>
  );
}
