import { load as configLoader } from '../../../../config/config';
import { version } from '../../../../package.json';


const config = configLoader();

export function serverInfo(ctx) {
  const externalAuthProviders = Object.keys(config.externalAuthProviders || {});
  ctx.body = { version, externalAuthProviders };
}
