<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { configDraftKey } from './useConfigDraft.ts';
import AccountPicker from './AccountPicker.vue';
import SettingsItemCard from './SettingsItemCard.vue';
import PickerDialog from '../../ui/domain/providers/PickerDialog.vue';
import ProviderIcon from '../../ui/domain/providers/ProviderIcon.vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import SwitchRow from '../../ui/domain/settings/SwitchRow.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ section: 'video_generation' | 'audio_generation' | 'audio_transcription' }>();
const { draft, mediaCatalog } = inject(configDraftKey)!;
const mobile = useIsMobile();
const config = computed(() => (draft.value[props.section] ??= { order: [], providers: {} }));
const catalog = computed(() =>
  mediaCatalog.value.filter((p) =>
    props.section === 'video_generation'
      ? p.kind === 'video'
      : props.section === 'audio_transcription'
        ? p.kind === 'transcription'
        : ['speech', 'music', 'sound_effect'].includes(p.kind),
  ),
);
const adding = ref(false),
  editing = ref('');
const current = computed(() => config.value.providers[editing.value]);
const spec = (id: string) => catalog.value.find((p) => p.id === id);
const currentSpec = computed(() => current.value && spec(current.value.preset));
const kindTitle = (kind: string) =>
  ({
    video: tr('视频', 'Video'),
    speech: tr('配音', 'Speech'),
    music: tr('音乐', 'Music'),
    sound_effect: tr('音效', 'Sound effects'),
    transcription: 'ASR',
  })[kind] ?? kind;
