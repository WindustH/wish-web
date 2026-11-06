<script setup lang="ts">
import { useDocumentVisible } from '../../ui/composables/useDocumentVisible.ts';
import { computed, nextTick, ref, watch } from 'vue';
import IslandSidebar from '../../ui/components/IslandSidebar.vue';
import Icon from '../../ui/components/Icon.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { sessionTasks, taskOutput, terminateTask, type BackgroundTask } from '../../core/api/endpoints.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { fmtDateTime } from '../../core/util/fmt.ts';
import { tr } from '../../core/i18n/tr.ts';

const props = defineProps<{ session: string; open: boolean; mobile: boolean }>();
const emit = defineEmits<{ close: []; count: [count: number] }>();
const parentActive = usePageActivity();
const visible = useDocumentVisible();
const active = computed(() => props.open && parentActive.value && visible.value);
const saved = useWorkspaceState('tasks', () => props.session, { selected: '' });
const tasks = ref<BackgroundTask[]>([]);
const current = computed(() => tasks.value.find((task) => task.task_id === saved.value.selected));
const loaded = ref(false);
const loading = ref(false),
  error = ref(''),
  outputError = ref(''),
  output = ref(''),
  truncated = ref(false);
const revision = ref(0),
  outputBox = ref<HTMLElement>();
const terminating = ref(false);
const actionError = ref('');
watch([() => props.session, () => saved.value.selected], () => (actionError.value = ''));
async function terminate(mode: 'graceful' | 'force') {
  const task = current.value;
  if (!task || task.process.status !== 'running' || terminating.value) return;
  const session = props.session;
  terminating.value = true;
  actionError.value = '';
  try {
    const result = await terminateTask(session, task.task_id, mode);
    if (props.session !== session) return;
    const listed = tasks.value.find((item) => item.task_id === task.task_id);
    if (listed) listed.process = result.process;
    revision.value++;
  } catch (cause) {
    if (props.session === session && saved.value.selected === task.task_id)
      actionError.value = describeError(cause).message;
  } finally {
    terminating.value = false;
  }
}
const running = computed(() => tasks.value.filter((task) => task.process.status === 'running').length);
const label = (task: BackgroundTask) =>
  ({
    running: tr('运行中', 'Running'),
    exited: task.process.exit_code === 0 ? tr('已完成', 'Completed') : tr('执行失败', 'Failed'),
    killed: tr('已终止', 'Terminated'),
    interrupted: tr('已中断', 'Interrupted'),
    unknown: tr('状态未知', 'Unknown'),
  })[task.process.status] ?? task.process.status;
