<script setup lang="ts">
import { computed } from 'vue';
import { ICONS } from '../../ui/icons.ts';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
import WorkGlyph from '../sessions/WorkGlyph.vue';
import { workStatusExamples } from './workStatusExamples.ts';

const states = computed(workStatusExamples);
const names = Object.keys(ICONS);
</script>
<template>
  <h3>{{ tr('会话状态图标', 'Session status icons') }}</h3>
  <div class="icon-gallery state-gallery">
    <figure v-for="(state, kind) in states" :key="kind" :data-state="kind">
      <WorkGlyph :kind="kind" />
      <figcaption>{{ state.label }}</figcaption>
    </figure>
  </div>
  <h3>{{ tr('界面图标', 'Interface icons') }}</h3>
  <div class="icon-gallery">
    <figure v-for="name in names" :key="name">
      <Icon :name="name" />
      <figcaption>{{ name }}</figcaption>
    </figure>
  </div>
</template>
<style scoped>
h3 {
  margin: 14px 0 4px;
  font-size: 13px;
  font-weight: 600;
}
.icon-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 4px;
  padding: 8px 0;
}
.icon-gallery figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 14px 4px 10px;
  border-radius: var(--radius);
  color: var(--fg);
}
.icon-gallery .icon {
  width: 22px;
  height: 22px;
}
.icon-gallery figcaption {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--fg-subtle);
}
.state-gallery figure {
  color: var(--fg-muted);
}
.state-gallery figcaption {
  white-space: normal;
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
