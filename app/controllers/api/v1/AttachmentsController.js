import formidable from 'formidable'

import { AttachmentSerializer } from '../../../models'
import { reportError } from '../../../support/exceptions'


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

    const form = new formidable.IncomingForm()

    form.on('file', async (inputName, file) => {
      try {
        const newAttachment = await req.user.newAttachment({ file })
        await newAttachment.create()

        const json = await new AttachmentSerializer(newAttachment).promiseToJSON()
        res.jsonp(json)
      } catch (e) {
        if (e.message && e.message.indexOf('Corrupt image') > -1) {
          this.app.logger.warn(e.message)

          const errorDetails = { message: 'Corrupt image' }
          reportError(res)(errorDetails)
          return;
        }

        if (e.message && e.message.indexOf('LCMS encoding') > -1) {
          this.app.logger.warn(`GraphicsMagick should be configured with --with-lcms2 option`)

          const errorDetails = { status: 500, message: 'Internal server error' }
          reportError(res)(errorDetails)
          return;
        }

        reportError(res)(e)
      }
    })

    form.parse(req)
  }
}
