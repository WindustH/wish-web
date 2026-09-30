import type { InjectionKey } from 'vue';

/** Closes the overlay page that is open - settings, statistics, data - back to the page beneath it. */
export const closeOverlayKey: InjectionKey<() => Promise<unknown>> = Symbol('closeOverlay');
