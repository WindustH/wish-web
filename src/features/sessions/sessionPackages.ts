import { shallowRef } from 'vue';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';
import { toast, dismissToast } from '../../ui/toast.ts';
import { savePackage } from '../../ui/download.ts';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { sessionExport } from '../../core/api/endpoints.ts';
import { absUrl, getConnectionScope } from '../../core/api/client.ts';
type Target = {
  id: string;
  name?: string | null;
  running?: boolean;
  phase?: string;
  kind?: string;
  bytes?: { total: number };
};
function sessionTargets(rows: Target[]) {
  return rows
    .filter((r) => r.kind !== 'folder')
    .map((r) => ({
      id: r.id,
      name: sessionTitle(r),
      running: !!r.running || r.phase === 'running' || r.phase === 'compacting',
      bytes: r.bytes?.total,
    }));
}

export function confirmArchive(rows: Target[], done?: ArchiveRequest['done']) {
  if (archiveRequest.value) return;
  const targets = sessionTargets(rows);
  if (targets.length) archiveRequest.value = { targets, folders: rows.length - targets.length, done };
}

const exporting = new Set<string>();
type ExportTarget = { id: string; name: string };
export interface ExportRequest {
  targets: ExportTarget[];
  scope: string;
}
export const exportRequest = shallowRef<ExportRequest | null>(null);

export async function downloadExport(target: ExportTarget, scope: string, signal?: AbortSignal, onSaving?: () => void) {
  const key = JSON.stringify([scope, target.id]);
  if (scope !== getConnectionScope())
    throw new Error(tr('连接已切换，请重新选择要导出的会话。', 'Connection changed. Select the sessions again.'));
  if (exporting.has(key)) return null;
  exporting.add(key);
  try {
    const ticket = await sessionExport(target.id, { signal });
    if (signal?.aborted || scope !== getConnectionScope()) return null;
    const url = packageUrl(ticket.download_url, '/exports/' + ticket.export_id);
    onSaving?.();
    return await savePackage(url, ticket.filename);
  } finally {
    exporting.delete(key);
  }
}

export async function exportSessions(rows: Target[]) {
  const scope = getConnectionScope();
  const targets = sessionTargets(rows);
  const eligible = targets.filter((t) => !t.running);
  if (eligible.length < targets.length)
    toast(tr('正在运行的会话需等到结束后再导出。', 'Wait for running sessions to finish before exporting them.'));
  if (eligible.length > 1) {
    exportRequest.value ??= { targets: eligible, scope };
    return;
  }
  const [target] = eligible;
  if (!target || exporting.has(JSON.stringify([scope, target.id]))) return;
  const controller = new AbortController();
  let progress = toast(tr('正在导出 ' + target.name, 'Exporting ' + target.name), {
    icon: 'download',
    persistent: true,
    action: { label: tr('停止等待', 'Stop waiting'), run: () => controller.abort() },
  });
  try {
    await downloadExport(target, scope, controller.signal, () => {
      dismissToast(progress);
      progress = toast(tr('正在下载 ' + target.name, 'Downloading ' + target.name), {
        icon: 'download',
        persistent: true,
      });
    });
  } catch (error) {
    if (!controller.signal.aborted) toast(target.name + ' · ' + describeError(error).message, { tone: 'error' });
  } finally {
    dismissToast(progress);
  }
}
export const sessionPackageActions = { archive: confirmArchive, export: exportSessions };
export interface ArchiveRequest {
  targets: { id: string; name: string; running: boolean; bytes?: number }[];
  folders: number;
  done?: (archived: string[]) => void;
}
export const archiveRequest = shallowRef<ArchiveRequest | null>(null);

// Preserve the current gateway or native bridge prefix. Only accept a grant for the requested ZIP.
export function packageUrl(path: string, expected: string) {
  const [resource] = path.split('?');
  if (resource !== '/api' + expected || path.includes('#')) throw new Error('Invalid package download URL');
  return absUrl(path.slice(4));
}
