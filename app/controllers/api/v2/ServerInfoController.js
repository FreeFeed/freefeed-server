import { version } from '../../../../package.json';
import { ServerInfo } from '../../../models';
import { allExternalProviders } from '../../../support/ExtAuth';

export async function serverInfo(ctx) {
  const externalAuthProvidersInfo = allExternalProviders.map(({ id, title, brand = id }) => ({
    id,
    title,
    brand,
  }));
  const registrationOpen = await ServerInfo.isRegistrationOpen();
  ctx.body = {
    version,
    registrationOpen,
    externalAuthProvidersInfo,
    // Deprecated and keeps for backward compatibility with clients
    externalAuthProviders: externalAuthProvidersInfo.map((p) => p.id),
  };
}
