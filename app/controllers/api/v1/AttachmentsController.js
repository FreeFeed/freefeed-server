import _ from 'lodash';
import createDebug from 'debug';

import { reportError } from '../../../support/exceptions';
import { serializeAttachment } from '../../../serializers/v2/post';
import { serializeUsersByIds } from '../../../serializers/v2/user';

export default class AttachmentsController {
  app;
  debug;

  constructor(app) {
    this.app = app;
    this.debug = createDebug('freefeed:AttachmentsController');
  }

  create = async (ctx) => {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return;
    }

    const fileHandlerPromises = _.map(ctx.request.files, async (file) => {
      try {
        const newAttachment = await ctx.state.user.newAttachment({ file });
        await newAttachment.create();

        ctx.body = {
          attachments: serializeAttachment(newAttachment),
          users: serializeUsersByIds([newAttachment.createdBy]),
        };
      } catch (e) {
        if (e.message && e.message.indexOf('Corrupt image') > -1) {
          this.debug(e.message);

          const errorDetails = { message: 'Corrupt image' };
          reportError(ctx)(errorDetails);
          return;
        }

        if (e.message && e.message.indexOf('LCMS encoding') > -1) {
          this.debug(`GraphicsMagick should be configured with --with-lcms2 option`);

          const errorDetails = { status: 500, message: 'Internal server error' };
          reportError(ctx)(errorDetails);
          return;
        }

        reportError(ctx)(e);
      }
    });

    await Promise.all(fileHandlerPromises);
  };
}
