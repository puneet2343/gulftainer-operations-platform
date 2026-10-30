import type { ReactNode } from 'react';

/** Vertical history: indigo dot, hairline, title, 12px meta line. Newest first by default. */
export default function Timeline({ items, emptyText = 'No history yet.' }: {
  items: { id: string; title: ReactNode; meta: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }[];
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="px-4 py-6 text-center !text-[13px] !text-gray-400">{emptyText}</p>;
  return (
    <ol className="relative ml-2 border-l border-gray-200 py-1">
      {items.map(item => {
        const dot = { primary: 'bg-primary', success: 'bg-[#1F8F6E]', warning: 'bg-[#B7791F]', danger: 'bg-[#C0352B]', neutral: 'bg-gray-300' }[item.tone ?? 'primary'];
        return (
          <li key={item.id} className="relative pb-4 pl-5 last:pb-1">
            <span className={`absolute -left-[5px] top-[6px] h-[9px] w-[9px] rounded-full ring-2 ring-white ${dot}`} aria-hidden="true" />
            <p className="!text-[13px] !leading-5 !text-secondary">{item.title}</p>
            <p className="mt-0.5 !text-[12px] !text-gray-400">{item.meta}</p>
          </li>
        );
      })}
    </ol>
  );
}
