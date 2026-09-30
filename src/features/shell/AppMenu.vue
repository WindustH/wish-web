<script setup lang="ts">
// The app's own places - settings, statistics, sessions and data, account status - and signing
// out, in one menu.
// On a desktop it opens from the foot of the sidebar, which names the server; on a phone from a
// button at the top right of the start page.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../../ui/components/Icon.vue';
import Menu, { type MenuItem } from '../../ui/components/Menu.vue';
import SignOutDialog from '../connection/SignOutDialog.vue';
import { accountDialogOpen } from '../account/accountDialog.ts';
import { serverName } from '../../core/connection.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';

const props = defineProps<{ placement: 'sidebar' | 'header' }>();
const router = useRouter();
const signingOut = ref(false);
const server = serverName();
const mac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
const items = computed<MenuItem[]>(() => [
  { key: 'settings', icon: 'settings', label: i18n.t('nav.settings'), shortcut: props.placement === 'sidebar' ? (mac ? '⌘,' : 'Ctrl+,') : undefined },
  { key: 'stats', icon: 'stats', label: i18n.t('nav.stats') },
  { key: 'data', icon: 'storage', label: tr('会话与数据', 'Sessions & data') },
  { key: 'account', icon: 'account', label: tr('账户状态', 'Account status') },
  { key: 'sign-out', icon: 'log-out', label: tr('退出登录', 'Sign out'), separator: true },
]);
function choose(key: string) {
  if (key === 'settings') void router.push('/settings');
  else if (key === 'stats') void router.push('/stats');
  else if (key === 'data') void router.push('/data');
  // A phone shows account status as a page of its own; a desktop as a window over the app.
  else if (key === 'account' && props.placement === 'header') void router.push('/account');
  else if (key === 'account') accountDialogOpen.value = true;
  else if (key === 'sign-out') signingOut.value = true;
}
</script>

<template>
  <Menu :items="items" :heading="server" content-class="app-menu" :side="placement === 'sidebar' ? 'top' : 'bottom'"
    :align="placement === 'sidebar' ? 'start' : 'end'" @select="choose">
    <template #trigger>
      <button v-if="placement === 'sidebar'" type="button" class="app-menu-row" :aria-label="tr(`菜单 · ${server}`, `Menu · ${server}`)">
        <img class="app-menu-mark" src="/app-icons/mark.svg" alt="" />
        <span class="app-menu-server">{{ server }}</span>
        <Icon name="chevrons-up-down" class="app-menu-chevron" />
      </button>
      <button v-else type="button" class="btn ghost icon-only app-menu-button" :aria-label="tr('菜单', 'Menu')"><Icon name="menu" /></button>
    </template>
  </Menu>
  <SignOutDialog :open="signingOut" @close="signingOut = false" />
</template>

<style>
.app-menu-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 5px 8px; border: 0; border-radius: var(--radius); background: transparent; color: var(--fg); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; transition: background var(--dur-fast); }
@media (hover: hover) { .app-menu-row:hover { background: var(--bg-hover); } }
.app-menu-row[data-state='open'] { background: var(--bg-hover); }
.app-menu-mark { display: block; flex: none; width: 26px; height: 26px; padding: 4px; border-radius: 50%; background: var(--bg-raised); box-shadow: inset 0 0 0 1px var(--line); }
.app-menu-server { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-menu-chevron { flex: none; width: 15px; height: 15px; color: var(--fg-subtle); }
.app-menu.menu-pop { width: max-content; min-width: 200px; max-width: min(280px, calc(100vw - 24px)); padding: 4px; }
</style>
