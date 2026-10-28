<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { mediaJobStatus, mediaPlayback } from '../../../core/api/endpoints.ts';
import { absUrl } from '../../../core/api/client.ts';
import type { MediaJob } from '../../../core/mediaGeneration.ts';
import { tr } from '../../../core/i18n/tr.ts';
import { showError } from '../../../ui/errorDialog.ts';
const props = defineProps<{ session: string; output: MediaJob }>();
let generation = 0;
let controller = new AbortController();
onBeforeUnmount(() => {
  generation++;
  controller.abort();
});
const current = ref(props.output),
  busy = ref(false),
  sources = ref<Record<string, string>>({}),
  playbackErrors = ref<Record<string, boolean>>({});
watch(
  () => [props.session, props.output] as const,
  ([, value]) => {
    generation++;
    controller.abort();
    controller = new AbortController();
    busy.value = false;
    current.value = value;
  },
);
const status = computed(
  () =>
    ({
      submitting: tr('提交中', 'Submitting'),
      running: tr('生成中', 'Generating'),
      downloading: tr('等待下载完成', 'Awaiting download'),
      succeeded: tr('已保存', 'Saved'),
      failed: tr('生成失败', 'Failed'),
      outcome_unknown: tr('上游结果未确认', 'Upstream outcome unknown'),
    })[current.value.status],
);
watch(
  () => [props.session, current.value.artifacts] as const,
  async ([session, artifacts], _, onCleanup) => {
    let alive = true;
    onCleanup(() => (alive = false));
    sources.value = {};
    playbackErrors.value = {};
    for (const artifact of artifacts ?? []) {
      try {
        const grant = await mediaPlayback(session, artifact.id, { signal: controller.signal });
        if (alive) sources.value[artifact.id] = absUrl(grant.path);
      } catch (error) {
        if (alive) showError({ title: tr('无法读取媒体', 'Could not load media'), error });
      }
    }
  },
  { immediate: true },
);
async function reloadMedia(id: string) {
  const own = generation;
  try {
    const grant = await mediaPlayback(props.session, id, { signal: controller.signal });
    if (own !== generation) return;
    sources.value[id] = absUrl(grant.path);
    playbackErrors.value[id] = false;
  } catch (error) {
    if (own !== generation) return;
    showError({ title: tr('无法读取媒体', 'Could not load media'), error });
  }
}
async function refresh() {
  if (busy.value) return;
  const own = generation;
  busy.value = true;
  try {
    const value = await mediaJobStatus(
      props.session,
      current.value.kind === 'video' ? 'video' : 'audio',
      current.value.job_id,
      { signal: controller.signal },
    );
    if (own === generation) current.value = value;
  } catch (error) {
    if (own !== generation) return;
    showError({ title: tr('无法查询任务', 'Could not query task'), error });
  } finally {
    if (own === generation) busy.value = false;
  }
}
</script>
<template>
  <div class="tool-media">
    <div class="media-summary">
      <span>{{ status }}</span
      ><span>{{ current.provider }} · {{ current.model }}</span>
    </div>
    <p v-if="current.error" class="detail-muted">{{ current.error }}</p>
    <button
      v-if="['running', 'downloading', 'submitting'].includes(current.status)"
      class="btn sm"
      :disabled="busy"
      @click="refresh"
    >
      {{ busy ? tr('正在查询…', 'Checking…') : tr('查询进度 / 继续下载', 'Check progress / resume download') }}
    </button>
    <figure v-for="artifact in current.artifacts" :key="artifact.id">
      <video
        v-if="artifact.mime_type.startsWith('video/') && sources[artifact.id]"
        :src="sources[artifact.id]"
        controls
        playsinline
        @error="playbackErrors[artifact.id] = true"
        preload="metadata"
      />
      <audio
        v-else-if="sources[artifact.id]"
        :src="sources[artifact.id]"
        controls
        preload="metadata"
        @error="playbackErrors[artifact.id] = true"
      />
      <p v-if="playbackErrors[artifact.id]" class="detail-muted">
        {{
          tr(
            '播放失败，链接可能已过期或浏览器不支持此格式。',
            'Playback failed. The link may have expired or the format may be unsupported.',
          )
        }}
        <button class="btn sm ghost" @click="reloadMedia(artifact.id)">{{ tr('重新加载', 'Reload') }}</button>
      </p>
      <figcaption>{{ artifact.path }}</figcaption>
    </figure>
    <small class="detail-muted">{{ tr('任务', 'Job') }} {{ current.job_id }}</small>
  </div>
</template>
<style scoped>
.tool-media {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.media-summary {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.media-summary > span + span {
  color: var(--fg-muted);
  font-size: 12px;
}
figure {
  margin: 0;
  display: grid;
  gap: 8px;
}
video {
  width: 100%;
  max-height: 65vh;
  background: var(--bg-secondary);
  border-radius: 12px;
}
audio {
  width: 100%;
  max-width: 560px;
}
figcaption,
small {
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--fg-muted);
}
.btn {
  justify-self: start;
}
</style>
