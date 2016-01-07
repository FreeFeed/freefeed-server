import formidable from 'formidable'

import { AttachmentSerializer } from '../../../models'
import exceptions from '../../../support/exceptions'


export default class AttachmentsController {
  static create(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    var form = new formidable.IncomingForm()

    form.on('file', async (inputName, file) => {
      try {
        const newAttachment = await req.user.newAttachment({ file: file })
        await newAttachment.create()

        let json = await new AttachmentSerializer(newAttachment).promiseToJSON()
        res.jsonp(json)
      } catch (e) {
        if (e.message && e.message.indexOf('Corrupt image') > -1) {
          console.log(e)

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
