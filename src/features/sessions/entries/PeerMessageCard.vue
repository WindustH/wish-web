<script setup lang="ts">
// The row keeps only the preview; the session host owns the open message.
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../../../ui/components/Icon.vue';
import Markdown from '../../../domain/references/ReferenceMarkdown.vue';
import PeerMessageDialog from './PeerMessageDialog.vue';
import { openActivityKey, type PeerMessageDetail } from '../activityDialogs.ts';
import { i18n } from '../../../core/i18n/index.ts';
import { tr } from '../../../core/i18n/tr.ts';

const props = defineProps<PeerMessageDetail>();
const open = ref(false);
const openActivity = inject(openActivityKey, undefined);
function showMessage() {
  if (openActivity)
    openActivity({
      chipKey: `peer:${props.at ?? ''}`,
      stepKey: null,
      peer: { ...props, images: props.images?.slice() },
    });
  else open.value = true;
}
const color = computed(() => props.author?.color ?? 'var(--accent)');
const initial = computed(() => [...(props.author?.name ?? '')][0]?.toUpperCase() ?? '');
const time = computed(() => {
  if (!props.at) return '';
  const at = new Date(props.at),
    today = new Date().toDateString() === at.toDateString();
  return new Intl.DateTimeFormat(
    i18n.locale.value,
    today
      ? { hour: '2-digit', minute: '2-digit' }
      : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  ).format(at);
});
const title = computed(() =>
  `${props.author ? `${props.author.name} · ` : ''}${props.verb} ${props.group?.name ?? ''}`.trim(),
);
const hasBody = computed(() => !!props.text.trim() || !!props.images?.length);

// The preview fades out at its foot only when the words go on below it.
const previewEl = ref<HTMLElement | null>(null);
const clipped = ref(false);
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (!previewEl.value) return;
  observer = new ResizeObserver(() => {
    clipped.value = previewEl.value!.scrollHeight > previewEl.value!.clientHeight + 1;
  });
  observer.observe(previewEl.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section class="peer-card" :class="{ sent: !author }" :style="{ '--card-color': color }">
    <button
      type="button"
      class="peer-card-open"
      :aria-label="`${title} · ${tr('查看完整消息', 'Show the whole message')}`"
      aria-haspopup="dialog"
      @click="showMessage"
    />
    <header class="peer-card-head">
      <span class="peer-card-mark" aria-hidden="true"
        ><template v-if="author">{{ initial }}</template
        ><Icon v-else name="send"
      /></span>
      <RouterLink v-if="author?.to && !preview" :to="author.to" class="peer-card-author">{{ author.name }}</RouterLink>
      <span v-else-if="author" class="peer-card-author">{{ author.name }}</span>
      <span class="peer-card-verb">{{ verb }}</span>
      <span v-if="group" class="peer-card-group"><Icon name="users" />{{ group.name }}</span>
      <span class="peer-card-meta">
        <span v-if="note">{{ note }}</span>
        <time v-if="time" :datetime="new Date(at!).toISOString()">{{ time }}</time>
      </span>
    </header>
    <div v-if="hasBody" class="peer-card-body">
      <div v-if="text.trim()" ref="previewEl" class="peer-card-preview" :class="{ clipped }">
        <Markdown :text="text" />
      </div>
      <div v-if="images?.length" class="peer-card-images">
        <img
          v-for="(src, index) in images.slice(0, 4)"
          :key="index"
          :src="src"
          alt=""
          loading="lazy"
          decoding="async"
        />
        <span v-if="images.length > 4" class="peer-card-more">+{{ images.length - 4 }}</span>
      </div>
    </div>
    <PeerMessageDialog v-if="open && !openActivity" v-bind="props" @close="open = false" />
  </section>
</template>

<style scoped>
/* A neutral surface; author colour belongs to the avatar and label. */
.peer-card {
  position: relative;
  min-width: 0;
  padding: 10px 14px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-raised);
  transition: background var(--dur-fast);
}
@media (hover: hover) {
  .peer-card:has(.peer-card-open:hover) {
    background: var(--bg-hover);
  }
}
.peer-card:has(.peer-card-open:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.peer-card-open {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: none;
  cursor: pointer;
}
.peer-card-open:focus-visible {
  outline: none;
}
.peer-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--fg-subtle);
}
.peer-card-mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  margin-right: 2px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--card-color) 22%, var(--bg-raised));
  color: var(--card-color);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1;
}
.peer-card-mark .icon {
  width: 11px;
  height: 11px;
}
.peer-card-author {
  flex: none;
  max-width: 40%;
  overflow: hidden;
  color: var(--card-color);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
}
.peer-card-verb {
  flex: none;
}
.peer-card-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  color: var(--fg-muted);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
}
.peer-card-group .icon {
  width: 13px;
  height: 13px;
  flex: none;
}
/* Links sit above the card's own button, so they lead where they say. */
.peer-card-head a {
  position: relative;
  z-index: 2;
}
@media (hover: hover) {
  .peer-card-head a:hover {
    text-decoration: underline;
  }
}
.peer-card-meta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding-left: 8px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.peer-card-body {
  display: grid;
  gap: 10px;
  margin-top: 8px;
}
/* The first lines only, fading out when there is more; the window has the rest. */
.peer-card-preview {
  max-height: calc(var(--message-size) * var(--message-leading) * 5);
  overflow: hidden;
  color: var(--fg);
  pointer-events: none;
}
.peer-card-preview.clipped {
  -webkit-mask-image: linear-gradient(to bottom, #000 60%, transparent);
  mask-image: linear-gradient(to bottom, #000 60%, transparent);
}
.peer-card-preview :deep(.markdown > .markdown-block:first-child > :first-child) {
  margin-top: 0;
}
.peer-card-preview :deep(.markdown > .markdown-block:last-child > :last-child) {
  margin-bottom: 0;
}
.peer-card-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  pointer-events: none;
}
.peer-card-images img {
  width: 56px;
  height: 56px;
  border: 1px solid var(--line);
  border-radius: 6px;
  object-fit: cover;
}
.peer-card-more {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 6px;
  background: var(--bg-sunken);
  color: var(--fg-muted);
  font-size: 12px;
}
@media (max-width: 599px) {
  .peer-card {
    padding: 10px 12px 12px;
  }
}
</style>
