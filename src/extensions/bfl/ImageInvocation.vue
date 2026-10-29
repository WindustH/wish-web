<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { blobUrl } from '../../core/api/endpoints.ts';
import ToolImage from '../../ui/domain/media/ToolImage.vue';
const props = defineProps<{ session?: string; request: Record<string, unknown>; fill: boolean }>();
const previewsOpen = ref(false);
watch(
  () => props.request,
  () => {
    previewsOpen.value = false;
  },
);
const inputs = computed(() => {
  const candidates = props.fill
    ? [
        { value: props.request.source_image, label: tr('源图', 'Source image') },
        { value: props.request.mask, label: tr('遮罩：白色修改，黑色保留', 'Mask: edit white, preserve black') },
      ]
    : (Array.isArray(props.request.reference_images) ? props.request.reference_images.slice(0, 8) : []).map(
        (value, index) => ({ value, label: tr(`参考图 ${index + 1}`, `Reference ${index + 1}`) }),
      );
  return candidates.flatMap(({ value, label }) => {
    if (typeof value !== 'string') return [];
    if (/^[a-f0-9]{64}$/.test(value))
      return [{ value, label, src: props.session ? blobUrl(`${props.session}/${value}`) : '' }];
    // Keep remote references as text; never load model-supplied URLs in the user's browser.
    return [{ value, label, src: '' }];
  });
});
const parameters = computed(() => {
  const value = props.request.parameters;
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
});
const parameterLabel = (key: string) =>
  ({
    width: tr('宽度', 'Width'),
    height: tr('高度', 'Height'),
    seed: tr('随机种子', 'Seed'),
    output_format: tr('图片格式', 'Format'),
    prompt_upsampling: tr('提示词增强', 'Prompt enhancement'),
    steps: tr('采样步数', 'Steps'),
    guidance: tr('引导强度', 'Guidance'),
    aspect_ratio: tr('宽高比', 'Aspect ratio'),
  })[key] ?? key;
</script>
<template>
  <section class="bfl-invocation">
    <header>
      {{ fill ? 'FLUX Fill' : 'FLUX' }} · {{ request.service ?? tr('按配置优先级', 'Configured priority') }}
    </header>
    <p class="prompt">{{ request.prompt }}</p>
    <dl v-if="parameters.length">
      <div v-for="[key, value] in parameters" :key="key">
        <dt>{{ parameterLabel(key) }}</dt>
        <dd>{{ typeof value === 'string' ? value : JSON.stringify(value) }}</dd>
      </div>
    </dl>
    <div v-if="inputs.length" class="inputs">
      <ul>
        <li v-for="(input, index) in inputs" :key="index">
          <span>{{ input.label }}</span
          ><code>{{ input.src ? input.value.slice(0, 12) : input.value }}</code>
        </li>
      </ul>
      <p v-if="fill && !request.mask" class="hint">
        {{ tr('修改源图中的透明区域。', 'Edits the transparent regions of the source image.') }}
      </p>
      <button
        v-if="inputs.some((input) => input.src)"
        class="btn ghost"
        :aria-expanded="previewsOpen"
        @click="previewsOpen = !previewsOpen"
      >
        {{ previewsOpen ? tr('收起输入图片', 'Hide input images') : tr('查看输入图片', 'View input images') }}
      </button>
      <div v-if="previewsOpen" class="previews">
        <template v-for="(input, index) in inputs" :key="index"
          ><ToolImage v-if="input.src" :src="input.src" mime="" :path="input.label"
        /></template>
      </div>
    </div>
  </section>
</template>
<style scoped>
.bfl-invocation {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header,
.hint {
  color: var(--fg-muted);
  font-size: 12px;
}
header,
.prompt,
dd,
code {
  overflow-wrap: anywhere;
}
.prompt {
  white-space: pre-wrap;
  margin: 0;
}
dl {
  margin: 0;
  display: grid;
  gap: 8px;
}
dl > div {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 2fr);
  gap: 12px;
}
dt {
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
dd {
  margin: 0;
}
.inputs {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
}
ul {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
  display: grid;
  gap: 8px;
}
li {
  display: grid;
  gap: 4px;
}
code {
  font-size: 12px;
  color: var(--fg-muted);
}
.previews {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}
</style>
