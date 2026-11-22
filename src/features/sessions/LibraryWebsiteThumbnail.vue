<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ descriptor: string; name?: string }>();
const address = computed(() => {
  const [format, , value] = props.descriptor.split('\n', 3);
  if (format !== 'Wish-Website/1' || !value) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url;
  } catch {
    // An unreadable descriptor still has its Library name.
  }
});
</script>

<template>
  <span class="site-cover" aria-hidden="true">
    <span class="site-window">
      <span class="site-bar">
        <span class="site-controls"><i></i><i></i><i></i></span>
        <span class="site-host">{{ address?.hostname }}</span>
      </span>
      <span class="site-content">
        <span class="site-port">{{
          address ? ':' + (address.port || (address.protocol === 'https:' ? '443' : '80')) : name
        }}</span>
        <span v-if="address" class="site-path">{{ address.pathname }}</span>
      </span>
    </span>
  </span>
</template>

<style scoped>
.site-cover {
  position: absolute;
  inset: 0;
  container-type: inline-size;
  overflow: hidden;
  pointer-events: none;
  background-color: var(--bg-sunken);
  background-image: radial-gradient(var(--line) 0.7px, transparent 0.85px);
  background-size: 6px 6px;
}
.site-window {
  position: absolute;
  inset: 12% 7% 9%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line-strong);
  border-radius: 5px;
  background: var(--bg-raised);
  box-shadow: 2px 3px 0 var(--line);
  overflow: hidden;
}
.site-bar {
  display: flex;
  align-items: center;
  gap: 5%;
  height: 26%;
  padding-inline: 7%;
  border-bottom: 1px solid var(--line);
  background: var(--bg-control);
}
.site-controls {
  display: inline-flex;
  gap: 2px;
  color: var(--fg-subtle);
}
.site-controls i {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
}
.site-host,
.site-port,
.site-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.site-host,
.site-path {
  font: 500 clamp(8px, 7.1cqw, 11px) / 1.2 var(--mono);
  color: var(--fg-muted);
}
.site-content {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding-inline: 8%;
}
.site-port {
  font: 600 clamp(14px, 14cqw, 26px) / 1.12 var(--font);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.045em;
  color: var(--fg);
}
</style>
