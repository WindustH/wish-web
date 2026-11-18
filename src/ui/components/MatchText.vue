<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ text: string; query: string; prefix?: boolean }>();
const parts = computed(() => {
  const words = props.query
    .toLocaleLowerCase()
    .split(/[\s/]+/)
    .filter(Boolean);
  const text = props.text.toLocaleLowerCase();
  const matched = Array.from({ length: props.text.length }, () => false);
  if (props.prefix) {
    const query = props.query.toLocaleLowerCase();
    if (query && text.startsWith(query)) matched.fill(true, 0, query.length);
  } else
    for (const word of words) {
      let start = text.indexOf(word);
      while (start >= 0) {
        matched.fill(true, start, start + word.length);
        start = text.indexOf(word, start + word.length);
      }
    }
  const result: { text: string; match: boolean }[] = [];
  for (let i = 0; i < props.text.length; i++) {
    const match = matched[i]!;
    const previous = result[result.length - 1];
    if (previous?.match === match) previous.text += props.text[i];
    else result.push({ text: props.text[i]!, match });
  }
  return result;
});
</script>
<template>
  <template v-for="(part, index) in parts" :key="index"
    ><mark v-if="part.match">{{ part.text }}</mark
    ><template v-else>{{ part.text }}</template></template
  >
</template>
<style scoped>
mark {
  color: var(--accent);
  background: none;
  font-weight: 650;
}
</style>
