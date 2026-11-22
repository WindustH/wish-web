<script setup lang="ts">
import Icon from '../../ui/components/Icon.vue';
defineProps<{ checked: boolean; mixed?: boolean; label: string }>();
defineEmits<{ toggle: [shift: boolean] }>();
</script>
<template>
  <label class="storage-check" @click.stop>
    <input
      type="checkbox"
      :aria-label="label"
      :checked="checked"
      :indeterminate="mixed"
      @click="$emit('toggle', $event.shiftKey)"
    />
    <span aria-hidden="true"><Icon v-if="checked || mixed" :name="mixed ? 'minus' : 'check'" /></span>
    <slot />
  </label>
</template>
<style scoped>
.storage-check {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
}
input {
  position: absolute;
  opacity: 0;
  margin: 0;
  width: var(--check-column, 28px);
  height: 100%;
  cursor: pointer;
}
span {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 17px;
  height: 17px;
  flex: none;
  margin-inline: calc((var(--check-column, 28px) - 17px) / 2);
  border: 1px solid var(--line-strong);
  border-radius: 4px;
}
input:checked + span,
input:indeterminate + span {
  background: var(--accent);
  color: var(--accent-fg);
  border-color: transparent;
}
input:focus-visible + span {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.icon {
  width: 13px;
  height: 13px;
}
</style>
