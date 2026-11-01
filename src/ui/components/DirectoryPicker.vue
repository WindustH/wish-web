<script setup lang="ts">
// Browse server paths. Directory mode selects working / skills directories; file mode
// chooses a regular file for linking. Neither mode reads file contents.
import { computed, nextTick, ref, watch } from 'vue';
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverArrow } from 'reka-ui';
import { directoriesList } from '../../core/api/endpoints.ts';
import { errorText } from '../../core/errors.ts';
import { usePageActivity } from '../composables/usePageActivity.ts';
import Icon from './Icon.vue';
import BubbleSurface from './BubbleSurface.vue';
import { tr } from '../../core/i18n/tr.ts';
import { useDialogLayer } from '../composables/useDialogLayer.ts';
import { useBackLayer } from '../composables/useBackLayer.ts';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    disabled?: boolean;
    title?: string;
    side?: 'top' | 'bottom';
    mode?: 'directory' | 'file';
  }>(),
  { title: undefined, side: 'top', mode: 'directory' },
);
const label = computed(
  () =>
    props.title ??
    (props.mode === 'file' ? tr('选择本地文件', 'Choose local file') : tr('选择工作目录', 'Choose working directory')),
);
const emit = defineEmits<{ 'update:modelValue': [path: string] }>();
type DirectoryListing = Awaited<ReturnType<typeof directoriesList>>;
const folderName = computed(
  () => props.modelValue.split('/').filter(Boolean).at(-1) || (props.modelValue.startsWith('/') ? '/' : ''),
);
const active = usePageActivity();
const layer = useDialogLayer(() => 75);
function childPath(parent: string, name: string) {
  const separator = parent.includes('\\') ? '\\' : '/';
  return parent.replace(/[\\/]+$/, '') + separator + name;
}
function initialPath() {
  if (props.mode !== 'file') return props.modelValue || '/';
  const value = props.modelValue;
  const index = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  if (index < 0) return '~';
  return value.slice(0, index + 1) || '/';
}

const open = ref(false),
  pending = ref(false),
  error = ref(''),
  path = ref('');
useBackLayer(
  () => open.value && active.value,
  () => {
    open.value = false;
  },
  () => layer.value,
);
const listing = ref<DirectoryListing>();
const sidebarListing = ref<DirectoryListing>();
const sidebarPending = ref(false),
  sidebarError = ref('');
const sidebar = ref<HTMLElement>();
const showHidden = ref(false);
const directories = computed(() =>
  (listing.value?.directories ?? []).filter((name) => showHidden.value || !name.startsWith('.')),
);
const files = computed(() => (listing.value?.files ?? []).filter((name) => showHidden.value || !name.startsWith('.')));
function selectFile(name: string) {
  if (props.mode !== 'file' || pending.value || error.value || !listing.value || path.value !== listing.value.path)
    return;
  emit('update:modelValue', childPath(listing.value.path, name));
  open.value = false;
}
const siblings = computed(() => {
  const current = listing.value;
  if (!current) return [];
  if (!current.parent) return [{ name: '/', path: '/' }];
  if (sidebarListing.value?.path !== current.parent) return [];
  return sidebarListing.value.directories
    .map((name) => ({ name, path: childPath(current.parent!, name) }))
    .filter((item) => showHidden.value || !item.name.startsWith('.') || item.path === current.path);
});
let generation = 0;
function revealCurrent() {
  void nextTick(() => {
    const container = sidebar.value;
    const selected = container?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!container || !selected) return;
    const offset = selected.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop += offset - (container.clientHeight - selected.offsetHeight) / 2;
  });
}
async function loadSidebar(parent: string, current: number) {
  sidebarPending.value = true;
  sidebarError.value = '';
  try {
    const result = await directoriesList(parent);
    if (current !== generation) return;
    sidebarListing.value = result;
    revealCurrent();
  } catch (reason) {
    if (current === generation) sidebarError.value = errorText(reason);
  } finally {
    if (current === generation) sidebarPending.value = false;
  }
}
async function browse(target: string) {
  const current = ++generation;
  path.value = target;
  pending.value = true;
  error.value = '';
  try {
    const result = await directoriesList(target, props.mode === 'file');
    if (current !== generation) return;
    listing.value = result;
    path.value = result.path;
    if (result.parent && sidebarListing.value?.path !== result.parent) {
      sidebarListing.value = undefined;
      void loadSidebar(result.parent, current);
    } else {
      sidebarPending.value = false;
      sidebarError.value = '';
      revealCurrent();
    }
  } catch (reason) {
    if (current === generation) error.value = errorText(reason);
  } finally {
    if (current === generation) pending.value = false;
  }
}
watch(open, (value) => {
  if (value) {
    listing.value = undefined;
    sidebarListing.value = undefined;
    void browse(initialPath());
  } else {
    ++generation;
    pending.value = false;
    sidebarPending.value = false;
  }
});
watch(active, (value) => {
  if (!value) open.value = false;
});
function select() {
  if (!listing.value || pending.value || error.value || path.value !== listing.value.path) return;
  emit('update:modelValue', listing.value.path);
  open.value = false;
}
</script>

