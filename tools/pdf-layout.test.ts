import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfLayout, pdfPageAt, pdfWindow } from '../src/domain/media/pdfLayout.ts';

test('continuous PDF pages preserve mixed page proportions and gaps', () => {
  const layout = pdfLayout(3, 300, new Map([[0, 2], [1, 0.5], [2, 1]]));
  assert.deepEqual(layout.starts, [0, 610, 770]);
  assert.deepEqual(layout.heights, [600, 150, 300]);
  assert.equal(layout.total, 1070);
  assert.equal(pdfPageAt(layout.starts, 609), 0);
  assert.equal(pdfPageAt(layout.starts, 610), 1);
  assert.equal(pdfPageAt(layout.starts, 900), 2);
});

test('large PDFs mount only visible pages and neighbors, including after a distant jump', () => {
  const layout = pdfLayout(10000, 600, new Map());
  const top = layout.starts[5000]!;
  const visible = pdfWindow(layout.starts, top, 900);
  assert.deepEqual(visible, [4999, 5000, 5001, 5002]);
  assert.deepEqual(pdfWindow([], 0, 600), []);
  assert.deepEqual(pdfWindow(layout.starts, 0, 600), [0, 1]);
  assert.deepEqual(pdfWindow(layout.starts, layout.total, 600), [9998, 9999]);
});

test('zoom scales page heights while retaining the inter-page gap', () => {
  const normal = pdfLayout(2, 300, new Map([[0, 2]]));
  const zoomed = pdfLayout(2, 600, new Map([[0, 2]]));
  assert.equal(zoomed.heights[0], normal.heights[0]! * 2);
  assert.equal(zoomed.starts[1], normal.heights[0]! * 2 + 10);
});
