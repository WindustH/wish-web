// Device-local sign-in profiles. SSH private keys stay in their original key store.
import { tr } from './i18n/tr.ts';
import { tryPlatform } from '../platform/index.ts';

export interface AccountLogin {
  method: 'http' | 'ssh';
  address: string;
  token: string;
  identity: string;
  apiPort: number;
  fingerprint: string;
}
export interface SavedAccount extends AccountLogin {
  id: string;
  name: string;
  scope: string;
}
const listKey = 'connection.accounts';
export const activeAccountKey = 'connection.activeAccount';
export function savedAccounts(): SavedAccount[] {
  try {
    const list = JSON.parse(tryPlatform('storage')?.get(listKey) || '[]');
    return Array.isArray(list)
      ? list.filter(
          (a) =>
            a &&
            (a.method === 'http' || a.method === 'ssh') &&
            ['id', 'name', 'scope', 'address', 'token', 'identity', 'fingerprint'].every(
              (k) => typeof a[k] === 'string',
            ) &&
            Number.isInteger(a.apiPort),
        )
      : [];
  } catch {
    return [];
  }
}
function sameLogin(a: AccountLogin, b: AccountLogin) {
  return (
    a.address === b.address &&
    a.method === b.method &&
    a.token === b.token &&
    a.identity === b.identity &&
    a.apiPort === b.apiPort &&
    a.fingerprint === b.fingerprint
  );
}
function uniqueId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');
}
export function updateAccount(id: string, login: AccountLogin, name: string) {
  const list = savedAccounts();
  const old = list.find((a) => a.id === id);
  if (!old) throw new Error(tr('此账户已移除。', 'This account has been removed.'));
  if (list.some((a) => a.id !== id && sameLogin(a, login)))
    throw new Error(tr('此登录信息已保存在其他卡片中。', 'Another card already has this login.'));
  const entry: SavedAccount = {
    ...login,
    name: name.trim(),
    id,
    scope: sameLogin(old, login) ? old.scope : 'account:' + uniqueId(),
  };
  tryPlatform('storage')?.set(listKey, JSON.stringify(list.map((a) => (a.id === id ? entry : a))));
  return entry;
}
export function rememberAccount(login: AccountLogin, name: string, previousScope?: string) {
  const list = savedAccounts();
  const previous = list.find((a) => sameLogin(a, login));
  const id = previous?.id ?? uniqueId();
  const account: SavedAccount = {
    ...login,
    id,
    name: name.trim() || previous?.name || '',
    scope: previous?.scope ?? previousScope ?? 'account:' + id,
  };
  const store = tryPlatform('storage');
  store?.set(listKey, JSON.stringify([account, ...list.filter((a) => a.id !== id)]));
  store?.set(activeAccountKey, id);
  return account;
}
export function forgetAccount(id: string) {
  const store = tryPlatform('storage');
  store?.set(listKey, JSON.stringify(savedAccounts().filter((a) => a.id !== id)));
}

export function hostPinKey(address: string) {
  try {
    const text = address.trim();
    const url = new URL(text.includes('://') ? text : 'ssh://' + text);
    return 'ssh.host.' + url.hostname + ':' + (url.port || '2222');
  } catch {
    return '';
  }
}
