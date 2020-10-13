import { version } from '../../../../package.json';
import { ServerInfo } from '../../../models';
import { allExternalProviders } from '../../../support/ExtAuth';


export async function serverInfo(ctx) {
  const externalAuthProviders = allExternalProviders
    .map(({ id, title }) => ({ id, title }));
  const registrationOpen = await ServerInfo.isRegistrationOpen();
  ctx.body = {
    version,
    externalAuthProviders,
    registrationOpen,
  };
}
