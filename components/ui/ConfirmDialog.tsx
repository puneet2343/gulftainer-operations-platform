'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDialog } from '@/lib/use-dialog';
import { SPRING_MODAL } from '@/lib/motion';

/**
 * The confirm pattern from the logout modal: blurred ink backdrop, a 370px card with a
 * 20px radius that sits at the bottom on phones and centred from sm up, an icon tile,
 * title, one sentence and two equal buttons.
 */
export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, busy = false, error = '', icon, onConfirm, onClose }: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
  icon?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useDialog(open, () => { if (!busy) onClose(); }, title);

  return (
    <AnimatePresence>
      {open && (
        <motion.div {...dialog}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-secondary/25 px-3 pb-3 backdrop-blur-[4px] sm:items-center sm:px-4 sm:pb-0"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={SPRING_MODAL}
            className="w-full max-w-[370px] rounded-[20px] border border-gray-200 bg-white p-5 shadow-[0_22px_70px_rgba(15,23,41,0.18)] sm:p-6"
          >
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${danger ? 'bg-red-50 text-red-500' : 'bg-primary/[0.07] text-primary'}`}>
              {icon ?? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              )}
            </div>

            <h2 className="mt-4 font-heading text-lg font-bold text-secondary">{title}</h2>
            <p className="mt-1.5 text-sm leading-6 text-gray-500">{description}</p>
            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-secondary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${
                  danger ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span className="hidden min-[360px]:inline">Working</span>
                  </>
                ) : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
