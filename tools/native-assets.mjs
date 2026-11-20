// Called by Tauri before the native build or development server starts.
import { run } from '@tauri-apps/cli';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

const android = process.env.TAURI_ENV_PLATFORM === 'android';
await run(['icon', 'tools/native-icons.json', '--fit', 'contain']);

if (android) {
  const wrapper = 'src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar';
  const checksum = '497c8c2a7e5031f6aa847f88104aa80a93532ec32ee17bdb8d1d2f67a194a9c7';
  const existing = existsSync(wrapper);
  let bytes;
  if (existing) bytes = await readFile(wrapper);
  else {
    const response = await fetch(
      'https://raw.githubusercontent.com/gradle/gradle/v9.6.1/gradle/wrapper/gradle-wrapper.jar',
    );
    if (!response.ok) throw new Error(`Gradle wrapper download failed (HTTP ${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== checksum)
    throw new Error('Gradle wrapper checksum mismatch');
  if (!existing) await writeFile(wrapper, bytes);
}
