<script setup lang="ts">
// Leaves the current server, after asking.
import { ref } from 'vue';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';
import SignOutDialog from './SignOutDialog.vue';
import { tr } from '../../core/i18n/tr.ts';
import { serverName } from '../../core/connection.ts';

defineProps<{ buttonClass?: string }>();
const confirming = ref(false);
const label = () => tr(`退出 ${serverName()}`, `Sign out of ${serverName()}`);
</script>

<template>
  <Hint :text="label()"><button type="button" :class="buttonClass" :aria-label="label()" @click="confirming = true"><Icon name="log-out" /></button></Hint>
  <SignOutDialog :open="confirming" @close="confirming = false" />
</template>
