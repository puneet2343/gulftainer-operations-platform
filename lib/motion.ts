/** The one easing curve used everywhere (also `--ease-ssi` in CSS). */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Drawer and modal springs. */
export const SPRING_DRAWER = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 } as const;
export const SPRING_MODAL = { type: 'spring', stiffness: 380, damping: 30 } as const;

/** Page sections rise 8–14px as they load; items stagger by 35–50ms. */
export const rise = (delay = 0, y = 8, duration = 0.4) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration, ease: EASE },
});
