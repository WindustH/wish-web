// A secret in the configuration - an API key, a credential, a password - is written out, taken
// from the server's environment as `${NAME}`, or, once saved, comes back redacted: the field then
// shows empty, and leaving it empty keeps what was saved.

/** How the server sends back a secret it keeps. */
export const REDACTED = '<redacted>';

/** The environment variable a field names when it reads `${NAME}`. */
export function parseEnvRef(text: string): string | undefined {
  return /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(text)?.[1];
}

/** What a secret's field shows: `${NAME}` for a variable, nothing for a redacted value, else the value. */
export function secretText(value: string | null | undefined, env: string | null | undefined): string {
  if (env != null) return '${' + env + '}';
  return value === REDACTED ? '' : value ?? '';
}

/**
 * What to store for what was typed: a variable for `${NAME}`, else the text. An empty field
 * stores `kept` - the redacted value, where emptying the field keeps what was saved - or nothing.
 */
export function readSecret(text: string, kept: string | null = null): { value: string | null; env: string | null } {
  const env = parseEnvRef(text);
  return env ? { value: null, env } : { value: text || kept, env: null };
}

/** Writes what was typed into a credentials map and its map of variables. */
export function writeCredential(values: Record<string, string>, envs: Record<string, string>, field: string, text: string) {
  const { value, env } = readSecret(text);
  delete values[field];
  delete envs[field];
  if (env) envs[field] = env;
  else if (value) values[field] = value;
}