function back() {
  if (saved.value.selected) saved.value.selected = '';
  else emit('close');
}
useBackLayer(
  () => props.open && props.mobile,
  back,
  () => 45,
);
watch(
  () => props.session,
  () => {
    tasks.value = [];
    output.value = '';
    error.value = '';
    loaded.value = false;
  },
);
watch(
  [active, () => props.session, revision],
  (_, __, cleanup) => {
    if (!active.value) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    cleanup(() => {
      controller.abort();
      clearTimeout(timer);
    });
    const session = props.session;
    async function refresh() {
      loading.value = true;
      try {
        const result = await sessionTasks(session, controller.signal);
        if (controller.signal.aborted) return;
        tasks.value = result.tasks.filter((task) => task.background);
        emit('count', tasks.value.filter((task) => task.process.status === 'running').length);
        error.value = '';
        if (saved.value.selected && !tasks.value.some((task) => task.task_id === saved.value.selected))
          saved.value.selected = '';
      } catch (cause) {
        if (!controller.signal.aborted) error.value = describeError(cause).message;
      } finally {
        if (!controller.signal.aborted) {
          loading.value = false;
          loaded.value = true;
          timer = setTimeout(refresh, 2500);
        }
      }
    }
    void refresh();
  },
  { immediate: true },
);
watch(
  [active, () => props.session, () => saved.value.selected, revision],
  (_, __, cleanup) => {
    output.value = '';
    outputError.value = '';
    truncated.value = false;
    if (!active.value || !saved.value.selected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    cleanup(() => {
      controller.abort();
      clearTimeout(timer);
    });
    const session = props.session,
      taskId = saved.value.selected;
    let first = true;
    async function refresh() {
      try {
        // Read only the tail: large logs never accumulate in the browser.
        const info = await taskOutput(session, taskId, 0, 0, controller.signal);
        const start = Math.max(0, info.output_bytes - 64 * 1024);
        const result = await taskOutput(session, taskId, start, 64 * 1024, controller.signal);
        if (controller.signal.aborted) return;
        const box = outputBox.value;
        const follow = first || !box || box.scrollHeight - box.scrollTop - box.clientHeight < 32;
        output.value = result.text;
        truncated.value = start > 0;
        outputError.value = '';
        await nextTick();
        if (controller.signal.aborted) return;
        if (follow && outputBox.value) outputBox.value.scrollTop = outputBox.value.scrollHeight;
        first = false;
        if (result.process.status !== 'running') return;
      } catch (cause) {
        if (!controller.signal.aborted) outputError.value = describeError(cause).message;
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 2000);
    }
    void refresh();
  },
  { immediate: true },
);
</script>

<template>
  <IslandSidebar
    :open="open"
    :overlay="mobile"
    :title="tr('后台任务', 'Background tasks')"
    :width="prefs.rightSidebarWidth.value"
    @update:width="prefs.setRightSidebarWidth"
    @close="emit('close')"
    @back="back"
  >
    <template #leading
      ><button
        v-if="saved.selected || mobile"
        class="btn ghost icon-only"
        :aria-label="saved.selected ? tr('返回', 'Back') : tr('关闭侧栏', 'Close sidebar')"
        @click="back"
      >
        <Icon :name="saved.selected ? 'arrow-left' : 'chevron-right'" /></button
    ></template>
    <template #actions
      ><button class="btn ghost icon-only" :disabled="loading" :aria-label="tr('刷新', 'Refresh')" @click="revision++">
        <Icon name="refresh-cw" /></button
    ></template>
    <div class="task-sidebar">
      <p v-if="error" class="task-message" role="alert">{{ error }}</p>
      <template v-if="current">
        <div class="task-details">
          <span
            >{{ label(current)
            }}<template v-if="current.process.exit_code !== null">
              · {{ tr('退出码', 'Exit code') }} {{ current.process.exit_code }}</template
            ></span
          >
          <div v-if="current.process.status === 'running'" class="task-controls" :aria-busy="terminating">
            <button class="btn sm" :disabled="terminating" @click="terminate('graceful')">
              {{ terminating ? tr('正在结束…', 'Stopping…') : tr('终止', 'Terminate') }}
            </button>
            <button class="btn sm danger" :disabled="terminating" @click="terminate('force')">
              {{ tr('强制结束', 'Force kill') }}
            </button>
          </div>
          <p v-if="actionError" role="alert">{{ actionError }}</p>
          <code>{{ current.command }}</code>
          <small>{{ fmtDateTime(current.started_at) }}</small>
          <p v-if="current.process.error" role="alert">{{ current.process.error }}</p>
        </div>
        <p v-if="outputError" class="task-message" role="alert">{{ outputError }}</p>
        <p v-if="truncated" class="task-message">
          {{ tr('仅显示最近 64 KiB 输出', 'Showing the latest 64 KiB of output') }}
        </p>
        <pre ref="outputBox" class="task-output" tabindex="0" :aria-label="tr('任务输出', 'Task output')">{{
          output || tr('暂无输出', 'No output yet')
        }}</pre>
      </template>
      <template v-else>
        <p class="task-message" role="status">
          {{ tr('运行中', 'Running') }} {{ running }} · {{ tr('全部', 'Total') }} {{ tasks.length }}
        </p>
        <p v-if="!tasks.length && !error" class="task-message">
          {{
            !loaded && loading
              ? tr('正在读取…', 'Loading…')
              : tr('此会话暂无后台任务', 'No background tasks in this session')
          }}
        </p>
        <div class="task-list">
          <button v-for="task in tasks" :key="task.task_id" class="task-card" @click="saved.selected = task.task_id">
            <span class="task-state" :class="{ running: task.process.status === 'running' }">{{ label(task) }}</span>
            <code>{{ task.command }}</code
            ><small>{{ fmtDateTime(task.started_at) }}</small>
          </button>
        </div>
      </template>
    </div>
  </IslandSidebar>
</template>
<style scoped>
.task-sidebar {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.task-message {
  margin: 0;
  padding: 10px 14px;
  color: var(--fg-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.task-list {
  overflow: auto;
  padding: 0 10px 10px;
  display: grid;
  gap: 8px;
}
.task-card {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--fg);
  text-align: left;
  cursor: pointer;
}
.task-card code {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.task-card small,
.task-details small {
  color: var(--fg-muted);
  font-size: 11px;
}
.task-state {
  font-size: 12px;
  color: var(--fg-muted);
}
.task-state.running {
  color: var(--accent);
}
.task-details {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}
.task-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.task-details code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 100px;
  overflow: auto;
}
.task-output {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 12px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 12px/1.6 var(--mono);
  user-select: text;
}
</style>
