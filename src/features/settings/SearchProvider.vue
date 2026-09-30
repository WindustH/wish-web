<script setup lang="ts">
// One search provider: a card with whether it can search now, and its editor.
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import SelectField from '../../ui/components/SelectField.vue';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { searchCheck, type SearchPreset, type SearchProviderStatus } from '../../core/api/endpoints.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import SettingsItemCard, { type ItemState } from './SettingsItemCard.vue';
import { REDACTED, secretText, readSecret } from '../../core/secretRef.ts';

export interface SearchProviderConfig {
  preset: string;
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
  count: number;
  value: SearchProviderConfig;
  preset?: SearchPreset;
  status?: SearchProviderStatus;
  // Model providers this one can borrow: the ones whose preset the search comes with.
  lenders: { value: string; label: string; brand?: string }[];
  initiallyOpen?: boolean;
  save?: () => Promise<boolean>;
  dirty?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ remove: []; checked: []; move: [delta: number] }>();
const isMobile = useIsMobile();
const editing = ref(props.initiallyOpen ?? false);
const checking = ref(false);

const name = computed(() => props.preset?.name ?? props.value.preset);
const borrowed = computed(() => !!props.preset?.borrows_from?.length);
const lenderName = computed(() => props.lenders.find(item => item.value === props.value.auth_provider)?.label ?? props.value.auth_provider ?? '');
const address = computed(() => props.value.base_url || props.status?.base_url || '');
const subtitle = computed(() => borrowed.value
  ? tr(`借用 ${lenderName.value} 的账户`, `Uses ${lenderName.value}'s account`)
  : [props.preset?.key === 'none' ? tr('无需密钥', 'No key') : tr('自带密钥', 'Own key'), address.value].filter(Boolean).join(' · '));
const problem = computed(() => props.status?.problem ? describeError(props.status.problem).message : '');
const state = computed<ItemState>(() => {
  if (!props.value.enabled) return { kind: 'disabled', text: tr('已停用', 'Disabled') };
  if (!props.status) return { kind: 'idle', text: tr('未保存', 'Not saved') };
  if (!props.status.available) return { kind: 'error', text: tr('不可用', 'Unavailable') };
  return { kind: 'ok', text: tr('可用', 'Ready') };
});

// A key saved before shows as "<redacted>"; leaving the field empty keeps it.
const storedKey = props.value.api_key === REDACTED;
const keyValue = computed(() => secretText(props.value.api_key, props.value.api_key_env));
function setKey(text: string) {
  const { value, env } = readSecret(text.trim(), storedKey ? REDACTED : null);
  props.value.api_key_env = env;
  props.value.api_key = value;
}
const baseUrl = computed({
  get: () => props.value.base_url ?? '',
  set: (text: string) => { props.value.base_url = text.trim() || null; },
});
const lender = computed({
  get: () => props.value.auth_provider ?? '',
  set: (id: string) => { props.value.auth_provider = id || null; },
});

// A search goes to what is saved, so unsaved edits are saved first.
async function check() {
  if (checking.value) return;
  checking.value = true;
  try {
    if (props.dirty && props.save && !(await props.save())) return;
    const result = await searchCheck(props.id);
    const seconds = (result.duration_ms / 1000).toFixed(1);
    toast(tr(`${name.value} 可以搜索：${result.results.length} 条结果，${seconds} 秒`, `${name.value} works: ${result.results.length} result${result.results.length === 1 ? '' : 's'} in ${seconds} s`));
  } catch (error) {
    showError({ title: tr('搜索失败', 'The search failed'), error });
  } finally {
    checking.value = false;
    emit('checked');
  }
}
</script>

