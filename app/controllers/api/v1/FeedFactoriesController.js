import { pgAdapter } from '../../../models'
import { UsersController, GroupsController } from '../../../controllers'
import exceptions, { NotFoundException } from '../../../support/exceptions'


export default class FeedFactoriesController {
  static async update(req, res) {
    try {
      const feed = await pgAdapter.getFeedOwnerById(req.params.userId)

      if (!feed) {
        throw new NotFoundException(`Feed ${req.params.userId} is not found`)
      }

      var controller = feed.isUser() ? UsersController : GroupsController
      controller.update(req, res)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }
}
