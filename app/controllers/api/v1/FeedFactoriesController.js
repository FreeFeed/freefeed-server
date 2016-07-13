import { dbAdapter } from '../../../models'
import { UsersController, GroupsController } from '../../../controllers'
import { reportError, NotFoundException } from '../../../support/exceptions'


export default class FeedFactoriesController {
  static async update(req, res) {
    try {
      const feed = await dbAdapter.getFeedOwnerById(req.params.userId)

      if (!feed) {
        throw new NotFoundException(`Feed ${req.params.userId} is not found`)
      }

      const controller = feed.isUser() ? UsersController : GroupsController
      controller.update(req, res)
    } catch (e) {
      reportError(res)(e)
    }
  }
}
