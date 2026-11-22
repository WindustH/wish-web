<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.ts';
import { sessions } from '../../core/state/sessionsSlice.ts';
import { bus } from '../../core/bus.ts';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { toast } from '../../ui/toast.ts';
import { finalizeRemovedSession } from './sessionActions.ts';
import type { ArchiveRequest } from './sessionPackages.ts';
const props = defineProps<{ request: ArchiveRequest }>();
const emit = defineEmits<{ close: [] }>();
const router = useRouter(),
  mobile = useIsMobile();
const available = computed(() => props.request.targets.filter((t) => !t.running));
const skipped = computed(() => props.request.targets.length - available.value.length);
const size = computed(() =>
  props.request.targets.every((t) => t.bytes != null)
    ? props.request.targets.reduce((sum, t) => sum + t.bytes!, 0)
    : null,
);
const busy = ref(false),
  finished = ref(false),
  progress = ref(''),
  failures = ref<string[]>([]);
let controller: AbortController | undefined;
onBeforeUnmount(() => controller?.abort());
async function submit() {
  if (busy.value || finished.value) return;
  busy.value = true;
  const own = (controller = new AbortController());
  const archived: string[] = [];
  let bytes = 0;
  try {
    for (const [i, target] of available.value.entries()) {
      if (own.signal.aborted) break;
      progress.value = `${i + 1} / ${available.value.length} · ${target.name}`;
      try {
        const m = await api.sessionArchive(target.id, { signal: own.signal });
        archived.push(target.id);
        bytes += m.archive_bytes;
        finalizeRemovedSession(target.id);
        if (router.currentRoute.value.params.id === target.id)
          await router.replace({ name: mobile.value ? 'sessions' : 'new-chat' });
      } catch (e) {
        if (!own.signal.aborted) failures.value.push(target.name + ' · ' + describeError(e).message);
      }
    }
    if (own.signal.aborted)
      failures.value.push(
        tr(
          '已停止等待。已提交的任务可能仍在服务端运行。',
          'Stopped waiting. Submitted requests may still finish on the server.',
        ),
      );
    if (archived.length) {
      const count = archived.length;
      const size = fmtBytes(bytes);
      const name = props.request.targets[0]!.name;
      toast(
        props.request.targets.length === 1
          ? tr(`已归档 ${name}（${size}）`, `Archived ${name} (${size})`)
          : tr(`已归档 ${count} 个会话（${size}）`, `Archived ${count} session${count === 1 ? '' : 's'} (${size})`),
      );
      props.request.done?.(archived);
    }
    if (archived.length || own.signal.aborted) {
      bus.emit('archives.changed');
      void sessions.refresh();
    }
  } finally {
    busy.value = false;
    finished.value = true;
    progress.value = '';
  }
  if (!failures.value.length) emit('close');
}
</script>
<template>
  <Modal compact :open="true" :title="tr('归档会话', 'Archive sessions')" :dismissable="!busy" @close="emit('close')">
    <div class="package-content">
      <strong
        >{{
          request.targets.length === 1
            ? request.targets[0]!.name
            : tr('已选 ' + request.targets.length + ' 个会话', request.targets.length + ' selected sessions')
        }}
        <small v-if="size != null">· {{ fmtBytes(size) }}</small></strong
      >
      <p>
        {{
          tr(
            '将完整记录、附件与命令输出保存到「存储 → 已归档」，然后移出活跃会话。链接的本地原文件会保留。',
            'Save records, attachments and command output to Storage → Archived, then remove the active session. Linked originals are kept.',
          )
        }}
      </p>
      <small v-if="request.folders">{{
        tr('已跳过 ' + request.folders + ' 个文件夹。', 'Skipped ' + request.folders + ' folders.')
      }}</small>
      <small v-if="skipped">{{
        tr(skipped + ' 个会话正在运行，本次会跳过。', skipped + ' running sessions will be skipped.')
      }}</small>
      <p v-if="busy" role="status"><Icon name="loader-circle" class="spin" /> {{ progress }}</p>
      <p v-for="(error, index) in failures" :key="index" class="load-error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <button class="btn ghost" @click="busy ? controller?.abort() : emit('close')">
        {{ busy ? tr('停止等待', 'Stop waiting') : finished ? tr('关闭', 'Close') : tr('取消', 'Cancel') }}
      </button>
      <button v-if="!finished" class="btn primary" :disabled="busy || !available.length" @click="submit">
        <Icon name="archive" />{{ tr('归档', 'Archive') }}
      </button>
    </template>
  </Modal>
</template>
<style scoped>
.package-content {
  display: grid;
  gap: 12px;
  overflow-wrap: anywhere;
}
.package-content p {
  margin: 0;
}
.package-content small {
  color: var(--fg-subtle);
}
.package-content .icon {
  width: 16px;
  height: 16px;
  vertical-align: middle;
}
</style>
