<script setup lang="ts">
import type { VideoMode } from '../../core/mediaGeneration.ts';
import { serviceOrder } from './serviceOrder.ts';
import { computed, inject, ref } from 'vue';
import { configDraftKey } from './useConfigDraft.ts';
import AccountPicker from './AccountPicker.vue';
import SettingsItemCard from './SettingsItemCard.vue';
import OrderedSettingsList from './OrderedSettingsList.vue';
import PickerDialog from '../../ui/domain/providers/PickerDialog.vue';
import ProviderIcon from '../../ui/domain/providers/ProviderIcon.vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import SpeechControlRows from './SpeechControlRows.vue';
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
const videoCapabilities = computed(() =>
  currentSpec.value?.model === current.value?.model ? currentSpec.value?.video : undefined,
);
const editOnly = computed(
  () => videoCapabilities.value?.modes.length === 1 && videoCapabilities.value.modes[0] === 'edit',
);
const modeTitle = (mode: VideoMode) =>
  ({
    text: tr('文生视频', 'Text to video'),
    frames: videoCapabilities.value?.input_roles.includes('last_frame')
      ? tr('首尾帧 / 图生视频', 'Frame-guided video')
      : tr('图生视频', 'Image to video'),
    reference: tr('多模态参考', 'Multimodal references'),
    edit: tr('视频编辑', 'Video editing'),
    extend: tr('视频延长', 'Video extension'),
  })[mode];
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
const order = computed<string[]>({
  get: () => serviceOrder(config.value.order, config.value.providers),
  set: (ids) => {
    config.value.order = ids;
  },
});
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
    parameters: { ...preset.defaults },
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
function applyDurationInput(event: Event) {
  if (current.value) {
    const value = (event.target as HTMLInputElement).value;
    current.value.parameters.duration = value === '' ? null : Number(value);
  }
}
</script>
<template>
  <section class="set-section media-settings">
    <header class="set-section-head">
      <h3>
        {{
          section === 'video_generation'
            ? tr('视频生成提供商', 'Video providers')
            : section === 'audio_generation'
              ? tr('音频生成提供商', 'Audio providers')
              : tr('语音转写提供商', 'Transcription providers')
        }}
      </h3>
      <p>
        {{
          tr(
            '默认使用第一个启用且支持当前用途的服务，可以复用已有账户。拖动可以调整顺序。',
            'Uses the first enabled service supporting the request. Services can share existing accounts. Drag to reorder.',
          )
        }}
      </p>
    </header>
    <div class="services">
      <OrderedSettingsList
        v-if="order.length"
        v-model="order"
        @open="editing = $event"
        v-slot="{ id, index, open, grab, move }"
      >
        <SettingsItemCard
          draggable
          :title="spec(config.providers[id].preset)?.name || id"
          :summary="`${config.providers[id].model} · ${draft.accounts[config.providers[id].credential_id]?.name || tr('未关联账户', 'No account')}`"
          :position="index + 1"
          :state="{
            kind: config.providers[id].enabled ? 'ok' : 'disabled',
            text: config.providers[id].enabled ? tr('已启用', 'Enabled') : tr('已停用', 'Disabled'),
          }"
          :edit-hint="tr('编辑服务', 'Edit service')"
          :remove-hint="tr('删除服务', 'Delete service')"
          @open="open"
          @remove="remove(id)"
          @grab="grab"
          @move="move"
        >
          <template #mark><ProviderIcon :brand="spec(config.providers[id].preset)?.brand" :fallback="icon" /></template>
        </SettingsItemCard>
      </OrderedSettingsList>
      <p v-else class="provider-list-empty">{{ tr('还没有配置服务。', 'No services configured yet.') }}</p>
      <button class="provider-add" @click="adding = true">
        <span class="provider-add-icon"><Icon name="plus" /></span>{{ tr('添加服务', 'Add service') }}
      </button>
    </div>
    <p class="hint">
      {{
        props.section === 'audio_transcription'
          ? tr(
              '在「扩展工具」中启用 Audio Transcribe。文件上限最高为 32 MiB，部分服务限 25 MB；语言提示和说话人区分取决于服务。',
              'Enable Audio Transcribe under Tools. Files up to 32 MiB are supported (25 MB for some services); language hints and speaker attribution depend on the service.',
            )
          : tr(
              '在「扩展工具」中启用对应生成工具。生成请求中断后不会自动重发或切换服务。',
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
      compact
      :content-class="mobile ? 'settings-editor mobile-settings-page' : 'settings-editor'"
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
              :required-credentials="currentSpec?.required_credentials"
              :preset="currentSpec?.account_presets[0]"
            />
          </div>
          <label v-if="currentSpec?.protocol !== 'xai_speech'" class="set-row stacked"
            ><span class="set-label">{{ tr('模型 ID', 'Model ID') }}</span
            ><input class="input" v-model="current.model"
          /></label>
          <label class="set-row stacked"
            ><span class="set-label">{{ tr('接口基础地址', 'Base URL') }}</span
            ><input class="input" v-model="current.base_url" :placeholder="currentSpec?.base_url"
          /></label>
          <SwitchRow v-model="current.proxy_enabled" :name="tr('使用代理', 'Use proxy')" />
        </div>
        <div v-if="currentSpec?.kind !== 'transcription' && !editOnly" class="set-card">
          <label v-if="currentSpec?.kind === 'speech'" class="set-row stacked"
            ><span class="set-label">{{ tr('默认音色 ID', 'Default voice ID') }}</span
            ><input
              class="input"
              v-model="current.parameters.voice"
              :placeholder="
                currentSpec?.protocol === 'xai_speech'
                  ? 'eve'
                  : tr('留空由模型调用时指定', 'Leave empty to choose per call')
              "
          /></label>
          <label v-else-if="currentSpec?.protocol !== 'xiaoyunque_video'" class="set-row stacked"
            ><span class="set-label">{{ tr('默认时长（秒）', 'Default duration (seconds)') }}</span
            ><input
              class="input"
              type="number"
              :value="current.parameters.duration"
              @input="applyDurationInput"
              :placeholder="tr('使用服务默认值', 'Service default')"
          /></label>
          <SpeechControlRows
            v-if="['minimax_speech', 'xai_speech'].includes(currentSpec?.protocol || '')"
            v-model="current.parameters"
            :model="current.model"
            :protocol="currentSpec?.protocol"
          />
          <template v-if="currentSpec?.protocol === 'xiaoyunque_video'">
            <label class="set-row stacked"
              ><span class="set-label">{{ tr('目标时长', 'Target duration') }}</span>
              <select class="input" v-model="current.parameters.duration_hint">
                <option :value="null">{{ tr('由服务决定', 'Let the service choose') }}</option>
                <option v-for="duration in ['～15s', '～30s', '40～60s', '1min+']" :key="duration">
                  {{ duration }}
                </option></select
              ><small>{{
                tr(
                  '最终时长由服务决定，可能与目标值不同。',
                  'The service determines the final duration, which may differ from this target.',
                )
              }}</small>
            </label>
            <label class="set-row stacked"
              ><span class="set-label">{{ tr('视频语言', 'Video language') }}</span>
              <select class="input" v-model="current.parameters.language">
                <option :value="null">{{ tr('使用服务默认值', 'Service default') }}</option>
                <option
                  v-for="language in [
                    'Chinese',
                    'English',
                    'Japanese',
                    'Thai',
                    'SouthAfrican',
                    'French',
                    'Turkish',
                    'Malay',
                    'German',
                    'Korean',
                    'Russian',
                    'Spanish',
                    'Indonesian',
                    'Italian',
                    'Portuguese',
                    'Filipino',
                    'Vietnamese',
                    'Dutch',
                    'Arabic',
                  ]"
                  :key="language"
                >
                  {{ language }}
                </option>
              </select>
            </label>
            <SwitchRow
              :model-value="current.parameters.watermark ?? true"
              @update:model-value="current.parameters.watermark = $event"
              :name="tr('显示生成水印', 'Show generation watermark')"
            />
          </template>
          <template v-if="currentSpec?.kind === 'video'">
            <label class="set-row stacked"
              ><span class="set-label">{{ tr('画幅', 'Aspect ratio') }}</span
              ><select class="input" v-model="current.parameters.aspect_ratio">
                <option :value="null">{{ tr('使用服务默认值', 'Service default') }}</option>
                <option v-for="ratio in currentSpec?.aspect_ratios ?? []" :key="ratio">{{ ratio }}</option>
              </select></label
            >
            <label v-if="currentSpec?.resolutions?.length" class="set-row stacked"
              ><span class="set-label">{{ tr('分辨率', 'Resolution') }}</span
              ><select class="input" v-model="current.parameters.resolution">
                <option :value="null">{{ tr('使用服务默认值', 'Service default') }}</option>
                <option v-for="resolution in currentSpec?.resolutions ?? []" :key="resolution">
                  {{ resolution }}
                </option></select
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
        <div v-if="videoCapabilities" class="set-card">
          <div class="set-row stacked">
            <span class="set-label">{{ tr('支持的用途', 'Supported uses') }}</span>
            <span>{{ videoCapabilities.modes.map(modeTitle).join(' · ') }}</span>
            <small>{{
              tr(
                '具体输入角色与限制可由模型通过工具查询。编辑模式不适用的生成默认值不会发送。',
                'The tool exposes supported input roles and limits. Generation defaults that do not apply to editing are not sent.',
              )
            }}</small>
            <small v-if="!videoCapabilities.blob_inputs.includes('video')">{{
              tr(
                '视频素材需公网地址；已生成的视频可复用保存的来源地址。当前不会自动公开本地附件。',
                'Video inputs require a public URL; generated videos can reuse their recorded source URL. Local attachments are not automatically published.',
              )
            }}</small>
          </div>
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
  gap: 12px;
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
