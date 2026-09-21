import { inject, onUnmounted, watch, type InjectionKey } from 'vue';
export interface ReturnChange { dirty?:()=>boolean; save?:()=>Promise<boolean>; discard?:()=>void }
export interface SettingsReturn {
  confirm:(change?:ReturnChange)=>Promise<boolean>;
  save:()=>Promise<boolean>;
  register:(key:symbol, back:(()=>Promise<void>)|null)=>void;
}
export const settingsReturnKey:InjectionKey<SettingsReturn>=Symbol('settingsReturn');
export function useSettingsReturn(active:()=>boolean,back:()=>Promise<void>){
  const context=inject(settingsReturnKey)!;
  const key=Symbol();
  watch(active,value=>context.register(key,value?back:null),{immediate:true});
  onUnmounted(()=>context.register(key,null));
  return context;
}
