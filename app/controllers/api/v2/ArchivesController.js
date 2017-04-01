import _ from 'lodash';
import expect from 'unexpected';
import Mailer from '../../../../lib/mailer'
import { load as configLoader } from '../../../../config/config'
import { dbAdapter } from '../../../models';
import { monitored, authRequired } from './helpers';

const config = configLoader();

export default class ArchivesController {
  start = authRequired(monitored('archives.start', async (ctx) => {
    const user = ctx.state.user;
    const archParams = await dbAdapter.getUserArchiveParams(user.id);
    if (!archParams) {
      ctx.status = 403;
      ctx.body = { err: `You have no archive record` };
      return;
    }
    if (archParams.recovery_status != 0) {
      ctx.status = 403;
      ctx.body = { err: `Archive restoration is already in progress or finished` };
      return;
    }

    const params = {
      disable_comments:      false,
      restore_self_comments: true,
      via_restore:           [],
      ...ctx.request.body,
    };

    // There should be only url's that are present in via_sources
    params.via_restore = _.uniq(params.via_restore)
      .filter((u) => archParams.via_sources.find((s) => s.url === u));

    try {
      await expect(params, 'to exhaustively satisfy', {
        disable_comments:      expect.it('to be a boolean'),
        restore_self_comments: expect.it('to be a boolean'),
        via_restore:           expect.it('to be an array').and('to have items satisfying', 'to be a string'),
      });
    } catch (e) {
      ctx.status = 403;
      ctx.body = { err: `Invalid data format` };
      return;
    }

    await dbAdapter.startArchiveRestoration(user.id, params);

    await Mailer.sendMail(
      config.mailer.adminRecipient,
      'Archive restoration request',
      { user, archParams },
      `${config.appRoot}/app/scripts/views/mailer/restoreArchive.ejs`,
    )

    ctx.status = 202;
  }));
}
