<script setup lang="ts">
// Skills: the folders sessions find them in, and every skill found there, in a tree of the folders
// it sits in, each with a switch and a view of what it says. A folder's switch turns all of its
// skills on, or off when they all are. The model is told of none of them; it looks with
// `wish skill` in its shell. Folders and switches are part of the configuration draft, saved with
// the rest of settings.
import { computed, ref, watch } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { AnimatePresence, motion } from 'motion-v';
import { tr } from '../../core/i18n/tr.ts';
import { skillContent, skillsList } from '../../core/api/endpoints.ts';
import type { SkillContent, SkillEntry, SkillsSnapshot } from '../../core/api/types.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import Markdown from '../../ui/components/Markdown.vue';
import DirectoryPicker from '../../ui/components/DirectoryPicker.vue';
import SwitchRow from './SwitchRow.vue';
import { foldersOf, skillRows, skillsIn, skillTree, type SkillFolder } from './skillTree.ts';
import { showError } from '../../ui/errorDialog.ts';
import { prefersReducedMotion } from '../../ui/motion/reducedMotion.ts';

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

// Folders closed by hand; a search shows its matches with every folder open.
const closed = ref(new Set<string>());
const searching = computed(() => !!query.value.trim());
const tree = computed(() => skillTree(all.value));
const folders = computed(() => foldersOf(tree.value));
const matches = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/);
  return all.value.filter(skill => terms.every(term => `${skill.name} ${skill.description} ${skill.path}`.toLocaleLowerCase().includes(term)));
});
function fold(folder: SkillFolder) {
  const next = new Set(closed.value);
  if (!next.delete(folder.path)) next.add(folder.path);
  closed.value = next;
}

