type Account = {
  name?: string;
  preset?: string | null;
  api_key?: string | null;
  api_key_env?: string | null;
  credentials?: Record<string, unknown>;
  credentials_env?: Record<string, unknown>;
};
// Reader endpoints use the account platform, not merely the same API-key format.
export function fetchAccountPresets(preset: string): string[] {
  return (
    (
      {
        deepseek_fetch: ['deepseek'],
        zai_reader: ['zai_global', 'zai_coding_global'],
        jina_reader: ['jina_reader'],
        codex_fetch: ['openai_codex'],
      } as Record<string, string[]>
    )[preset] ?? []
  );
}
export function compatibleAccounts(accounts: Record<string, Account>, allowed?: string[]) {
  return Object.entries(accounts).filter(
    ([, account]) => allowed === undefined || allowed.includes(account.preset ?? ''),
  );
}
export function defaultAccount(
  accounts: Record<string, Account>,
  allowed?: string[],
  required: string[] = [],
): string | null {
  return (
    compatibleAccounts(accounts, allowed).find(([, a]) => {
      const field = (name: string) =>
        [a.credentials?.[name], a.credentials_env?.[name]].some(
          (value) => typeof value === 'string' && value.trim().length > 0,
        );
      if (required.length)
        return required.every((name) =>
          name === 'api_key' ? Boolean(a.api_key?.trim() || a.api_key_env?.trim()) : field(name),
        );
      if (
        a.preset === 'volcengine_visual' ||
        a.preset?.startsWith('aws') ||
        field('access_key_id') ||
        field('secret_access_key')
      ) {
        return (
          field('access_key_id') && field('secret_access_key') && (!a.preset?.startsWith('aws') || field('region'))
        );
      }
      return [
        a.api_key,
        a.api_key_env,
        a.credentials?.access_token,
        a.credentials_env?.access_token,
        a.credentials?.refresh_token,
        a.credentials_env?.refresh_token,
      ].some((v) => typeof v === 'string' && v.trim().length > 0);
    })?.[0] ?? null
  );
}
