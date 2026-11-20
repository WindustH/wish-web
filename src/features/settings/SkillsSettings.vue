<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { CheckboxIndicator, CheckboxRoot, PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui';
import { tr } from '../../core/i18n/tr.ts';
import { skillContent, skillsList } from '../../core/api/endpoints.ts';
import type { SkillContent, SkillEntry, SkillsSnapshot } from '../../core/api/types.ts';
import Icon from '../../ui/components/Icon.vue';
import { useRoute, useRouter } from 'vue-router';
import { skillBrowserPath } from '../shell/settingsNavigation.ts';
import Markdown from '../../domain/references/ReferenceMarkdown.vue';
import DirectoryPicker from '../../ui/components/DirectoryPicker.vue';
import SwitchRow from '../../domain/settings/SwitchRow.vue';
import { foldersOf, skillRows, skillsIn, skillTree, type SkillFolder, type SkillRow } from './skillTree.ts';
import { showError } from '../../ui/errorDialog.ts';
import SkillList, { type FolderState, type SkillListRow } from './SkillList.vue';

const props = defineProps<{ config: any; busy: boolean; revision: string }>();
const snapshot = ref<SkillsSnapshot | null>(null);
const loading = ref(false);
const query = ref('');
const route = useRoute();
const router = useRouter();
const managingFolders = computed(() => route.query.section === 'skills' && route.query.advanced === 'folders');
const browsing = computed(() => route.query.section === 'skills' && route.query.advanced === 'browse');
const folderPath = computed(() => (browsing.value && typeof route.query.folder === 'string' ? route.query.folder : ''));
const detailName = computed(() => (browsing.value && typeof route.query.skill === 'string' ? route.query.skill : ''));
const detailPending = ref(false);
const viewing = ref<SkillContent | null>(null);
const settings = computed<{ dirs: string[]; disabled: string[] }>(() => props.config.skills);

let loadingRequest: AbortController | undefined;
let viewingRequest: AbortController | undefined;
onBeforeUnmount(() => {
  loadingRequest?.abort();
  viewingRequest?.abort();
});
async function load() {
  loadingRequest?.abort();
  const request = (loadingRequest = new AbortController());
  loading.value = true;
  try {
    const result = await skillsList({ signal: request.signal });
    if (!request.signal.aborted) snapshot.value = result;
  } catch (error) {
    if (!request.signal.aborted) showError({ title: tr('无法读取 Skill', 'Could not read skills'), error });
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
// A save may change the folders, so what is in them is read again.
watch(() => props.revision, load, { immediate: true });

const savedDirs = computed(
  () => snapshot.value?.roots.filter((root) => root.source !== 'wish').map((root) => root.source) ?? [],
);
const dirsChanged = computed(() => JSON.stringify(settings.value.dirs) !== JSON.stringify(savedDirs.value));
const missing = (dir: string) =>
  !dirsChanged.value && snapshot.value?.roots.find((root) => root.source === dir)?.exists === false;
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
const usable = computed(() => all.value.filter((skill) => skill.standing === 'used' && enabled(skill.name)).length);

const searching = computed(() => !!query.value.trim());
const tree = computed(() => skillTree(all.value));
const folders = computed(() => foldersOf(tree.value));
const matches = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/);
  return all.value.filter((skill) =>
    terms.every((term) => `${skill.name} ${skill.description} ${skill.path}`.toLocaleLowerCase().includes(term)),
  );
});
const current = computed(() => (folderPath.value ? folders.value.get(folderPath.value) : undefined));
function openFolder(folder: SkillFolder) {
  void router.push(skillBrowserPath(folder.path));
}

