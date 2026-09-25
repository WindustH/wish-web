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
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: objectUrl, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
