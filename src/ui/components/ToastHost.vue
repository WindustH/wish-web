<script setup lang="ts">
import { dismissToast, useToasts } from '../toast.ts';
import { needRefresh, refreshApp } from '../pwa.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import ToastStack from './ToastStack.vue';
import ToastCard from './ToastCard.vue';

const items = useToasts();
</script>

<template>
  <ToastStack>
    <ToastCard
      v-for="item in items.slice(0, 3)"
      :key="item.id"
      :text="item.text"
      :detail="item.detail"
      :icon="item.icon"
      :tone="item.tone"
      @dismiss="dismissToast(item.id)"
    >
      <template v-if="item.sessionId" #default>
        <RouterLink
          class="btn ghost"
          :to="{ name: 'chat', params: { id: item.sessionId } }"
          @click="dismissToast(item.id)"
          >{{ tr('打开会话', 'Open session') }}</RouterLink
        >
      </template>
    </ToastCard>
    <ToastCard
      v-if="needRefresh"
      key="update"
      class="pwa-update"
      persistent
      icon="sparkles"
      :text="i18n.t('pwa.updateAvailable')"
      :detail="i18n.t('pwa.reloadHint')"
      :dismiss-label="i18n.t('pwa.later')"
      @dismiss="needRefresh = false"
    >
      <button class="btn primary" @click="refreshApp()">{{ i18n.t('pwa.reload') }}</button>
    </ToastCard>
  </ToastStack>
</template>
