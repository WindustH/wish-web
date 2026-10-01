<script setup lang="ts">
// The provider chosen in the first step, shown above the later ones with the way back to change it.
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { presetDescription, providerName } from '../../ui/providerPresentation.ts';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import type { SetupState } from './useProviderSetup.ts';

const props = defineProps<{ setup: SetupState }>();
const title = computed(() => props.setup.provider.display_name
  || (props.setup.preset ? providerName(props.setup.preset.provider) : props.setup.custom ? tr('自定义提供商', 'Custom provider') : props.setup.id));
const description = computed(() => props.setup.preset ? presetDescription(props.setup.preset) : props.setup.provider.base_url || props.setup.id);
</script>

<template>
  <div class="setup-chosen">
    <span class="setup-mark"><ProviderIcon :brand="setup.preset?.provider" :fallback="setup.custom ? 'plus' : 'providers'" /></span>
    <span class="setup-row-text"><span>{{ title }}</span><small>{{ description }}</small></span>
    <button type="button" class="btn ghost setup-change" :disabled="setup.saving || setup.verifying" @click="setup.step = 'provider'">{{ tr('更换', 'Change') }}</button>
  </div>
</template>
