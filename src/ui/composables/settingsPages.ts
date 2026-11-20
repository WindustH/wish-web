import { computed, provide, ref, shallowRef, type InjectionKey, type Ref } from 'vue';

interface SettingsPage {
  back: () => Promise<boolean>;
}
interface SettingsPages {
  target: Ref<HTMLElement | undefined>;
  current: Readonly<Ref<SettingsPage | undefined>>;
  enter: (page: SettingsPage) => void;
  leave: (page: SettingsPage) => void;
  closeSettings: () => void;
}
export const settingsPagesKey: InjectionKey<SettingsPages | null> = Symbol('settingsPages');
export function provideSettingsPages(closeSettings: () => void) {
  const target = ref<HTMLElement>();
  const stack = shallowRef<SettingsPage[]>([]);
  const current = computed(() => stack.value.at(-1));
  provide(settingsPagesKey, {
    target,
    current,
    closeSettings,
    enter(page) {
      stack.value = [...stack.value, page];
    },
    leave(page) {
      stack.value = stack.value.filter((item) => item !== page);
    },
  });
  return { target, current };
}
