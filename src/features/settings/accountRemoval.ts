/** All service configurations referencing an account, including legacy search borrowers. */
export function accountRemovalPlan(config: any, accountId: string) {
  const models = Object.keys(config.providers ?? {}).filter((id) => config.providers[id].credential_id === accountId);
  const searches = Object.keys(config.search?.providers ?? {}).filter((id) => {
    const provider = config.search.providers[id];
    return provider.credential_id === accountId || models.includes(provider.auth_provider);
  });
  const readers = Object.keys(config.fetch?.providers ?? {}).filter(
    (id) => config.fetch.providers[id].credential_id === accountId,
  );
  const images = Object.keys(config.image_generation?.providers ?? {}).filter(
    (id) => config.image_generation.providers[id].credential_id === accountId,
  );
  return { models, searches, readers, images, resetsDefault: models.includes(config.defaults?.provider) };
}
export function removeAccountAndServices(config: any, accountId: string) {
  const plan = accountRemovalPlan(config, accountId);
  for (const id of plan.models) delete config.providers[id];
  for (const [group, ids] of [
    [config.search, plan.searches],
    [config.fetch, plan.readers],
    [config.image_generation, plan.images],
  ] as const) {
    if (!group) continue;
    for (const id of ids) delete group.providers[id];
    if (group.order) group.order = group.order.filter((id: string) => !ids.includes(id));
  }
  if (plan.resetsDefault) {
    config.defaults.provider = '';
    config.defaults.model = '';
  }
  delete config.accounts[accountId];
}