const skills = (count: number) => tr(`${count} 个 Skill`, `${count} skill${count === 1 ? '' : 's'}`);
const label = (source: string) => source === 'wish' ? tr('Wish 的 Skill 目录', 'Wish\'s skill folder') : source;
// A folder counts the skills in it that sessions can see, a search or not.
function folderState(shown: SkillFolder) {
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
const rows = computed(() => skillRows(searching.value ? skillTree(matches.value) : tree.value, folder => searching.value || !closed.value.has(folder.path))
  .map(row => row.kind === 'folder'
    ? { ...row, key: `folder:${row.folder.path}`, state: folderState(row.folder), skill: undefined, note: undefined }
    : { ...row, key: `skill:${row.skill.dir}`, state: undefined, folder: undefined, note: note(row.skill) }));
const reduced = prefersReducedMotion();

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
    <div class="set-card">
      <div class="set-row toggle-row skill-folder">
        <span class="set-label"><span>{{ tr('Wish 的 Skill 目录', 'Wish\'s skill folder') }}</span><small class="set-mono">{{ snapshot?.dir ?? '…' }}</small></span>
      </div>
      <div v-for="(dir, index) in settings.dirs" :key="dir" class="set-row toggle-row skill-folder">
        <span class="set-label"><span class="set-mono">{{ dir }}</span><small v-if="missing(dir)" class="skill-missing">{{ tr('这个目录不存在', 'This folder does not exist') }}</small></span>
        <button type="button" class="btn ghost icon-only" :aria-label="tr('移除这个目录', 'Remove this folder')" :disabled="busy" @click="settings.dirs.splice(index, 1)"><Icon name="trash-2" /></button>
      </div>
      <div class="set-row skill-add">
        <DirectoryPicker model-value="~" side="bottom" :title="tr('选择 Skill 目录', 'Choose a skill folder')" :disabled="busy" @update:model-value="addDir">
          <template #trigger><button type="button" class="skill-add-button"><span class="provider-add-icon"><Icon name="plus" /></span>{{ tr('添加目录', 'Add a folder') }}</button></template>
        </DirectoryPicker>
      </div>
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
    <label v-if="all.length > 8" class="skill-search"><Icon name="search" /><input v-model="query" type="search" :placeholder="tr('搜索 Skill', 'Search skills')" :aria-label="tr('搜索 Skill', 'Search skills')" autocomplete="off" spellcheck="false" /></label>
    <div class="set-card skill-tree">
      <p v-if="!snapshot" class="skill-empty">{{ loading ? tr('正在读取…', 'Reading…') : tr('没有读取到 Skill。', 'Skills could not be read.') }}</p>
      <p v-else-if="!all.length" class="skill-empty">{{ tr('还没有 Skill。把 Skill 文件夹（每个里面有一个 SKILL.md）放进上面的目录即可，也可以按类别放在子文件夹里。', 'No skills yet. Put skill folders, each holding a SKILL.md, in a folder above, in subfolders by kind if you like.') }}</p>
      <p v-else-if="!rows.length" class="skill-empty">{{ tr('没有匹配的 Skill。', 'No skill matches.') }}</p>
      <AnimatePresence :initial="false">
        <motion.div v-for="row in rows" :key="row.key" class="skill-line" :style="{ '--depth': row.depth }"
          :initial="reduced ? false : { height: 0, opacity: 0 }" :animate="{ height: 'auto', opacity: 1 }" :exit="reduced ? undefined : { height: 0, opacity: 0 }" :transition="{ duration: 0.18, ease: 'easeOut' }">
          <div v-if="row.folder && row.state" class="set-row toggle-row skill-row skill-folder-row">
            <button type="button" class="skill-fold" :aria-expanded="searching || !closed.has(row.folder.path)" :disabled="searching" @click="fold(row.folder)">
              <Icon name="chevron-right" class="skill-chevron" />
              <span class="set-label">
                <span>{{ row.folder.name }}</span>
                <small>{{ row.state.summary }}<template v-if="row.state.conflict"> · <span class="skill-warn">{{ tr('有重名的 Skill', 'Has skills sharing a name') }}</span></template></small>
              </span>
            </button>
            <SwitchRoot v-if="row.state.total" :model-value="row.state.on === row.state.total" class="cfg-switch" :class="{ partial: row.state.on && row.state.on < row.state.total }"
              :aria-label="row.folder.name" :disabled="busy" @update:model-value="setFolder(row.state.switchable, $event)"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot>
          </div>
          <div v-else-if="row.skill" class="set-row toggle-row skill-row" :class="{ off: row.skill.standing !== 'used' || !enabled(row.skill.name) }">
            <button type="button" class="skill-open" @click="view(row.skill)">
              <span class="set-label">
                <span class="skill-name">{{ row.skill.name }}</span>
                <small class="skill-description">{{ row.skill.description }}</small>
                <small v-if="row.note" class="skill-note" :class="{ 'skill-warn': row.note.warn }">{{ row.note.text }}</small>
              </span>
            </button>
            <SwitchRoot v-if="row.skill.standing === 'used'" :model-value="enabled(row.skill.name)" class="cfg-switch" :aria-label="row.skill.name" :disabled="busy" @update:model-value="setEnabled(row.skill!.name, $event)"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
    <div v-if="snapshot?.problems.length" class="skill-problems" role="status">
      <p>{{ tr('这些文件读取失败：', 'These files could not be read:') }}</p>
      <p v-for="problem in snapshot.problems" :key="problem.path"><span class="set-mono">{{ problem.path }}</span> · {{ problem.message }}</p>
    </div>
  </section>

  <Modal :open="!!viewing" wide :title="viewing?.name ?? ''" @close="viewing = null">
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
.skill-add { grid-template-columns: minmax(0, 1fr); min-height: 0; padding-block: 8px; }
.skill-add-button { display: flex; align-items: center; gap: 10px; justify-self: start; padding: 4px 0; border: 0; background: none; color: var(--accent); font: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; }
.skill-add-button:disabled { opacity: .5; cursor: default; }
@media (hover: hover) { .skill-add-button:hover:not(:disabled) { text-decoration: underline; } }
.skill-pending { margin: 8px 4px 0; }
.skill-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.skill-head .btn .icon { width: 16px; height: 16px; }
.skill-search { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 0 12px; height: 40px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--bg-raised); color: var(--fg-subtle); }
.skill-search:focus-within { border-color: var(--accent); }
.skill-search .icon { width: 16px; height: 16px; flex: none; }
.skill-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--fg); font: inherit; }
.skill-empty { margin: 0; padding: 18px 16px; color: var(--fg-subtle); font-size: 13px; text-align: center; }
.skill-open { display: block; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
@media (hover: hover) { .skill-open:hover .skill-name { color: var(--accent); } }
.skill-open:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 4px; border-radius: 4px; }
.skill-name { min-width: 0; font-family: var(--mono); overflow-wrap: anywhere; transition: color var(--dur-fast); }
.skill-description { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.set-label > small.skill-note { color: var(--fg-faint); overflow-wrap: anywhere; }
.set-label > small .skill-warn, .set-label > small.skill-warn { color: var(--warn); }
.skill-row.off .skill-name, .skill-row.off .skill-description { opacity: .55; }
/* The tree: each level in by the width of a folder's chevron and the gap after it, so a folder's
   skills line up with its name. */
.skill-line { overflow: hidden; }
.skill-line + .skill-line { border-top: 1px solid var(--line); }
.skill-line > .set-row { padding-left: calc(16px + var(--depth) * 24px); }
.skill-fold { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.skill-fold:disabled { cursor: default; }
.skill-fold:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 4px; border-radius: 4px; }
.skill-chevron { flex: none; width: 16px; height: 16px; color: var(--fg-subtle); transition: transform var(--dur-fast) ease; }
.skill-fold[aria-expanded="true"] .skill-chevron { transform: rotate(90deg); }
@media (hover: hover) { .skill-fold:not(:disabled):hover .set-label > span { color: var(--accent); } }
/* Some of a folder's skills on: the thumb halfway, and turning it on turns them all on. */
.cfg-switch.partial { background: color-mix(in srgb, var(--accent) 30%, var(--bg-sunken)); border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
.cfg-switch.partial .cfg-switch-thumb { transform: translateX(8.5px); background: var(--bg); }
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
  .skill-line + .skill-line { border-top: 2px solid transparent; }
  .skill-line > .set-row { padding-left: calc(14px + var(--depth) * 24px); }
}
@media (prefers-reduced-motion: reduce) {
  .skill-chevron { transition: none; }
}
</style>
