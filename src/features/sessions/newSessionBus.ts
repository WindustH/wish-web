// Tiny event bus so the global Ctrl+Shift+O shortcut can open the modal
// without importing the component (and its provider catalog) eagerly.
import { shallowRef } from 'vue';

export const newSessionOpen = shallowRef(false);
export function openNewSession() { newSessionOpen.value = true; }
