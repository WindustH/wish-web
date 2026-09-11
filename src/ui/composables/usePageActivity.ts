import { inject, ref, type InjectionKey, type Ref } from 'vue';

export const pageActivityKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol('pageActivity');
export const usePageActivity = () => inject(pageActivityKey, () => ref(true), true);