<template>
  <PopoverRoot v-model:open="open" :modal="false">
    <PopoverTrigger v-if="$slots.trigger" as-child :disabled="disabled"><slot name="trigger" /></PopoverTrigger>
    <PopoverTrigger
      v-else
      class="cwd-trigger"
      :disabled="disabled"
      :data-hint="label + ': ' + modelValue"
      :aria-label="label"
    >
      <Icon :name="mode === 'file' ? 'paperclip' : 'folder'" />
      <span>{{ folderName || label }}</span>
      <Icon name="chevron-down" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        class="directory-picker"
        :style="{ zIndex: layer }"
        :aria-label="label"
        :side="side"
        align="start"
        :side-offset="10"
        :collision-padding="16"
        @open-auto-focus.prevent
      >
        <BubbleSurface />
        <form class="directory-path" @submit.prevent="browse(path)">
          <button
            type="button"
            class="btn ghost icon-only"
            :disabled="!listing?.parent || pending"
            :aria-label="tr('上一级', 'Parent directory')"
            @click="browse(listing!.parent!)"
          >
            <Icon name="arrow-left" />
          </button>
          <button
            type="button"
            class="btn ghost icon-only"
            :disabled="pending"
            :aria-label="tr('主目录', 'Home directory')"
            :data-hint="tr('主目录', 'Home directory')"
            @click="browse('~')"
          >
            <Icon name="house" />
          </button>
          <input
            v-model="path"
            class="input"
            :aria-label="tr('目录路径', 'Directory path')"
            spellcheck="false"
            autocomplete="off"
          />
          <button class="btn ghost icon-only" :aria-label="tr('打开路径', 'Open path')">
            <Icon name="chevron-right" />
          </button>
        </form>
        <div class="directory-middle">
          <div class="directory-browser">
            <nav
              ref="sidebar"
              class="directory-sidebar"
              :aria-label="tr('同级目录', 'Sibling directories')"
              :aria-busy="sidebarPending"
            >
              <p v-if="sidebarPending" class="hint" role="status">{{ tr('正在读取…', 'Loading…') }}</p>
              <p v-else-if="sidebarError" class="load-error" role="alert">{{ sidebarError }}</p>
              <button
                v-for="item in siblings"
                :key="item.path"
                type="button"
                class="directory-location"
                :aria-current="item.path === listing?.path ? 'location' : undefined"
                :disabled="pending"
                :data-hint="item.path"
                @click="browse(item.path)"
              >
                <Icon name="folder" /><span>{{ item.name }}</span>
              </button>
            </nav>
            <div class="directory-list" :aria-busy="pending">
              <p v-if="pending" class="hint" role="status">{{ tr('正在读取…', 'Loading…') }}</p>
              <p v-else-if="error" class="load-error" role="alert">{{ error }}</p>
              <template v-else>
                <button
                  v-for="name in directories"
                  :key="name"
                  class="directory-row"
                  @click="browse(childPath(listing!.path, name))"
                >
                  <Icon name="folder" class="directory-folder" /><span>{{ name }}</span
                  ><Icon name="chevron-right" class="directory-enter" />
                </button>
                <button
                  v-for="name in files"
                  :key="'file:' + name"
                  type="button"
                  class="directory-row file-row"
                  :disabled="path !== listing?.path"
                  @click="selectFile(name)"
                >
                  <Icon name="paperclip" class="directory-folder" /><span>{{ name }}</span>
                </button>
                <p v-if="!directories.length && !files.length" class="hint">
                  {{
                    mode === 'file'
                      ? tr('没有可显示的文件或目录', 'No visible files or directories')
                      : tr('没有可显示的子目录', 'No visible subdirectories')
                  }}
                </p>
              </template>
            </div>
          </div>
        </div>
        <div class="directory-footer">
          <label class="directory-hidden"
            ><input v-model="showHidden" type="checkbox" />{{
              mode === 'file' ? tr('显示隐藏文件', 'Show hidden files') : tr('显示隐藏目录', 'Show hidden directories')
            }}</label
          >
          <button
            v-if="mode === 'directory'"
            class="btn primary icon-only"
            :aria-label="tr('使用此目录', 'Use this directory')"
            :data-hint="tr('使用此目录', 'Use this directory')"
            :disabled="pending || !!error || !listing || path !== listing.path"
            @click="select"
          >
            <Icon name="check" />
          </button>
        </div>
        <PopoverArrow as-child :width="30" :height="9"
          ><span data-bubble-anchor class="directory-tail-anchor" aria-hidden="true"
        /></PopoverArrow>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.cwd-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  border: 0;
  background: transparent;
  color: var(--fg-subtle);
  padding: 6px 0;
  font: 12px/1.5 var(--font);
  cursor: pointer;
}
.cwd-trigger span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cwd-trigger .icon {
  width: 14px;
  height: 14px;
  flex: none;
}
.cwd-trigger:disabled {
  opacity: 0.5;
  cursor: default;
}
@media (hover: hover) {
  .cwd-trigger:hover {
    color: var(--fg);
  }
}
:global(.directory-picker) {
  --directory-chrome: color-mix(in srgb, var(--bg-overlay) 65%, var(--bg-hover));
  --bubble-surface: var(--directory-chrome);
  z-index: 75;
  width: min(380px, calc(100vw - 32px));
  max-height: var(--reka-popover-content-available-height);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: var(--fg);
  isolation: isolate;
  transform-origin: var(--reka-popover-content-transform-origin);
}
:global(.directory-picker[data-side='bottom']) {
  --bubble-surface: var(--bg-control);
}
:global(.directory-tail-anchor) {
  display: block;
  width: 30px;
  height: 9px;
  opacity: 0;
  pointer-events: none;
}
.directory-path {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 4px 10px 0;
  background: var(--bg-control);
  border-radius: 13px 13px 0 0;
}
.directory-path input {
  min-width: 0;
  flex: 1;
  font: 12px/1.5 var(--mono);
  padding: 2px 4px;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.directory-path input:focus {
  background: transparent;
  outline: none;
  box-shadow: none;
}
.directory-path .btn {
  width: 30px;
  min-width: 30px;
  height: 30px;
  min-height: 30px;
  padding: 0;
}
.directory-middle {
  display: flex;
  min-height: 0;
  background: var(--bg-control);
}
.directory-browser {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  margin: 4px 8px 8px;
  border-radius: 9px;
  overflow: hidden;
  background: var(--bg);
}
.directory-sidebar {
  display: none;
}
.directory-list {
  flex: 1;
  min-width: 0;
  min-height: 0;
  max-height: 260px;
  overflow: auto;
  padding: 6px;
  background: transparent;
  overscroll-behavior: contain;
}
.directory-list > p {
  margin: 12px;
}
.directory-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 34px;
  padding: 6px 9px;
  background: transparent;
  border: 0;
  border-radius: 5px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: 13px/1.5 var(--font);
}
.directory-row span {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.directory-row .directory-folder {
  flex: none;
  width: 17px;
  height: 17px;
  color: var(--fg-subtle);
}
.directory-row .directory-enter {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--fg-faint);
}
@media (hover: hover) {
  .directory-row:hover,
  .directory-location:hover {
    background: var(--bg-hover);
  }
}
.directory-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 5px 10px 6px 13px;
  background: var(--directory-chrome);
  border-radius: 0 0 13px 13px;
}
.directory-footer .btn {
  width: 28px;
  min-width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
}
.directory-footer .icon {
  width: 17px;
  height: 17px;
}
.directory-hidden {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  color: var(--fg-subtle);
  font-size: 11px;
  cursor: pointer;
}
.directory-hidden input {
  margin: 0;
  width: 12px;
  height: 12px;
  accent-color: var(--accent);
}
@media (min-width: 900px) {
  :global(.directory-picker) {
    width: min(540px, calc(100vw - 32px));
  }
  .directory-sidebar {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 144px;
    flex: none;
    min-height: 0;
    max-height: 260px;
    overflow: auto;
    padding: 6px;
    background: var(--bg-overlay);
    overscroll-behavior: contain;
  }
  .directory-sidebar > p {
    margin: 10px 8px;
  }
  .directory-location {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: none;
    min-width: 0;
    padding: 6px 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--fg-subtle);
    font: 12px/1.5 var(--font);
    text-align: left;
    cursor: pointer;
  }
  .directory-location span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .directory-location .icon {
    width: 15px;
    height: 15px;
    flex: none;
  }
  .directory-location[aria-current] {
    background: var(--bg-active);
    color: var(--fg);
  }
  .directory-location:disabled {
    cursor: default;
  }
}
:global(.directory-picker[data-state='open']) {
  animation: directory-in 160ms ease-out;
}
:global(.directory-picker[data-state='closed']) {
  animation: directory-out 130ms ease-in;
}
@keyframes directory-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.97);
  }
}
@keyframes directory-out {
  to {
    opacity: 0;
    transform: translateY(4px) scale(0.97);
  }
}
@media (prefers-reduced-motion: reduce) {
  :global(.directory-picker) {
    animation: none !important;
  }
}
</style>
