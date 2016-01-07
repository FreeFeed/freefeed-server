import fetch from 'node-fetch'

import { load as configLoader } from '../config/config'


const config = configLoader()

// https://developers.google.com/recaptcha/docs/verify
export default async function recaptchaVerify(response, clientip) {
  let googleApi = 'https://www.google.com/recaptcha/api/siteverify'
  let uc = encodeURIComponent
  let res = await fetch(`${googleApi}?secret=${uc(config.recaptcha.secret)}&response=${uc(response)}&remoteip=${uc(clientip)}`)
  let result = await res.json()
  if (result.success) {
    return true
  }
  throw new Error("Bad captcha")
}
