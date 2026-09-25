// Read-only checks through the same proxy used by the UI.
export {};   // an ES module: top-level await
const base = (process.argv[2] || 'http://127.0.0.1:8790') + '/api';
let failures = 0;
for (const path of ['/version','/sessions?limit=1','/providers','/defaults','/config','/usage','/usage/series?window=7d',`/usage/daily?days=7&end_date=${new Date().toISOString().slice(0,10)}&tz_offset_minutes=0`,'/status','/storage']) {
  try {
    const response = await fetch(base + path, {signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
    await response.json(); console.log(`PASS ${path}`);
  } catch (error) { failures++; console.error(`FAIL ${path}: ${(error as Error).message}`); }
}
try {
  const response = await fetch(base + '/events', {signal:AbortSignal.timeout(5000)});
  const reader = response.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  await reader.cancel();
  if (!first.includes('snapshot')) throw new Error('missing initial snapshot');
  console.log('PASS /events');
} catch(error) { failures++; console.error(`FAIL /events: ${(error as Error).message}`); }
process.exitCode = failures ? 1 : 0;
