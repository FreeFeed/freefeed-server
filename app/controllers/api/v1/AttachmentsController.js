import formidable from 'formidable'

import { AttachmentSerializer } from '../../../models'
import exceptions from '../../../support/exceptions'


export default class AttachmentsController {
  app = null

  constructor(app) {
    this.app = app
  }

  create = (req, res) => {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    var form = new formidable.IncomingForm()

    form.on('file', async (inputName, file) => {
      try {
        const newAttachment = await req.user.newAttachment({ file: file })
        await newAttachment.create()

        let json = await new AttachmentSerializer(newAttachment).promiseToJSON()
        res.jsonp(json)
      } catch (e) {
        if (e.message && e.message.indexOf('Corrupt image') > -1) {
          this.app.logger.warn(e.message)

          let errorDetails = { message: 'Corrupt image' }
          exceptions.reportError(res)(errorDetails)
        } else {
          exceptions.reportError(res)(e)
        }
      }
    })

    form.parse(req)
  }
}
