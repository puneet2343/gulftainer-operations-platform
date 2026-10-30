'use client';

import type { ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

/** Which page numbers to show around the current page (at most `count`). */
export function visiblePageNumbers(page: number, totalPages: number, count = 5) {
  const half = Math.floor(count / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(totalPages, start + count - 1);
  start = Math.max(1, end - count + 1);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

/** Table footer: "Showing 1–10 of 42" on the left, page buttons on the right (stacked on phones). */
export default function Pagination({ page, totalPages, total, pageSize, onChange, mobile = false }: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  mobile?: boolean;
}) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);
  const pages = visiblePageNumbers(page, totalPages);

  return (
    <div className={`flex border-t border-gray-200 px-4 py-3 ${mobile ? 'flex-col gap-3' : 'items-center justify-between'}`}>
      <p className="!text-[14px] !text-gray-500">
        Showing <span className="font-semibold text-secondary">{rangeStart}–{rangeEnd}</span> of <span className="font-semibold text-secondary">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        <PaginationButton label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeftIcon />
        </PaginationButton>

        {pages[0] > 1 && (
          <>
            <PaginationButton onClick={() => onChange(1)}>1</PaginationButton>
            {pages[0] > 2 && <span className="px-1 text-[14px] text-gray-400">…</span>}
          </>
        )}

        {pages.map((pageNumber) => (
          <PaginationButton key={pageNumber} active={page === pageNumber} onClick={() => onChange(pageNumber)}>
            {pageNumber}
          </PaginationButton>
        ))}

        {pages.length > 0 && pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-[14px] text-gray-400">…</span>}
            <PaginationButton active={page === totalPages} onClick={() => onChange(totalPages)}>{totalPages}</PaginationButton>
          </>
        )}

        <PaginationButton label="Next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          <ChevronRightIcon />
        </PaginationButton>
      </div>
    </div>
  );
}

export function PaginationButton({ children, label, onClick, active = false, disabled = false }: {
  children: ReactNode;
  label?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 min-w-8 cursor-pointer place-items-center rounded-md border px-2 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-primary/30 hover:text-primary'
      }`}
    >
      {children}
    </button>
  );
}
