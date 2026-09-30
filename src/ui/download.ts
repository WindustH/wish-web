import { apiFetch, needsAccessToken } from '../core/api/client.ts';

/**
 * Click handler for a download link to the backend. A backend reached directly
 * needs its access token, which a plain link cannot send, so the file is fetched
 * and saved from memory instead; other links download as usual.
 */
export async function downloadApiFile(event: MouseEvent, url: string, filename: string) {
  if (!needsAccessToken(url)) return;
  event.preventDefault();
  const response = await apiFetch(url);
  if (!response.ok) return;
  saveBlob(await response.blob(), filename);
}

/** Saves what is in memory as a file download. */
export function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: objectUrl, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
