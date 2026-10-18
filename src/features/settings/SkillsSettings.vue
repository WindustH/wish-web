<script setup lang="ts">
// Skills: the folders sessions find them in, and every skill found there, in a tree of the folders
// it sits in, each with a box that turns it on and a view of what it says. A folder opens in a
// window of its own (on a phone, a page), and its box turns all of its skills on, or off when they
// all are; a search lists what it finds under its box. The model is told of none of them; it looks
// with `wish skill` in its shell. Folders and switches are part of the configuration draft, saved with
// the rest of settings.
import { computed, ref, watch } from 'vue';
import { CheckboxIndicator, CheckboxRoot, PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui';
import { tr } from '../../core/i18n/tr.ts';
import { skillContent, skillsList } from '../../core/api/endpoints.ts';
import type { SkillContent, SkillEntry, SkillsSnapshot } from '../../core/api/types.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import Markdown from '../../ui/components/Markdown.vue';
import DirectoryPicker from '../../ui/components/DirectoryPicker.vue';
import SwitchRow from './SwitchRow.vue';
import { foldersOf, skillRows, skillsIn, skillTree, type SkillFolder, type SkillRow } from './skillTree.ts';
import { showError } from '../../ui/errorDialog.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SkillList, { type FolderState, type SkillListRow } from './SkillList.vue';
import { useSettingsReturn } from './settingsReturn.ts';

const props = defineProps<{ config: any; busy: boolean; revision: string }>();
const snapshot = ref<SkillsSnapshot | null>(null);
const loading = ref(false);
const query = ref('');
const viewing = ref<SkillContent | null>(null);
const settings = computed<{ dirs: string[]; disabled: string[] }>(() => props.config.skills);

async function load() {
  loading.value = true;
  try { snapshot.value = await skillsList(); }
  catch (error) { showError({ title: tr('无法读取 Skill', 'Could not read skills'), error }); }
  finally { loading.value = false; }
}
// A save may change the folders, so what is in them is read again.
watch(() => props.revision, load, { immediate: true });

const savedDirs = computed(() => snapshot.value?.roots.filter(root => root.source !== 'wish').map(root => root.source) ?? []);
const dirsChanged = computed(() => JSON.stringify(settings.value.dirs) !== JSON.stringify(savedDirs.value));
const missing = (dir: string) => !dirsChanged.value && snapshot.value?.roots.find(root => root.source === dir)?.exists === false;
function addDir(dir: string) {
  if (dir && !settings.value.dirs.includes(dir)) settings.value.dirs.push(dir);
}

const enabled = (name: string) => !settings.value.disabled.includes(name);
function setEnabled(name: string, on: boolean) {
  const disabled = settings.value.disabled;
  const index = disabled.indexOf(name);
  if (on && index >= 0) disabled.splice(index, 1);
  if (!on && index < 0) disabled.push(name);
}
const all = computed(() => snapshot.value?.skills ?? []);
const usable = computed(() => all.value.filter(skill => skill.standing === 'used' && enabled(skill.name)).length);

const isMobile = useIsMobile();
const searching = computed(() => !!query.value.trim());
const tree = computed(() => skillTree(all.value));
const folders = computed(() => foldersOf(tree.value));
const matches = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/);
  return all.value.filter(skill => terms.every(term => `${skill.name} ${skill.description} ${skill.path}`.toLocaleLowerCase().includes(term)));
});
// The folders opened, the one shown last: a folder in the window opens in its place, and back
// returns to the one it was in.
const stack = ref<string[]>([]);
const current = computed(() => folders.value.get(stack.value.at(-1) ?? '\0'));
const openFolder = (folder: SkillFolder) => { stack.value = [...stack.value, folder.path]; };
const backFolder = () => { stack.value = stack.value.slice(0, -1); };
// On a phone, the system's back goes back a folder, as the page's own back does.
useSettingsReturn(() => isMobile.value && stack.value.length > 0, async () => backFolder());

