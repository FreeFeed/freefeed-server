import config from 'config';

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
    attachments: {
      fileSizeLimit: config.attachments.fileSizeLimit,
      maxCountPerPost: config.attachments.maxCount,
    },
    maxTextLength: {
      post: config.maxLength.post,
      comment: config.maxLength.comment,
      description: config.maxLength.description,
    },
    emailVerificationEnabled: config.emailVerification.enabled,
  };
}
