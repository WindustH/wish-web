import { apiFetch, needsAccessToken } from '../core/api/client.ts';
import { toast } from './toast.ts';
import { describeError } from '../core/i18n/errorMessages.ts';

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
export async function saveApiFile(url: string, filename: string) {
  if (!needsAccessToken(url)) {
    saveUrl(url, filename);
    return;
  }
  try {
    const response = await apiFetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    saveBlob(await response.blob(), filename);
  } catch (error) {
    toast(describeError(error).message);
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
