import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasNewWebBuild } from '../src/ui/buildUpdate.ts';

function reply(body: unknown, status = 200): typeof fetch {
  return async (_url, options) => {
    assert.equal(options?.cache, 'no-store');
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  };
}

test('network build check distinguishes current and new deployments', async () => {
  assert.equal(await hasNewWebBuild('build-a', reply({ id: 'build-a' })), false);
  assert.equal(await hasNewWebBuild('build-a', reply({ id: 'build-b' })), true);
});

test('network build check rejects missing or invalid build information', async () => {
  await assert.rejects(hasNewWebBuild('build-a', reply({ id: '' })), /Invalid build/);
  await assert.rejects(hasNewWebBuild('build-a', reply({ error: 'missing' }, 404)), /HTTP 404/);
});
