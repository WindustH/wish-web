<script setup lang="ts">
// Choosing sessions: a searchable list with a box to tick per session, for a group's members,
// leaving out the sessions `excluded` names. In a flex column it takes the height left, its list
// scrolling within it, as on a phone's page.
import { computed, onMounted, ref } from 'vue';
import * as api from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';
import Icon from '../../ui/components/Icon.vue';
import Spinner from '../../ui/components/Spinner.vue';
import { modelLabel } from '../../ui/modelLabel.ts';

const props = defineProps<{ excluded?: string[] }>();
const chosen = defineModel<string[]>({ required: true });
const rows = ref<{ id: string; name: string; model: string; provider: string }[]>([]);
const loading = ref(true);
const failed = ref(false);
const query = ref('');
onMounted(async () => {
  try {
    const page = await api.sessionsList({ limit: 200, order: 'desc' });
    rows.value = page.items.map(item => ({ id: item.id, name: sessionTitle(item), model: item.model, provider: item.provider }));
  } catch { failed.value = true; }
  finally { loading.value = false; }
});
const shown = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/);
  return rows.value
    .filter(row => !props.excluded?.includes(row.id))
    .filter(row => terms.every(term => `${row.name} ${row.model} ${row.id}`.toLocaleLowerCase().includes(term)));
});
function toggle(id: string) {
  chosen.value = chosen.value.includes(id) ? chosen.value.filter(item => item !== id) : [...chosen.value, id];
}
</script>

<template>
  <div class="session-picker">
    <label class="session-picker-search"><Icon name="search" /><input v-model="query" type="search" :placeholder="tr('搜索会话', 'Search sessions')" autocomplete="off" spellcheck="false" /></label>
    <div class="session-picker-list" role="listbox" aria-multiselectable="true">
      <p v-if="loading" class="session-picker-empty"><Spinner /></p>
      <p v-else-if="failed" class="session-picker-empty">{{ tr('无法读取会话列表。', 'Could not read the sessions.') }}</p>
      <p v-else-if="!shown.length" class="session-picker-empty">{{ rows.length ? tr('没有匹配的会话。', 'No session matches.') : tr('还没有会话。', 'No sessions yet.') }}</p>
      <button v-for="row in shown" :key="row.id" type="button" class="session-picker-row" role="option" :aria-selected="chosen.includes(row.id)" @click="toggle(row.id)">
        <span class="session-picker-check" aria-hidden="true"><Icon v-if="chosen.includes(row.id)" name="check" /></span>
        <span class="session-picker-text"><span>{{ row.name }}</span><small>{{ modelLabel(row.model) || row.model }}</small></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.session-picker { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.session-picker-search { display: flex; flex: none; align-items: center; gap: 8px; padding: 0 12px; height: 38px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--bg-raised); color: var(--fg-subtle); }
.session-picker-search:focus-within { border-color: var(--accent); }
.session-picker-search .icon { width: 15px; height: 15px; flex: none; }
.session-picker-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--fg); font: inherit; }
.session-picker-list { display: grid; align-content: start; max-height: min(44dvh, 360px); overflow: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); }
.session-picker-empty { display: flex; justify-content: center; margin: 0; padding: 20px; color: var(--fg-subtle); font-size: 13px; }
.session-picker-row { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.session-picker-row + .session-picker-row { border-top: 1px solid var(--line); }
@media (hover: hover) { .session-picker-row:hover { background: var(--bg-hover); } }
.session-picker-check { display: grid; place-items: center; flex: none; width: 18px; height: 18px; border: 1px solid var(--line-strong); border-radius: 5px; color: var(--accent-fg); }
.session-picker-row[aria-selected='true'] .session-picker-check { background: var(--accent); border-color: var(--accent); }
.session-picker-check .icon { width: 13px; height: 13px; }
.session-picker-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.session-picker-text span { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-picker-text small { color: var(--fg-subtle); font-size: 12px; }
@media (max-width: 899px) {
  .session-picker { flex: 1; }
  .session-picker-list { flex: 1; min-height: 132px; max-height: none; }
}
</style>
