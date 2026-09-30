/** Whether the user has asked for less motion, as of now. False where there is no window to ask. */
export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
