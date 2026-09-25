// Registers all browser adapters as the default platform.
import { use } from '../index.ts';
import { browserStorage } from './storage.ts';
import { browserNotify } from './notify.ts';
import { browserFs } from './fs.ts';
import { browserClipboard } from './clipboard.ts';
import { browserApp } from './app.ts';

export function registerBrowserPlatform() {
  use('clipboard', browserClipboard);
  use('storage', browserStorage);
  use('notify', browserNotify);
  use('fs', browserFs);
  use('app', browserApp);
  window.addEventListener('beforeinstallprompt', browserApp.captureInstallPrompt);
}
