<script setup lang="ts">
// One search provider: a card with whether it can search now, and its editor.
import { computed, inject, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import AccountPicker from './AccountPicker.vue';
import ProviderIcon from '../../ui/domain/providers/ProviderIcon.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { searchCheck, type SearchPreset, type SearchProviderStatus } from '../../core/api/endpoints.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import { configDraftKey } from './useConfigDraft.ts';
import SettingsItemCard, { type ItemState } from './SettingsItemCard.vue';

export interface SearchProviderConfig {
  preset: string;
  credential_id?: string | null;
  enabled: boolean;
  base_url?: string | null;
  auth_provider?: string | null;
  api_key?: string | null;
  api_key_env?: string | null;
  proxy_enabled: boolean;
  headers?: Record<string, string>;
}

const props = defineProps<{
  id: string;
  position: number;
  value: SearchProviderConfig;
  preset?: SearchPreset;
  status?: SearchProviderStatus;
  statusKnown?: boolean;
  // Model providers this one can borrow: the ones whose preset the search comes with.
  lenders: { value: string; label: string; brand?: string }[];
  initiallyOpen?: boolean;
  save?: () => Promise<boolean>;
  dirty?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ remove: []; checked: []; grab: [event: PointerEvent]; move: [delta: number] }>();
const isMobile = useIsMobile();
const configDraft = inject(configDraftKey);
const editing = ref(props.initiallyOpen ?? false);
const checking = ref(false);

const name = computed(() => props.preset?.name ?? props.value.preset);
const borrowed = computed(() => !!props.preset?.borrows_from?.length);
const lenderName = computed(
  () =>
    props.lenders.find((item) => item.value === props.value.auth_provider)?.label ?? props.value.auth_provider ?? '',
);
const address = computed(() => props.value.base_url || props.status?.base_url || '');
const subtitle = computed(() =>
  props.value.credential_id
    ? (configDraft?.draft.value.accounts?.[props.value.credential_id]?.name || props.value.credential_id).replace(
        /^model-/,
        '',
      )
    : borrowed.value
      ? tr(`借用 ${lenderName.value} 的账户`, `Uses ${lenderName.value}'s account`)
      : [props.preset?.key === 'none' ? tr('无需密钥', 'No key') : tr('自带密钥', 'Own key'), address.value]
          .filter(Boolean)
          .join(' · '),
);
const problem = computed(() => (props.status?.problem ? describeError(props.status.problem).message : ''));
// The badge describes configuration, just like models and readers. Test failures stay separate.
const state = computed<ItemState>(() =>
  props.value.enabled
    ? { kind: 'ok', text: tr('已启用', 'Enabled') }
    : { kind: 'disabled', text: tr('已停用', 'Disabled') },
);

// A key saved before shows as "<redacted>"; leaving the field empty keeps it.
const baseUrl = computed({
  get: () => props.value.base_url ?? '',
  set: (text: string) => {
    props.value.base_url = text.trim() || null;
  },
});
// A search goes to what is saved, so unsaved edits are saved first.
async function check() {
  if (checking.value) return;
  checking.value = true;
  try {
    if (props.dirty && props.save && !(await props.save())) return;
    const result = await searchCheck(props.id);
    const seconds = (result.duration_ms / 1000).toFixed(1);
    toast(
      tr(
        `${name.value} 可以搜索：${result.results.length} 条结果，${seconds} 秒`,
        `${name.value} works: ${result.results.length} result${result.results.length === 1 ? '' : 's'} in ${seconds} s`,
      ),
    );
  } catch (error) {
    showError({ title: tr('搜索失败', 'The search failed'), error });
  } finally {
    checking.value = false;
    emit('checked');
  }
}
</script>

<template>
  <SettingsItemCard
    :title="name"
    :summary="subtitle"
    :state="state"
    :position="position"
    draggable
    :edit-hint="tr('编辑', 'Edit')"
    :remove-hint="tr('删除', 'Delete')"
    :check-hint="tr('测试', 'Test')"
    :checking="checking"
    :busy="busy"
    @open="editing = true"
    @remove="emit('remove')"
    @check="check"
    @grab="emit('grab', $event)"
    @move="emit('move', $event)"
  >
    <template #mark><ProviderIcon :brand="preset?.brand" fallback="globe" /></template>
    <div v-if="!isMobile && problem && value.enabled" class="search-problem">
      <Icon name="triangle-alert" />
      <p>{{ problem }}</p>
    </div>

    <Modal
      compact
      wide
      :page="isMobile"
      :open="editing"
      :content-class="isMobile ? 'settings-editor mobile-settings-page' : 'settings-editor'"
      :title="isMobile ? name : tr('编辑搜索提供商 · ', 'Edit search provider · ') + name"
      @close="editing = false"
    >
      <div class="search-form">
        <div class="set-card">
          <div class="set-row inline toggle-row">
            <span class="set-label"
              ><span>{{ tr('启用', 'Enabled') }}</span
              ><small>{{
                tr('停用后保留配置，但不会被用来搜索', 'Kept in the configuration, but never asked')
              }}</small></span
            ><SwitchRoot v-model="value.enabled" class="cfg-switch" :aria-label="tr('启用', 'Enabled')"
              ><SwitchThumb class="cfg-switch-thumb"
            /></SwitchRoot>
          </div>
        </div>
        <div class="set-card">
          <div v-if="preset?.key !== 'none'" class="set-row">
            <span class="set-label">{{ tr('账户', 'Account') }}</span
            ><AccountPicker
              v-model="value.credential_id"
              :allowed="preset?.borrows_from"
              :preset="preset?.borrows_from?.[0]"
            />
          </div>
          <label class="set-row"
            ><span class="set-label"
              ><span>{{ tr('地址', 'Address') }}</span
              ><small>{{
                preset?.base_url_required
                  ? tr('你部署的实例的地址', 'Where your instance is')
                  : tr('留空使用服务商的默认地址', "Empty uses the service's own address")
              }}</small></span
            ><input
              class="input set-mono"
              v-model.lazy="baseUrl"
              :placeholder="
                preset?.base_url_placeholder ||
                (preset?.base_url_required ? 'https://' : tr('默认地址', 'Default address'))
              "
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
          /></label>
          <div class="set-row inline toggle-row">
            <span class="set-label"
              ><span>{{ tr('使用代理', 'Use proxy') }}</span
              ><small>{{ tr('使用「网络」设置中的代理', 'Use the proxy configured under Network') }}</small></span
            ><SwitchRoot v-model="value.proxy_enabled" class="cfg-switch" :aria-label="tr('使用代理', 'Use proxy')"
              ><SwitchThumb class="cfg-switch-thumb"
            /></SwitchRoot>
          </div>
        </div>
        <p v-if="preset?.docs_url" class="search-docs">
          <a :href="preset.docs_url" target="_blank" rel="noreferrer">{{
            tr('查看这个服务的文档', "Read this service's documentation")
          }}</a>
        </p>
        <div v-if="isMobile" class="set-card">
          <div class="set-row inline">
            <span class="set-label"
              ><span>{{ state?.text }}</span
              ><small>{{ problem || tr('用它搜一次，确认能用', 'Search once to see that it works') }}</small></span
            ><button type="button" class="btn" :disabled="checking || busy" @click="check">
              <Icon v-if="checking" name="loader-circle" class="spin" />{{ tr('测试', 'Test') }}
            </button>
          </div>
        </div>
        <button
          v-if="isMobile"
          type="button"
          class="btn danger solid search-mobile-remove"
          @click="
            editing = false;
            emit('remove');
          "
        >
          <Icon name="trash-2" />{{ tr('删除', 'Delete') }}
        </button>
      </div>
      <template v-if="!isMobile" #footer
        ><span class="hint">{{
          tr('修改保留在设置草稿中，保存后生效。', 'Changes remain in the settings draft until saved.')
        }}</span
        ><button class="btn primary" @click="editing = false">{{ tr('完成', 'Done') }}</button></template
      >
    </Modal>
  </SettingsItemCard>
</template>

<style scoped>
.search-problem {
  display: flex;
  gap: 10px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--line);
  color: var(--err);
  font-size: 12.5px;
  line-height: 1.6;
}
.search-problem > .icon {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 3px;
}
.search-problem p {
  margin: 0;
  overflow-wrap: anywhere;
}
.search-form {
  display: grid;
  gap: 16px;
}
.search-form .set-row input::placeholder {
  font-family: var(--font);
}
.search-form .set-row.inline > .btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.search-docs {
  margin: -4px 4px 0;
  font-size: 12.5px;
}
.hint {
  font-size: 12px;
  color: var(--fg-subtle);
  margin-right: auto;
}
@media (max-width: 899px) {
  .search-mobile-remove {
    width: 100%;
    min-height: 52px;
    justify-content: center;
    border-radius: 18px;
  }
}
</style>
