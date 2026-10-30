'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EASE } from '@/lib/motion';

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
type ToastApi = { success: (message: string) => void; error: (message: string) => void; info: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Short status messages that slide up from the bottom. `role="status"` so screen readers announce them. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone']) => {
    const id = Date.now() + Math.random();
    setToasts(current => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), tone === 'error' ? 6000 : 3600);
  }, []);
  const api = useMemo<ToastApi>(() => ({
    success: message => push(message, 'success'),
    error: message => push(message, 'error'),
    info: message => push(message, 'info'),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[300] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.3, ease: EASE }}
              className={`pointer-events-auto flex max-w-[480px] items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium shadow-[0_10px_28px_rgba(15,23,41,0.14)] ${
                toast.tone === 'error' ? 'border-red-200 bg-white text-red-700' : toast.tone === 'success' ? 'border-gray-200 bg-white text-secondary' : 'border-primary/20 bg-white text-primary'
              }`}
            >
              <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${toast.tone === 'error' ? 'bg-[#C0352B]' : toast.tone === 'success' ? 'bg-[#1F8F6E]' : 'bg-primary'}`} aria-hidden="true" />
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) return { success: () => {}, error: () => {}, info: () => {} };
  return api;
}
