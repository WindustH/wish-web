<script setup lang="ts">
// The first-run setup: a provider, its credentials, then the default model, each a page of its
// own under one header that shows where the setup is. See useProviderSetup for what the steps do.
import './setup.css';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { SETUP_STEPS, useProviderSetup, type SetupStep } from './useProviderSetup.ts';
import SetupProviderStep from './SetupProviderStep.vue';
import SetupAuthStep from './SetupAuthStep.vue';
import SetupModelStep from './SetupModelStep.vue';

const props = defineProps<{ preview?: boolean }>();
const emit = defineEmits<{ complete: []; exit: [] }>();
const setup = reactive(useProviderSetup({ preview: props.preview }));
const isMobile = useIsMobile();
const LABELS: Record<SetupStep, () => string> = {
  provider: () => tr('提供商', 'Provider'), auth: () => tr('认证', 'Credentials'), model: () => tr('模型', 'Model'),
};
const current = computed(() => SETUP_STEPS.indexOf(setup.step));
// A step slides in from the way the setup moves: forward from the right, back from the left.
const direction = ref<'forward' | 'back'>('forward');
const page = ref<HTMLElement>();
watch(() => setup.step, (next, previous) => {
  direction.value = SETUP_STEPS.indexOf(next) >= SETUP_STEPS.indexOf(previous) ? 'forward' : 'back';
  page.value?.scrollTo({ top: 0 });
});
// A new step takes the focus: its first field on a desktop, its title on a phone, where a field
// would bring up the keyboard over the page.
function focusStep() {
  const step = page.value?.querySelector('.setup-step');
  const target = (!isMobile.value && step?.querySelector<HTMLElement>('[data-autofocus]')) || step?.querySelector<HTMLElement>('h1');
  target?.focus({ preventScroll: true });
}
watch(() => setup.loading, loading => { if (!loading) void nextTick(focusStep); });
async function finish() { if (await setup.save()) emit('complete'); }
</script>

<template>
  <main ref="page" class="provider-setup" :class="{ preview }">
    <div v-if="preview" class="setup-preview-bar" role="status">
      <span><Icon name="sparkles" />{{ tr('引导预览 · 不会保存任何配置', 'Setup preview · nothing is saved') }}</span>
      <button type="button" class="btn ghost" @click="emit('exit')">{{ tr('退出预览', 'Exit preview') }}</button>
    </div>
    <div class="setup-column">
      <header class="setup-head">
        <img class="setup-brand" src="/app-icons/mark.svg" alt="Wish" />
        <ol v-if="setup.snapshot && !setup.loading" class="setup-steps" :aria-label="tr('设置步骤', 'Setup steps')">
          <li v-for="(step, index) in SETUP_STEPS" :key="step" :class="{ done: index < current, current: index === current }" :aria-current="index === current ? 'step' : undefined">
            <button type="button" :disabled="index >= current || setup.saving || setup.verifying" @click="setup.step = step">
              <span class="setup-step-mark"><Icon v-if="index < current" name="check" /><template v-else>{{ index + 1 }}</template></span>
              <span class="setup-step-label">{{ LABELS[step]() }}</span>
            </button>
          </li>
        </ol>
      </header>
      <p v-if="setup.loading" class="setup-status" role="status"><Icon name="loader-circle" class="spin" />{{ tr('正在读取配置…', 'Loading configuration…') }}</p>
      <div v-else-if="!setup.snapshot" class="setup-status">
        <p class="setup-load-error" role="alert">{{ setup.error }}</p>
        <button type="button" class="btn" @click="setup.load">{{ tr('重试', 'Retry') }}</button>
      </div>
      <Transition v-else :name="`setup-${direction}`" mode="out-in" @after-enter="focusStep">
        <SetupProviderStep v-if="setup.step === 'provider'" :setup="setup" />
        <SetupAuthStep v-else-if="setup.step === 'auth'" :setup="setup" />
        <SetupModelStep v-else :setup="setup" @finish="finish" />
      </Transition>
    </div>
  </main>
</template>
