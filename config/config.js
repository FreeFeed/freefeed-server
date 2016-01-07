var env = process.env.NODE_ENV || 'development'
  , configName = `./environments/${env}`
  , config

export function load() {
  if (!config)
    config = require(configName).getConfig()

  return config
}
