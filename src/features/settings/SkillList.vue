<script setup lang="ts">
// Rows of skills and the folders they sit in, in the catalog: a folder opens to show what it holds, a
// skill to show what it says, and each has a box that turns it on - a folder's ticked with all of
// its skills on and a dash with some.
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { AnimatePresence, motion } from 'motion-v';
import { tr } from '../../core/i18n/tr.ts';
import type { SkillEntry } from '../../core/api/types.ts';
import Icon from '../../ui/components/Icon.vue';
import { prefersReducedMotion } from '../../ui/motion/reducedMotion.ts';
import type { SkillFolder } from './skillTree.ts';

export interface FolderState {
  switchable: SkillEntry[];
  on: number;
  total: number;
  summary: string;
  checked: boolean | 'indeterminate';
  conflict: boolean;
}
export type SkillListRow =
  | { key: string; folder: SkillFolder; state: FolderState; skill?: undefined; note?: undefined }
  | { key: string; skill: SkillEntry; note?: { text: string; warn?: boolean }; folder?: undefined; state?: undefined };

defineProps<{ rows: SkillListRow[]; busy: boolean; enabled: (name: string) => boolean }>();
const emit = defineEmits<{
  open: [folder: SkillFolder];
  view: [skill: SkillEntry];
  setFolder: [skills: SkillEntry[], on: boolean];
  setSkill: [name: string, on: boolean];
}>();
const reduced = prefersReducedMotion();
</script>

<template>
  <AnimatePresence :initial="false">
    <motion.div
      v-for="row in rows"
      :key="row.key"
      class="skill-line"
      :initial="reduced ? false : { height: 0, opacity: 0 }"
      :animate="{ height: 'auto', opacity: 1 }"
      :exit="reduced ? undefined : { height: 0, opacity: 0 }"
      :transition="{ duration: 0.18, ease: 'easeOut' }"
    >
      <div v-if="row.folder" class="skill-row skill-folder-row">
        <button type="button" class="skill-fold" :title="row.folder.name" @click="emit('open', row.folder)">
          <Icon name="folder" class="skill-folder-icon" />
          <span class="folder-name">{{ row.folder.name }}</span>
          <span v-if="row.state.conflict" class="skill-warn">{{ tr('重名', 'Name conflict') }}</span>
          <span class="folder-count" :title="row.state.summary">
            <span aria-hidden="true">{{
              row.state.total
                ? row.state.on === row.state.total
                  ? row.state.total
                  : row.state.on + ' / ' + row.state.total
                : '—'
            }}</span>
            <span class="visually-hidden">{{ row.state.summary }}</span>
          </span>
          <Icon name="chevron-right" class="skill-chevron" />
        </button>
        <CheckboxRoot
          v-if="row.state.total"
          :model-value="row.state.checked"
          class="skill-check"
          :aria-label="row.folder.name"
          :disabled="busy"
          @update:model-value="emit('setFolder', row.state.switchable, $event === true)"
          ><CheckboxIndicator class="skill-check-mark"
            ><Icon :name="row.state.checked === 'indeterminate' ? 'minus' : 'check'" /></CheckboxIndicator
        ></CheckboxRoot>
      </div>
      <div v-else class="skill-row" :class="{ off: row.skill.standing !== 'used' || !enabled(row.skill.name) }">
        <button type="button" class="skill-open" @click="emit('view', row.skill)">
          <Icon name="file" class="skill-file-icon" />
          <span class="skill-metadata">
            <span class="skill-name" :title="row.skill.name">{{ row.skill.name }}</span>
            <small v-if="row.skill.description" class="skill-description" :title="row.skill.description">{{
              row.skill.description
            }}</small>
            <small v-if="row.note" class="skill-note" :title="row.note.text" :class="{ 'skill-warn': row.note.warn }">{{
              row.note.text
            }}</small>
          </span>
        </button>
        <CheckboxRoot
          v-if="row.skill.standing === 'used'"
          :model-value="enabled(row.skill.name)"
          class="skill-check"
          :aria-label="row.skill.name"
          :disabled="busy"
          @update:model-value="emit('setSkill', row.skill!.name, $event === true)"
          ><CheckboxIndicator class="skill-check-mark"><Icon name="check" /></CheckboxIndicator
        ></CheckboxRoot>
      </div>
    </motion.div>
  </AnimatePresence>
</template>

<style scoped>
.skill-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  align-items: center;
  column-gap: 2px;
  border-radius: 5px;
}
.skill-row:focus-within {
  background: var(--bg-hover);
}
@media (hover: hover) {
  .skill-row:hover {
    background: var(--bg-hover);
  }
}
.skill-fold,
.skill-open {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  min-height: var(--text-list-row-height);
  padding: 10px 4px 10px 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: inherit;
  font: 500 var(--text-list-size)/var(--text-list-leading) var(--font);
  text-align: start;
  cursor: pointer;
}
.skill-fold:focus-visible,
.skill-open:focus-visible {
  outline-offset: -2px;
}
.folder-name,
.skill-name,
.skill-description,
.skill-note {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-name {
  flex: 1;
}
.skill-folder-icon,
.skill-file-icon {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--fg-subtle);
}
.skill-chevron {
  width: 12px;
  height: 12px;
  flex: none;
  color: var(--fg-faint);
}
.folder-count {
  flex: none;
  font-size: var(--text-list-secondary);
  font-variant-numeric: tabular-nums;
  color: var(--fg-subtle);
}
.skill-metadata {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.skill-name {
  font: inherit;
}
.skill-description,
.skill-note,
.skill-warn {
  font-size: var(--text-list-secondary);
  line-height: var(--text-list-leading);
  color: var(--fg-subtle);
}
.skill-warn {
  color: var(--warn);
}
.off .skill-name {
  color: var(--fg-muted);
}
.skill-check {
  justify-self: center;
}
@media (pointer: coarse), (max-width: 899px) {
  .skill-row {
    grid-template-columns: minmax(0, 1fr) 44px;
  }
  .skill-check {
    position: relative;
  }
  .skill-check::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
}
</style>
