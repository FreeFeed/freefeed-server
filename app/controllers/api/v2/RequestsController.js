import exceptions from '../../../support/exceptions'


export default class RequestsController {
  static async revokeRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})
      return
    }

    try {
      res.status(200).jsonp({ status: 'ok'})
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }
}
