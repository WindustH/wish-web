<script setup lang="ts">
import { mediaJob as validMediaJob } from '../validation.ts';
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { blobUrl, mediaJobStatus, mediaPlayback } from '../../../core/api/endpoints.ts';
import { absUrl } from '../../../core/api/client.ts';
import type { MediaJob } from '../../../core/mediaGeneration.ts';
import { tr } from '../../../core/i18n/tr.ts';
import { downloadApiFile } from '../../../ui/download.ts';
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
    const playbackController = new AbortController();
    onCleanup(() => {
      alive = false;
      playbackController.abort();
    });
    sources.value = {};
    playbackErrors.value = {};
    for (const artifact of artifacts ?? []) {
      if (!alive) break;
      try {
        const grant = await mediaPlayback(session, artifact.id, { signal: playbackController.signal });
        if (alive) sources.value[artifact.id] = absUrl(grant.path);
      } catch (error) {
        if (alive) showError({ title: tr('无法读取媒体', 'Could not load media'), error });
      }
    }
  },
  { immediate: true },
);
function filename(id: string, mime: string) {
  const extension: Record<string, string> = {
    'video/quicktime': 'mov',
    'application/zip': 'zip',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/flac': 'flac',
    'audio/ogg': 'ogg',
  };
  return id + '.' + (extension[mime] ?? 'bin');
}
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
    if (own === generation) {
      if (!validMediaJob(value)) throw new Error('Invalid media job response');
      current.value = value;
    }
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
        v-if="
          artifact.mime_type.startsWith('video/') && artifact.mime_type !== 'video/quicktime' && sources[artifact.id]
        "
        :src="sources[artifact.id]"
        controls
        playsinline
        @error="playbackErrors[artifact.id] = true"
        preload="metadata"
      />
      <audio
        v-else-if="artifact.mime_type.startsWith('audio/') && sources[artifact.id]"
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
      <p v-if="artifact.mime_type === 'video/quicktime'" class="detail-muted">
        {{
          tr(
            'QuickTime / ProRes 文件，请下载后使用兼容的播放器或编辑器打开。',
            'Download this QuickTime / ProRes file and open it in a compatible player or editor.',
          )
        }}
      </p>
      <p v-if="artifact.mime_type === 'application/zip'" class="detail-muted">
        {{
          tr(
            'PNG 帧序列，请下载 ZIP 后查看或导入编辑器。文件未自动解压。',
            'PNG frame sequence. Download the ZIP to view or import it into an editor. Files are not extracted automatically.',
          )
        }}
      </p>
      <a
        v-if="sources[artifact.id]"
        class="btn sm artifact-download"
        :href="sources[artifact.id]"
        :download="filename(artifact.id, artifact.mime_type)"
        @click="
          downloadApiFile($event, blobUrl(`${session}/${artifact.id}`), filename(artifact.id, artifact.mime_type))
        "
      >
        {{ tr('下载文件', 'Download file') }}
      </a>
      <figcaption>{{ artifact.path }}</figcaption>
    </figure>
    <a
      v-if="current.timestamps && /^[a-f0-9]{64}$/.test(current.timestamps.id)"
      class="btn sm timing-download"
      :href="blobUrl(`${session}/${current.timestamps.id}`)"
      @click="downloadApiFile($event, blobUrl(`${session}/${current.timestamps.id}`), 'speech-timestamps.json')"
    >
      {{ tr('下载时间戳 / 字幕', 'Download timestamps / subtitles') }}
    </a>
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
