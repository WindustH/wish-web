<script setup lang="ts">
import { DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuItem } from 'reka-ui';

defineProps<{ items: Array<{ key: string; label: string; icon?: string }>; label?: string }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger class="btn ghost icon-only" :aria-label="label || 'menu'">
      <slot />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu-pop" align="end" :side-offset="6">
        <DropdownMenuItem v-for="item in items" :key="item.key" class="menu-item"
          @select="emit('select', item.key)">
          {{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