const skills = (count: number) => tr(`${count} 个 Skill`, `${count} skill${count === 1 ? '' : 's'}`);
// A folder counts the skills in it that sessions can see, a search or not.
function folderState(shown: SkillFolder): FolderState {
  const inside = skillsIn(folders.value.get(shown.path) ?? shown);
  const switchable = inside.filter((skill) => skill.standing === 'used');
  const on = switchable.filter((skill) => enabled(skill.name)).length;
  const total = switchable.length;
  return {
    switchable,
    on,
    total,
    summary: !total
      ? tr('没有会话能用的 Skill', 'No skill sessions can use')
      : on === total
        ? skills(total)
        : !on
          ? tr(`${total} 个 Skill，都已关闭`, `${skills(total)}, all off`)
          : tr(`${total} 个 Skill，开启了 ${on} 个`, `${on} of ${skills(total)} on`),
    // The folder's box: ticked with all of its skills on, a dash with some.
    checked: on === total ? true : on ? ('indeterminate' as const) : false,
    conflict: inside.some((skill) => skill.standing === 'conflict'),
  };
}
function setFolder(switchable: SkillEntry[], on: boolean) {
  for (const skill of switchable) setEnabled(skill.name, on);
}
// Why a skill sessions can't see is kept out, and where one is when skills come from more than one folder.
function note(skill: SkillEntry): { text: string; warn?: boolean } | undefined {
  if (skill.standing === 'conflict') {
    const others = all.value
      .filter((other) => other.name === skill.name && other.source === skill.source && other.dir !== skill.dir)
      .map((other) => other.path);
    return {
      warn: true,
      text: tr(
        `与同一目录下的 ${others.join('、')} 重名，都不会被使用`,
        `Shares its name with ${others.join(', ')} in the same folder, so neither is used`,
      ),
    };
  }
  if (skill.standing === 'shadowed') {
    const first = all.value.find((other) => other.name === skill.name)!;
    return {
      text:
        first.source === 'wish'
          ? tr('被 Wish 的 Skill 目录中的同名 Skill 覆盖', "Hidden by the skill of this name in Wish's skill folder")
          : tr(`被 ${first.source} 中的同名 Skill 覆盖`, `Hidden by the skill of this name in ${first.source}`),
    };
  }
  return undefined;
}
const decorate = (rows: SkillRow[]): SkillListRow[] =>
  rows.map((row) =>
    row.kind === 'folder'
      ? { folder: row.folder, key: `folder:${row.folder.path}`, state: folderState(row.folder) }
      : { skill: row.skill, key: `skill:${row.skill.dir}`, note: note(row.skill) },
  );
// Here, the top level; in the window, what the folder holds.
const rows = computed(() => decorate(skillRows(tree.value)));
// A search lists what it finds under the box, and leaves the list below as it is.
const searchOpen = ref(false);
const found = computed(() => matches.value.slice(0, 50));
function outsideSearch(event: Event) {
  const target = (event as CustomEvent).detail?.originalEvent?.target;
  if (target instanceof Element && target.closest('.skill-search')) event.preventDefault();
}
// From the keyboard: down or Tab from the box goes into what it found, up and down move through
// them, and Escape comes back to the box.
const searchInput = ref<HTMLInputElement | null>(null);
// The settings page owns the return target across desktop/mobile dialog remounts.
const searchReturn = defineModel<string>('searchReturn', { default: '' });
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
  const buttons = resultButtons(),
    at = buttons.indexOf(document.activeElement as HTMLElement);
  if (event.key === 'Escape') return closeSearch(event);
  const to = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 : -2;
  if (to === -2) return;
  event.preventDefault();
  if (to < 0) searchInput.value?.focus();
  else buttons[Math.min(to, buttons.length - 1)]?.focus();
}
const folderRows = computed(() => (current.value ? decorate(skillRows(current.value)) : []));

function view(skill: SkillEntry, fromSearch = false) {
  searchReturn.value = fromSearch ? query.value : '';
  searchOpen.value = false;
  void router.push(skillBrowserPath(folderPath.value, skill));
}
watch(
  [detailName, () => route.query.dir],
  async ([name, dir], _, onCleanup) => {
    viewing.value = null;
    detailPending.value = false;
    if (!name || typeof dir !== 'string') return;
    const request = (viewingRequest = new AbortController());
    detailPending.value = true;
    onCleanup(() => request.abort());
    try {
      const result = await skillContent(name, dir, { signal: request.signal });
      if (!request.signal.aborted) viewing.value = result;
    } catch (error) {
      if (!request.signal.aborted) showError({ title: tr('无法读取这个 Skill', 'Could not read this skill'), error });
    } finally {
      if (!request.signal.aborted) detailPending.value = false;
    }
  },
  { immediate: true },
);
watch(
  [detailName, searchInput],
  ([name, input]) => {
    if (browsing.value && !name && input && searchReturn.value) {
      query.value = searchReturn.value;
      searchReturn.value = '';
      input.parentElement?.focus({ preventScroll: true });
    }
  },
  { flush: 'post' },
);
function resetSearch() {
  query.value = '';
  searchOpen.value = false;
}
watch(browsing, (open) => {
  if (!open) resetSearch();
});
onDeactivated(resetSearch);
</script>

