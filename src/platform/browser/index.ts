// Registers all browser adapters as the default platform.
import { use } from '../index.ts';
import { createBrowserStorage, type BrowserStorageOptions } from './storage.ts';
import { browserNotify } from './notify.ts';
import { browserFs } from './fs.ts';
import { browserClipboard } from './clipboard.ts';
import { browserApp } from './app.ts';

export function registerBrowserPlatform(storage: BrowserStorageOptions) {
  use('clipboard', browserClipboard);
  use('storage', createBrowserStorage(storage));
  use('notify', browserNotify);
  use('fs', browserFs);
  use('app', browserApp);
  window.addEventListener('beforeinstallprompt', browserApp.captureInstallPrompt);
}
