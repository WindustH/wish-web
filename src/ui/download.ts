import { apiFetch, needsAccessToken } from '../core/api/client.ts';
import { isNativeApp, saveNativePackage } from '../platform/native.ts';
import { toast } from './toast.ts';
import { describeError } from '../core/i18n/errorMessages.ts';
import { tr } from '../core/i18n/tr.ts';

/**
 * Click handler for a download link to the backend. A backend reached directly
 * needs its access token, which a plain link cannot send, so the file is fetched
 * and saved from memory instead; other links download as usual.
 */
export async function downloadApiFile(event: MouseEvent, url: string, filename: string) {
  if (!needsAccessToken(url)) return;
  event.preventDefault();
  await saveApiFile(url, filename);
}

/** Starts a backend download from an action, including authenticated connections. */
export async function saveApiFile(url: string, filename: string, signal?: AbortSignal) {
  if (signal?.aborted) return;
  if (!needsAccessToken(url)) {
    saveUrl(url, filename);
    return;
  }
  try {
    const response = await apiFetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!signal?.aborted) saveBlob(blob, filename);
  } catch (error) {
    if (!signal?.aborted) toast(describeError(error).message, { tone: 'error' });
  }
}

/** Saves what is in memory as a file download. */
export function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  saveUrl(objectUrl, filename);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function saveUrl(url: string, filename: string) {
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
}

/** The signed HTTPS or loopback URL lets the download manager stream the file directly. */
export async function savePackage(url: string, filename: string) {
  if (
    isNativeApp() &&
    !(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
  ) {
    const location = await saveNativePackage(url, filename);
    if (!location) return null;
    toast(tr('已保存 ZIP', 'ZIP saved'), { detail: location, tone: 'success', icon: 'download' });
    return 'saved' as const;
  }
  saveUrl(url, filename);
  toast(tr('已开始下载 ZIP', 'ZIP download started'), { detail: filename, icon: 'download' });
  return 'started' as const;
}
