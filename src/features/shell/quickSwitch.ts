import { ref } from 'vue';
import { platform } from '../../platform/index.ts';
import { getBaseUrl } from '../../core/api/client.ts';

export const quickSwitchOpen = ref(false);
const storageKey = () => `sessions.visits.${getBaseUrl()}`;
export function sessionVisits(): Record<string, number> {
  try {
    const value = JSON.parse(platform('storage').get(storageKey()) ?? '{}');
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}
export function rememberSessionVisit(id: string) {
  const visits = sessionVisits();
  visits[id] = Date.now();
  platform('storage').set(
    storageKey(),
    JSON.stringify(
      Object.fromEntries(
        Object.entries(visits)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 500),
      ),
    ),
  );
}
