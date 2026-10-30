'use client';

import { useState } from 'react';
import { useDialog } from '@/lib/use-dialog';
import { BRAND } from '@/lib/brand';

const DONE_KEY = 'gt-app-feedback-done';
const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

function rememberDone() {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* Storage is optional. */ }
}

function alreadyDone() {
  try { return !!localStorage.getItem(DONE_KEY); } catch { return false; }
}

/** Star rating with an optional comment. One submission per device. Replace `submit` with an API call. */
export function AppFeedbackForm({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function submit() {
    if (!rating || state !== 'idle') return;
    setState('sending');
    setError('');
    try {
      await new Promise(resolve => window.setTimeout(resolve, 600));
      rememberDone();
      setState('sent');
      window.setTimeout(() => onDone?.(), 1800);
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'Unable to send feedback. Please retry.');
    }
  }

  if (state === 'sent') {
    return <p role="status" className="py-2 text-center text-[14px] font-semibold text-primary">Thank you for your feedback!</p>;
  }

  const shown = hover || rating;
  return (
    <div>
      <p className={`font-semibold text-secondary ${compact ? 'text-[14px]' : 'text-[16px]'}`}>How was your experience with {BRAND.product}?</p>
      <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            className="rounded p-0.5 text-[30px] leading-none transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span aria-hidden="true" className={star <= shown ? 'text-amber-400' : 'text-gray-300'}>★</span>
          </button>
        ))}
        <span className="ml-2 text-[12px] font-medium text-gray-500">{LABELS[shown]}</span>
      </div>
      {rating > 0 && (
        <>
          <textarea
            value={message}
            onChange={event => setMessage(event.target.value.slice(0, 500))}
            rows={compact ? 2 : 3}
            placeholder="Anything we could do better? (optional)"
            aria-label="Comments (optional)"
            className="mt-3 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-primary/40"
          />
          {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={state === 'sending'}
            className="mt-3 h-10 rounded-lg bg-primary px-5 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            {state === 'sending' ? 'Sending...' : 'Submit feedback'}
          </button>
        </>
      )}
    </div>
  );
}

/** The same form in a dialog, for the Feedback buttons in the header and menu. */
export function AppFeedbackDialog({ onClose }: { onClose: () => void }) {
  const dialog = useDialog(true, onClose, 'App feedback');
  const [done] = useState(alreadyDone);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div {...dialog} className="relative w-full max-w-sm rounded-2xl bg-white p-6" onClick={event => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close feedback" className="absolute right-3 top-2 text-[22px] leading-none text-gray-400 hover:text-gray-600">×</button>
        {done ? (
          <p className="py-2 pr-6 text-[14px] text-gray-600">You have already shared your feedback. Thank you!</p>
        ) : (
          <AppFeedbackForm onDone={onClose} />
        )}
      </div>
    </div>
  );
}
