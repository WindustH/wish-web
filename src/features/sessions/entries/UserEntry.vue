<script setup lang="ts">
const props = defineProps<{ item: any }>();
const blocks = () => props.item.entry?.payload?.content || [];
const images = () => props.item.entry?.payload?.__images || [];
</script>

<template>
  <div class="entry user">
    <div class="bubble">
      <div v-for="(b, i) in blocks().filter((b: any) => b.type === 'text')" :key="i">{{ b.text }}</div>
      <img v-for="(img, i) in images()" :key="'i' + i" :src="img.localUrl" :alt="img.name || 'image'" loading="lazy" />
    </div>
  </div>
</template>
