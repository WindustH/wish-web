<script setup lang="ts">
import Icon from './Icon.vue';
import { usePageActivity } from '../composables/usePageActivity.ts';
import { DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuItem } from 'reka-ui';

defineProps<{ items: Array<{ key: string; label: string; icon?: string; danger?: boolean }>; label?: string }>();
const pageActive = usePageActivity();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger class="btn ghost icon-only" :aria-label="label || 'menu'">
      <slot />
    </DropdownMenuTrigger>
    <DropdownMenuPortal v-if="pageActive">
      <DropdownMenuContent class="menu-pop" align="end" :side-offset="6">
        <DropdownMenuItem v-for="item in items" :key="item.key" class="menu-item" :class="{ 'menu-danger': item.danger }"
          @select="emit('select', item.key)">
          <Icon v-if="item.icon" :name="item.icon" />{{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
.menu-item { display: flex; align-items: center; gap: 12px; }
.menu-danger { color: var(--err); }
</style>
