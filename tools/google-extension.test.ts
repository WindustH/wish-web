import assert from 'node:assert/strict';
import test from 'node:test';
import { extensionTool } from '../src/extensions/registry.ts';

test('Google grounded search selects a structured result renderer with its query and sources', () => {
  const tool = extensionTool('google_search');
  assert.ok(tool, 'the backend Google search contract must have a frontend presentation');
  const output = { provider: 'google_antigravity', results: [{ title: 'Rust', url: 'https://rust-lang.org/', snippet: 'Documentation' }] };
  const context = { tool: 'google_search', arguments: { query: 'Rust documentation' }, output, metadata: null };
  assert.equal(tool.icon, 'web-search');
  assert.deepEqual(tool.invocation?.(context)?.props.request, context.arguments);
  assert.equal(tool.result(context)?.props.output, output);
  assert.equal(tool.result({ ...context, output: null, metadata: output })?.props.output, output);
});

test('both Google image contracts retain session artifact previews and reject malformed image output', () => {
  const image = { id: 'a'.repeat(64), path: '/session/blobs/image', mime_type: 'image/jpeg' };
  for (const name of ['google_image', 'google_interactions_image']) {
    const tool = extensionTool(name);
    assert.ok(tool);
    const context = { tool: name, session: 'fixture', arguments: { prompt: 'a cup', reference_images: [image.id] }, output: { images: [image] }, metadata: null };
    assert.deepEqual(tool.result(context)?.props, { session: 'fixture', images: [image] });
    assert.equal(tool.result({ ...context, session: undefined }), undefined);
    assert.equal(tool.result({ ...context, output: { images: [{ id: 'invalid' }] } }), undefined);
  }
});
