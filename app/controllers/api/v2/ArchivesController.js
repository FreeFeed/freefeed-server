import _ from 'lodash';
import expect from 'unexpected';
import Mailer from '../../../../lib/mailer'
import { load as configLoader } from '../../../../config/config'
import { dbAdapter } from '../../../models';
import { ForbiddenException, NotFoundException } from '../../../support/exceptions';
import { monitored, authRequired } from './helpers';

const config = configLoader();

export default class ArchivesController {
  restoration = authRequired(monitored('archives.restoration', async (ctx) => {
    const user = ctx.state.user;
    const archParams = await dbAdapter.getUserArchiveParams(user.id);
    if (!archParams) {
      throw new ForbiddenException('You have no archive record');
    }
    if (!archParams.has_archive) {
      throw new ForbiddenException('You have not Clio archive');
    }
    if (archParams.recovery_status != 0) {
      throw new ForbiddenException('Archive restoration is already in progress or finished');
    }

    const params = {
      disable_comments: false,
      via_restore:      [],
      ...ctx.request.body,
    };

    // There should be only url's that are present in via_sources
    params.via_restore = _.uniq(params.via_restore)
      .filter((u) => archParams.via_sources.find((s) => s.url === u));

    try {
      await expect(params, 'to exhaustively satisfy', {
        disable_comments: expect.it('to be a boolean'),
        via_restore:      expect.it('to be an array').and('to have items satisfying', 'to be a string'),
      });
    } catch (e) {
      throw new ForbiddenException('Invalid data format');
    }

    await dbAdapter.startArchiveRestoration(user.id, params);

    await Mailer.sendMail(
      config.mailer.adminRecipient,
      'Archive restoration request',
      { user, archParams },
      `${config.appRoot}/app/scripts/views/mailer/restoreArchive.ejs`,
    )

    ctx.status = 202;
    ctx.body = {};
  }));

  activities = authRequired(monitored('archives.start', async (ctx) => {
    const user = ctx.state.user;
    const archParams = await dbAdapter.getUserArchiveParams(user.id);
    if (!archParams) {
      throw new ForbiddenException('You have no archive record');
    }

    try {
      await expect(ctx.request.body, 'to exhaustively satisfy', { restore: true });
    } catch (e) {
      throw new ForbiddenException('Invalid data format');
    }

    if (!archParams.restore_comments_and_likes) {
      await dbAdapter.enableArchivedActivitiesRestoration(user.id);
    }

    ctx.status = 202;
    ctx.body = {};
  }));

  postByOldName = monitored('archives.postByOldName', async (ctx) => {
    const { name } = ctx.params;
    const postId = await dbAdapter.getPostIdByOldName(name);
    if (!postId) {
      throw new NotFoundException('Post not found');
    }

    ctx.body = { postId };
  });
}
