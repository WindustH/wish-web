<script setup lang="ts">
// The list a gathered node opens: one line per thing done or said, in the order it came - a
// run's steps spread out, a notice standing as itself. Picking a line hands back the whole entry,
// chip and step, for the log to open in the window that chip has always had.
import Icon from '../../../ui/components/Icon.vue';

export interface ActivityItem { key: string; chipKey: string; stepKey: string | null; icon: string; title: string; failed: boolean; warn: boolean }
defineProps<{ items: ActivityItem[] }>();
defineEmits<{ pick: [item: ActivityItem] }>();
</script>

<template>
  <ul class="activity-list">
    <li v-for="item in items" :key="item.key">
      <button type="button" :class="{ failed: item.failed, warn: item.warn && !item.failed }" @click="$emit('pick', item)">
        <Icon :name="item.icon" /><span class="activity-list-text">{{ item.title }}</span>
        <Icon name="chevron-right" />
      </button>
    </li>
  </ul>
</template>
