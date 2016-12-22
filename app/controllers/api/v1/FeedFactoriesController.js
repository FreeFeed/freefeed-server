import { dbAdapter } from '../../../models'
import { UsersController, GroupsController } from '../../../controllers'
import { NotFoundException } from '../../../support/exceptions'


export default class FeedFactoriesController {
  static async update(ctx) {
    const feed = await dbAdapter.getFeedOwnerById(ctx.params.userId);

    if (!feed) {
      throw new NotFoundException(`Feed ${ctx.params.userId} is not found`);
    }

    const controller = feed.isUser() ? UsersController : GroupsController;
    await controller.update(ctx);
  }
}
