import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarOptions } from '../src/features/usage/chartOptions.ts';
test('an empty usage calendar renders its axis without dereferencing a missing bucket', () => {
  const option = calendarOptions({ buckets: [], bucketMs: 86400000, offsetMinutes: 0, endMs: 0 }, {
    foreground: '#fff', muted: '#aaa', line: '#333', surface: '#222', font: 'sans-serif', colors: [], heat: [],
  }, 'en') as any;
  assert.equal(option.xAxis.axisLabel.formatter('0'), '');
  assert.deepEqual(option.series[0].data, []);
});
