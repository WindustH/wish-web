import hljs from 'highlight.js/lib/common';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import powershell from 'highlight.js/lib/languages/powershell';
import { createBoundedCache } from '../core/util/boundedCache.ts';

hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('powershell', powershell);

// Reuse completed fences while the surrounding answer streams. Large code
// remains complete and copyable, without synchronous syntax parsing on the UI thread.
const cache = createBoundedCache(128, 1_000_000);
const MAX_HIGHLIGHT_LENGTH = 32_000;
export function highlightCode(code: string, language: string): string {
  const name = language.toLowerCase();
  if (!name || !hljs.getLanguage(name) || code.length > MAX_HIGHLIGHT_LENGTH) return '';
  const key = `${name}\0${code}`;
  const previous = cache.get(key);
  if (previous !== undefined) return previous;
  try {
    const html = hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
    cache.set(key, html);
    return html;
  } catch {
    // Markdown-it escapes the original code when highlighting returns nothing.
    return '';
  }
}
