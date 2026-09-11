<script setup lang="ts">
import Hint from './Hint.vue';
defineOptions({ inheritAttrs: false });
defineProps<{ variant?: 'primary' | 'ghost'; disabled?: boolean; title?: string }>();
</script>

<template>
  <Hint :text="title"><button v-bind="$attrs" class="btn" :class="variant" :disabled="disabled">
    <slot />
  </button></Hint>
</template>
