<script setup lang="ts">
import { ref, useId } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
defineProps<{ label: string }>();
const token = defineModel<string>({ required: true });
const open = ref(!!token.value);
const id = useId();
</script>
<template>
  <div class="account-token">
    <button type="button" class="token-toggle" :aria-expanded="open" :aria-controls="id" @click="open = !open">
      <Icon :name="open ? 'chevron-down' : 'chevron-right'" :size="14" />{{ label }}
    </button>
    <input
      v-if="open"
      :id="id"
      :aria-label="label"
      v-model="token"
      class="input"
      type="password"
      autocomplete="current-password"
      :placeholder="tr('可选', 'Optional')"
    />
  </div>
</template>
<style scoped>
.account-token {
  display: grid;
  gap: 4px;
}
.token-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: start;
  border: 0;
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: 13px;
  min-height: 28px;
  padding: 0;
  cursor: pointer;
}
@media (hover: hover) {
  .token-toggle:hover {
    color: var(--fg);
  }
}
@media (pointer: coarse) {
  .token-toggle {
    min-height: 44px;
  }
}
</style>
