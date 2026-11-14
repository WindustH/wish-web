import { configSave, configSnapshot } from './api/endpoints.ts';
import type { ConfigSnapshot, EndpointOptions } from './api/types.ts';
import { replayConfigChanges } from './configMerge.ts';

/** Save only local edits if an account refresh or another editor changed the revision. */
export async function saveConfigEdits(
  source: ConfigSnapshot,
  config: ConfigSnapshot['config'],
  opts?: EndpointOptions,
): Promise<ConfigSnapshot> {
  try {
    return await configSave({ revision: source.revision, config }, opts);
  } catch (error) {
    if ((error as { status?: number })?.status !== 409) throw error;
    const latest = await configSnapshot(opts);
    return configSave(
      { revision: latest.revision, config: replayConfigChanges(source.config, config, latest.config) },
      opts,
    );
  }
}
