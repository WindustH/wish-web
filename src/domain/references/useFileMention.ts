import { inject, type InjectionKey } from 'vue';
import type { FileMention } from '../../core/blobMentions.ts';

export const fileMentionKey: InjectionKey<(file: FileMention) => Promise<void>> = Symbol('open file mention');
export const useFileMention = () => inject(fileMentionKey, undefined);
