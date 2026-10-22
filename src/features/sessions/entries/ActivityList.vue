<script setup lang="ts">
// The list a gathered node opens: one line per thing done or said, in the order it came - a
// run's steps spread out, a notice standing as itself. Each line opens that very thing's detail,
// in the window its run has always had.
import Icon from '../../../ui/components/Icon.vue';

defineProps<{ items: { key: string; icon: string; title: string; failed: boolean; warn: boolean }[] }>();
defineEmits<{ pick: [key: string] }>();
</script>

<template>
  <ul class="activity-list">
    <li v-for="item in items" :key="item.key">
      <button type="button" :class="{ failed: item.failed, warn: item.warn && !item.failed }" @click="$emit('pick', item.key)">
        <Icon :name="item.icon" /><span class="activity-list-text">{{ item.title }}</span>
        <Icon name="chevron-right" />
      </button>
    </li>
  </ul>
</template>
