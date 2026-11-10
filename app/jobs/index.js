import config from 'config';

import { JobManager } from '../models';
import { initHandlers as initWelcomeDirectsHandlers } from '../support/welcome-directs';

import { initHandlers as initDeleteArticleHandlers } from './delete-article';
import { initHandlers as initPeriodicHandlers } from './periodic';
import { initHandlers as initUserGoneHandlers } from './user-gone';
import { initHandlers as initAttachmentsSanitizeHandlers } from './attachments-sanitize';
import { initHandlers as initAttachmentPrepareVideoHandlers } from './attachment-prepare-video';
import { initHandlers as initAttachmentRecreatePreviewsHandlers } from './attachment-recreate-previews';
import { initHandlers as initDeletePostsHandlers } from './delete-post';
import { initHandlers as initDeleteCommentsHandlers } from './delete-comment';
import { keepJobLockedMiddleware, sentryMiddleware } from './middlewares';

export async function initJobProcessing(app) {
  const jobManager = new JobManager(config.jobManager);
  await Promise.all(
    [
      initPeriodicHandlers,
      initUserGoneHandlers,
      initAttachmentsSanitizeHandlers,
      initAttachmentPrepareVideoHandlers,
      initAttachmentRecreatePreviewsHandlers,
      initWelcomeDirectsHandlers,
      initDeletePostsHandlers,
      initDeleteCommentsHandlers,
      initDeleteArticleHandlers,
    ].map((h) => h(jobManager, app)),
  );

  jobManager.use(sentryMiddleware);
  jobManager.use(keepJobLockedMiddleware);

  if (process.env.NODE_ENV !== 'test') {
    // Delay the start of the job polling for a random interval. In multi-node
    // environment it will allow a more even distribution of the job fetching.
    setTimeout(
      () => jobManager.startPolling(),
      Math.random() * config.jobManager.pollInterval * 1000,
    );
  }

  return jobManager;
}
