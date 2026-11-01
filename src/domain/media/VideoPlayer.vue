<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';

const props = defineProps<{ src: string; label: string }>();
const emit = defineEmits<{
  ready: [element: HTMLVideoElement | null];
  loadedmetadata: [];
  loadeddata: [];
  playing: [];
  timeupdate: [];
  pause: [];
  error: [];
}>();
const surface = ref<HTMLElement>(),
  video = ref<HTMLVideoElement>();
const paused = ref(true),
  duration = ref(0),
  time = ref(0),
  volume = ref(1),
  muted = ref(false),
  rate = ref(1);
const draft = ref<number | null>(null),
  buffered = ref(0),
  notice = ref('');
const shownTime = computed(() => draft.value ?? time.value);
const progress = computed(() => (duration.value ? (shownTime.value / duration.value) * 100 : 0));
function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(whole / 3600),
    m = Math.floor(whole / 60) % 60,
    s = whole % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}`;
}
function sync() {
  const el = video.value;
  if (!el) return;
  paused.value = el.paused;
  duration.value = Number.isFinite(el.duration) ? el.duration : 0;
  time.value = el.currentTime;
  volume.value = el.volume;
  muted.value = el.muted;
  rate.value = el.playbackRate;
  buffered.value =
    duration.value && el.buffered.length ? (el.buffered.end(el.buffered.length - 1) / duration.value) * 100 : 0;
}
async function toggle() {
  const el = video.value;
  if (!el) return;
  notice.value = '';
  if (!el.paused) el.pause();
  else
    try {
      await el.play();
    } catch {
      notice.value = tr('无法开始播放，请重试。', 'Could not start playback. Try again.');
    }
}
function seek(event: Event) {
  if (video.value && duration.value) video.value.currentTime = Number((event.target as HTMLInputElement).value);
  draft.value = null;
}
function setVolume(event: Event) {
  if (!video.value) return;
  video.value.volume = Number((event.target as HTMLInputElement).value);
  video.value.muted = false;
}
function speed(value: string) {
  if (video.value) video.value.playbackRate = Number(value);
}
async function fullscreen() {
  notice.value = '';
  const el = video.value as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | undefined;
  try {
    if (document.fullscreenElement === surface.value) await document.exitFullscreen();
    else if (surface.value?.requestFullscreen) await surface.value.requestFullscreen();
    else if (el?.webkitEnterFullscreen) el.webkitEnterFullscreen();
    else notice.value = tr('当前浏览器不支持全屏。', 'Fullscreen is unavailable in this browser.');
  } catch {
    notice.value = tr('无法进入全屏，请重试。', 'Could not enter fullscreen. Try again.');
  }
}
function keyboard(event: KeyboardEvent) {
  if ((event.target as Element).closest('button, input, select, [role="menuitem"]')) return;
  if (event.key === ' ' || event.key === 'k') {
    event.preventDefault();
    void toggle();
  } else if (['ArrowLeft', 'ArrowRight'].includes(event.key) && video.value && duration.value) {
    event.preventDefault();
    video.value.currentTime = Math.max(0, Math.min(duration.value, time.value + (event.key === 'ArrowLeft' ? -5 : 5)));
  } else if (event.key === 'f') {
    event.preventDefault();
    void fullscreen();
  }
}
watch(video, (element) => emit('ready', element ?? null), { flush: 'post' });
onBeforeUnmount(() => {
  video.value?.pause();
  emit('ready', null);
});
</script>

<template>
  <div ref="surface" class="wish-video" tabindex="0" :aria-label="label" @keydown="keyboard">
    <video
      ref="video"
      :src="props.src"
      playsinline
      preload="metadata"
      :aria-label="label"
      @click="toggle"
      @dblclick="fullscreen"
      @loadedmetadata="
        sync();
        emit('loadedmetadata');
      "
      @loadeddata="
        sync();
        emit('loadeddata');
      "
      @playing="
        sync();
        emit('playing');
      "
      @play="sync"
      @pause="
        sync();
        emit('pause');
      "
      @ended="sync"
      @durationchange="sync"
      @progress="sync"
      @volumechange="sync"
      @ratechange="sync"
      @timeupdate="
        sync();
        emit('timeupdate');
      "
      @error="emit('error')"
    />
    <div class="video-controls">
      <input
        class="video-seek"
        type="range"
        min="0"
        :max="duration || 1"
        step="0.1"
        :value="shownTime"
        :disabled="!duration"
        :aria-label="tr('播放进度', 'Playback position')"
        :aria-valuetext="`${clock(shownTime)} / ${clock(duration)}`"
        :style="{ '--played': `${progress}%`, '--buffered': `${buffered}%` }"
        @input="draft = Number(($event.target as HTMLInputElement).value)"
        @change="seek"
        @pointercancel="draft = null"
        @blur="draft = null"
      />
      <div class="video-buttons">
        <button
          class="btn ghost icon-only video-play"
          :aria-label="paused ? tr('播放', 'Play') : tr('暂停', 'Pause')"
          :title="paused ? tr('播放', 'Play') : tr('暂停', 'Pause')"
          @click="toggle"
        >
          <Icon :name="paused ? 'play' : 'pause'" />
        </button>
        <span class="video-time"
          >{{ clock(shownTime) }} <span>/ {{ clock(duration) }}</span></span
        >
        <div class="video-volume">
          <button
            class="btn ghost icon-only"
            :aria-label="muted ? tr('取消静音', 'Unmute') : tr('静音', 'Mute')"
            :title="muted ? tr('取消静音', 'Unmute') : tr('静音', 'Mute')"
            @click="video && (video.muted = !video.muted)"
          >
            <Icon :name="muted || !volume ? 'volume-off' : 'volume'" />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="muted ? 0 : volume"
            :aria-label="tr('音量', 'Volume')"
            @input="setVolume"
          />
        </div>
        <select
          class="video-speed"
          :value="rate"
          :aria-label="tr('播放速度', 'Playback speed')"
          @change="speed(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="value in [0.5, 1, 1.25, 1.5, 2]" :key="value" :value="value">{{ value }}×</option>
        </select>
        <button
          class="btn ghost icon-only"
          :aria-label="tr('切换全屏', 'Toggle fullscreen')"
          :title="tr('切换全屏', 'Toggle fullscreen')"
          @click="fullscreen"
        >
          <Icon name="fullscreen" />
        </button>
      </div>
      <p v-if="notice" class="video-notice" role="status">{{ notice }}</p>
    </div>
  </div>
</template>

<style scoped>
.wish-video {
  width: 100%;
  max-height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-raised);
  container-type: inline-size;
}
.wish-video video {
  display: block;
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  object-fit: contain;
  background: #000;
  cursor: pointer;
}
.video-controls {
  flex: none;
  padding: 6px 10px 8px;
  border-top: 1px solid var(--line);
  color: var(--fg);
  background: var(--bg-raised);
}
.video-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.video-play {
  color: var(--accent);
}
.video-time {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  margin-right: auto;
}
.video-time span {
  color: var(--fg-muted);
}
.video-speed {
  font: inherit;
  font-size: 12px;
  color: var(--fg-muted);
  background: var(--bg-raised);
  border: 0;
  border-radius: 8px;
  padding: 8px 2px;
  cursor: pointer;
}
.video-volume {
  display: flex;
  align-items: center;
  gap: 2px;
}
.video-volume input {
  width: 64px;
  accent-color: var(--accent);
}
.video-seek {
  appearance: none;
  display: block;
  width: 100%;
  height: 20px;
  margin: 0;
  cursor: pointer;
  background: transparent;
}
.video-seek::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(
    to right,
    var(--accent) 0 var(--played),
    var(--fg-subtle) var(--played) var(--buffered),
    var(--line) var(--buffered) 100%
  );
}
.video-seek::-moz-range-track {
  height: 4px;
  border-radius: 4px;
  background: var(--line);
}
.video-seek::-moz-range-progress {
  height: 4px;
  border-radius: 4px;
  background: var(--accent);
}
.video-seek::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  margin-top: -4px;
}
.video-seek::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
}
.video-seek:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}
.video-seek:disabled {
  cursor: default;
  opacity: 0.5;
}
.video-notice {
  font-size: 12px;
  color: var(--fg-muted);
  margin: 4px 0;
}
.wish-video:fullscreen {
  width: 100%;
  height: 100%;
  max-height: none;
  border: 0;
  border-radius: 0;
}
@container (max-width:380px) {
  .video-volume input {
    display: none;
  }
  .video-buttons {
    gap: 0;
  }
  .video-controls {
    padding-inline: 6px;
  }
}
@media (pointer: coarse) {
  .video-seek {
    height: 28px;
  }
  .video-buttons .icon-only {
    min-width: 40px;
    min-height: 40px;
  }
}
</style>
