import { computed, ref } from 'vue';
import { providerConfigs } from '../../core/api/endpoints.ts';
import { providerTitles } from '../providerPresentation.ts';
import { readCached, writeCached } from '../../core/util/responseCache.ts';

// Usage rows carry only provider IDs. Keep what the names are derived from and
// resolve at render time so a locale switch renames the brand without a refetch.
const known = ref<Record<string, { display_name?: string | null; preset: string }>>({});
// Whether the names have been read at all: until then a provider has no title to show, rather
// than its ID standing in for a moment.
const read = ref(false);
let pending: Promise<void> | undefined;

function load() {
  // Names from the last launch cover the wait; the fresh list replaces them.
  if (!Object.keys(known.value).length) void readCached<typeof known.value>('provider-titles').then(cached => { if (cached && !Object.keys(known.value).length) { known.value = cached; read.value = true; } });
  pending ??= providerConfigs()
    .then(({ providers }: { providers: { id: string; display_name?: string | null; preset: string }[] }) => {
      const titles = Object.fromEntries(providers.map(p => [p.id, { display_name: p.display_name ?? null, preset: p.preset }]));
      known.value = titles;
      writeCached('provider-titles', titles);
    })
    .catch(() => {})
    .finally(() => { pending = undefined; read.value = true; });
}

// Display name, then preset brand, then ID; a name several providers share keeps
// the ID beside it. Computed over every configured provider, so each place agrees.
// Before the names are read, nothing.
const titles = computed(() => providerTitles(Object.entries(known.value).map(([id, provider]) => ({ id, ...provider }))));

export function useProviderTitles() {
  load();
  return (id: string) => titles.value.get(id) ?? (read.value ? id : '');
}
