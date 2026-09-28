<script setup lang="ts">
// The app's own places - settings, statistics, account status - and signing out, in one menu.
// On a desktop it opens from the foot of the sidebar, which names the server; on a phone from a
// button at the top right of the start page.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from 'reka-ui';
import Icon from '../../ui/components/Icon.vue';
import SignOutDialog from '../connection/SignOutDialog.vue';
import { accountDialogOpen } from '../account/accountDialog.ts';
import { serverName } from '../../core/connection.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';

const props = defineProps<{ placement: 'sidebar' | 'header' }>();
const router = useRouter();
const pageActive = usePageActivity();
const signingOut = ref(false);
const server = serverName();
const mac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
const items = computed(() => [
  { key: 'settings', icon: 'settings', label: i18n.t('nav.settings'), shortcut: mac ? '⌘,' : 'Ctrl+,' },
  { key: 'stats', icon: 'chart-column', label: i18n.t('nav.stats') },
  { key: 'account', icon: 'wallet', label: tr('账户状态', 'Account status') },
]);
function choose(key: string) {
  if (key === 'settings') void router.push('/settings');
  else if (key === 'stats') void router.push('/stats');
  // A phone shows account status as a page of its own; a desktop as a window over the app.
  else if (key === 'account' && props.placement === 'header') void router.push('/account');
  else if (key === 'account') accountDialogOpen.value = true;
}
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger v-if="placement === 'sidebar'" class="app-menu-row" :aria-label="tr(`菜单 · ${server}`, `Menu · ${server}`)">
      <img class="app-menu-mark" src="/app-icons/mark.svg" alt="" />
      <span class="app-menu-server">{{ server }}</span>
      <Icon name="chevrons-up-down" class="app-menu-chevron" />
    </DropdownMenuTrigger>
    <DropdownMenuTrigger v-else class="btn ghost icon-only app-menu-button" :aria-label="tr('菜单', 'Menu')">
      <Icon name="menu" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal v-if="pageActive">
      <DropdownMenuContent class="menu-pop app-menu" :class="placement" :side="placement === 'sidebar' ? 'top' : 'bottom'"
        :align="placement === 'sidebar' ? 'start' : 'end'" :side-offset="6">
        <DropdownMenuLabel class="app-menu-label">{{ server }}</DropdownMenuLabel>
        <DropdownMenuItem v-for="item in items" :key="item.key" class="menu-item app-menu-item" @select="choose(item.key)">
          <Icon :name="item.icon" /><span>{{ item.label }}</span><kbd v-if="item.shortcut && placement === 'sidebar'">{{ item.shortcut }}</kbd>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="app-menu-separator" />
        <DropdownMenuItem class="menu-item app-menu-item" @select="signingOut = true">
          <Icon name="log-out" /><span>{{ tr('退出登录', 'Sign out') }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
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
.app-menu .app-menu-label { padding: 4px 10px 2px; font-size: 12px; color: var(--fg-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-menu .app-menu-item > span { flex: 1; min-width: 0; }
.app-menu .app-menu-item > kbd { flex: none; margin-left: 16px; font: 11.5px var(--font); color: var(--fg-faint); }
.app-menu .app-menu-separator { height: 1px; margin: 4px 6px; background: var(--line); }
</style>
