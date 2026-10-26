<script setup lang="ts">
import Icon from '../../ui/components/Icon.vue';
defineProps<{ icon: string; title: string; description: string; count?: number }>();
defineEmits<{ open: [] }>();
</script>
<template>
  <button type="button" class="debug-tool-row" aria-haspopup="dialog" @click="$emit('open')">
    <Icon :name="icon" class="debug-tool-icon" />
    <span class="debug-tool-copy"><span class="debug-tool-title">{{ title }}</span><span class="debug-tool-description">{{ description }}</span></span>
    <span v-if="count != null" class="debug-tool-count">{{ count }}</span>
    <Icon name="chevron-right" class="debug-tool-arrow" />
  </button>
</template>
<style scoped>
.debug-tool-row { display:flex; align-items:center; gap:12px; width:100%; min-height:70px; padding:15px 18px; border:0; background:transparent; color:var(--fg); text-align:left; font:inherit; cursor:pointer; }
.debug-tool-icon { flex:none; width:20px; height:20px; color:var(--fg-muted); }
.debug-tool-copy { display:flex; flex-direction:column; gap:4px; min-width:0; flex:1; }
.debug-tool-title { font-size:14px; font-weight:500; line-height:1.4; }
.debug-tool-description { font-size:12px; line-height:1.5; color:var(--fg-subtle); }
.debug-tool-count { flex:none; min-width:24px; padding:2px 7px; border-radius:7px; background:var(--bg-hover); color:var(--fg-muted); font-size:11px; font-variant-numeric:tabular-nums; text-align:center; }
.debug-tool-arrow { flex:none; width:15px; height:15px; color:var(--fg-subtle); }
@media(hover:hover) { .debug-tool-row:hover { background:var(--bg-hover); } }
.debug-tool-row:focus-visible { outline:2px solid var(--focus-ring); outline-offset:-3px; border-radius:10px; }
@media(max-width:599px) { .debug-tool-row { padding:14px; gap:10px; } }
</style>
