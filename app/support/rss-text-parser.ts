import { escape as urlEscape } from 'querystring';

import { escape as htmlEscape } from 'lodash';
import { sentences } from 'sbd';
import { HASHTAG, EMAIL, MENTION, LINK } from 'social-text-tokenizer';
import config from 'config';
import { emailHref, linkHref, prettyEmail, prettyLink } from 'social-text-tokenizer/prettifiers';

import { tokenize } from './tokenize-text';

export function extractTitle(text: string, maxLen: number): string {
  // see https://unicode.org/cldr/utility/list-unicodeset.jsp?a=%5B%3AWord_Break%3DNewline%3A%5D&g=&i=
  const [line] = text.split(/[\u0000-\u001f\u0085\u2028\u2029]/, 1);

  if (line.length <= maxLen) {
    return trimPeriod(line);
  }

  const ss = sentences(line);

  if (ss[0].length < maxLen) {
    return trimPeriod(joinStrings(ss, maxLen));
  }

  const words = ss[0].split(/\s+/);

  if (words[0].length < maxLen) {
    return `${joinStrings(words, maxLen - 1)}\u2026`;
  }

  return `${words[0].substr(0, maxLen - 1)}\u2026`;
}

function joinStrings(parts: string[], maxLen: number) {
  let [result] = parts;

  for (const p of parts.slice(1)) {
    if (result.length + p.length - 1 >= maxLen) {
      break;
    }

    result = `${result} ${p}`;
  }

  return trimPeriod(result);
}

function trimPeriod(text: string) {
  return text.replace(/([^.])\.$/, '$1');
}

export function textToHTML(text: string) {
  const lines = text
    .trim()
    .split(/[\u0000-\u001f\u0085\u2028\u2029]/)
    .map((l) => l.trim())
    .map((l) => linkify(l));
  const paragraphs = [[]] as string[][];
  lines.forEach((line, i) => {
    if (line !== '') {
      paragraphs[paragraphs.length - 1].push(line);
    } else if (lines[i - 1] !== '') {
      paragraphs.push([]);
    }
  });
  return paragraphs.map((ls) => `<p>${ls.join('<br />\n')}</p>`).join('\n');
}

function linkify(text: string) {
  return tokenize(text)
    .map((token) => {
      if (token.type === HASHTAG) {
        return `<a href="${config.host}/search?qs=${urlEscape(token.text)}">${htmlEscape(
          token.text,
        )}</a>`;
      }

      if (token.type === EMAIL) {
        return `<a href="${htmlEscape(emailHref(token.text))}">${htmlEscape(
          prettyEmail(token.text),
        )}</a>`;
      }

      if (token.type === MENTION) {
        return `<a href="${config.host}/${urlEscape(
          token.text.substring(1).toLowerCase(),
        )}">${htmlEscape(token.text)}</a>`;
      }

      if (token.type === LINK) {
        return `<a href="${htmlEscape(linkHref(token.text))}">${htmlEscape(
          prettyLink(token.text),
        )}</a>`;
      }

      return htmlEscape(token.text);
    })
    .join('');
}
