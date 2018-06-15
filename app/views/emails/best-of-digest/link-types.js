export const LINK = 'link';
export const AT_LINK = 'atLink';
export const LOCAL_LINK = 'localLink';
export const EMAIL = 'email';
export const HASHTAG = 'hashTag';
export const ARROW = 'arrow';

const linkTypes = [LINK, AT_LINK, LOCAL_LINK, EMAIL, HASHTAG, ARROW];

export function isLink({ type }) {
  return linkTypes.indexOf(type) !== -1;
}

export const FRIENDFEED_POST = new RegExp(`^http://friendfeed.com/[^/]+/([0-9a-f]{8})(?:/|$)`);