const skills = (count: number) => tr(`${count} 个 Skill`, `${count} skill${count === 1 ? '' : 's'}`);
const label = (source: string) => source === 'wish' ? tr('Wish 的 Skill 目录', 'Wish\'s skill folder') : source;
// A folder counts the skills in it that sessions can see, a search or not.
function folderState(shown: SkillFolder): FolderState {
  const inside = skillsIn(folders.value.get(shown.path) ?? shown);
  const switchable = inside.filter(skill => skill.standing === 'used');
  const on = switchable.filter(skill => enabled(skill.name)).length;
  const total = switchable.length;
  return {
    switchable, on, total,
    summary: !total ? tr('没有会话能用的 Skill', 'No skill sessions can use')
      : on === total ? skills(total)
      : !on ? tr(`${total} 个 Skill，都已关闭`, `${skills(total)}, all off`)
      : tr(`${total} 个 Skill，开启了 ${on} 个`, `${on} of ${skills(total)} on`),
    // The folder's box: ticked with all of its skills on, a dash with some.
    checked: on === total ? true : on ? 'indeterminate' as const : false,
    conflict: inside.some(skill => skill.standing === 'conflict'),
  };
}
function setFolder(switchable: SkillEntry[], on: boolean) {
  for (const skill of switchable) setEnabled(skill.name, on);
}
// Why a skill sessions can't see is kept out, and where one is when skills come from more than one folder.
function note(skill: SkillEntry): { text: string; warn?: boolean } | undefined {
  if (skill.standing === 'conflict') {
    const others = all.value.filter(other => other.name === skill.name && other.source === skill.source && other.dir !== skill.dir).map(other => other.path);
    return { warn: true, text: tr(`与同一目录下的 ${others.join('、')} 重名，都不会被使用`, `Shares its name with ${others.join(', ')} in the same folder, so neither is used`) };
  }
  if (skill.standing === 'shadowed') {
    const first = all.value.find(other => other.name === skill.name)!;
    return { text: first.source === 'wish' ? tr('被 Wish 的 Skill 目录中的同名 Skill 覆盖', 'Hidden by the skill of this name in Wish\'s skill folder')
      : tr(`被 ${first.source} 中的同名 Skill 覆盖`, `Hidden by the skill of this name in ${first.source}`) };
  }
  return (snapshot.value?.roots.length ?? 0) > 1 ? { text: label(skill.source) } : undefined;
}
const decorate = (rows: SkillRow[]): SkillListRow[] => rows.map(row => row.kind === 'folder'
  ? { folder: row.folder, key: `folder:${row.folder.path}`, state: folderState(row.folder) }
  : { skill: row.skill, key: `skill:${row.skill.dir}`, note: note(row.skill) });
// Here, the top level; in the window, what the folder holds.
const rows = computed(() => decorate(skillRows(tree.value)));
// A search lists what it finds under the box, and leaves the list below as it is.
const searchOpen = ref(false);
watch(query, text => { searchOpen.value = !!text.trim(); });
const found = computed(() => matches.value.slice(0, 50));
function outsideSearch(event: Event) {
  const target = (event as CustomEvent).detail?.originalEvent?.target;
  if (target instanceof Element && target.closest('.skill-search')) event.preventDefault();
}
// From the keyboard: down or Tab from the box goes into what it found, up and down move through
// them, and Escape comes back to the box.
const searchInput = ref<HTMLInputElement | null>(null);
const resultButtons = () => [...document.querySelectorAll<HTMLElement>('#skill-results button')];
function intoResults(event: KeyboardEvent) {
  const first = resultButtons()[0];
  if (!searchOpen.value || !searching.value || !first || event.shiftKey) return;
  event.preventDefault();
  first.focus();
}
// Escape puts the results away, and only them: the settings around stay open.
function closeSearch(event: KeyboardEvent) {
  if (!searchOpen.value || !searching.value) return;
  event.preventDefault();
  event.stopPropagation();
  // Back in the box first: its focus opens the results, which then close.
  searchInput.value?.focus();
  searchOpen.value = false;
}
function moveInResults(event: KeyboardEvent) {
  const buttons = resultButtons(), at = buttons.indexOf(document.activeElement as HTMLElement);
  if (event.key === 'Escape') return closeSearch(event);
  const to = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 : -2;
  if (to === -2) return;
  event.preventDefault();
  if (to < 0) searchInput.value?.focus(); else buttons[Math.min(to, buttons.length - 1)]?.focus();
}
const folderRows = computed(() => current.value ? decorate(skillRows(current.value)) : []);