const choices = computed(() =>
  catalog.value.map((p) => ({
    key: p.id,
    title: p.name,
    brand: p.brand,
    description: `${kindTitle(p.kind)} · ${p.model}`,
  })),
);
const icon = computed(() =>
  props.section === 'video_generation' ? 'video' : props.section === 'audio_transcription' ? 'mic' : 'audio',
);
const ids = computed(() => [
  ...config.value.order,
  ...Object.keys(config.value.providers).filter((id) => !config.value.order.includes(id)),
]);
function add(id: string) {
  const preset = spec(id);
  if (!preset) return;
  const key = uniqueId(id, (key) => key in config.value.providers);
  config.value.providers[key] = {
    preset: id,
    credential_id: '',
    model: preset.model,
    enabled: true,
    proxy_enabled: true,
    parameters: {},
  };
  config.value.order.push(key);
  adding.value = false;
  editing.value = key;
}
function remove(id: string) {
  if (editing.value === id) editing.value = '';
  delete config.value.providers[id];
  config.value.order = config.value.order.filter((key) => key !== id);
}
function move(id: string, direction: number) {
  const order = [...ids.value],
    index = order.indexOf(id);
  if (index < 0) {
    order.push(id);
  } else {
    const next = index + direction;
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next]!, order[index]!];
  }
  config.value.order = order;
}
function applyDurationInput(event: Event) {
  if (current.value) {
    const value = (event.target as HTMLInputElement).value;
    current.value.parameters.duration = value === '' ? null : Number(value);
  }
}
</script>
<template>
  <section class="media-settings">
    <p class="hint">
      {{
        tr(
          '按列表顺序优先使用支持当前用途的服务。模型也可指定服务，或查询当前可用列表。',
          'The first enabled service supporting the requested purpose is preferred. Models can also choose a service or inspect the current provider list.',
        )
      }}
    </p>
    <div class="services">
      <SettingsItemCard
        v-for="id in ids"
        :key="id"
        :title="spec(config.providers[id].preset)?.name || id"
        :summary="`${config.providers[id].model} · ${draft.accounts[config.providers[id].credential_id]?.name || tr('未关联账户', 'No account')}`"
        :edit-hint="tr('编辑服务', 'Edit service')"
        :remove-hint="tr('删除服务', 'Delete service')"
        @open="editing = id"
        @remove="remove(id)"
      >
        <template #mark><ProviderIcon :brand="spec(config.providers[id].preset)?.brand" :fallback="icon" /></template>
        <template #actions>
          <button
            class="btn ghost icon-only"
            :disabled="config.order.indexOf(id) === 0"
            :aria-label="tr('提高优先级', 'Move up')"
            @click.stop="move(id, -1)"
          >
            <Icon name="chevron-up" />
          </button>
          <button
            class="btn ghost icon-only"
            :disabled="config.order.indexOf(id) === config.order.length - 1"
            :aria-label="tr('降低优先级', 'Move down')"
            @click.stop="move(id, 1)"
          >
            <Icon name="chevron-down" />
          </button>
        </template>
      </SettingsItemCard>
      <button class="provider-add" @click="adding = true">
        <span class="provider-add-icon"><Icon name="plus" /></span>{{ tr('添加服务', 'Add service') }}
      </button>
    </div>
    <p class="hint">
      {{
        props.section === 'audio_transcription'
          ? tr(
              '在「工具」中启用 Audio Transcribe。当前文件上限为 32 MiB，支持语言提示与说话人区分。',
              'Enable Audio Transcribe under Tools. Files up to 32 MiB are supported, with language hints and speaker attribution.',
            )
          : tr(
              '在「工具」中启用对应生成工具。生成请求中断后不会自动重发或切换服务。',
              'Enable the corresponding generation tool under Tools. Interrupted submissions are not automatically repeated or switched to another provider.',
            )
      }}
    </p>
    <PickerDialog
      v-if="adding"
      :title="tr('添加服务', 'Add service')"
      :items="choices"
      :placeholder="tr('搜索服务…', 'Search services…')"
      @close="adding = false"
      @choose="add"
    />
    <Modal
      v-if="current"
      :open="true"
      :page="mobile"
      content-class="settings-editor"
      :title="currentSpec?.name || current.preset"
      @close="editing = ''"
    >
      <div class="media-editor">
        <div class="set-card">
          <SwitchRow v-model="current.enabled" :name="tr('启用', 'Enabled')" />
          <div class="set-row stacked">
            <span class="set-label">{{ tr('账户', 'Account') }}</span
            ><AccountPicker
              required
              v-model="current.credential_id"
              :allowed="currentSpec?.account_presets"
              :preset="currentSpec?.account_presets[0]"
            />
          </div>
          <label class="set-row stacked"
            ><span class="set-label">{{ tr('模型 ID', 'Model ID') }}</span
            ><input class="input" v-model="current.model"
          /></label>
          <label class="set-row stacked"
            ><span class="set-label">{{ tr('接口基础地址', 'Base URL') }}</span
            ><input class="input" v-model="current.base_url" :placeholder="currentSpec?.base_url"
          /></label>
          <SwitchRow v-model="current.proxy_enabled" :name="tr('使用代理', 'Use proxy')" />
        </div>
        <div v-if="currentSpec?.kind !== 'transcription'" class="set-card">
          <label v-if="currentSpec?.kind === 'speech'" class="set-row stacked"
            ><span class="set-label">{{ tr('默认音色 ID', 'Default voice ID') }}</span
            ><input
              class="input"
              v-model="current.parameters.voice"
              :placeholder="tr('留空由模型调用时指定', 'Leave empty to choose per call')"
          /></label>
          <label v-else class="set-row stacked"
            ><span class="set-label">{{ tr('默认时长（秒）', 'Default duration (seconds)') }}</span
            ><input
              class="input"
              type="number"
              :value="current.parameters.duration"
              @input="applyDurationInput"
              :placeholder="tr('使用服务默认值', 'Service default')"
          /></label>
          <template v-if="currentSpec?.kind === 'video'">
            <label class="set-row stacked"
              ><span class="set-label">{{ tr('画幅', 'Aspect ratio') }}</span
              ><select class="input" v-model="current.parameters.aspect_ratio">
                <option :value="null">16:9 ({{ tr('默认', 'default') }})</option>
                <option v-for="ratio in ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']" :key="ratio">{{ ratio }}</option>
              </select></label
            >
            <label class="set-row stacked"
              ><span class="set-label">{{ tr('分辨率', 'Resolution') }}</span
              ><select class="input" v-model="current.parameters.resolution">
                <option :value="null">768P ({{ tr('默认', 'default') }})</option>
                <option>480P</option>
                <option>768P</option>
                <option>2K</option></select
              ><small>{{ tr('可选分辨率取决于模型。', 'Supported resolutions depend on the model.') }}</small></label
            >
          </template>
          <SwitchRow
            v-if="currentSpec?.kind === 'music'"
            :model-value="current.parameters.instrumental ?? false"
            @update:model-value="current.parameters.instrumental = $event"
            :name="tr('纯音乐', 'Instrumental')"
          />
        </div>
        <div v-if="mobile" class="media-order">
          <button class="btn sm" :disabled="ids.indexOf(editing) === 0" @click="move(editing, -1)">
            {{ tr('上移', 'Move up') }}
          </button>
          <button class="btn sm" :disabled="ids.indexOf(editing) === ids.length - 1" @click="move(editing, 1)">
            {{ tr('下移', 'Move down') }}
          </button>
        </div>
        <p class="hint">
          {{ tr('服务 ID', 'Service ID') }}: <code>{{ editing }}</code>
        </p>
        <a v-if="currentSpec?.docs_url" :href="currentSpec.docs_url" target="_blank" rel="noreferrer">{{
          tr('服务文档', 'Service documentation')
        }}</a>
      </div>
      <template #footer>
        <button v-if="mobile" class="btn danger ghost" @click="remove(editing)">
          {{ tr('删除服务', 'Delete service') }}
        </button>
        <button class="btn primary" @click="editing = ''">{{ tr('完成', 'Done') }}</button>
      </template>
    </Modal>
  </section>
</template>
<style scoped>
.services,
.media-editor {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.hint,
.media-editor small {
  color: var(--fg-muted);
  font-size: 13px;
  line-height: 1.6;
}
.media-settings {
  display: grid;
  gap: 16px;
}
.hint {
  margin: 0;
}
</style>
