<script setup lang="ts">
import { ref, useId } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';

defineProps<{ count: number; label: string }>();
const expanded = ref(false);
const id = useId();
</script>

<template>
  <div class="model-legend">
    <div :id="id" class="legend-grid" :class="{ folded: !expanded }" role="group" :aria-label="label">
      <slot />
    </div>
    <button
      v-if="count > 2"
      type="button"
      class="btn ghost sm legend-more"
      :class="{ 'only-narrow': count <= 4 }"
      :aria-controls="id"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <Icon :name="expanded ? 'chevron-up' : 'chevron-down'" :size="14" />
      <span v-if="expanded">{{ tr('收起', 'Show less') }}</span>
      <template v-else>
        <span class="wide-count">{{ tr(`展开其余 ${count - 4} 个模型`, `Show ${count - 4} more models`) }}</span>
        <span class="narrow-count">{{ tr(`展开其余 ${count - 2} 个模型`, `Show ${count - 2} more models`) }}</span>
      </template>
    </button>
  </div>
</template>
<style scoped>
.model-legend {
  container-type: inline-size;
  min-width: 0;
  margin-bottom: 8px;
}
.legend-grid {
  display: grid;
  gap: 2px 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.folded > :slotted(:nth-child(n + 5)),
.narrow-count,
.legend-more.only-narrow {
  display: none;
}
.legend-more {
  margin-top: 4px;
  color: var(--fg-subtle);
}
@container (max-width: 30rem) {
  .legend-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .folded > :slotted(:nth-child(n + 3)),
  .wide-count {
    display: none;
  }
  .narrow-count {
    display: inline;
  }
  .legend-more.only-narrow {
    display: inline-flex;
  }
}
</style>
