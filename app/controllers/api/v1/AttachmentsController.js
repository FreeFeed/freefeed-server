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
          return;
        }

        if (e.message && e.message.indexOf('LCMS encoding') > -1) {
          this.app.logger.warn(`GraphicsMagick should be configured with --with-lcms2 option`)

          const errorDetails = { status: 500, message: 'Internal server error' }
          exceptions.reportError(res)(errorDetails)
          return;
        }

        exceptions.reportError(res)(e)
      }
    })

    form.parse(req)
  }
}
