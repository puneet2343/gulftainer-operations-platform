import type { ReactNode } from 'react';

/** Two-column facts grid: 12px uppercase label over a 14px value. */
export function KeyValueList({ items, columns = 2, className = '' }: {
  items: { label: string; value: ReactNode; mono?: boolean; span?: boolean }[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const grid = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3.5 ${grid} ${className}`}>
      {items.map(item => (
        <div key={item.label} className={`min-w-0 ${item.span ? 'sm:col-span-full' : ''}`}>
          <dt className="text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-400">{item.label}</dt>
          <dd className={`mt-0.5 min-w-0 break-words text-[14px] text-secondary ${item.mono ? 'font-mono text-[13px]' : ''}`}>{item.value === '' || item.value === null || item.value === undefined ? <span className="text-gray-400">—</span> : item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Thin progress bar in indigo; `tone` switches to warning or danger. */
export function Progress({ value, max, tone = 'primary', label }: { value: number; max: number; tone?: 'primary' | 'warning' | 'danger' | 'success'; label?: string }) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const colour = { primary: 'bg-primary', warning: 'bg-[#B7791F]', danger: 'bg-[#C0352B]', success: 'bg-[#1F8F6E]' }[tone];
  return (
    <div className="min-w-0">
      {label && <div className="mb-1 flex items-center justify-between text-[12px] text-gray-500"><span>{label}</span><span className="tabular-nums">{percent}%</span></div>}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`h-full rounded-full transition-[width] duration-500 ${colour}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Checklist row used for release conditions and pre-arrival documents. */
export function CheckItem({ done, label, detail }: { done: boolean; label: string; detail?: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? 'bg-[rgba(52,189,152,0.14)] text-[#1F8F6E]' : 'bg-gray-100 text-gray-400'}`} aria-hidden="true">
        {done ? (
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" /></svg>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </span>
      <div className="min-w-0">
        <p className={`!text-[13px] ${done ? '!text-secondary' : '!font-medium !text-secondary'}`}>{label}</p>
        {detail && <p className="!text-[12px] !text-gray-500">{detail}</p>}
      </div>
    </li>
  );
}
