import { computed, readonly, ref } from 'vue';
import { bus } from '../../../core/bus.ts';
import { providerConfigs } from '../../../core/api/endpoints.ts';
import { providerTitles } from './providerPresentation.ts';
import { readCached, writeCached } from '../../../core/util/responseCache.ts';

// Usage rows carry only provider IDs. Keep what the names are derived from and
// resolve at render time so a locale switch renames the brand without a refetch.
const known = ref<Record<string, { display_name?: string | null; preset: string }>>({});
// Whether the names have been read at all: until then a provider has no title to show, rather
// than its ID standing in for a moment.
const read = ref(false);
export const providerTitlesError = ref<unknown>(null);
let pending: Promise<void> | undefined;
/** Whether provider names can be shown yet; until then, what shows one keeps its place empty. */
export const providerTitlesRead = readonly(read);

let loadedAt = 0;
let revision = 0;
function load() {
  if (Date.now() - loadedAt < 30_000) return;
  // Names from the last launch cover the wait; the fresh list replaces them.
  if (!Object.keys(known.value).length)
    void readCached<typeof known.value>('provider-titles').then((cached) => {
      if (cached && !Object.keys(known.value).length) {
        known.value = cached;
        read.value = true;
      }
    });
  if (pending) return;
  const requestedRevision = revision;
  pending = providerConfigs()
    .then(({ providers }: { providers: { id: string; display_name?: string | null; preset: string }[] }) => {
      if (requestedRevision !== revision) return;
      const titles = Object.fromEntries(
        providers.map((p) => [p.id, { display_name: p.display_name ?? null, preset: p.preset }]),
      );
      loadedAt = Date.now();
      known.value = titles;
      providerTitlesError.value = null;
      writeCached('provider-titles', titles);
    })
    .catch((error) => {
      if (requestedRevision === revision) providerTitlesError.value = error;
    })
    .finally(() => {
      pending = undefined;
      read.value = true;
      if (requestedRevision !== revision) load();
    });
}

// Display name, then preset brand, then ID; a name several providers share keeps
// the ID beside it. Computed over every configured provider, so each place agrees.
// Before the names are read, nothing.
const titles = computed(() =>
  providerTitles(Object.entries(known.value).map(([id, provider]) => ({ id, ...provider }))),
);

export function useProviderTitles() {
  load();
  return (id: string) => titles.value.get(id) ?? (read.value ? id : '');
}

// One application-lifetime subscriber, shared by all consumers.
bus.on('configuration.changed', () => {
  revision++;
  loadedAt = 0;
  load();
});
