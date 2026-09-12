import type { InjectionKey, Ref } from 'vue';
import type { ConfigObject } from '../../core/config-editor';
export interface UpstreamModels { providerPath: string; models: Record<string, ConfigObject>; defaults: ConfigObject; sources: Record<string, string> }
export const upstreamModelsKey: InjectionKey<Ref<UpstreamModels | undefined>> = Symbol('upstreamModels');
