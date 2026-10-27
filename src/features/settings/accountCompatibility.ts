type Account = {
  name?: string;
  preset?: string;
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
export function defaultAccount(accounts: Record<string, Account>, allowed?: string[]): string | null {
  return (
    compatibleAccounts(accounts, allowed).find(([, a]) =>
      [
        a.api_key,
        a.api_key_env,
        a.credentials?.access_token,
        a.credentials_env?.access_token,
        a.credentials?.refresh_token,
        a.credentials_env?.refresh_token,
      ].some((v) => typeof v === 'string' && v.trim().length > 0),
    )?.[0] ?? null
  );
}
