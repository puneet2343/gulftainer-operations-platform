import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

/** Desktop table wrapper with the admin heading row. Pair with a `md:hidden` card list for phones. */
export function TableWrap({ children, minWidth = 760, className = '' }: { children: ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={`hidden overflow-x-auto md:block ${className}`}>
      <table className="w-full text-left" style={{ minWidth }}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-gray-100 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-400">{children}</tr>
    </thead>
  );
}

export function Th({ children, align = 'left', className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''} ${className}`} {...rest}>{children}</th>;
}

export function Tr({ children, selected = false, onClick, className = '' }: { children: ReactNode; selected?: boolean; onClick?: () => void; className?: string }) {
  return (
    <tr onClick={onClick} className={`border-b border-gray-100 text-[13px] transition-colors last:border-0 hover:bg-gray-50 ${selected ? 'bg-primary/[0.03]' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}>{children}</tr>
  );
}

export function Td({ children, align = 'left', className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return <td className={`px-4 py-3 align-top text-gray-600 ${align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : ''} ${className}`} {...rest}>{children}</td>;
}

/** Primary cell: 13px semibold indigo reference with an optional 12px grey line under it. */
export function RefCell({ primary, secondary, mono = false }: { primary: ReactNode; secondary?: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`!text-[13px] !font-semibold !text-primary ${mono ? 'font-mono' : ''}`}>{primary}</p>
      {secondary && <p className="mt-0.5 truncate !text-[12px] !text-gray-400">{secondary}</p>}
    </div>
  );
}

/** Phone card list container for list pages. */
export function CardList({ children }: { children: ReactNode }) {
  return <ul className="space-y-2.5 p-3 md:hidden">{children}</ul>;
}

export function Card({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <li onClick={onClick} className={`rounded-xl border border-gray-200 bg-white p-3.5 shadow-[0_3px_12px_rgba(15,23,41,0.025)] ${onClick ? 'cursor-pointer active:bg-gray-50' : ''}`}>{children}</li>
  );
}

/** Inline text input, select and textarea using the global .form-* styles with a 44px height on phones. */
export const INPUT = 'form-input !h-11 !rounded-lg !px-3 !text-[14px] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400';
export const SELECT = 'form-select !h-11 !rounded-lg !px-3 !text-[14px] disabled:cursor-not-allowed disabled:bg-gray-50';
export const TEXTAREA = 'form-textarea !rounded-lg !px-3 !py-2.5 !text-[14px] min-h-[88px]';
