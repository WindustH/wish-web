<script setup lang="ts">
// Step 2: the credentials, in the form the provider takes them: a key, a ChatGPT account, AWS keys,
// or nothing for a service on the Wish machine. Moving on reads the provider's model list with
// them, so a refused key shows here, before anything is saved.
import { computed, reactive, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { MODEL_PROTOCOLS } from '../../core/provider-presets.ts';
import { protocolPresentation } from '../../ui/protocolPresentation.ts';
import { providerName } from '../../ui/providerPresentation.ts';
import Icon from '../../ui/components/Icon.vue';
import SelectField from '../../ui/components/SelectField.vue';
import AnimatedDetails from '../../ui/components/AnimatedDetails.vue';
import { credentialTitle } from '../settings/preset-profile.ts';
import { useChatgptLogin } from '../settings/useChatgptLogin.ts';
import SetupChosen from './SetupChosen.vue';
import type { SetupState } from './useProviderSetup.ts';

const props = defineProps<{ setup: SetupState }>();
const setup = props.setup;
const reveal = ref(false);
// A ChatGPT account can also be given as a token by hand.
const manualToken = ref(false);
const login = reactive(useChatgptLogin(() => setup.id.trim(), setup.saveForSignIn, () => void setup.signedInWithChatgpt()));

const codex = computed(() => !!setup.profile?.codex);
const local = computed(() => setup.provider.auth === 'none');
const name = computed(() => setup.preset ? providerName(setup.preset.provider) : setup.custom ? tr('自定义提供商', 'your provider') : setup.id);
const keyLabel = computed(() => setup.profile?.keyLabel || 'API Key');
const title = computed(() => codex.value ? tr('登录 ChatGPT', 'Sign in to ChatGPT')
  : setup.custom ? tr('连接你的服务', 'Connect your service') : tr(`连接 ${name.value}`, `Connect ${name.value}`));
const intro = computed(() => {
  if (codex.value) return tr('用 ChatGPT 账户登录，Wish 会按你的订阅调用模型，并自动刷新登录。', 'Sign in with your ChatGPT account. Wish calls models under your subscription and keeps the sign-in fresh.');
  if (setup.custom) return tr('填写服务地址和认证方式。下一步会用它们读取模型列表，确认能连上。', 'Enter the service address and how it signs requests. The next step reads its model list to make sure they work.');
  if (local.value) return tr('确认服务地址即可，本地服务不需要密钥。', 'Check the service address. A local service needs no key.');
  return setup.profile?.keyHint || tr(`填写 ${keyLabel.value}。它只保存在运行 Wish 的机器上。`, `Enter your ${keyLabel.value}. It stays on the machine Wish runs on.`);
});
const showKey = computed(() => setup.usesKey && (!codex.value || manualToken.value));
const credentials = computed(() => setup.credentialFields.filter(() => !codex.value || manualToken.value));
// The service address is part of a preset; only a custom or local one asks for it up front.
const addressFirst = computed(() => setup.custom || local.value);
const secret = (field: string) => ['secret_access_key', 'session_token'].includes(field);
const auths = [
  { value: 'bearer', label: 'Bearer token' }, { value: 'anthropic_key', label: 'Anthropic API Key' },
  { value: 'google_key', label: 'Google API Key' }, { value: 'sig_v4', label: 'AWS SigV4' },
  { value: 'none', label: tr('无需认证', 'No authentication') },
];
const protocols = computed(() => [...new Set([...(setup.preset?.protocols ?? MODEL_PROTOCOLS), setup.provider.protocol])]
  .map(value => ({ value, ...protocolPresentation(value) })));
const placeholder = (field?: string) => setup.stored(field) ? tr('已保存，留空则保留', 'Saved; leave empty to keep it') : '';
</script>

<template>
  <section class="setup-step">
    <SetupChosen :setup="setup" />
    <header class="setup-title">
      <h1 tabindex="-1">{{ title }}</h1>
      <p>{{ intro }}</p>
    </header>
    <form class="setup-form" novalidate @submit.prevent="setup.verify">
      <label v-if="addressFirst" class="setup-field">
        <span class="setup-field-label">{{ tr('服务地址', 'Service address') }}</span>
        <input v-model.trim="setup.provider.base_url" class="input" type="url" :data-autofocus="setup.custom || undefined" placeholder="https://api.example.com/v1" autocomplete="url" spellcheck="false" />
        <small v-if="setup.custom" class="setup-hint">{{ tr('OpenAI 兼容服务的地址通常以 /v1 结尾。', 'The address of an OpenAI-compatible service usually ends in /v1.') }}</small>
      </label>
      <label v-if="setup.custom" class="setup-field">
        <span class="setup-field-label">{{ tr('认证方式', 'Authentication') }}</span>
        <SelectField v-model="setup.provider.auth" mobile-page :options="auths" />
      </label>

      <div v-if="codex && !manualToken" class="setup-signin">
        <p v-if="setup.signedIn" class="setup-signed"><Icon name="check" />{{ tr('已登录 ChatGPT', 'Signed in to ChatGPT') }}</p>
        <template v-else>
          <button type="button" class="btn primary setup-signin-button" :disabled="setup.preview || login.submitting" @click="login.start">
            <Icon name="external-link" />{{ login.busy ? tr('重新打开 ChatGPT 登录', 'Restart ChatGPT sign-in') : tr('通过 ChatGPT 登录', 'Sign in with ChatGPT') }}
          </button>
          <small class="setup-hint">{{ setup.preview ? tr('预览中不会登录。', 'Sign-in is off in the preview.') : setup.profile?.note }}</small>
          <a v-if="login.url" class="setup-link" :href="login.url" target="_blank" rel="noopener noreferrer">{{ tr('重新打开登录页面', 'Open the sign-in page again') }}<Icon name="external-link" /></a>
          <small v-if="login.message" class="setup-hint" role="status">{{ login.message }}</small>
          <div v-if="login.busy" class="setup-callback">
            <small class="setup-hint">{{ tr('授权后如果停在一个打不开的 localhost 页面，把地址栏里的完整链接粘贴到这里。', 'If authorization ends on a localhost page that does not load, paste its full address here.') }}</small>
            <div class="setup-callback-row">
              <input v-model.trim="login.callbackUrl" class="input" type="url" :placeholder="tr('粘贴 localhost 链接', 'Paste the localhost address')" autocomplete="off" spellcheck="false" @keydown.enter.prevent="login.complete" />
              <button type="button" class="btn" :disabled="!login.callbackUrl || login.submitting" @click="login.complete">{{ login.submitting ? tr('验证中…', 'Checking…') : tr('完成登录', 'Finish') }}</button>
            </div>
          </div>
        </template>
      </div>
      <button v-if="codex && !setup.signedIn" type="button" class="setup-switch" @click="manualToken = !manualToken">
        {{ manualToken ? tr('改用 ChatGPT 登录', 'Sign in with ChatGPT instead') : tr('改为手动填写 Access Token', 'Enter an Access Token by hand instead') }}
      </button>

      <label v-if="showKey" class="setup-field">
        <span class="setup-field-label">{{ keyLabel }}<a v-if="setup.profile?.documentation" :href="setup.profile.documentation" target="_blank" rel="noreferrer">{{ tr('在哪里获取', 'Where to get one') }}<Icon name="external-link" /></a></span>
        <span class="setup-secret">
          <input class="input" :type="reveal || setup.provider.api_key_env != null ? 'text' : 'password'" :value="setup.secretValue()" :placeholder="placeholder() || tr(`粘贴 ${keyLabel}`, `Paste your ${keyLabel}`)" :data-autofocus="!addressFirst || undefined" autocomplete="off" spellcheck="false" @input="setup.setSecret(($event.target as HTMLInputElement).value)" />
          <button type="button" class="setup-reveal" :aria-label="reveal ? tr('隐藏', 'Hide') : tr('显示', 'Show')" :aria-pressed="reveal" @click="reveal = !reveal"><Icon :name="reveal ? 'eye-off' : 'eye'" /></button>
        </span>
        <small class="setup-hint">{{ tr('也可以填写 ${环境变量名}，从运行 Wish 的机器上的环境变量读取。', 'Or enter ${VARIABLE} to read it from an environment variable on the machine Wish runs on.') }}</small>
      </label>
      <label v-for="field in credentials" :key="field" class="setup-field">
        <span class="setup-field-label">{{ credentialTitle(field) || field }}<small v-if="setup.optionalCredential(field)">{{ tr('选填', 'Optional') }}</small></span>
        <input class="input" :type="secret(field) ? 'password' : 'text'" :value="setup.secretValue(field)" :placeholder="placeholder(field)" autocomplete="off" spellcheck="false" @input="setup.setSecret(($event.target as HTMLInputElement).value, field)" />
      </label>
      <p v-if="setup.profile?.note && !codex" class="setup-note"><Icon name="info" />{{ setup.profile.note }}</p>

      <AnimatedDetails class="setup-advanced">
        <summary><span>{{ tr('连接选项', 'Connection options') }}</span><Icon name="chevron-down" /></summary>
        <div class="setup-advanced-fields">
          <label v-if="!addressFirst" class="setup-field">
            <span class="setup-field-label">{{ tr('服务地址', 'Service address') }}</span>
            <input v-model.trim="setup.provider.base_url" class="input" type="url" autocomplete="url" spellcheck="false" />
          </label>
          <label class="setup-field">
            <span class="setup-field-label">{{ tr('请求协议', 'Request protocol') }}</span>
            <SelectField v-model="setup.provider.protocol" mobile-page :options="protocols" />
          </label>
          <label class="setup-field">
            <span class="setup-field-label">{{ tr('请求路径', 'Request path') }}</span>
            <input v-model.trim="setup.provider.path" class="input" spellcheck="false" />
          </label>
          <label class="setup-field">
            <span class="setup-field-label">{{ tr('提供商 ID', 'Provider ID') }}<small>{{ tr('设置和会话里用它指代这个提供商', 'Settings and sessions name the provider by it') }}</small></span>
            <input v-model.trim="setup.id" class="input" :disabled="setup.existing" autocomplete="off" spellcheck="false" />
          </label>
        </div>
      </AnimatedDetails>

      <p v-if="setup.authMissing" class="setup-hint setup-waiting">{{ setup.authMissing }}</p>
      <footer class="setup-footer">
        <button type="button" class="btn ghost setup-back" :disabled="setup.verifying" @click="setup.step = 'provider'"><Icon name="arrow-left" />{{ tr('上一步', 'Back') }}</button>
        <span class="setup-footer-gap" />
        <button v-if="setup.verifyFailed" type="button" class="btn ghost" @click="setup.skipVerify">{{ tr('跳过检查', 'Skip the check') }}</button>
        <button type="submit" class="btn primary" :disabled="!!setup.authMissing || setup.verifying">
          <Icon v-if="setup.verifying" name="loader-circle" class="spin" />{{ setup.verifying ? tr('正在连接…', 'Connecting…') : tr('下一步', 'Next') }}
        </button>
      </footer>
    </form>
  </section>
</template>
