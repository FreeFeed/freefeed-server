const env = process.env.NODE_ENV || 'development';
const configName = `./environments/${env}`;

let config;

export function load() {
  // FIXME: should be replaced with promise-based System.import() eventually
  if (!config) {
    config = require(configName).getConfig();

    if (typeof config.attachments.fileSizeLimit === 'string') {
      // eslint-disable-next-line no-console
      console.error('⚠️ DEPRECATED: please use number as value of config.attachments.fileSizeLimit');
    }
  }

  return config;
}
