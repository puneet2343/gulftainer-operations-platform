'use client';

import type { FormEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDialog } from '@/lib/use-dialog';
import { SPRING_MODAL } from '@/lib/motion';

/**
 * Modal form: the ConfirmDialog shell widened to 560px with a scrolling body.
 * Bottom sheet on phones, centred from sm up. Submit is wired to the form so
 * Enter works; the footer shows the error returned by the service layer.
 */
export default function FormDialog({ open, title, description, children, submitLabel = 'Save', cancelLabel = 'Cancel', busy = false, error = '', danger = false, wide = false, onSubmit, onClose, footer }: {
  open: boolean;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  danger?: boolean;
  wide?: boolean;
  onSubmit?: () => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const dialog = useDialog(open, () => { if (!busy) onClose(); }, title);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!busy) onSubmit?.();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div {...dialog}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-secondary/25 px-0 backdrop-blur-[4px] sm:items-center sm:px-4"
        >
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, scale: 0.98, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={SPRING_MODAL}
            className={`flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-t-[20px] border border-gray-200 bg-white shadow-[0_22px_70px_rgba(15,23,41,0.18)] sm:max-h-[calc(100dvh-48px)] sm:rounded-[20px] ${wide ? 'sm:max-w-[760px]' : 'sm:max-w-[560px]'}`}
          >
            <div className="shrink-0 border-b border-gray-100 px-5 pb-4 pt-5 sm:px-6">
              <h2 className="font-heading text-[18px] font-bold tracking-[-0.02em] text-secondary">{title}</h2>
              {description && <p className="mt-1 text-[13px] leading-5 text-gray-500">{description}</p>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
            <div className="shrink-0 border-t border-gray-100 px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
              {error && <p role="alert" className="mb-3 rounded-lg bg-[#FDF1EF] px-3 py-2 text-[13px] text-[#C0352B]">{error}</p>}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-[12px] text-gray-400">{footer}</div>
                <div className="flex shrink-0 gap-2.5">
                  <button type="button" disabled={busy} onClick={onClose} className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-secondary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
                    {cancelLabel}
                  </button>
                  {onSubmit && (
                    <button type="submit" disabled={busy} className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary-dark'}`}>
                      {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Working</> : submitLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
