<script setup lang="ts">
// Rows of skills and the folders they sit in, as cards: a folder opens to show what it holds, a
// skill to show what it says, and each has a box that turns it on - a folder's ticked with all of
// its skills on and a dash with some.
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { AnimatePresence, motion } from 'motion-v';
import { tr } from '../../core/i18n/tr.ts';
import type { SkillEntry } from '../../core/api/types.ts';
import Icon from '../../ui/components/Icon.vue';
import { prefersReducedMotion } from '../../ui/motion/reducedMotion.ts';
import type { SkillFolder } from './skillTree.ts';

export interface FolderState { switchable: SkillEntry[]; on: number; total: number; summary: string; checked: boolean | 'indeterminate'; conflict: boolean }
export type SkillListRow =
  | { key: string; depth: number; folder: SkillFolder; state: FolderState; skill?: undefined; note?: undefined }
  | { key: string; depth: number; skill: SkillEntry; note?: { text: string; warn?: boolean }; folder?: undefined; state?: undefined };

defineProps<{ rows: SkillListRow[]; busy: boolean; enabled: (name: string) => boolean }>();
const emit = defineEmits<{ open: [folder: SkillFolder]; view: [skill: SkillEntry]; setFolder: [skills: SkillEntry[], on: boolean]; setSkill: [name: string, on: boolean] }>();
const reduced = prefersReducedMotion();
</script>

<template>
  <AnimatePresence :initial="false">
    <motion.div v-for="row in rows" :key="row.key" class="skill-line" :style="{ '--depth': row.depth }"
      :initial="reduced ? false : { height: 0, opacity: 0 }" :animate="{ height: 'auto', opacity: 1 }" :exit="reduced ? undefined : { height: 0, opacity: 0 }" :transition="{ duration: 0.18, ease: 'easeOut' }">
      <div v-if="row.folder" class="set-row toggle-row skill-row skill-folder-row">
        <button type="button" class="skill-fold" aria-haspopup="dialog" @click="emit('open', row.folder)">
          <Icon name="folder" class="skill-folder-icon" />
          <span class="set-label">
            <span>{{ row.folder.name }}</span>
            <small>{{ row.state.summary }}<template v-if="row.state.conflict"> · <span class="skill-warn">{{ tr('有重名的 Skill', 'Has skills sharing a name') }}</span></template></small>
          </span>
          <Icon name="chevron-right" class="skill-chevron" />
        </button>
        <CheckboxRoot v-if="row.state.total" :model-value="row.state.checked" class="skill-check" :aria-label="row.folder.name" :disabled="busy"
          @update:model-value="emit('setFolder', row.state.switchable, $event === true)"><CheckboxIndicator class="skill-check-mark"><Icon :name="row.state.checked === 'indeterminate' ? 'minus' : 'check'" /></CheckboxIndicator></CheckboxRoot>
      </div>
      <div v-else class="set-row toggle-row skill-row" :class="{ off: row.skill.standing !== 'used' || !enabled(row.skill.name) }">
        <button type="button" class="skill-open" @click="emit('view', row.skill)">
          <span class="set-label">
            <span class="skill-name">{{ row.skill.name }}</span>
            <small class="skill-description">{{ row.skill.description }}</small>
            <small v-if="row.note" class="skill-note" :class="{ 'skill-warn': row.note.warn }">{{ row.note.text }}</small>
          </span>
        </button>
        <CheckboxRoot v-if="row.skill.standing === 'used'" :model-value="enabled(row.skill.name)" class="skill-check" :aria-label="row.skill.name" :disabled="busy"
          @update:model-value="emit('setSkill', row.skill!.name, $event === true)"><CheckboxIndicator class="skill-check-mark"><Icon name="check" /></CheckboxIndicator></CheckboxRoot>
      </div>
    </motion.div>
  </AnimatePresence>
</template>

<style scoped>
.skill-open { display: block; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
@media (hover: hover) { .skill-open:hover .skill-name { color: var(--accent); } }
.skill-open:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 4px; border-radius: 4px; }
.skill-name { min-width: 0; font-family: var(--mono); overflow-wrap: anywhere; transition: color var(--dur-fast); }
.skill-description { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.set-label > small.skill-note { color: var(--fg-faint); overflow-wrap: anywhere; }
.set-label > small .skill-warn, .set-label > small.skill-warn { color: var(--warn); }
.skill-row.off .skill-name, .skill-row.off .skill-description { opacity: .55; }
/* A card for each folder and skill; in a search's tree, each level in by the width of a folder's
   icon and the gap after it, so a folder's skills line up under its name. */
.skill-line { overflow: hidden; margin-left: calc(var(--depth) * 26px); border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); }
.skill-fold { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.skill-fold > .set-label { flex: 1; min-width: 0; }
.skill-fold:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 4px; border-radius: 4px; }
.skill-folder-icon { flex: none; width: 16px; height: 16px; color: var(--fg-subtle); }
.skill-chevron { flex: none; width: 15px; height: 15px; color: var(--fg-faint); }
@media (hover: hover) { .skill-fold:hover .set-label > span { color: var(--accent); } }
/* Ticked as files are picked: a dash on a folder with some of its skills on, and ticking it turns
   them all on. */
.skill-check { display: grid; place-items: center; flex: none; justify-self: end; width: 20px; height: 20px; padding: 0; border: 1.5px solid var(--line-strong); border-radius: 6px; background: transparent; color: var(--accent-fg); cursor: pointer; transition: background var(--dur-fast), border-color var(--dur-fast); }
.skill-check:is([data-state="checked"], [data-state="indeterminate"]) { border-color: var(--accent); background: var(--accent); }
.skill-check:disabled { opacity: .5; cursor: default; }
.skill-check:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.skill-check-mark { display: grid; place-items: center; }
.skill-check-mark .icon { width: 14px; height: 14px; stroke-width: 3; }
@media (max-width: 899px) {
  .skill-line { border: 0; border-radius: 16px; background: var(--bg-group); }
  .skill-check { width: 24px; height: 24px; border-radius: 7px; }
  .skill-check-mark .icon { width: 16px; height: 16px; }
}
</style>
