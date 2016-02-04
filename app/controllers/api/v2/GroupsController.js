import exceptions, { NotFoundException }  from '../../../support/exceptions'


export default class GroupsController {
  static async groupRequests(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})

    try {
      res.jsonp({ err: null, status: 'success' })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }
}
