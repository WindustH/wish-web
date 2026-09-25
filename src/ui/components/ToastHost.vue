<script setup lang="ts">
import { useToasts } from '../toast.ts';
const items = useToasts();
</script>

<template>
  <div class="toast-region" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in items" :key="t.id" class="toast" role="status">{{ t.text }}</div>
    </TransitionGroup>
  </div>
</template>
