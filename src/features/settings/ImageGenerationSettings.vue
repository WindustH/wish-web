<script setup lang="ts">
import { serviceOrder } from './serviceOrder.ts';
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
import { showError } from '../../ui/errorDialog.ts';
const { draft, imageCatalog } = inject(configDraftKey)!;
const mobile = useIsMobile();
const config = computed(() => (draft.value.image_generation ??= { order: [], providers: {} }));
const ids = computed(() => serviceOrder(config.value.order, config.value.providers));
const adding = ref(false),
  editing = ref('');
const current = computed(() => config.value.providers[editing.value]);
const spec = (id: string) => imageCatalog.value.find((p) => p.id === id);
const choices = computed(() =>
  imageCatalog.value.map((p) => ({
    key: p.id,
    title: p.name,
    brand: p.brand,
    description: p.model,
    search: `${p.id} ${p.protocol}`,
  })),
);
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
function setPreferred(id: string) {
  config.value.order = [id, ...config.value.order.filter((key) => key !== id)];
}
function parameters(event: Event) {
  const input = event.target as HTMLTextAreaElement;
  try {
    const value: unknown = JSON.parse(input.value);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(tr('参数必须为 JSON 对象', 'Parameters must be a JSON object'));
    current.value.parameters = value as Record<string, unknown>;
  } catch (error) {
    showError({ title: tr('生成参数无效', 'Invalid generation parameters'), error });
    input.value = JSON.stringify(current.value.parameters, null, 2);
  }
}
</script>
<template>
  <section class="set-section image-generation-settings">
    <p class="hint">
      {{
        tr(
          '默认使用第一个启用的服务。生成后保存到会话的 blob，并向模型返回本地路径。',
          'Uses the first enabled service by default. Generated images are stored as session blobs and local paths are returned to the model.',
        )
      }}
    </p>
    <div class="image-services">
      <SettingsItemCard
        v-for="(id, index) in ids"
        :key="id"
        :title="spec(config.providers[id].preset)?.name || id"
        :summary="`${config.providers[id].model} · ${draft.accounts[config.providers[id].credential_id]?.name || tr('未关联账户', 'No account')}`"
        :edit-hint="tr('编辑服务', 'Edit service')"
        :remove-hint="tr('删除服务', 'Delete service')"
        @open="editing = id"
        @remove="remove(id)"
      >
        <template #mark><ProviderIcon :brand="spec(config.providers[id].preset)?.brand" fallback="image" /></template>
        <template #actions
          ><button v-if="index" class="btn sm ghost" @click.stop="setPreferred(id)">
            {{ tr('设为首选', 'Use by default') }}
          </button></template
        >
      </SettingsItemCard>
      <button class="provider-add" @click="adding = true">
        <span class="provider-add-icon"><Icon name="plus" /></span>{{ tr('添加生图服务', 'Add image service') }}
      </button>
    </div>
    <p class="hint">
      {{
        tr(
          '在「扩展工具」中启用 Image Generate。生图可能产生费用，提交中断时不会自动重试或切换服务。',
          'Enable Image Generate under Tools. Generation may incur charges; interrupted submissions are not automatically retried or routed to another service.',
        )
      }}
    </p>
    <PickerDialog
      v-if="adding"
      :title="tr('添加生图服务', 'Add image service')"
      :items="choices"
      :placeholder="tr('搜索生图服务…', 'Search image services…')"
      @close="adding = false"
      @choose="add"
    />
    <Modal
      v-if="current"
      :open="true"
      :page="mobile"
      content-class="settings-editor"
      :title="spec(current.preset)?.name || current.preset"
      @close="editing = ''"
    >
      <div class="image-editor">
        <div class="set-card">
          <SwitchRow v-model="current.enabled" :name="tr('启用', 'Enabled')" />
          <div class="set-row stacked">
            <span class="set-label">{{ tr('账户', 'Account') }}</span
            ><AccountPicker
              required
              v-model="current.credential_id"
              :allowed="spec(current.preset)?.account_presets"
              :required-credentials="spec(current.preset)?.required_credentials"
              :preset="spec(current.preset)?.account_presets[0]"
            />
          </div>
          <label class="set-row stacked"
            ><span class="set-label">{{ tr('模型 ID', 'Model ID') }}</span
            ><input class="input" v-model="current.model"
          /></label>
          <label class="set-row stacked"
            ><span class="set-label">{{ tr('接口基础地址', 'Base URL') }}</span
            ><input class="input" v-model="current.base_url" :placeholder="spec(current.preset)?.base_url"
          /></label>
          <SwitchRow v-model="current.proxy_enabled" :name="tr('使用代理', 'Use proxy')" />
        </div>
        <div class="set-card">
          <label class="set-row stacked"
            ><span class="set-label">{{ tr('生成参数（JSON）', 'Generation parameters (JSON)') }}</span
            ><small>{{
              tr(
                '按服务协议配置尺寸、质量、数量等；留 {} 使用预设。',
                'Configure size, quality and count according to the service protocol; use {} for preset defaults.',
              )
            }}</small
            ><textarea
              class="input parameters"
              :value="JSON.stringify(current.parameters, null, 2)"
              @change="parameters"
            />
          </label>
        </div>
        <p class="hint">
          {{
            spec(current.preset)?.image_required
              ? tr(
                  '局部重绘与扩图：需要一张源图，另提供同尺寸黑白 PNG 蒙版（白色重绘、黑色保留），或使用源图的透明区域。支持最多 4096 像素边长，输入合计 12 MiB。扩图时先准备扩大的画布并标记新增区域。',
                  'Inpainting and outpainting: provide one source plus a matching black/white PNG mask (white edits, black preserves), or use source transparency. Maximum edge 4096 pixels; 12 MiB combined. For outpainting, prepare an enlarged canvas and mark the added area.',
                )
              : spec(current.preset)?.protocol === 'xai'
                ? tr(
                    'Grok Imagine 2.0 支持最多 5 张有序参考图，可混用会话图片与 HTTPS 地址，按文字指令编辑或合成。支持单次调用设置比例、1K/2K、auto/low/medium 画质和最多 10 张输出；本地输入合计 12 MiB。不支持 GPT Image 的蒙版与透明标注参数。',
                    'Grok Imagine 2.0 supports up to 5 ordered references, mixing session images and HTTPS URLs for editing or composition. Per-call options control aspect ratio, 1K/2K, auto/low/medium quality and up to 10 outputs. Local inputs are limited to 12 MiB combined. GPT Image mask and markup parameters are not supported.',
                  )
                : spec(current.preset)?.protocol === 'wan'
                  ? tr(
                      'Wan 2.7 支持最多 9 张有序参考图，可按文字编辑或用 bbox_list 框选区域。支持会话图片及 HTTPS 地址；本地图片边长 240–4096、宽高比 1:8–8:1，合计 12 MiB，不接受透明像素。框选坐标按校正方向后的图片计算，每张最多两处。编辑输出最高 2K。可在调用参数中设置 size、seed、watermark、thinking_mode 和 color_palette。普通模式最多 4 张；enable_sequential 组图模式最多 12 张，不能与 color_palette 同用。Pro 仅纯文生图支持 4K。',
                      'Wan 2.7 supports up to 9 ordered references, prompt editing and bbox_list regions. Use session images or HTTPS URLs. Local images require edges 240–4096, aspect ratio 1:8–8:1, 12 MiB combined, and no transparent pixels. Boxes use orientation-corrected pixel coordinates, up to two per image. Editing output is limited to 2K. Per-call controls include size, seed, watermark, thinking_mode and color_palette. Standard mode allows up to 4 outputs; enable_sequential allows up to 12 and cannot use color_palette. Pro supports 4K only for non-sequential text-to-image.',
                    )
                  : spec(current.preset)?.protocol === 'runninghub'
                    ? tr(
                        '支持文生图及最多 10 张参考图。会话图片会先校正方向并转换为 PNG，上传到 RunningHub 后生成；也支持 HTTPS 图片地址。本地图片边长最多 4096，转换后合计 12 MiB。resolution 优先于 width/height，支持 1k、2k；输出 png 或 jpeg。单次调用可覆盖输出格式，并选择 1K/2K 或一组宽高；显式宽高会替代默认 resolution。',
                        'Supports text-to-image and up to 10 references. Local images are orientation-corrected, converted to PNG and uploaded to RunningHub; HTTPS image URLs are also supported. Maximum local edge 4096 pixels, 12 MiB combined after conversion. resolution (1k/2k) overrides width/height; outputs png/jpeg. Per-call options override format and either select 1K/2K or a width/height pair; explicit dimensions replace the configured resolution.',
                      )
                    : spec(current.preset)?.protocol === 'jimeng'
                      ? tr(
                          '支持文生图和最多 14 张 HTTPS 参考图。即梦接口仅接收公网图片地址，不能直接读取本地附件。默认只生成一张；可在参数中调整 force_single、size、width/height、scale 等。',
                          'Supports text-to-image and up to 14 public HTTPS reference images. Jimeng cannot read local attachments directly. Defaults to one output; configure force_single, size, width/height, scale and other supported parameters below.',
                        )
                      : spec(current.preset)?.protocol === 'novelai'
                        ? tr(
                            '支持文生图、单图图生图，以及 V4.5 角色／风格参考。参考图会按比例缩放并补黑边；可单独控制参考强度和保真度，也可与图生图组合。参考功能按上游规则额外计费。蒙版重绘尚未接入。',
                            'Supports text-to-image, single-image editing, and V4.5 character/style references. References are resized proportionally with black padding, with separate strength and fidelity controls; they can accompany an image-to-image source. Extra upstream reference fees apply. Mask inpainting is not yet integrated.',
                          )
                        : spec(current.preset)?.protocol === 'openai'
                          ? tr(
                              'GPT Image 支持最多 16 张会话图片或 HTTPS 参考图，可按文字指令编辑与合成。本地输入合计 12 MiB。模型可为单次请求指定尺寸、画质、输出格式和透明背景。支持黑白蒙版重绘；GPT Image 2.5 还支持透明 PNG 标注图。蒙版与标注不能同时使用，首张源图需为本地图片，尺寸须匹配且边长不超过 4096。此能力不适用于 ChatGPT 订阅通道。',
                              'GPT Image supports up to 16 session images or HTTPS references for prompt-based editing and composition, with a 12 MiB combined local input limit. Per-call controls include size, quality, format and transparent background. Supports black/white masks and, on GPT Image 2.5, transparent PNG annotations. Mask and markup cannot be combined; the first source must be local with matching dimensions and edges up to 4096 pixels. This does not apply to the ChatGPT subscription adapter.',
                            )
                          : spec(current.preset)?.reference_images
                            ? tr(
                                `支持文生图、多图参考与文字指令编辑。模型可使用当前会话附件或已生成图片继续编辑；最多 ${spec(current.preset)?.reference_image_limit ?? 8} 张，合计 12 MiB，支持 PNG、JPEG、WebP。实际能力取决于所选模型。`,
                                `Supports text-to-image, multiple reference images and prompt-based editing. The model can reuse session attachments or generated images: up to ${spec(current.preset)?.reference_image_limit ?? 8} PNG, JPEG or WebP images, 12 MiB combined. Actual capabilities depend on the selected model.`,
                              )
                            : tr(
                                '当前接入支持文生图；尚未接入此服务的参考图与编辑功能。',
                                'This adapter currently supports text-to-image; reference images and editing are not integrated for this service.',
                              )
          }}
        </p>
        <p v-if="current.preset === 'codex_images'" class="hint">
          {{
            tr(
              '使用 ChatGPT 登录账户与订阅额度。此通道沿用 Codex 接口，是否可用取决于账户权限；不等同于 OpenAI API。',
              'Uses ChatGPT sign-in and subscription allowance through the Codex interface. Availability depends on account access; this is separate from the OpenAI API.',
            )
          }}
        </p>
        <a
          v-if="spec(current.preset)?.docs_url"
          :href="spec(current.preset)?.docs_url"
          target="_blank"
          rel="noreferrer"
          >{{ tr('服务文档', 'Service documentation') }}</a
        >
      </div>
      <template #footer>
        <button v-if="mobile && config.order[0] !== editing" class="btn ghost" @click="setPreferred(editing)">
          {{ tr('设为首选', 'Use by default') }}
        </button>
        <button v-if="mobile" class="btn danger ghost" @click="remove(editing)">
          {{ tr('删除服务', 'Delete service') }}
        </button>
        <button class="btn primary" @click="editing = ''">{{ tr('完成', 'Done') }}</button>
      </template>
    </Modal>
  </section>
</template>
<style scoped>
.image-services,
.image-editor {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.hint {
  color: var(--fg-muted);
  font-size: 13px;
  line-height: 1.6;
}
.parameters {
  min-height: 140px;
  font-family: var(--font-mono);
  resize: vertical;
}
.image-editor small {
  color: var(--fg-muted);
}
</style>
