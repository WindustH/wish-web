<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Monitor, Server, Network, Search, X, ChevronDown } from '@lucide/vue';
import ConfigEditor from './ConfigEditor.vue';
import UiSettings from './UiSettings.vue';
import { fieldHint, fieldLabel, tr } from './fields';
import { configEditors, errorText, pointer } from '../../core/config-editor';
import type { ConfigOwner, Json } from '../../core/config-editor';
import './settings.css';

const tab = ref('ui');
const coreEditor = ref<InstanceType<typeof ConfigEditor>>();
const providerEditor = ref<InstanceType<typeof ConfigEditor>>();
const scroll = ref<HTMLElement>();
const panels = ref<HTMLElement>();
const query = ref('');
const categories = computed(() => [
  { id: 'ui', label: tr('界面', 'Interface'), icon: Monitor },
  { id: 'wishd', label: tr('核心', 'Core'), icon: Server },
  { id: 'providerd', label: tr('提供商', 'Provider'), icon: Network },
]);
type Match = { owner: string; id: string; label: string; hint: string; section: string; path?: string[] };
const matches = ref<Match[]>([]);
const pendingSearch = computed(() => Object.values(configEditors).some(editor => editor.busy.value && !editor.draft.value));
const searchErrors = computed(() => categories.value.filter(category => category.id !== 'ui').flatMap(category => {
  const error = configEditors[category.id as 'wishd' | 'providerd'].error.value;
  return error ? [`${category.label}: ${errorText(error)}`] : [];
}));
const searching = computed(() => !!query.value.trim());
let observer: MutationObserver;
let frame = 0;
function search() {
  frame = 0;
  const words = query.value.toLocaleLowerCase().trim().split(/\s+/);
  const found: Match[] = [];
  if (searching.value) for (const panel of panels.value!.querySelectorAll<HTMLElement>('[data-settings-panel]')) {
    const owner = panel.dataset.settingsPanel!;
    if (owner !== 'ui') continue;
    for (const field of panel.querySelectorAll<HTMLElement>('.cfg-field, .setting-row')) {
      const control = field.querySelector<HTMLElement>('input[id], select[id], button[id], a');
      const label = field.querySelector('label')?.textContent?.trim() || field.querySelector('.setting-row > div > span')?.textContent?.trim();
      if (!label || !control) continue;
      const hint = field.querySelector('.cfg-hint')?.textContent?.trim() || '';
      const section = field.closest('.cfg-section')?.querySelector('h2')?.textContent?.trim() || '';
      const groups: string[] = [];
      for (let parent = field.parentElement; parent && parent !== panel; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS') groups.unshift(parent.querySelector(':scope > summary')!.textContent!.trim());
      }
      const context = [section, ...groups].join(' · ');
      const category = categories.value.find(c => c.id === owner)!.label;
      if (words.every(word => `${category} ${context} ${label} ${hint} ${control.id}`.toLocaleLowerCase().includes(word))) {
        // Only labels, explanations and field paths are indexed; credential values are never searched.
        found.push({ owner, id: control.id, label, hint, section: context });
      }
    }
  }
  if (searching.value) for (const owner of ['wishd', 'providerd'] as ConfigOwner[]) {
    const draft = configEditors[owner].draft.value;
    if (!draft) continue;
    const category = categories.value.find(c => c.id === owner)!.label;
    function visit(value: Json, path: string[]) {
      if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
        return;
      }
      const label = fieldLabel(path), hint = fieldHint(path), id = pointer(path);
      const section = path.slice(0, -1).map((_, index) => fieldLabel(path.slice(0, index + 1))).join(' · ');
      // Search schema names and descriptions only, never credential values.
      if (words.every(word => `${category} ${section} ${label} ${hint} ${id}`.toLocaleLowerCase().includes(word))) {
        found.push({ owner, id, label, hint, section, path });
      }
    }
    visit(draft, []);
  }
  matches.value = found;
}
function scheduleSearch() {
  if (searching.value && !frame) frame = requestAnimationFrame(search);
}
watch(() => [configEditors.wishd.draft.value, configEditors.providerd.draft.value], scheduleSearch);
watch(query, async () => { await nextTick(); search(); if (searching.value) scroll.value!.scrollTo({ top: 0, behavior: 'instant' }); });
watch(tab, () => scroll.value!.scrollTo({ top: 0, behavior: 'instant' }), { flush: 'post' });
async function select(match: Match) {
  query.value = '';
  tab.value = match.owner;
  await nextTick();
  if (!document.getElementById(match.id) && match.path) {
    (match.owner === 'wishd' ? coreEditor.value : providerEditor.value)!.revealPath(match.path);
    await nextTick();
  }
  const field = document.getElementById(match.id)!;
  for (let parent = field.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  await nextTick();
  field.focus({ preventScroll: true });
  const row = field.closest('.cfg-field, .setting-row')!;
  const viewport = row.closest<HTMLElement>('.modal-body') || scroll.value!;
  viewport.scrollTo({ top: viewport.scrollTop + row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 20, behavior: 'instant' });
}
onMounted(() => {
  observer = new MutationObserver(scheduleSearch);
  observer.observe(panels.value!, { childList: true, characterData: true, subtree: true });
});
onBeforeUnmount(() => { observer.disconnect(); cancelAnimationFrame(frame); });
</script>

<template>
  <div class="page settings-page">
    <div class="settings-shell">
      <aside class="settings-sidebar">
        <div class="settings-search"><Search :size="16" /><input v-model="query" type="search" :placeholder="tr('搜索配置', 'Search settings')" :aria-label="tr('搜索配置', 'Search settings')" @keydown.esc="query = ''" @keydown.down.prevent="scroll?.querySelector<HTMLButtonElement>('.settings-result')?.focus()" @keydown.enter.prevent="matches.length === 1 ? select(matches[0]!) : scroll?.querySelector<HTMLButtonElement>('.settings-result')?.focus()" /><button v-if="query" type="button" :aria-label="tr('清除搜索', 'Clear search')" @click="query = ''"><X :size="15" /></button></div>
        <nav class="settings-categories" :aria-label="tr('设置分类', 'Settings categories')">
          <div v-for="category in categories" :key="category.id" class="settings-category">
            <button type="button" class="settings-category-button" :data-settings-owner="category.id" :class="{ active: tab === category.id }" :aria-expanded="tab === category.id && !searching" :aria-controls="`settings-contents-${category.id}`" @click="tab = category.id; query = ''"><component :is="category.icon" :size="17" /><span>{{ category.label }}</span><ChevronDown :size="14" /></button>
            <div v-show="tab === category.id && !searching" :id="`settings-contents-${category.id}`" class="settings-subitems" />
          </div>
        </nav>
      </aside>
      <div class="settings-main">
        <div ref="scroll" class="settings-scroll">
          <div v-if="searching" class="settings-results">
            <p v-if="pendingSearch" role="status" class="cfg-hint">{{ tr('正在读取配置…', 'Loading settings…') }}</p>
            <p v-for="error in searchErrors" :key="error" role="alert" class="cfg-notice cfg-error">{{ error }}</p>
            <p v-if="!pendingSearch" role="status" class="cfg-hint">{{ matches.length ? tr(`找到 ${matches.length} 项配置`, `${matches.length} settings found`) : tr('没有匹配的配置。可尝试搜索名称或说明中的关键词。', 'No matching settings. Try a keyword from a name or explanation.') }}</p>
            <button v-for="match in matches" :key="`${match.owner}:${match.id}`" class="settings-result" @click="select(match)"><small>{{ categories.find(c => c.id === match.owner)!.label }} · {{ match.section }}</small><strong>{{ match.label }}</strong><span>{{ match.hint }}</span></button>
          </div>
          <div ref="panels" v-show="!searching" class="settings-panels">
            <div v-if="tab === 'ui' || searching" v-show="tab === 'ui'" data-settings-panel="ui"><UiSettings /></div>
            <div v-if="tab === 'wishd' || searching" v-show="tab === 'wishd'" data-settings-panel="wishd"><ConfigEditor ref="coreEditor" owner="wishd" :active="tab === 'wishd' && !searching" /></div>
            <div v-if="tab === 'providerd' || searching" v-show="tab === 'providerd'" data-settings-panel="providerd"><ConfigEditor ref="providerEditor" owner="providerd" :active="tab === 'providerd' && !searching" /></div>
          </div>
        </div>
        <div id="settings-actions" class="settings-actions" />
      </div>
    </div>
  </div>
</template>
