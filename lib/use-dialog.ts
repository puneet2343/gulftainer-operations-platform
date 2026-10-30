'use client';

import { useEffect, useRef } from 'react';

const dialogs: HTMLElement[] = [];
const focusable = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Shared keyboard behavior for the existing styled dialogs, including nested mobile navigation. */
export function useDialog(open: boolean, onClose: () => void, label: string) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogs.push(dialog);
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusable))
      .filter(element => !element.matches(':disabled, [aria-hidden="true"], [tabindex="-1"]') && element.getClientRects().length);
    const focusFirst = () => (dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]') || controls()[0] || dialog).focus();
    const frame = requestAnimationFrame(focusFirst);
    function keydown(event: KeyboardEvent) {
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog!.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog!.contains(document.activeElement))) {
        event.preventDefault(); last!.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog!.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    function focusin(event: FocusEvent) {
      if (dialogs.at(-1) === dialog && !dialog!.contains(event.target as Node)) focusFirst();
    }
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      cancelAnimationFrame(frame);
      dialogs.splice(dialogs.indexOf(dialog), 1);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return { ref, role: 'dialog' as const, 'aria-modal': true as const, 'aria-label': label, tabIndex: -1 };
}
