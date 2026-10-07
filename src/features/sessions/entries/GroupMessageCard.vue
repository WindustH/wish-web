<script setup lang="ts">
// A message that went through a group, as one card in a session's history: who wrote it, in a
// colour of its own, or that this session sent it; the group; the start of the words with the
// images under them. The whole card opens a window with all of it.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import CopyButton from '../../../ui/components/CopyButton.vue';
import Icon from '../../../ui/components/Icon.vue';
import Markdown from '../../../ui/components/Markdown.vue';
import Modal from '../../../ui/components/Modal.vue';
import { i18n } from '../../../core/i18n/index.ts';
import { tr } from '../../../core/i18n/tr.ts';
import { fmtDateTime } from '../../../core/util/fmt.ts';

const props = defineProps<{
  /** Who wrote it: a name, its colour and its session's page. Absent for this session's own. */
  author?: { name: string; color: string; to?: string };
  /** Said before the group: "in", or how this session sent it. */
  verb: string;
  group: { id: string; name: string };
  /** The words; without them the card is its heading alone. */
  text: string;
  images?: string[];
  /** Said at the end of the heading: whom it woke, or what came with it. */
  note?: string;
  at?: number;
}>();
const open = ref(false);
const color = computed(() => props.author?.color ?? 'var(--accent)');
const initial = computed(() => [...(props.author?.name ?? '')][0]?.toUpperCase() ?? '');
const time = computed(() => {
  if (!props.at) return '';
  const at = new Date(props.at), today = new Date().toDateString() === at.toDateString();
  return new Intl.DateTimeFormat(i18n.locale.value, today ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at);
});
const title = computed(() => `${props.author ? `${props.author.name} · ` : ''}${props.verb} ${props.group.name}`);
const hasBody = computed(() => !!props.text.trim() || !!props.images?.length);

