import { inject, type InjectionKey, type Ref } from 'vue';

export const sidebarResizingKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol('sidebar resizing');
export const useSidebarResize = () => inject(sidebarResizingKey, undefined);

export const drawerWorkspaceWidth = 800;