<template>
  <template v-if="!browsing && !managingFolders">
    <section class="set-section">
      <div class="set-card">
        <SwitchRow
          v-model="config.defaults.tools.skills"
          :name="tr('新会话默认启用', 'On for new sessions')"
          :hint="
            config.defaults.tools.shell
              ? ''
              : tr(
                  '目前需要 Shell，而新会话默认不开启 Shell',
                  'Needs the shell for now, which new sessions start without',
                )
          "
        />
      </div>
    </section>
    <section class="set-section">
      <div class="set-card">
        <div class="set-row inline">
          <span class="settings-link-label"><Icon name="folder" />{{ tr('Skill 目录', 'Skill folders') }}</span>
          <button
            type="button"
            class="btn settings-page-link skill-folders-open"
            @click="router.push('/settings?section=skills&advanced=folders')"
          >
            {{ tr('管理目录', 'Manage folders') }}<Icon name="arrow-up-right" :size="15" />
          </button>
        </div>
      </div>
    </section>

    <section class="set-section">
      <div class="set-card">
        <div class="set-row inline">
          <span class="settings-link-label">
            <Icon name="skill" />
            <span class="set-label"
              >Skill<small v-if="snapshot">{{
                tr(`找到 ${all.length} 个，会话可用 ${usable} 个`, `${all.length} found, ${usable} available`)
              }}</small></span
            >
          </span>
          <button class="btn settings-page-link" type="button" @click="router.push(skillBrowserPath())">
            {{ tr('浏览 Skill', 'Browse skills') }}<Icon name="arrow-up-right" :size="15" />
          </button>
        </div>
      </div>
    </section>
  </template>
  <section v-else-if="managingFolders" class="set-section">
    <header class="set-section-head skill-path-heading">
      <DirectoryPicker
        model-value="~"
        side="bottom"
        :title="tr('选择 Skill 目录', 'Choose a skill folder')"
        :disabled="busy"
        @update:model-value="addDir"
      >
        <template #trigger
          ><button type="button" class="btn ghost sm skill-path-add" :disabled="busy">
            <Icon name="plus" :size="16" /><span>{{ tr('添加目录', 'Add a folder') }}</span>
          </button></template
        >
      </DirectoryPicker>
    </header>
    <ul class="skill-path-list" :aria-label="tr('Skill 目录', 'Skill folders')">
      <li class="skill-path-row">
        <span class="skill-path" :title="snapshot?.dir">{{ snapshot?.dir ?? '…' }}</span>
        <span class="skill-path-default">{{ tr('默认', 'Default') }}</span>
      </li>
      <li v-for="(dir, index) in settings.dirs" :key="dir" class="skill-path-row">
        <div class="skill-path-text">
          <span class="skill-path" :title="dir">{{ dir }}</span
          ><small v-if="missing(dir)" class="skill-missing">{{
            tr('这个目录不存在', 'This folder does not exist')
          }}</small>
        </div>
        <button
          type="button"
          class="btn ghost icon-only settings-delete"
          :aria-label="tr(`移除目录 ${dir}`, `Remove folder ${dir}`)"
          :disabled="busy"
          @click="settings.dirs.splice(index, 1)"
        >
          <Icon name="trash-2" />
        </button>
      </li>
    </ul>
    <p v-if="dirsChanged" class="hint skill-pending">
      {{ tr('保存后会读取修改后的目录。', 'Changed folders are read once saved.') }}
    </p>
  </section>
  <section v-else-if="!detailName" class="skill-browser">
    <template v-if="!current">
      <div class="skill-browser-actions">
        <PopoverRoot :open="searchOpen && searching" @update:open="searchOpen = $event">
          <PopoverAnchor as-child>
            <div class="skill-search" tabindex="-1">
              <Icon name="search" /><input
                ref="searchInput"
                v-model="query"
                type="search"
                :placeholder="tr('搜索 Skill', 'Search skills')"
                :aria-label="tr('搜索 Skill', 'Search skills')"
                autocomplete="off"
                spellcheck="false"
                :aria-expanded="searchOpen && searching"
                aria-controls="skill-results"
                @input="searchOpen = true"
                @focus="searchOpen = true"
                @click="searchOpen = true"
                @keydown.escape="closeSearch"
                @keydown.down="intoResults"
                @keydown.tab="intoResults"
              />
            </div>
          </PopoverAnchor>
          <PopoverPortal>
            <PopoverContent
              class="skill-results popup-palette"
              side="bottom"
              align="start"
              :side-offset="6"
              :collision-padding="12"
              @open-auto-focus.prevent
              @close-auto-focus.prevent
              @interact-outside="outsideSearch"
              @keydown="moveInResults"
            >
              <!-- reka names the popover itself; this names what the box controls. -->
              <div id="skill-results" class="skill-results-list">
                <p v-if="!found.length" class="skill-results-empty">
                  {{ tr('没有匹配的 Skill。', 'No skill matches.') }}
                </p>
                <div
                  v-for="skill in found"
                  :key="skill.dir"
                  class="skill-result"
                  :class="{ off: skill.standing !== 'used' || !enabled(skill.name) }"
                >
                  <button type="button" class="skill-result-open" @click="view(skill, true)">
                    <span class="skill-result-name">{{ skill.name }}</span>
                    <small>{{ [skill.category, skill.description].filter(Boolean).join(' · ') }}</small>
                  </button>
                  <CheckboxRoot
                    v-if="skill.standing === 'used'"
                    :model-value="enabled(skill.name)"
                    class="skill-check"
                    :aria-label="skill.name"
                    :disabled="busy"
                    @update:model-value="setEnabled(skill.name, $event === true)"
                    ><CheckboxIndicator class="skill-check-mark"><Icon name="check" /></CheckboxIndicator
                  ></CheckboxRoot>
                </div>
                <p v-if="matches.length > found.length" class="skill-results-empty">
                  {{
                    tr(
                      `还有 ${matches.length - found.length} 个，再多输入一些来缩小范围`,
                      `${matches.length - found.length} more; type more to narrow it down`,
                    )
                  }}
                </p>
              </div>
            </PopoverContent>
          </PopoverPortal>
        </PopoverRoot>
        <button
          type="button"
          class="btn ghost icon-only"
          :aria-label="tr('重新读取', 'Read again')"
          :disabled="loading"
          @click="load"
        >
          <Icon name="refresh-cw" :class="{ spin: loading }" />
        </button>
      </div>
      <div class="skill-list skill-tree">
        <p v-if="!snapshot" class="skill-empty">
          {{ loading ? tr('正在读取…', 'Reading…') : tr('没有读取到 Skill。', 'Skills could not be read.') }}
        </p>
        <p v-else-if="!all.length" class="skill-empty">
          {{
            tr(
              '还没有 Skill。把 Skill 文件夹（每个里面有一个 SKILL.md）放进上面的目录即可，也可以按类别放在子文件夹里。',
              'No skills yet. Put skill folders, each holding a SKILL.md, in a folder above, in subfolders by kind if you like.',
            )
          }}
        </p>
        <SkillList
          :rows="rows"
          :busy="busy"
          :enabled="enabled"
          @open="openFolder"
          @view="view"
          @set-folder="setFolder"
          @set-skill="setEnabled"
        />
      </div>
      <div v-if="snapshot?.problems.length" class="skill-problems" role="status">
        <p>{{ tr('这些文件读取失败：', 'These files could not be read:') }}</p>
        <p v-for="problem in snapshot.problems" :key="problem.path">
          <span class="set-mono">{{ problem.path }}</span> · {{ problem.message }}
        </p>
      </div>
    </template>
    <div v-else class="skill-list skill-tree">
      <label v-if="folderState(current).total" class="skill-folder-toggle"
        ><span>{{ tr('启用此目录下的全部 Skill', 'Enable all skills in this folder') }}</span>
        <CheckboxRoot
          v-if="folderState(current!).total"
          :model-value="folderState(current!).checked"
          class="skill-check"
          :aria-label="tr(`开启 ${current.name} 中的全部 Skill`, `Turn on every skill in ${current.name}`)"
          :disabled="busy"
          @update:model-value="setFolder(folderState(current!).switchable, $event === true)"
          ><CheckboxIndicator class="skill-check-mark"
            ><Icon :name="folderState(current!).checked === 'indeterminate' ? 'minus' : 'check'" /></CheckboxIndicator
        ></CheckboxRoot>
      </label>
      <SkillList
        :rows="folderRows"
        :busy="busy"
        :enabled="enabled"
        @open="openFolder"
        @view="view"
        @set-folder="setFolder"
        @set-skill="setEnabled"
      />
    </div>
  </section>
  <section v-else-if="viewing" class="skill-view">
    <p v-if="viewing.description" class="skill-view-description">{{ viewing.description }}</p>
    <dl class="skill-view-meta">
      <dt>{{ tr('位置', 'Folder') }}</dt>
      <dd class="set-mono">{{ viewing.dir }}</dd>
      <template v-if="viewing.files.length"
        ><dt>{{ tr('文件', 'Files') }}</dt>
        <dd class="set-mono">
          {{ viewing.files.join(', ')
          }}<template v-if="viewing.more_files">{{
            tr(` 等，另有 ${viewing.more_files} 个`, `, and ${viewing.more_files} more`)
          }}</template>
        </dd></template
      >
    </dl>
    <Markdown class="skill-view-body" :text="viewing.body" />
  </section>
  <p v-else class="hint" role="status">
    {{ detailPending ? tr('正在读取…', 'Reading…') : tr('无法读取这个 Skill', 'Could not read this skill') }}
  </p>
