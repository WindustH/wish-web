import type { ToastTone } from '../../ui/toast.ts';
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import { retryOperationName } from '../../core/upstreamRetry.ts';

export type SessionNotice =
  | { kind: 'failed' | 'question'; detail: string }
  | { kind: 'idle' }
  | { kind: 'retry'; operation: string; attempt: number; max: number; detail: string }
  | { kind: 'recovery'; attempt: number };

export function sessionNotice(
  name: string,
  event: SessionNotice,
): { text: string; detail: string; icon: string; tone: ToastTone } {
  switch (event.kind) {
    case 'retry': {
      const operation = retryOperationName(event.operation);
      const count = event.attempt + '/' + event.max;
      return {
        tone: 'warning',
        icon: 'refresh-cw',
        text: tr(`「${name}」${operation}重试（${count}）`, `${name} · ${operation} retry (${count})`),
        detail: event.detail,
      };
    }
    case 'recovery':
      return {
        tone: 'warning',
        icon: 'refresh-cw',
        text: tr(`「${name}」正在恢复生成`, `${name} is resuming generation`),
        detail: tr(`第 ${event.attempt} 次尝试`, `Attempt ${event.attempt}`),
      };
    case 'failed':
      return { tone: 'error', icon: 'circle-x', text: i18n.t('notify.runFailed', { name }), detail: event.detail };
    case 'question':
      return {
        tone: 'info',
        icon: 'question',
        text: tr(`「${name}」在等你回答`, `${name} is waiting for your answer`),
        detail: event.detail,
      };
    case 'idle':
      return {
        tone: 'success',
        icon: 'check',
        text: tr(`「${name}」的工作已完成`, `Work completed in “${name}”`),
        detail: '',
      };
  }
}