async function view(skill: SkillEntry) {
  try { viewing.value = await skillContent(skill.name, skill.dir); }
  catch (error) { showError({ title: tr('无法读取这个 Skill', 'Could not read this skill'), error }); }
}
</script>

<template>
  <section class="set-section">
    <div class="set-card"><SwitchRow v-model="config.defaults.tools.skills" :name="tr('新会话默认启用', 'On for new sessions')" :hint="config.defaults.tools.shell ? tr('每个会话也可以在会话设置里单独开关', 'Each session can switch it in its own settings') : tr('目前需要 Shell，而新会话默认不开启 Shell', 'Needs the shell for now, which new sessions start without')" /></div>
  </section>
  <section class="set-section">
    <header class="set-section-head"><h3>{{ tr('Skill 目录', 'Skill folders') }}</h3></header>
    <div class="skill-list">
      <div class="set-card"><div class="set-row toggle-row skill-folder">
        <span class="set-label"><span>{{ tr('Wish 的 Skill 目录', 'Wish\'s skill folder') }}</span><small class="set-mono">{{ snapshot?.dir ?? '…' }}</small></span>
      </div></div>
      <div v-for="(dir, index) in settings.dirs" :key="dir" class="set-card"><div class="set-row toggle-row skill-folder">
        <span class="set-label"><span class="set-mono">{{ dir }}</span><small v-if="missing(dir)" class="skill-missing">{{ tr('这个目录不存在', 'This folder does not exist') }}</small></span>
        <button type="button" class="btn ghost icon-only" :aria-label="tr('移除这个目录', 'Remove this folder')" :disabled="busy" @click="settings.dirs.splice(index, 1)"><Icon name="trash-2" /></button>
      </div></div>
      <DirectoryPicker model-value="~" side="bottom" :title="tr('选择 Skill 目录', 'Choose a skill folder')" :disabled="busy" @update:model-value="addDir">
        <template #trigger><button type="button" class="provider-add" :disabled="busy"><span class="provider-add-icon"><Icon name="plus" /></span><span>{{ tr('添加目录', 'Add a folder') }}</span></button></template>
      </DirectoryPicker>
    </div>
    <p v-if="dirsChanged" class="hint skill-pending">{{ tr('保存后会读取修改后的目录。', 'Changed folders are read once saved.') }}</p>
  </section>

  <section class="set-section">
    <header class="set-section-head skill-head">
      <div>
        <h3>{{ tr('Skill', 'Skills') }}</h3>
        <p v-if="snapshot">{{ tr(`找到 ${all.length} 个，会话可用 ${usable} 个。点开可以查看内容。`, `${all.length} found, ${usable} available to sessions. Open one to read it.`) }}</p>
      </div>
      <button type="button" class="btn ghost icon-only" :aria-label="tr('重新读取', 'Read again')" :disabled="loading" @click="load"><Icon name="refresh-cw" :class="{ spin: loading }" /></button>
    </header>
    <PopoverRoot v-if="all.length > 8" :open="searchOpen && searching" @update:open="searchOpen = $event">
      <PopoverAnchor as-child>
        <label class="skill-search"><Icon name="search" /><input ref="searchInput" v-model="query" type="search" :placeholder="tr('搜索 Skill', 'Search skills')" :aria-label="tr('搜索 Skill', 'Search skills')" autocomplete="off" spellcheck="false"
          :aria-expanded="searchOpen && searching" aria-controls="skill-results"
          @focus="searchOpen = true" @click="searchOpen = true" @keydown.escape="closeSearch" @keydown.down="intoResults" @keydown.tab="intoResults" /></label>
      </PopoverAnchor>
      <PopoverPortal>
        <PopoverContent class="skill-results" side="bottom" align="start" :side-offset="6" :collision-padding="12" @open-auto-focus.prevent @close-auto-focus.prevent @interact-outside="outsideSearch" @keydown="moveInResults">
          <!-- reka names the popover itself; this names what the box controls. -->
          <div id="skill-results" class="skill-results-list">
          <p v-if="!found.length" class="skill-results-empty">{{ tr('没有匹配的 Skill。', 'No skill matches.') }}</p>
          <div v-for="skill in found" :key="skill.dir" class="skill-result" :class="{ off: skill.standing !== 'used' || !enabled(skill.name) }">
            <button type="button" class="skill-result-open" @click="view(skill)">
              <span class="skill-result-name">{{ skill.name }}</span>
              <small>{{ [skill.category, skill.description].filter(Boolean).join(' · ') }}</small>
            </button>
            <CheckboxRoot v-if="skill.standing === 'used'" :model-value="enabled(skill.name)" class="skill-check" :aria-label="skill.name" :disabled="busy"
              @update:model-value="setEnabled(skill.name, $event === true)"><CheckboxIndicator class="skill-check-mark"><Icon name="check" /></CheckboxIndicator></CheckboxRoot>
          </div>
          <p v-if="matches.length > found.length" class="skill-results-empty">{{ tr(`还有 ${matches.length - found.length} 个，再多输入一些来缩小范围`, `${matches.length - found.length} more; type more to narrow it down`) }}</p>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <div class="skill-list skill-tree">
      <p v-if="!snapshot" class="skill-empty">{{ loading ? tr('正在读取…', 'Reading…') : tr('没有读取到 Skill。', 'Skills could not be read.') }}</p>
      <p v-else-if="!all.length" class="skill-empty">{{ tr('还没有 Skill。把 Skill 文件夹（每个里面有一个 SKILL.md）放进上面的目录即可，也可以按类别放在子文件夹里。', 'No skills yet. Put skill folders, each holding a SKILL.md, in a folder above, in subfolders by kind if you like.') }}</p>
      <SkillList :rows="rows" :busy="busy" :enabled="enabled" @open="openFolder" @view="view" @set-folder="setFolder" @set-skill="setEnabled" />
    </div>
    <div v-if="snapshot?.problems.length" class="skill-problems" role="status">
      <p>{{ tr('这些文件读取失败：', 'These files could not be read:') }}</p>
      <p v-for="problem in snapshot.problems" :key="problem.path"><span class="set-mono">{{ problem.path }}</span> · {{ problem.message }}</p>
    </div>
  </section>

  <Modal :open="!!current" :page="isMobile" wide :content-class="isMobile ? 'mobile-settings-page' : undefined" :title="current?.name ?? ''" :back="stack.length > 1 ? backFolder : undefined" @close="stack = []">
    <template v-if="current" #actions>
      <CheckboxRoot v-if="folderState(current).total" :model-value="folderState(current).checked" class="skill-check" :aria-label="tr(`开启 ${current.name} 中的全部 Skill`, `Turn on every skill in ${current.name}`)" :disabled="busy"
        @update:model-value="setFolder(folderState(current!).switchable, $event === true)"><CheckboxIndicator class="skill-check-mark"><Icon :name="folderState(current).checked === 'indeterminate' ? 'minus' : 'check'" /></CheckboxIndicator></CheckboxRoot>
    </template>
    <div class="skill-list skill-tree"><SkillList :rows="folderRows" :busy="busy" :enabled="enabled" @open="openFolder" @view="view" @set-folder="setFolder" @set-skill="setEnabled" /></div>
  </Modal>

  <Modal :open="!!viewing" wide :layer="72" :title="viewing?.name ?? ''" @close="viewing = null">
    <div v-if="viewing" class="skill-view">
      <p v-if="viewing.description" class="skill-view-description">{{ viewing.description }}</p>
      <dl class="skill-view-meta">
        <dt>{{ tr('位置', 'Folder') }}</dt><dd class="set-mono">{{ viewing.dir }}</dd>
        <template v-if="viewing.files.length"><dt>{{ tr('文件', 'Files') }}</dt><dd class="set-mono">{{ viewing.files.join(', ') }}<template v-if="viewing.more_files">{{ tr(` 等，另有 ${viewing.more_files} 个`, `, and ${viewing.more_files} more`) }}</template></dd></template>
      </dl>
      <Markdown class="skill-view-body" :text="viewing.body" />
    </div>
  </Modal>