</template>

<style scoped>
.skill-browser-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.skill-folder-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px;
  margin-bottom: 8px;
  font-size: var(--text-list-secondary);
  color: var(--fg-muted);
}
.skill-path-heading {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.skill-path-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 252px;
  overflow-y: auto;
}
.skill-path-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: var(--text-list-row-height);
  padding: 4px 2px;
}
.skill-path-row + .skill-path-row {
  border-top: 1px solid var(--line);
}
.skill-path-row > .skill-path,
.skill-path-text {
  flex: 1;
  min-width: 0;
}
.skill-path-text {
  display: grid;
  gap: 2px;
}
.skill-path {
  font-size: var(--text-list-size);
  line-height: var(--text-list-leading);
  overflow-wrap: anywhere;
  user-select: text;
}
.skill-path-default {
  color: var(--fg-subtle);
  font-size: 12px;
}
.skill-path-row .btn {
  flex: none;
}
@media (pointer: coarse) {
  .skill-path-add,
  .skill-path-row .btn {
    min-height: 44px;
    min-width: 44px;
  }
}
.skill-missing {
  color: var(--warn);
}
.skill-pending {
  margin: 8px 4px 0;
}
.skill-search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  padding: 0 8px;
  height: 36px;
  border-bottom: 1px solid var(--line-strong);
  color: var(--fg-subtle);
}
.skill-search:focus-within {
  border-bottom-color: var(--accent);
}
@media (pointer: coarse), (max-width: 899px) {
  .skill-search {
    height: 44px;
  }
}
.skill-search .icon {
  width: 16px;
  height: 16px;
  flex: none;
}
.skill-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--fg);
  font: inherit;
  font-size: max(13px, 1em);
}
.skill-empty {
  margin: 0;
  padding: 18px 16px;
  border: 1px dashed var(--line-strong);
  border-radius: 12px;
  color: var(--fg-subtle);
  font-size: 13px;
  text-align: center;
}
/* What a search finds: a menu's surface under the box, as wide as it. The popover's own root takes
   this component's scope, not the element given the class, so the rule is global. */
