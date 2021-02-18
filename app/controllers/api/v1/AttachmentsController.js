import createDebug from 'debug';
import compose from 'koa-compose';

import { reportError, BadRequestException } from '../../../support/exceptions';
import { serializeAttachment } from '../../../serializers/v2/post';
import { serializeUsersByIds } from '../../../serializers/v2/user';
import { authRequired } from '../../middlewares';

export default class AttachmentsController {
  app;
  debug;

  constructor(app) {
    this.app = app;
    this.debug = createDebug('freefeed:AttachmentsController');
  }

  create = compose([
    authRequired(),
    async (ctx) => {
      const { file } = ctx.request.files;

      if (!file) {
        throw new BadRequestException('No file provided');
      }

      try {
        const newAttachment = await ctx.state.user.newAttachment({ file });
        await newAttachment.create();

        ctx.body = {
          attachments: serializeAttachment(newAttachment),
          users: await serializeUsersByIds([newAttachment.userId]),
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
    },
  ]);
}