// The preview fades out at its foot only when the words go on below it.
const preview = ref<HTMLElement | null>(null);
const clipped = ref(false);
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (!preview.value) return;
  observer = new ResizeObserver(() => { clipped.value = preview.value!.scrollHeight > preview.value!.clientHeight + 1; });
  observer.observe(preview.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section class="group-card" :class="{ sent: !author }" :style="{ '--card-color': color }">
    <button type="button" class="group-card-open" :aria-label="`${title} · ${tr('查看完整消息', 'Show the whole message')}`" :aria-expanded="open" @click="open = true" />
    <header class="group-card-head">
      <span class="group-card-mark" aria-hidden="true"><template v-if="author">{{ initial }}</template><Icon v-else name="send" /></span>
      <RouterLink v-if="author?.to" :to="author.to" class="group-card-author">{{ author.name }}</RouterLink>
      <span v-else-if="author" class="group-card-author">{{ author.name }}</span>
      <span class="group-card-verb">{{ verb }}</span>
      <RouterLink :to="`/g/${group.id}`" class="group-card-group"><Icon name="users" />{{ group.name }}</RouterLink>
      <span class="group-card-meta">
        <span v-if="note">{{ note }}</span>
        <time v-if="time" :datetime="new Date(at!).toISOString()">{{ time }}</time>
      </span>
    </header>
    <div v-if="hasBody" class="group-card-body">
      <div v-if="text.trim()" ref="preview" class="group-card-preview" :class="{ clipped }"><Markdown :text="text" /></div>
      <div v-if="images?.length" class="group-card-images">
        <img v-for="(src, index) in images.slice(0, 4)" :key="index" :src="src" alt="" loading="lazy" decoding="async" />
        <span v-if="images.length > 4" class="group-card-more">+{{ images.length - 4 }}</span>
      </div>
    </div>
    <Modal :open="open" :title="title" compact content-class="group-message-window" @close="open = false">
      <div class="group-card-actions"><CopyButton :text="text" /></div>
      <div class="group-card-detail">
        <p class="group-card-detail-meta">
          <RouterLink v-if="author?.to" :to="author.to">{{ author.name }}</RouterLink>
          <span v-else-if="author">{{ author.name }}</span>
          <span>{{ verb }}</span>
          <RouterLink :to="`/g/${group.id}`"><Icon name="users" />{{ group.name }}</RouterLink>
          <span v-if="at">· {{ fmtDateTime(at) }}</span>
          <span v-if="note">· {{ note }}</span>
        </p>
        <Markdown v-if="text.trim()" :text="text" />
        <img v-for="(src, index) in images" :key="index" class="group-card-image" :src="src" alt="" loading="lazy" decoding="async" />
      </div>
    </Modal>
  </section>
</template>

<style scoped>
:global(.modal-card.group-message-window:not(.modal-page)) { width: min(94vw, 42.5rem); }
:global(.group-message-window.compact .modal-body) { position: relative; padding: 14px 16px 16px; }
:global(.group-message-window .modal-flow-title) { padding-right: 48px; margin-bottom: 6px; }
/* One surface, a short bar in the author's colour at its side; the whole card opens the window. */
.group-card { position: relative; min-width: 0; padding: 10px 14px 12px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); transition: background var(--dur-fast); }
.group-card::before { content: ''; position: absolute; left: -1px; top: 12px; bottom: 12px; width: 3px; border-radius: 0 3px 3px 0; background: var(--card-color); }
@media (hover: hover) { .group-card:has(.group-card-open:hover) { background: var(--bg-hover); } }
.group-card:has(.group-card-open:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.group-card-open { position: absolute; inset: 0; z-index: 1; width: 100%; padding: 0; border: 0; border-radius: inherit; background: none; cursor: pointer; }
.group-card-open:focus-visible { outline: none; }
.group-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; min-width: 0; font-size: 12.5px; line-height: 1.5; color: var(--fg-subtle); }
.group-card-mark { display: grid; place-items: center; flex: none; width: 20px; height: 20px; margin-right: 2px; border-radius: 50%; background: color-mix(in srgb, var(--card-color) 22%, var(--bg-raised)); color: var(--card-color); font-size: 10.5px; font-weight: 700; line-height: 1; }
.group-card-mark .icon { width: 11px; height: 11px; }
.group-card-author { flex: none; max-width: 40%; overflow: hidden; color: var(--card-color); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
.group-card-verb { flex: none; }
.group-card-group { display: inline-flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; color: var(--fg-muted); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
.group-card-group .icon { width: 13px; height: 13px; flex: none; }
/* Links sit above the card's own button, so they lead where they say. */
.group-card-head a { position: relative; z-index: 2; }
@media (hover: hover) { .group-card-head a:hover { text-decoration: underline; } }
.group-card-meta { display: inline-flex; flex: none; align-items: center; gap: 8px; margin-left: auto; padding-left: 8px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.group-card-body { display: grid; gap: 10px; margin-top: 8px; }
/* The first lines only, fading out when there is more; the window has the rest. */
.group-card-preview { max-height: calc(var(--message-size, 15px) * 1.75 * 5); overflow: hidden; color: var(--fg); pointer-events: none; }
.group-card-preview.clipped { mask-image: linear-gradient(to bottom, #000 60%, transparent); }
.group-card-preview :deep(.markdown > :first-child) { margin-top: 0; }
.group-card-preview :deep(.markdown > :last-child) { margin-bottom: 0; }
.group-card-images { display: flex; flex-wrap: wrap; gap: 6px; pointer-events: none; }
.group-card-images img { width: 56px; height: 56px; border: 1px solid var(--line); border-radius: 6px; object-fit: cover; }
.group-card-more { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 6px; background: var(--bg-sunken); color: var(--fg-muted); font-size: 12px; }
.group-card-actions { position: absolute; right: 12px; top: 8px; display: flex; align-items: center; gap: 2px; }
.group-card-detail { display: grid; gap: 10px; max-height: calc(84dvh - 140px); overflow: auto; }
.group-card-detail-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 0; color: var(--fg-subtle); font-size: 12.5px; }
.group-card-detail-meta a { display: inline-flex; align-items: center; gap: 4px; color: var(--fg-muted); text-decoration: none; }
.group-card-detail-meta a .icon { width: 13px; height: 13px; }
@media (hover: hover) { .group-card-detail-meta a:hover { color: var(--accent); } }
.group-card-image { max-width: 100%; border-radius: 8px; }
@media (max-width: 599px) { .group-card { padding: 10px 12px 12px 14px; } }
</style>
