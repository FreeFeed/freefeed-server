import  XRegExp from 'xregexp';


const marksCharsRe = new XRegExp(`[\\pM]`, 'g');
const notAlNum = new XRegExp(`[^\\pL\\pN]+`, 'g');

/**
 * Prepare text for search:
 * 1. Normalize to NFKD Unicode form
 * 2. Remove any Unicode Mark symbols
 * 3. Normalize to NFC Unicode form
 * 4. Convert to lower case
 *
 * As a result, the 'Pražského povstání' string becomes 'prazskeho povstani'.
 * It isn't a complete solution (keeps ligatures ß, æ and some other joined)
 * but can handle most of european diactrics.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return (
    text
      // The "'" has a special meaning in Postgres literals and has no
      // meaning in search context. Remove them for simplicity.
      .replace(/'/g, ' ')
      .normalize('NFKD')
      // Preserve cyrillic 'short i' (convert it back to NFC)
      .replace(/\u0418\u0306/g, '\u0419')
      .replace(/\u0438\u0306/g, '\u0439')
      .replace(marksCharsRe, '')
      .normalize('NFC')
      .toLowerCase()
  );
}

/**
 * @param {Link} link
 * @returns {string}
 */
export function linkToText(link) {
  return normalizeText(link.pretty)
    .replace(notAlNum, ' ')
    .replace(/^www /, '');
}
