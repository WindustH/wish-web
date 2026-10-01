<script setup lang="ts">
// Step 3: the model new sessions start with: one the provider's catalog lists - those its preset
// suggests first - or any ID typed in. Starting saves the provider with it as the default.
import { computed, onMounted, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { compactNumber } from '../../core/util/fmt.ts';
import { providerName } from '../../ui/providerPresentation.ts';
import Icon from '../../ui/components/Icon.vue';
import SetupChosen from './SetupChosen.vue';
import type { SetupState } from './useProviderSetup.ts';

const props = defineProps<{ setup: SetupState }>();
const emit = defineEmits<{ finish: [] }>();
const setup = props.setup;
const query = ref('');
// What is typed in the ID field; it is the choice while nothing in the list is.
const typed = ref(setup.models.some(item => item.id === setup.model) ? '' : setup.model);

const shown = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/);
  return setup.models.filter(item => terms.every(term => `${item.id} ${item.name ?? ''}`.toLocaleLowerCase().includes(term)));
});
const name = computed(() => setup.preset ? providerName(setup.preset.provider) : setup.custom ? tr('这个服务', 'this service') : setup.id);
const intro = computed(() => ({
  ready: tr(`这些是 ${name.value} 提供的模型。新会话默认使用你选的这个，聊天时也可以随时切换。`, `These are the models ${name.value} offers. New sessions start with the one you choose, and you can switch at any time in a chat.`),
  none: tr('这个提供商不提供模型列表，请填写要用的模型 ID。', 'This provider does not list its models. Enter the ID of the model to use.'),
}[setup.catalogState as 'ready' | 'none'] ?? tr('没有读取到模型列表，请填写要用的模型 ID。', 'The model list could not be read. Enter the ID of the model to use.')));
const detail = (item: SetupState['models'][number]) => [item.name, item.context_window ? tr(`${compactNumber(item.context_window)} 上下文`, `${compactNumber(item.context_window)} context`) : '']
  .filter(Boolean).join(' · ');
function pick(id: string) { setup.model = id; }
function type(text: string) { typed.value = text; setup.model = text.trim(); }
onMounted(() => {
  // A suggested model is chosen to begin with, so the common case is one click.
  if (!setup.model && setup.models[0]?.tag) setup.model = setup.models[0].id;
});
</script>

<template>
  <section class="setup-step">
    <SetupChosen :setup="setup" />
    <header class="setup-title">
      <h1 tabindex="-1">{{ tr('选择默认模型', 'Choose the default model') }}</h1>
      <p>{{ intro }}</p>
    </header>
    <label v-if="setup.models.length > 8" class="setup-search">
      <Icon name="search" />
      <input v-model="query" type="search" data-autofocus :placeholder="tr(`在 ${setup.models.length} 个模型中搜索`, `Search ${setup.models.length} models`)" :aria-label="tr('搜索模型', 'Search models')" autocomplete="off" spellcheck="false" />
    </label>
    <ul v-if="shown.length" class="setup-list setup-models" role="radiogroup" :aria-label="tr('模型', 'Models')">
      <li v-for="item in shown" :key="item.id">
        <button type="button" role="radio" class="setup-row" :class="{ chosen: setup.model === item.id }" :aria-checked="setup.model === item.id" @click="pick(item.id)">
          <span class="setup-radio" aria-hidden="true" />
          <span class="setup-row-text"><span class="setup-model-id">{{ item.id }}</span><small v-if="detail(item)">{{ detail(item) }}</small></span>
          <span v-if="item.tag" class="setup-badge">{{ item.tag === 'recommended' ? tr('推荐', 'Suggested') : tr('已配置', 'Configured') }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="query.trim()" class="setup-hint setup-empty">{{ tr('没有匹配的模型，可以在下面直接填写它的 ID。', 'No model matches. Enter its ID below.') }}</p>
    <label class="setup-field setup-typed" :class="{ chosen: typed.trim() && setup.model === typed.trim() }">
      <span class="setup-field-label">{{ setup.models.length ? tr('或填写其他模型 ID', 'Or enter another model ID') : tr('模型 ID', 'Model ID') }}</span>
      <input class="input" :value="typed" :data-autofocus="!setup.models.length || undefined" :placeholder="tr('例如 deepseek-chat', 'For example deepseek-chat')" autocomplete="off" spellcheck="false" @input="type(($event.target as HTMLInputElement).value)" @focus="typed.trim() && type(typed)" />
    </label>
    <button v-if="setup.catalogState === 'failed'" type="button" class="setup-switch" :disabled="setup.verifying" @click="setup.verify">
      <Icon v-if="setup.verifying" name="loader-circle" class="spin" />{{ tr('重新读取模型列表', 'Read the model list again') }}
    </button>
    <footer class="setup-footer">
      <button type="button" class="btn ghost setup-back" :disabled="setup.saving" @click="setup.step = 'auth'"><Icon name="arrow-left" />{{ tr('上一步', 'Back') }}</button>
      <span class="setup-footer-gap" />
      <button type="button" class="btn primary" :disabled="!setup.model.trim() || setup.saving" @click="emit('finish')">
        <Icon v-if="setup.saving" name="loader-circle" class="spin" />{{ setup.saving ? tr('正在保存…', 'Saving…') : tr('开始使用', 'Start') }}
      </button>
    </footer>
    <p class="setup-hint setup-footnote">{{ tr('之后可以在设置里添加更多模型和提供商。', 'You can add more models and providers in settings later.') }}</p>
  </section>
</template>
