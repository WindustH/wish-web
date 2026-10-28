import { computed, inject } from 'vue';
import { configDraftKey } from './useConfigDraft.ts';
import { fetchAccountPresets } from './accountCompatibility.ts';
import { providerName, presetDescription } from '../../ui/domain/providers/providerPresentation.ts';
import { providerPriority } from '../../ui/domain/providers/catalogOrder.ts';
import { tr } from '../../core/i18n/tr.ts';

export interface AccountPreset {
  id: string;
  name: string;
  brand?: string;
  description: string;
  fields: string[];
}

// Account types describe credentials, not model endpoints. Services using the same
// platform reuse its type; keyless services do not introduce an account.
export const searchAccountPreset = (id: string) => (id === 'jina' ? 'jina_reader' : id);

export function useAccountCatalog() {
  const { catalog, searchCatalog, fetchCatalog, imageCatalog } = inject(configDraftKey)!;
  return computed(() => {
    const entries = new Map<string, AccountPreset>();
    for (const p of [...catalog.value.presets].sort(
      (a, b) => providerPriority(a.provider) - providerPriority(b.provider),
    )) {
      entries.set(p.id, {
        id: p.id,
        name: providerName(p.provider),
        brand: p.provider,
        description: presetDescription(p),
        fields: [...new Set([...p.required_credentials, ...p.optional_credentials])],
      });
    }
    for (const p of searchCatalog.value) {
      if (p.key === 'none') continue;
      if (p.borrows_from?.length) {
        for (const id of p.borrows_from) {
          const existing = entries.get(id);
          if (existing) existing.description += ` · ${tr('网页搜索', 'Web search')}`;
        }
        continue;
      }
      const id = searchAccountPreset(p.id);
      entries.set(id, { id, name: p.name, brand: p.brand, description: tr('网页搜索', 'Web search'), fields: [] });
    }
    for (const p of fetchCatalog.value) {
      if (p.key === 'none') continue;
      const ids = p.account_preset ? [p.account_preset] : fetchAccountPresets(p.id);
      for (const id of ids.length ? ids : [p.id]) {
        const existing = entries.get(id);
        if (existing) {
          existing.description += ` · ${tr('网页读取', 'Web fetch')}`;
        } else
          entries.set(id, {
            id,
            name: p.name,
            brand: p.id === 'jina_reader' ? 'Jina' : undefined,
            description: tr('网页读取', 'Web fetch'),
            fields: [],
          });
      }
    }
    for (const p of imageCatalog?.value ?? []) {
      for (const id of p.account_presets) {
        const existing = entries.get(id);
        if (!existing)
          entries.set(id, {
            id,
            name: p.name,
            brand: p.brand,
            description: tr('图片生成', 'Image generation'),
            fields: [],
          });
        else if (!existing.description.includes(tr('图片生成', 'Image generation')))
          existing.description += ` · ${tr('图片生成', 'Image generation')}`;
      }
    }
    return [...entries.values()];
  });
}
