'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { FilterIcon, SearchIcon } from './Icons';

/** Search field with a magnifier on the left and a filter toggle on the right. */
export function SearchBar({ value, onChange, placeholder = 'Search...', mobile = false, showFilters = false, onToggleFilters, hasActiveFilters = false, label = 'Search' }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mobile?: boolean;
  showFilters?: boolean;
  onToggleFilters?: () => void;
  hasActiveFilters?: boolean;
  label?: string;
}) {
  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></span>
      <input
        aria-label={label}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-gray-200 bg-white pl-10 text-secondary outline-none transition-all duration-150 placeholder:text-gray-400 hover:border-gray-300 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 ${onToggleFilters ? 'pr-12' : 'pr-3'} ${mobile ? 'h-11 text-[12px]' : 'h-10 text-[13px]'}`}
      />
      {onToggleFilters && (
        <button
          type="button"
          aria-label="Filter"
          aria-expanded={showFilters}
          onClick={onToggleFilters}
          className={`absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md transition-all ${
            showFilters || hasActiveFilters ? 'bg-primary/[0.08] text-primary' : 'text-gray-400 hover:bg-gray-100 hover:text-secondary'
          }`}
        >
          <FilterIcon />
          {hasActiveFilters && <span className="absolute right-[4px] top-[4px] h-[5px] w-[5px] rounded-full bg-primary" />}
        </button>
      )}
    </div>
  );
}

/** Toggle chip: indigo tint when selected, white with a hairline when not. */
export function FilterChoice({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-[34px] rounded-lg border px-3 text-[12px] font-semibold transition-all ${
        selected ? 'border-primary/25 bg-primary/[0.07] text-primary' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-secondary'
      }`}
    >
      {label}
    </button>
  );
}

/** Pill showing one active filter with a remove cross. */
export function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-secondary"
    >
      <span className="max-w-[210px] truncate">{label}</span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-secondary"
      >
        ×
      </button>
    </motion.span>
  );
}

/** Small uppercase label above a group of filter chips. */
export function FilterLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-gray-400">{children}</p>;
}

/** Labelled native select using the global .form-select style. */
export function FilterSelect({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="form-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="form-select">
        {children}
      </select>
    </label>
  );
}
