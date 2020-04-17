/**
 * Override config to match our configuration shape. This file is to be complete
 * as the code is translated to Typesctipt.
 */
declare module 'config' {
  type Config = {
    attachments: {
      fileSizeLimit: number;
    }
  }

  const c: Config;
  export = c;
}

