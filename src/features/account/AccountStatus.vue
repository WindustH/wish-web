<script setup lang="ts">
// Balances and plan allowances of every provider with an account reading. The
// window or page around it owns loading and the refresh control.
import { computed, onBeforeUnmount, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import Hint from '../../ui/components/Hint.vue';
import { fmtDateTime } from '../../core/util/fmt.ts';
import Icon from '../../ui/components/Icon.vue';
import ProviderIcon from '../../domain/providers/ProviderIcon.vue';
import Spinner from '../../ui/components/Spinner.vue';
import {
  balanceParts,
  failureLabel,
  formatAmount,
  quotaAmounts,
  quotaParts,
  parseInstant,
  quotaLevel,
  quotaRemainingPercent,
  quotaTitle,
  resetLabel,
  type AccountState,
} from './accountState.ts';
import type { AccountRow } from './useAccountStates.ts';
import { useProviderTitles } from '../../domain/providers/useProviderTitles.ts';

const props = defineProps<{ rows: AccountRow[]; loading: boolean; error: string }>();
const emit = defineEmits<{ retry: [id: string]; settings: [] }>();
const cards = new Map<string, HTMLElement>();
function register(id: string, node: unknown) {
  if (node instanceof HTMLElement) cards.set(id, node);
  else cards.delete(id);
}
function locate(id: string) {
  const card = cards.get(id);
  card?.scrollIntoView({ block: 'nearest' });
  card?.focus({ preventScroll: true });
}
const issues = computed(() =>
  props.rows.flatMap((row) => {
    const state = row.state;
    const problem = row.error || state?.failure || (state && availability(state));
    const low = state?.quotas.find((quota) => !quota.unlimited && quotaLevel(quota) === 'high');
    const label = problem
      ? tr('异常', 'Issue')
      : low
        ? tr('额度紧张', 'Low allowance')
        : state?.warnings?.length
          ? tr('有提醒', 'Warning')
          : '';
    return label ? [{ id: row.id, label, problem: !!problem }] : [];
  }),
);

// Relative times tick while the list stays open.
const now = ref(Date.now());
const timer = setInterval(() => {
  now.value = Date.now();
}, 30_000);
onBeforeUnmount(() => clearInterval(timer));
const availability = (state: AccountState) => {
  if (!state.availability) return '';
  switch (state.availability.toLowerCase()) {
    case 'available':
      return '';
    case 'degraded':
      return tr('服务降级', 'Degraded');
    case 'unavailable':
      return tr('不可用', 'Unavailable');
    case 'limited':
    case 'restricted':
      return tr('受限', 'Restricted');
    case 'maintenance':
      return tr('维护中', 'Under maintenance');
    default:
      return state.availability;
  }
};
// The same names as everywhere else: two instances of one vendor keep their IDs apart.
const providerTitle = useProviderTitles();
const title = (item: { id: string }) => providerTitle(item.id);
const plan = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const empty = (state: AccountState) => !state.balances.length && !state.quotas.length && !state.failure;
const percentText = (value: number | null) => (value == null ? '' : `${Math.round(value)}%`);
</script>

<template>
  <div class="account-status" :aria-busy="loading">
    <p v-if="error" class="account-problem" role="alert"><Icon name="triangle-alert" />{{ error }}</p>

    <nav
      v-if="rows.length > 1 && issues.length"
      class="account-summary"
      :aria-label="tr('需留意的账户', 'Accounts needing attention')"
    >
      <button v-for="issue in issues" :key="issue.id" class="btn sm ghost" @click="locate(issue.id)">
        <i aria-hidden="true" :class="{ problem: issue.problem }" />{{ title(issue) }} · {{ issue.label }}
      </button>
    </nav>
    <article
      v-for="row in rows"
      :key="row.id"
      :ref="(node) => register(row.id, node)"
      tabindex="-1"
      class="account-card"
    >
      <header class="account-card-head">
        <span class="account-mark"><ProviderIcon :brand="row.brand ?? undefined" /></span>
        <div class="account-card-title">
          <strong>{{ title(row) }}</strong>
          <small v-if="row.state && availability(row.state)">{{ availability(row.state) }}</small>
        </div>
        <span v-if="row.state?.plan_type" class="account-plan">{{ plan(row.state.plan_type) }}</span>
        <Spinner v-if="row.loading" class="account-spinner" />
      </header>

      <p v-if="row.error" class="account-problem">
        <Icon name="triangle-alert" /><span>{{ row.error }}</span
        ><button class="btn ghost sm" :disabled="row.loading" @click="emit('retry', row.id)">
          {{ tr('重试', 'Retry') }}
        </button>
      </p>
      <template v-if="row.state">
        <p v-if="row.state.failure" class="account-problem">
          <Icon name="triangle-alert" />
          <span
            >{{ failureLabel(row.state.failure.kind)
            }}<small
              >{{ row.state.failure.message
              }}<template v-if="row.state.failure.code"> ({{ row.state.failure.code }})</template></small
            ></span
          >
          <RouterLink
            v-if="row.state.failure.kind === 'Unauthorized'"
            class="btn ghost sm"
            to="/settings?section=accounts"
            @click="emit('settings')"
            >{{ tr('检查凭据', 'Check credentials') }}</RouterLink
          >
          <button v-if="!row.error" class="btn ghost sm" :disabled="row.loading" @click="emit('retry', row.id)">
            {{ tr('重试', 'Retry') }}
          </button>
        </p>
        <ul v-if="row.state.warnings?.length" class="account-warnings">
          <li v-for="(warning, index) in row.state.warnings" :key="index">{{ warning }}</li>
        </ul>
        <div v-for="(balance, index) in row.state.balances" :key="`balance-${index}`" class="account-balance">
          <span class="account-label">{{
            balance.available != null ? tr('可用余额', 'Available balance') : tr('余额', 'Balance')
          }}</span>
          <strong class="account-amount">{{
            formatAmount(balance.available ?? balance.total, balance.currency, balance.minor_unit) ?? '—'
          }}</strong>
          <div v-if="balanceParts(balance).length" class="account-parts">
            <span v-for="part in balanceParts(balance)" :key="part.label"
              >{{ part.label }} <b>{{ part.value }}</b></span
            >
          </div>
        </div>
        <div v-for="quota in row.state.quotas" :key="quota.id" class="account-quota" :class="quotaLevel(quota)">
          <div class="account-quota-head">
            <span>{{ quotaTitle(quota, row.state.protocol) }}</span>
            <b>{{ quota.unlimited ? tr('不限量', 'Unlimited') : percentText(quotaRemainingPercent(quota)) }}</b>
          </div>
          <div
            v-if="quotaRemainingPercent(quota) != null"
            class="account-meter"
            role="meter"
            :aria-valuenow="Math.round(quotaRemainingPercent(quota)!)"
            :aria-valuetext="
              tr(
                `剩余 ${percentText(quotaRemainingPercent(quota))}`,
                `${percentText(quotaRemainingPercent(quota))} remaining`,
              )
            "
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="quotaTitle(quota, row.state.protocol)"
          >
            <i :style="{ width: `${quotaRemainingPercent(quota)}%` }" />
          </div>
          <small class="quota-note"
            ><span v-if="quotaAmounts(quota)">{{ quotaAmounts(quota) }}</span>
            <span v-else-if="!quota.unlimited && quotaRemainingPercent(quota) == null">{{
              tr('未提供', 'Not reported')
            }}</span>
            <Hint v-if="parseInstant(quota.resets_at)" :text="fmtDateTime(parseInstant(quota.resets_at))"
              ><time :datetime="parseInstant(quota.resets_at)?.toISOString()">{{
                resetLabel(quota.resets_at, now)
              }}</time></Hint
            >
          </small>
          <small v-if="quotaParts(quota)" class="quota-parts">{{ quotaParts(quota) }}</small>
        </div>
        <p v-if="empty(row.state)" class="account-note">
          {{ tr('服务没有报告余额或额度。', 'The service reported no balance or allowance.') }}
        </p>
      </template>
    </article>

    <div v-if="!rows.length && !loading && !error" class="account-empty">
      <Icon name="account" />
      <p>{{ tr('暂无可查询的账户信息。', 'No account information available.') }}</p>
    </div>
  </div>
</template>

<style scoped>
.account-status {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.account-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-raised);
}
/* On the phone's page, a grouped card one step above the sunken page. */
@media (max-width: 899px) {
  .account-page .account-card {
    border: 0;
    border-radius: 18px;
    background: var(--bg-group);
  }
}
.account-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.account-mark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--bg-sunken);
  color: var(--fg);
}
.account-mark :deep(.icon),
.account-mark :deep(svg) {
  width: 18px;
  height: 18px;
}
.account-card-title {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.account-card-title strong {
  font: 600 14px/1.4 var(--font);
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-card-title small {
  font-size: 12px;
  color: var(--warn);
}
.account-plan {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}
.account-spinner {
  flex: none;
  width: 14px;
  height: 14px;
}
.account-balance {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.account-label {
  font-size: 12px;
  color: var(--fg-subtle);
}
.account-amount {
  font: 600 24px/1.25 var(--font);
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}
.account-parts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--fg-subtle);
}
.account-parts b {
  font-weight: 500;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}
.account-quota {
  --level: var(--ok);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.account-quota.mid {
  --level: var(--warn);
}
.account-quota.high {
  --level: var(--err);
}
.account-quota-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--fg);
}
.account-quota-head b {
  font-weight: 600;
  color: var(--level);
  font-variant-numeric: tabular-nums;
}
.account-meter {
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--bg-sunken);
}
.account-meter i {
  display: block;
  height: 100%;
  min-width: 2px;
  border-radius: 3px;
  background: var(--level);
  transition: width var(--dur) var(--ease-out);
}
.account-quota small {
  font-size: 12px;
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
}
.account-problem {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--err) 8%, transparent);
  color: var(--err);
  font-size: 13px;
  line-height: 1.55;
}
.account-summary i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warn);
}
.account-summary i.problem {
  background: var(--err);
}
.account-problem > span {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}
.account-problem .btn {
  flex: none;
}
.account-problem .icon {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 2px;
}
.account-problem small {
  display: block;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.account-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--fg-subtle);
}
.account-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--fg-subtle);
  text-align: center;
  font-size: 13px;
}
.account-empty .icon {
  width: 28px;
  height: 28px;
  color: var(--fg-faint);
}
.account-empty p {
  margin: 0;
}
@media (max-width: 899px) {
  .account-card {
    border-radius: 14px;
    padding: 14px;
  }
}
.account-summary,
.quota-note {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.account-warnings {
  list-style: none;
  margin: 0;
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 9%, transparent);
  font-size: 13px;
}
.account-balance + .account-quota,
.account-quota + .account-quota {
  border-top: 1px solid var(--line);
  padding-top: 8px;
}
.account-problem .btn {
  margin-inline-start: auto;
  flex: none;
}
.quota-parts {
  color: var(--fg-subtle);
  font-size: 11.5px;
}
</style>
