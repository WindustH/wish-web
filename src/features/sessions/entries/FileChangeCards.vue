<script setup lang="ts">
import { computed, inject } from 'vue';
import { rowFileChanges, stackedFiles } from '../fileChanges.ts';
import { openActivityKey } from '../activityDialogs.ts';
import { tr } from '../../../core/i18n/tr.ts';
import Icon from '../../../ui/components/Icon.vue';
const props = defineProps<{ item: any }>();
const groups = computed(() => rowFileChanges(props.item));
const open = inject(openActivityKey);
const fileName = (path: string) => path.split(/[\\/]/).at(-1) || path;
</script>
<template>
  <div v-for="group in groups" :key="group.chipKey" class="file-change-cards">
    <div v-if="stackedFiles(group.files)" class="file-card-stack">
      <button type="button" class="file-change-card stacked" aria-haspopup="dialog"
        @click="open?.({ chipKey: group.chipKey, stepKey: null, files: true })">
        <span class="stack-mark"><Icon name="file-diff" /></span>
        <span class="file-change-label">
          <strong>{{ tr('文件修改', 'File changes') }}<span class="stack-count">{{ tr(`${group.files.length} 个文件`, `${group.files.length} files`) }}</span></strong>
          <small>{{ group.files.slice(0, 3).map((file: any) => fileName(file.path)).join(' · ') }} · …</small>
        </span>
        <Icon name="chevron-right" />
      </button>
    </div>
    <template v-else>
      <button v-for="file in group.files" :key="file.path" type="button" class="file-change-card" aria-haspopup="dialog"
        @click="open?.({ chipKey: group.chipKey, stepKey: null, files: true, filePath: file.path })">
        <Icon name="file-diff" /><span class="file-change-label"><strong>{{ file.path }}</strong><small>{{ tr('文件修改', 'File changes') }}</small></span>
        <span v-if="file.added || file.removed" class="file-change-count"><b>+{{ file.added }}</b><b>−{{ file.removed }}</b></span><Icon name="chevron-right" />
      </button>
    </template>
  </div>
</template>
<style scoped>
.file-change-cards { display: grid; gap: 10px; padding: 6px 0 12px; min-width: 0; }
.file-change-card { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; min-height: 66px; padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); color: var(--fg); text-align: left; font: inherit; font-size: 13px; cursor: pointer; }
.file-change-card > .icon { flex: none; width: 18px; }
.file-change-label { flex: 1; min-width: 0; }
.file-change-label strong { display: block; overflow-wrap: anywhere; font-weight: 500; }
.file-change-label small { display: block; margin-top: 4px; color: var(--fg-subtle); font-size: 11px; }
.file-change-count { display: flex; gap: 8px; white-space: nowrap; font-size: 12px; }
.file-change-count b:first-child { color: var(--ok); }.file-change-count b:last-child { color: var(--err); }
.file-card-stack { position: relative; isolation: isolate; padding-bottom: 12px; }
.file-card-stack::before, .file-card-stack::after { content: ''; position: absolute; pointer-events: none; border: 1px solid var(--line); border-radius: 10px; }
.file-card-stack::before { z-index: 0; inset: 12px 16px 0; background: var(--bg-inset); }
.file-card-stack::after { z-index: 1; inset: 6px 8px 6px; background: var(--bg-raised); }
.stacked { z-index: 2; min-height: 76px; box-shadow: 0 2px 5px rgb(0 0 0 / 5%); }
.stack-mark { display: grid; place-items: center; flex: none; width: 34px; height: 38px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg-inset); color: var(--fg-muted); }
.stack-mark .icon { width: 18px; height: 18px; }
.stacked strong { display: flex; align-items: baseline; gap: 8px; }
.stack-count { color: var(--fg-subtle); font-size: 11px; font-weight: 400; white-space: nowrap; }
.stacked small { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.stacked > .icon { width: 14px; color: var(--fg-subtle); }
@media (hover: hover) { .file-change-card:hover { background: var(--bg-hover); } }
.file-change-card:focus-visible { outline: 2px solid var(--fg-subtle); outline-offset: 3px; }
</style>
