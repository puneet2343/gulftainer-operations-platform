import type { ReactNode } from 'react';
import { EmptyIcon } from './Icons';

/** Centered empty state: grey icon tile, 14px semibold title, one line of help, optional action. */
export default function EmptyState({ title, description, icon, action, className = '' }: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-gray-100 text-gray-400">{icon ?? <EmptyIcon />}</span>
      <h3 className="mt-3 text-[14px] font-semibold text-secondary">{title}</h3>
      <p className="mt-1 max-w-[300px] !text-[14px] !leading-5 !text-gray-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Inline error with a retry link, as used under lists that failed to load. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <p role="alert" className="text-[14px] text-gray-600">
      {message}{' '}
      <button type="button" onClick={onRetry} className="font-medium text-primary underline underline-offset-4">Try again</button>
    </p>
  );
}
