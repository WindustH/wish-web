import type { InjectionKey, Ref } from 'vue';
import type { ReplyReference, ReplyLink } from '../../core/replyReferences.ts';
export interface ReplyContext {
  session: Ref<string>;
  revision: Ref<number>;
  version?(source: string): number;
  focus?: Ref<ReplyReference | undefined>;
  add(reference: ReplyReference, image?: Blob): Promise<void>;
  locate(reference: ReplyReference): void;
  links(source: string, signal: AbortSignal): Promise<ReplyLink[]>;
  preview(seq: number, signal: AbortSignal): Promise<string>;
  jump(seq: number): void;
}
export const replyContextKey: InjectionKey<ReplyContext> = Symbol('reply context');
