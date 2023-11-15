import config from 'config';

// https://developers.google.com/recaptcha/docs/verify
export default async function recaptchaVerify(response, clientip) {
  const googleApi = 'https://www.google.com/recaptcha/api/siteverify';
  const uc = encodeURIComponent;
  const res = await fetch(
    `${googleApi}?secret=${uc(config.recaptcha.secret)}&response=${uc(response)}&remoteip=${uc(
      clientip,
    )}`,
  );
  const result = await res.json();

  if (result.success) {
    return true;
  }

  throw new Error('Bad captcha');
}
