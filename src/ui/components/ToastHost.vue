<script setup lang="ts">
import { useToasts } from '../toast.js';
const items = useToasts();
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in items" :key="t.id" class="toast" role="status">{{ t.text }}</div>
    </TransitionGroup>
  </div>
</template>