:global(.skill-results) {
  z-index: 75;
  display: grid;
  gap: 2px;
  width: var(--reka-popper-anchor-width);
  max-height: min(360px, 60dvh);
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-overlay);
  box-shadow: var(--shadow-menu);
  animation: menu-in var(--dur-fast) var(--ease-out);
}
.skill-results-list {
  display: contents;
}
.skill-results-empty {
  margin: 0;
  padding: 14px;
  color: var(--fg-subtle);
  font-size: 13px;
  text-align: center;
}
.skill-result {
  min-height: var(--text-list-row-height);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 6px 4px;
  border-radius: 8px;
}
@media (hover: hover) {
  .skill-result:hover {
    background: var(--bg-hover);
  }
}
.skill-result-open {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.skill-result-name {
  font: 500 var(--text-list-size)/var(--text-list-leading) var(--font);
  overflow-wrap: anywhere;
}
.skill-result-open small {
  line-height: var(--text-list-leading);
  overflow: hidden;
  color: var(--fg-subtle);
  font-size: var(--text-list-secondary);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.skill-result.off .skill-result-open {
  opacity: 0.55;
}
@media (max-width: 899px) {
  .skill-empty {
    border-radius: 16px;
  }
}
.skill-problems {
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--warn-bg);
  color: var(--fg-muted);
  font-size: 12.5px;
  line-height: 1.6;
}
.skill-problems p {
  margin: 0;
  overflow-wrap: anywhere;
}
.skill-view {
  display: grid;
  gap: 14px;
}
.skill-view-description {
  margin: 0;
  color: var(--fg-muted);
  line-height: 1.7;
}
.skill-view-meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 14px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg-sunken);
  font-size: 12.5px;
}
.skill-view-meta dt {
  color: var(--fg-subtle);
}
.skill-view-meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.skill-view-body {
  min-width: 0;
}
@media (max-width: 899px) {
  .skill-search {
    border: 0;
    border-radius: 14px;
    background: var(--bg-group);
  }
}
</style>
