'use client';

import Link from 'next/link';
import { memo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from '@phosphor-icons/react';
import { EASE } from '@/lib/motion';
import { CalendarIcon, LocationIcon, ArrowIcon } from '@/components/ui/Icons';

/*
 * Public-site cards, ported from the catalogue:
 *  - FeatureCard: the big category tile (mist background, 22/28px radius, 16:9 visual, name, description, status line)
 *  - ItemCard:    the list card (white, hairline, 12px radius, image band, title, two meta rows, footer action)
 */

export function FeatureCard({ href, title, description, status, active = true, index = 0, visual, external = false }: {
  href: string;
  title: string;
  description: string;
  status: string;
  active?: boolean;
  index?: number;
  /** Fills the 16:9 area. Pass an <Image fill /> or leave empty for the gradient placeholder. */
  visual?: ReactNode;
  external?: boolean;
}) {
  const body = (
    <>
      <span className="relative block aspect-[16/9] overflow-hidden rounded-[16px] bg-gray-100 md:rounded-[20px]">
        {visual ?? <PlaceholderVisual index={index} />}
      </span>
      <span className="block px-1 pb-1 pt-4 md:px-2 md:pt-5">
        <span className="block text-[19px] font-semibold leading-tight tracking-[-0.02em] text-secondary md:text-[24px]">{title}</span>
        <span className="mt-1 block text-[14px] leading-snug text-gray-500 md:mt-2 md:text-[15px]">{description}</span>
        <span className="mt-3 flex items-center gap-1.5 text-[14px] font-medium md:mt-4 md:text-[15px]">
          <span className={`inline-flex items-center gap-1.5 ${active ? 'text-primary' : 'text-gray-400'}`}>
            {status}
            <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </span>
      </span>
    </>
  );
  const className = 'group block h-full rounded-[22px] bg-gray-50 p-2.5 transition-[background-color,box-shadow] duration-300 ease-[var(--ease-ssi)] hover:bg-gray-100 active:scale-[0.995] md:rounded-[28px] md:p-3';
  return (
    <li className="ssi-rise" style={{ animationDelay: `${index * 70}ms` }}>
      {external
        ? <a href={href} target="_blank" rel="noopener" className={className}>{body}</a>
        : <Link href={href} className={className}>{body}</Link>}
    </li>
  );
}

/** Gradient block standing in for a photo until real imagery exists. */
function PlaceholderVisual({ index }: { index: number }) {
  const angles = ['135deg', '160deg', '110deg'];
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 transition-transform duration-500 ease-[var(--ease-ssi)] group-hover:scale-[1.02]"
      style={{ backgroundImage: `linear-gradient(${angles[index % 3]}, #283F8F 0%, #23879A 55%, #34BD98 100%)` }}
    >
      <span className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 0.8px, transparent 0.8px)', backgroundSize: '18px 18px' }} />
    </span>
  );
}

export const ItemCard = memo(function ItemCard({ href, title, location, date, description, footer = 'Available', action = 'View details', index = 0, visual }: {
  href: string;
  title: string;
  location: string;
  date: string;
  description?: string;
  footer?: string;
  action?: string;
  index?: number;
  visual?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: index * 0.035, ease: EASE }}
      className="h-full"
    >
      <Link
        href={href}
        className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_3px_12px_rgba(15,23,41,0.025)] transition-all duration-200 hover:border-gray-300 hover:shadow-[0_8px_24px_rgba(15,23,41,0.055)]"
      >
        {/* IMAGE */}
        <div className="relative aspect-[16/8.5] overflow-hidden bg-gray-100 sm:aspect-[16/8] md:aspect-[16/7.4]">
          {visual ?? <PlaceholderVisual index={index + 1} />}
        </div>

        {/* CONTENT */}
        <div className="flex flex-1 flex-col p-3.5 md:p-4">
          <h3 className="mt-1 line-clamp-2 font-heading text-[15px] font-semibold leading-5 text-secondary md:text-[16px]">{title}</h3>

          <div className="mt-2.5 space-y-1.5">
            <MetaRow icon={<LocationIcon />} value={location} />
            <MetaRow icon={<CalendarIcon />} value={date} />
          </div>

          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-[12px] font-semibold text-secondary">About</span>
              <p className="min-w-0 flex-1 truncate text-[12px] leading-4 text-gray-500 md:text-[13px]">
                {description?.trim() || 'View information, schedule and details.'}
              </p>
            </div>
          </div>

          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-[12px] font-medium text-gray-400">{footer}</span>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary transition-colors group-hover:text-primary-dark">
                {action}
                <ArrowIcon />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

function MetaRow({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-gray-500 md:text-[13px]">
      <span className="shrink-0 text-gray-400">{icon}</span>
      <span className="truncate">{value}</span>
    </p>
  );
}
