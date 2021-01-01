import XRegExp from 'xregexp';
import { Link } from 'social-text-tokenizer';

const marksCharsRe = XRegExp(`[\\pM]`, 'g');
const notAlNum = XRegExp(`[^\\pL\\pN]+`, 'g');

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
 */
export function normalizeText(text: string) {
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

export function linkToText(link: Link) {
  return normalizeText(link.pretty).replace(notAlNum, ' ').replace(/^www /, '');
}