<template>
  <SettingsItemCard :title="name" :summary="subtitle" :state="state" :position="position" draggable :edit-hint="tr('编辑', 'Edit')" :remove-hint="tr('删除', 'Delete')" :check-hint="tr('试搜一次', 'Try a search')" :checking="checking" :busy="busy" @open="editing = true" @remove="emit('remove')" @check="check">
    <template #mark><ProviderIcon :brand="preset?.brand" fallback="globe" /></template>
    <div v-if="!isMobile && problem && value.enabled" class="search-problem"><Icon name="triangle-alert" /><p>{{ problem }}</p></div>

    <Modal compact wide :page="isMobile" :open="editing" :content-class="isMobile ? 'settings-editor mobile-settings-page' : 'settings-editor'" :title="isMobile ? name : tr('编辑搜索提供商 · ', 'Edit search provider · ') + name" @close="editing = false">
      <div class="search-form">
        <div class="set-card">
          <div class="set-row inline toggle-row"><span class="set-label"><span>{{ tr('启用', 'Enabled') }}</span><small>{{ tr('停用后保留配置，但不会被用来搜索', 'Kept in the configuration, but never asked') }}</small></span><SwitchRoot v-model="value.enabled" class="cfg-switch" :aria-label="tr('启用', 'Enabled')"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        </div>
        <div v-if="borrowed" class="set-card">
          <label class="set-row"><span class="set-label"><span>{{ tr('使用的账户', 'Account') }}</span><small>{{ tr('订阅附带的搜索，用这个模型提供商的凭据和代理设置', 'Search that comes with a subscription uses this model provider\'s credentials and proxy') }}</small></span><SelectField mobile-page :picker-title="tr('使用的账户', 'Account')" v-model="lender" :options="lenders" /></label>
        </div>
        <div v-else class="set-card">
          <label v-if="preset?.key !== 'none'" class="set-row"><span class="set-label"><span>API Key</span><small><template v-if="preset?.key_url">{{ tr('在服务商的控制台获取，', 'Get one from the service\'s console, ') }}<a :href="preset.key_url" target="_blank" rel="noreferrer">{{ tr('打开', 'open') }}</a></template><template v-else>{{ tr('服务商给的密钥', 'The key the service issued') }}</template></small></span><input class="input" :type="value.api_key_env != null ? 'text' : 'password'" :value="keyValue" :placeholder="value.api_key === REDACTED ? tr('已配置，留空保留', 'Configured; leave empty to keep') : tr('直接填写，或使用 ${ENV_NAME}', 'Enter a key or use ${ENV_NAME}')" autocomplete="new-password" @input="setKey(($event.target as HTMLInputElement).value)" /></label>
          <label class="set-row"><span class="set-label"><span>{{ tr('地址', 'Address') }}</span><small>{{ preset?.base_url_required ? tr('你部署的实例的地址', 'Where your instance is') : tr('留空使用服务商的默认地址', 'Empty uses the service\'s own address') }}</small></span><input class="input set-mono" v-model.lazy="baseUrl" :placeholder="preset?.base_url_placeholder || (preset?.base_url_required ? 'https://' : tr('默认地址', 'Default address'))" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
          <div class="set-row inline toggle-row"><span class="set-label"><span>{{ tr('使用代理', 'Use proxy') }}</span><small>{{ tr('按「提供商」中的网络代理设置连接', 'Connect through the network proxy set under Providers') }}</small></span><SwitchRoot v-model="value.proxy_enabled" class="cfg-switch" :aria-label="tr('使用代理', 'Use proxy')"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        </div>
        <p v-if="preset?.docs_url" class="search-docs"><a :href="preset.docs_url" target="_blank" rel="noreferrer">{{ tr('查看这个服务的文档', 'Read this service\'s documentation') }}</a></p>

        <div v-if="isMobile && count > 1" class="set-card">
          <div class="set-row inline"><span class="set-label"><span>{{ tr(`第 ${position} 个询问`, `Asked ${position} of ${count}`) }}</span><small>{{ tr('前一个用不了时才轮到后面的', 'A later one is asked only when the earlier ones cannot answer') }}</small></span><span class="search-move"><button type="button" class="btn icon-only" :disabled="position === 1" :aria-label="tr('上移', 'Move up')" @click="emit('move', -1)"><Icon name="arrow-up" /></button><button type="button" class="btn icon-only" :disabled="position === count" :aria-label="tr('下移', 'Move down')" @click="emit('move', 1)"><Icon name="arrow-down" /></button></span></div>
        </div>
        <div v-if="isMobile" class="set-card">
          <div class="set-row inline"><span class="set-label"><span>{{ state.text }}</span><small>{{ problem || tr('用它搜一次，确认能用', 'Search once to see that it works') }}</small></span><button type="button" class="btn" :disabled="checking || busy" @click="check"><Icon v-if="checking" name="loader-circle" class="spin" />{{ tr('试搜', 'Try') }}</button></div>
        </div>
        <button v-if="isMobile" type="button" class="btn danger solid search-mobile-remove" @click="editing = false; emit('remove')"><Icon name="trash-2" />{{ tr('删除', 'Delete') }}</button>
      </div>
      <template v-if="!isMobile" #footer><span class="hint">{{ tr('修改保留在设置草稿中，保存后生效。', 'Changes remain in the settings draft until saved.') }}</span><button class="btn primary" @click="editing = false">{{ tr('完成', 'Done') }}</button></template>
    </Modal>
  </SettingsItemCard>
</template>

<style scoped>
.search-problem { display: flex; gap: 10px; padding: 10px 16px 12px; border-top: 1px solid var(--line); color: var(--err); font-size: 12.5px; line-height: 1.6; }
.search-problem > .icon { flex: none; width: 15px; height: 15px; margin-top: 3px; }
.search-problem p { margin: 0; overflow-wrap: anywhere; }
.search-form { display: grid; gap: 16px; }
.search-form .set-row input::placeholder { font-family: var(--font); }
.search-form .set-row.inline > .btn { display: inline-flex; align-items: center; gap: 6px; }
.search-docs { margin: -4px 4px 0; font-size: 12.5px; }
.search-move { display: flex; gap: 6px; }
.hint { font-size: 12px; color: var(--fg-subtle); margin-right: auto; }
@media (max-width: 899px) {
  .search-mobile-remove { width: 100%; min-height: 52px; justify-content: center; border-radius: 18px; }
}
</style>
