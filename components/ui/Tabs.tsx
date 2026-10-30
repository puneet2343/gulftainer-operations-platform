'use client';

/** Horizontal tab strip: 14px medium labels with the indigo underline on the active tab. Scrolls on phones. */
export default function Tabs<T extends string>({ tabs, value, onChange, counts }: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-gray-100 px-2 [scrollbar-width:none] sm:px-3">
      {tabs.map(tab => {
        const active = tab.id === value;
        const count = counts?.[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative flex h-11 shrink-0 cursor-pointer items-center gap-1.5 px-3 text-[13px] font-medium transition-colors sm:text-[14px] ${active ? 'text-primary' : 'text-gray-500 hover:text-secondary'}`}
          >
            {tab.label}
            {typeof count === 'number' && <span className={`rounded-full px-1.5 text-[11px] font-semibold ${active ? 'bg-primary/[0.08] text-primary' : 'bg-gray-100 text-gray-500'}`}>{count}</span>}
            <span className={`absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-primary transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
