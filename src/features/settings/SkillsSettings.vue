<script setup lang="ts">
// Skills: the folders sessions find them in, and every skill found there, each with a switch and a
// view of what it says. The model is told of none of them; it looks with `wish skill` in its shell.
// Folders and switches are part of the configuration draft, saved with the rest of settings.
import { computed, ref, watch } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { tr } from '../../core/i18n/tr.ts';
import { skillContent, skillsList } from '../../core/api/endpoints.ts';
import type { SkillContent, SkillEntry, SkillsSnapshot } from '../../core/api/types.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import Markdown from '../../ui/components/Markdown.vue';
import DirectoryPicker from '../../ui/components/DirectoryPicker.vue';
import SwitchRow from './SwitchRow.vue';
import { showError } from '../../ui/errorDialog.ts';

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
const shown = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/);
  return (snapshot.value?.skills ?? []).filter(skill => terms.every(term => `${skill.name} ${skill.description} ${skill.category ?? ''}`.toLocaleLowerCase().includes(term)));
});
const usable = computed(() => (snapshot.value?.skills ?? []).filter(skill => !skill.shadowed && enabled(skill.name)).length);
const where = (skill: SkillEntry) => skill.shadowed ? tr('被前面的同名 Skill 覆盖', 'Hidden by an earlier skill of this name')
  : skill.source === 'wish' ? tr('Wish 的 Skill 目录', 'Wish\'s skill folder') : skill.source;
async function view(skill: SkillEntry) {
  try { viewing.value = await skillContent(skill.name); }
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
        <p v-if="snapshot">{{ tr(`找到 ${snapshot.skills.length} 个，会话可用 ${usable} 个。点开可以查看内容。`, `${snapshot.skills.length} found, ${usable} available to sessions. Open one to read it.`) }}</p>
      </div>
      <button type="button" class="btn ghost icon-only" :aria-label="tr('重新读取', 'Read again')" :disabled="loading" @click="load"><Icon name="refresh-cw" :class="{ spin: loading }" /></button>
    </header>
    <label v-if="(snapshot?.skills.length ?? 0) > 8" class="skill-search"><Icon name="search" /><input v-model="query" type="search" :placeholder="tr('搜索 Skill', 'Search skills')" :aria-label="tr('搜索 Skill', 'Search skills')" autocomplete="off" spellcheck="false" /></label>
    <div class="set-card">
      <p v-if="!snapshot" class="skill-empty">{{ loading ? tr('正在读取…', 'Reading…') : tr('没有读取到 Skill。', 'Skills could not be read.') }}</p>
      <p v-else-if="!snapshot.skills.length" class="skill-empty">{{ tr('还没有 Skill。把 Skill 文件夹（每个里面有一个 SKILL.md）放进上面的目录即可。', 'No skills yet. Put skill folders, each holding a SKILL.md, in a folder above.') }}</p>
      <p v-else-if="!shown.length" class="skill-empty">{{ tr('没有匹配的 Skill。', 'No skill matches.') }}</p>
      <div v-for="skill in shown" :key="skill.dir" class="set-row toggle-row skill-row" :class="{ off: skill.shadowed || !enabled(skill.name) }">
        <button type="button" class="skill-open" @click="view(skill)">
          <span class="set-label">
            <span class="skill-name">{{ skill.name }}<em v-if="skill.category">{{ skill.category }}</em></span>
            <small class="skill-description">{{ skill.description }}</small>
            <small class="skill-source">{{ where(skill) }}</small>
          </span>
        </button>
        <SwitchRoot v-if="!skill.shadowed" :model-value="enabled(skill.name)" class="cfg-switch" :aria-label="skill.name" :disabled="busy" @update:model-value="setEnabled(skill.name, $event)"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot>
      </div>
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
.skill-name { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-family: var(--mono); transition: color var(--dur-fast); }
.skill-name em { font: 400 11.5px/1 var(--font); font-style: normal; color: var(--fg-subtle); }
.skill-description { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.skill-source { color: var(--fg-faint) !important; overflow-wrap: anywhere; }
.skill-row.off .skill-name, .skill-row.off .skill-description { opacity: .55; }
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
