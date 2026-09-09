// Registers all browser adapters as the default platform.
import { use } from '../index.js';
import { browserStorage } from './storage.js';
import { browserNotify } from './notify.js';
import { browserFs } from './fs.js';
import { browserShare } from './share.js';
import { browserApp } from './app.js';

export function registerBrowserPlatform() {
  use('storage', browserStorage);
  use('notify', browserNotify);
  use('fs', browserFs);
  use('share', browserShare);
  use('app', browserApp);
}
