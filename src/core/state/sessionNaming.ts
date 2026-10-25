// Naming is initiated only by explicit frontend actions, never by polling or the backend.
import { shallowRef } from 'vue';
import * as api from '../api/endpoints.ts';
import { bus } from '../bus.ts';
import { tr } from '../i18n/tr.ts';
import { errorText } from '../errors.ts';
import { toast } from '../../ui/toast.ts';

export function createSessionNaming(requests: Pick<typeof api, 'sessionGenerateName' | 'sessionRename'> = api, notify = toast) {
  const pending = shallowRef<ReadonlySet<string>>(new Set());
  async function generate(id: string, firstEntry?: number): Promise<void> {
    if (pending.value.has(id)) return;
    pending.value = new Set([...pending.value, id]);
    if (firstEntry == null) notify(tr('正在生成会话名称…', 'Generating session title…'));
    try {
      const result = await requests.sessionGenerateName(id, firstEntry == null
        ? { mode: 'context' } : { mode: 'first_message', entry: firstEntry });
      await requests.sessionRename(id, result.name, result.revision);
      bus.emit('list.changed');
      if (firstEntry == null) notify(tr('会话名称已更新', 'Session title updated'));
    } catch (error) {
      notify(tr('会话命名未完成：', 'Session naming did not finish: ') + errorText(error));
    } finally {
      const next = new Set(pending.value); next.delete(id); pending.value = next;
    }
  }
  return { pending, generate };
}
export const sessionNaming = createSessionNaming();
