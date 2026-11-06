<script setup lang="ts">
import RunFailureCard from '../../../domain/chat/RunFailureCard.vue';
import RetryRunButton from '../RetryRunButton.vue';
defineProps<{ item: any; session?: string }>();
</script>
<template>
  <RunFailureCard :failure="item.entry.payload.failure">
    <RetryRunButton v-if="session" :session="session" :sequence="item.entry.seq" />
  </RunFailureCard>
</template>
