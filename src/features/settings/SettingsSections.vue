<script setup lang="ts">
const props = defineProps<{ prefix: string; sections: { id: string; label: string }[] }>();
const sectionId = (id: string) => `settings-${props.prefix}-${id}`;
</script>

<template>
  <div class="cfg-layout">
    <div class="cfg-content">
      <slot name="before" />
      <section v-for="item in sections" :id="sectionId(item.id)" :key="item.id"
        class="cfg-section" tabindex="-1" :aria-labelledby="`${sectionId(item.id)}-heading`">
        <h2 :id="`${sectionId(item.id)}-heading`">{{ item.label }}</h2>
        <slot :section="item.id" />
      </section>
      <slot name="after" />
    </div>
  </div>
</template>
