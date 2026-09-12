<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import Hint from '../../ui/components/Hint.vue';
import Menu from '../../ui/components/Menu.vue';
import { EllipsisVertical, Pencil } from '@lucide/vue';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import { pointer } from '../../core/config-editor';
import { fieldHint, tr } from './fields';
import { openConfigDialog, activeConfigPaths } from './config-dialog';
const props = withDefaults(defineProps<{ path: string[]; title: string; brand?: string; enabled?: boolean; menu?: boolean; removable?: boolean; removeLabel?: string }>(), { enabled: undefined });
const emit = defineEmits<{ 'update:enabled': [value: boolean]; remove: [] }>();
const hint = computed(() => /^\d+$/.test(props.path.at(-1)!) || props.path.at(-2) === 'models' ? '' : fieldHint(props.path));
const open = inject(openConfigDialog)!;
const paths = inject(activeConfigPaths)!;
const row = ref<HTMLElement>();
const expanded = computed(() => paths.value.includes(pointer(props.path)));
function edit() { open({ path: props.path, title: props.title, anchor: row.value?.querySelector<HTMLElement>('[data-config-edit]') ?? row.value?.querySelector<HTMLElement>('button') ?? undefined }); }
</script>

<template>
  <div ref="row" class="cfg-edit-row" :data-config-path="pointer(path)">
    <div><strong class="cfg-edit-title"><ProviderIcon v-if="brand" :brand="brand" /><span>{{ title }}</span></strong><p v-if="hint" class="cfg-hint">{{ hint }}</p></div>
    <div class="cfg-edit-actions">
      <Hint v-if="enabled !== undefined" :text="enabled ? tr('已启用', 'Enabled') : tr('已停用', 'Disabled')"><span class="cfg-toggle-hint"><SwitchRoot class="cfg-switch" :model-value="enabled" :aria-label="`${tr('启用', 'Enable')} ${title}`" :data-provider-toggle="pointer(path)" @update:model-value="emit('update:enabled', $event)"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></span></Hint>
      <span v-if="enabled !== undefined || (menu && removable)" :data-config-menu="pointer(path)">
        <Menu :label="`${tr('更多操作', 'More actions')} ${title}`" :items="[
          ...(enabled !== undefined ? [{ key: 'edit', label: tr('编辑', 'Edit'), icon: 'pencil' }] : []),
          ...(enabled !== undefined || removable ? [{ key: 'remove', label: removeLabel || tr('删除', 'Delete'), icon: 'trash-2', danger: true }] : []),
        ]" @select="$event === 'edit' ? edit() : emit('remove')"><EllipsisVertical :size="18" /></Menu>
      </span>
      <button v-if="enabled === undefined" type="button" class="btn" :class="{ active: expanded }" :aria-expanded="expanded" :data-config-edit="pointer(path)" :aria-label="`${tr('编辑', 'Edit')} ${title}`" @click="edit()"><Pencil :size="15" />{{ tr('编辑', 'Edit') }}</button>
    </div>
  </div>
</template>

<style scoped>
.cfg-toggle-hint { display: inline-flex; }
.cfg-edit-actions { display: flex; align-items: center; gap: 14px; flex: none; }
</style>
