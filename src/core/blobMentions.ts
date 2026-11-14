/** Coordinates are independent of the message's rendered text. */
export type BlobLocation = { page?: number; time?: number };
export type BlobMention = BlobLocation & { owner: string; id: string; name?: string };
export type FileMention =
  | (BlobMention & { kind: 'blob' })
  | (BlobLocation & { kind: 'local'; path: string; name?: string })
  | { kind: 'environment'; href: string; name?: string };

function location(params: URLSearchParams): BlobLocation | undefined {
  const page = params.has('page') ? Number(params.get('page')) : undefined;
  const rawTime = params.get('time') ?? params.get('t');
  const time = rawTime === null ? undefined : Number(rawTime);
  if (page !== undefined && (!Number.isSafeInteger(page) || page < 1)) return;
  if (time !== undefined && (!Number.isFinite(time) || time < 0)) return;
  return { page, time };
}

/** Only explicit local paths and Wish references are intercepted. No I/O while rendering. */
export function parseFileMention(href: string): FileMention | undefined {
  try {
    const decoded = decodeURI(href);
    if (
      /^(?:wish:\/\/blob\/|\$\{?WISH_)/.test(decoded) &&
      /\$\{?WISH_(?:BLOB_ROOT|TMPDIR|BLOB_ID_[0-9A-Z]+|SESSION_ID_[0-9A-Z]+)\}?/.test(decoded)
    ) {
      return { kind: 'environment', href: decoded };
    }
    if (/^wish:\/\/blob\//i.test(href)) {
      const url = new URL(href);
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const position = location(url.searchParams);
      if (
        parts.length !== 2 ||
        !parts[0] ||
        /[\/\\\0]/.test(parts[0]) ||
        !/^[a-f0-9]{64}$/.test(parts[1]!) ||
        !position
      )
        return;
      return { kind: 'blob', owner: parts[0], id: parts[1]!, ...position };
    }
    let value = href;
    if (/^file:/i.test(value)) {
      const url = new URL(value);
      if (url.hostname && url.hostname !== 'localhost') return;
      value = `${url.pathname}${url.hash}`;
    }
    if (!/^\/(?!\/)|^[a-z]:[\\/]/i.test(value)) return;
    const fragment = value.indexOf('#');
    const position = fragment >= 0 ? location(new URLSearchParams(value.slice(fragment + 1))) : {};
    if (!position) return;
    const path = decodeURIComponent(fragment >= 0 ? value.slice(0, fragment) : value);
    if (path.includes('\0') || path.length > 16384 || /^\/api\//.test(path)) return;
    return { kind: 'local', path, ...position };
  } catch {
    return;
  }
}

export function blobMentionHref(mention: BlobMention): string {
  const url = new URL(`wish://blob/${encodeURIComponent(mention.owner)}/${mention.id}`);
  if (mention.page !== undefined) url.searchParams.set('page', String(mention.page));
  if (mention.time !== undefined) url.searchParams.set('time', String(mention.time));
  return url.href;
}

export function readBlobMention(value: unknown): BlobMention | undefined {
  if (!value || typeof value !== 'object') return;
  const item = value as Record<string, unknown>;
  if (typeof item.owner !== 'string' || typeof item.id !== 'string') return;
  const mention = {
    owner: item.owner,
    id: item.id,
    ...(typeof item.name === 'string' ? { name: item.name } : {}),
    ...(item.page != null ? { page: Number(item.page) } : {}),
    ...(item.time != null ? { time: Number(item.time) } : {}),
  };
  return parseFileMention(blobMentionHref(mention))?.kind === 'blob' ? mention : undefined;
}

/** Resolve only public variables supplied by the message owner's session. */
export function resolveEnvironmentMention(
  href: string,
  environment: Record<string, string>,
  owner: string,
): Exclude<FileMention, { kind: 'environment' }> | undefined {
  let missing = false;
  const expanded = href.replace(/\$\{([A-Z][A-Z0-9_]*)\}|\$([A-Z][A-Z0-9_]*)/g, (_, braced, plain) => {
    const key = braced ?? plain;
    if (
      !/^WISH_(?:BLOB_ROOT|TMPDIR|BLOB_ID_[0-9A-Z]+|SESSION_ID_[0-9A-Z]+)$/.test(key) ||
      typeof environment[key] !== 'string'
    ) {
      missing = true;
      return '';
    }
    return environment[key];
  });
  if (missing) return;
  const bare = expanded.match(/^([a-f0-9]{64})(?:#(.*))?$/);
  if (bare) {
    const mention = parseFileMention(
      `wish://blob/${encodeURIComponent(owner)}/${bare[1]}${bare[2] ? '?' + bare[2] : ''}`,
    );
    return mention?.kind === 'blob' ? mention : undefined;
  }
  const parsed = parseFileMention(expanded);
  if (!parsed || parsed.kind === 'environment') return;
  if (parsed.kind === 'local' && environment.WISH_BLOB_ROOT) {
    const prefix = environment.WISH_BLOB_ROOT.replace(/\/$/, '') + '/';
    const id = parsed.path.startsWith(prefix) ? parsed.path.slice(prefix.length) : '';
    if (/^[a-f0-9]{64}$/.test(id)) return { kind: 'blob', owner, id, page: parsed.page, time: parsed.time };
  }
  return parsed;
}
