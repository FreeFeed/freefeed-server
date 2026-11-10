import { registerHooks } from 'node:module';

import { resolve } from './extensionless.js';
import { load } from './jsx-loader.js';

registerHooks({ resolve, load });
