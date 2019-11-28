import { load as configLoader } from '../../../../config/config';
import { version } from '../../../../package.json';
import { ServerInfo } from '../../../models';


const config = configLoader();

export async function serverInfo(ctx) {
  const externalAuthProviders = Object.keys(config.externalAuthProviders || {});
  const registrationOpen = await ServerInfo.isRegistrationOpen();
  ctx.body = {
    version,
    externalAuthProviders,
    registrationOpen,
  };
}
