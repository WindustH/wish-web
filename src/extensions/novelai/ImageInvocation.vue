<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { blobUrl } from '../../core/api/endpoints.ts';
import ToolImage from '../../domain/media/ToolImage.vue';
const props = defineProps<{ session?: string; request: Record<string, unknown> }>();
const previewsOpen = ref(false);
watch(
  () => props.request,
  () => {
    previewsOpen.value = false;
  },
);
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const imageId = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
const source = computed(() => imageId(props.request.source_image));
const references = computed(() =>
  (Array.isArray(props.request.references) ? props.request.references.slice(0, 8) : []).flatMap((value) => {
    const reference = record(value);
    const image = imageId(reference?.image);
    if (!reference || !image) return [];
    return [{ image, kind: reference.kind, strength: reference.strength ?? 1, fidelity: reference.fidelity ?? 1 }];
  }),
);
const parameters = computed(() =>
  Object.entries(record(props.request.parameters) ?? {}).filter(([key]) => key !== 'character_prompts'),
);
const characters = computed(() => {
  const values = record(props.request.parameters)?.character_prompts;
  return (Array.isArray(values) ? values.slice(0, 6) : []).flatMap((value) => {
    const character = record(value);
    if (!character || typeof character.prompt !== 'string') return [];
    const centers = (Array.isArray(character.centers) ? character.centers.slice(0, 6) : []).flatMap((value) => {
      const center = record(value);
      return typeof center?.x === 'number' &&
        typeof center.y === 'number' &&
        Number.isFinite(center.x) &&
        Number.isFinite(center.y)
        ? [String(center.x) + ', ' + String(center.y)]
        : [];
    });
    return [
      {
        prompt: character.prompt,
        negative: typeof character.negative_prompt === 'string' ? character.negative_prompt : '',
        centers,
      },
    ];
  });
});
const parameterLabel = (key: string) =>
  ({
    width: tr('宽度', 'Width'),
    height: tr('高度', 'Height'),
    steps: tr('采样步数', 'Steps'),
    scale: tr('引导强度', 'Guidance'),
    seed: tr('随机种子', 'Seed'),
    n_samples: tr('图片数量', 'Image count'),
    negative_prompt: tr('负面提示词', 'Negative prompt'),
    strength: tr('重绘强度', 'Edit strength'),
    noise: tr('噪声', 'Noise'),
    sampler: tr('采样器', 'Sampler'),
    noise_schedule: tr('噪声调度', 'Noise schedule'),
    cfg_rescale: tr('引导重缩放', 'Guidance rescale'),
    dynamic_thresholding: tr('去锐化', 'Decrisper'),
  })[key] ?? key;
const kindLabel = (kind: unknown) =>
  kind === 'character'
    ? tr('角色', 'Character')
    : kind === 'style'
      ? tr('风格', 'Style')
      : kind === 'character_style'
        ? tr('角色与风格', 'Character & style')
        : tr('参考图', 'Reference');
</script>
<template>
  <section class="novelai-invocation">
    <header>NovelAI · {{ request.service ?? tr('按配置优先级', 'Configured priority') }}</header>
    <p class="prompt">{{ request.prompt }}</p>
    <dl v-if="parameters.length" class="parameters">
      <div v-for="[key, value] in parameters" :key="key">
        <dt>{{ parameterLabel(key) }}</dt>
        <dd>
          {{
            typeof value === 'boolean'
              ? value
                ? tr('开启', 'On')
                : tr('关闭', 'Off')
              : typeof value === 'string'
                ? value
                : JSON.stringify(value)
          }}
        </dd>
      </div>
    </dl>
    <section v-if="characters.length" class="characters" :aria-label="tr('角色描述', 'Character prompts')">
      <article v-for="(character, index) in characters" :key="index" class="character">
        <header>{{ tr('角色', 'Character') }} {{ index + 1 }}</header>
        <p class="prompt">{{ character.prompt }}</p>
        <p v-if="character.negative" class="negative">
          <span>{{ tr('负面提示词', 'Negative prompt') }}</span> {{ character.negative }}
        </p>
        <p class="position">
          {{
            character.centers.length
              ? tr('位置', 'Position') + ': ' + character.centers.join(' · ')
              : tr('自动安排位置', 'Automatic placement')
          }}
        </p>
      </article>
    </section>
    <div v-if="source || references.length" class="inputs">
      <p v-if="source">
        {{ tr('图生图源图', 'Image-to-image source') }} <code>{{ source.slice(0, 12) }}</code>
      </p>
      <ol v-if="references.length">
        <li v-for="(reference, index) in references" :key="index">
          <span>{{ index + 1 }} · {{ kindLabel(reference.kind) }}</span>
          <span class="weights"
            >{{ tr('强度', 'Strength') }} {{ reference.strength }} · {{ tr('保真度', 'Fidelity') }}
            {{ reference.fidelity }}</span
          >
        </li>
      </ol>
      <button v-if="session" class="btn ghost" :aria-expanded="previewsOpen" @click="previewsOpen = !previewsOpen">
        {{ previewsOpen ? tr('收起输入图片', 'Hide input images') : tr('查看输入图片', 'View input images') }}
      </button>
      <div v-if="previewsOpen && session" class="previews">
        <ToolImage
          v-if="source"
          :src="blobUrl(`${session}/${source}`)"
          mime=""
          :path="tr('图生图源图', 'Image-to-image source')"
        />
        <ToolImage
          v-for="(reference, index) in references"
          :key="index"
          :src="blobUrl(`${session}/${reference.image}`)"
          mime=""
          :path="`${index + 1} · ${kindLabel(reference.kind)}`"
        />
      </div>
    </div>
  </section>
</template>
<style scoped>
.novelai-invocation {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header,
.weights {
  color: var(--fg-muted);
  font-size: 12px;
}
header,
.prompt,
dd {
  overflow-wrap: anywhere;
}
.prompt {
  white-space: pre-wrap;
  margin: 0;
}
.parameters {
  margin: 0;
  display: grid;
  gap: 8px;
}
.parameters > div {
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
  white-space: pre-wrap;
}
.characters {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.character {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 8px;
  min-width: 0;
}
.negative,
.position {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.negative span,
.position {
  color: var(--fg-muted);
  font-size: 12px;
}
.inputs {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
}
.inputs p {
  margin: 0 0 8px;
  overflow-wrap: anywhere;
}
ol {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
  display: grid;
  gap: 8px;
}
li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
}
.previews {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}
</style>
