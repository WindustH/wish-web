import { computed, inject, provide, type InjectionKey, type Ref } from 'vue';

const dialogLayer: InjectionKey<Readonly<Ref<number>>> = Symbol('dialogLayer');

// Portals leave the DOM hierarchy, so carry the containing dialog's layer
// through Vue context. Each child puts both its scrim and content above it.
export function useDialogLayer(minimum: () => number = () => 60) {
  const parent = inject(dialogLayer, undefined);
  const layer = computed(() => Math.max(minimum(), (parent?.value ?? 56) + 4));
  provide(dialogLayer, layer);
  return layer;
}