</template>

<style scoped>
.skill-folder .set-label > .set-mono, .skill-folder small.set-mono { overflow-wrap: anywhere; }
.skill-missing { color: var(--warn); }
/* Folders and skills are found and added, so each is a card of its own, not a row of a fixed form. */
.skill-list { display: grid; gap: 10px; }
.skill-list.skill-tree { gap: 8px; }
.skill-pending { margin: 8px 4px 0; }
.skill-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.skill-head .btn .icon { width: 16px; height: 16px; }
.skill-search { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 0 12px; height: 40px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--bg-raised); color: var(--fg-subtle); }
.skill-search:focus-within { border-color: var(--accent); }
.skill-search .icon { width: 16px; height: 16px; flex: none; }
.skill-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--fg); font: inherit; }
.skill-empty { margin: 0; padding: 18px 16px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--fg-subtle); font-size: 13px; text-align: center; }
/* What a search finds: a menu's surface under the box, as wide as it. The popover's own root takes
   this component's scope, not the element given the class, so the rule is global. */
:global(.skill-results) { z-index: 75; display: grid; gap: 2px; width: var(--reka-popper-anchor-width); max-height: min(360px, 60dvh); overflow-y: auto; padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-overlay); box-shadow: var(--shadow-menu); animation: menu-in var(--dur-fast) var(--ease-out); }
.skill-results-list { display: contents; }
.skill-results-empty { margin: 0; padding: 14px; color: var(--fg-subtle); font-size: 13px; text-align: center; }
.skill-result { display: flex; align-items: center; gap: 10px; padding: 6px 10px 6px 4px; border-radius: 8px; }
@media (hover: hover) { .skill-result:hover { background: var(--bg-hover); } }
.skill-result-open { display: grid; gap: 2px; flex: 1; min-width: 0; padding: 2px 6px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.skill-result-name { font-family: var(--mono); font-size: 13px; overflow-wrap: anywhere; }
.skill-result-open small { overflow: hidden; color: var(--fg-subtle); font-size: 12px; white-space: nowrap; text-overflow: ellipsis; }
.skill-result.off .skill-result-open { opacity: .55; }
@media (max-width: 899px) { .skill-empty { border-radius: 16px; } }
.skill-problems { margin-top: 10px; padding: 10px 14px; border-radius: 10px; background: var(--warn-bg); color: var(--fg-muted); font-size: 12.5px; line-height: 1.6; }
.skill-problems p { margin: 0; overflow-wrap: anywhere; }
.skill-view { display: grid; gap: 14px; }
.skill-view-description { margin: 0; color: var(--fg-muted); line-height: 1.7; }
.skill-view-meta { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 14px; margin: 0; padding: 12px 14px; border-radius: 10px; background: var(--bg-sunken); font-size: 12.5px; }
.skill-view-meta dt { color: var(--fg-subtle); }
.skill-view-meta dd { margin: 0; overflow-wrap: anywhere; }
.skill-view-body { min-width: 0; }
@media (max-width: 899px) {
  .skill-search { border: 0; border-radius: 14px; background: var(--bg-group); }
}
</style>
