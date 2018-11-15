import { escape as urlEscape } from 'querystring';
import { escape as htmlEscape } from 'lodash';
import { sentences } from 'sbd';
import {
  withText,
  combine,
  hashTags,
  emails,
  mentions,
  links,
  HashTag,
  Email,
  Mention,
  Link,
} from 'social-text-tokenizer';
import { load as configLoader } from '../../config/config';


const config = configLoader();

export function extractTitle(text, maxLen) {
  // see https://unicode.org/cldr/utility/list-unicodeset.jsp?a=%5B%3AWord_Break%3DNewline%3A%5D&g=&i=
  const [line] = text.split(/[\u0000-\u001f\u0085\u2028\u2029]/, 1);

  if (line.length <= maxLen) {
    return line;
  }

  const ss = sentences(line);

  if (ss[0].length < maxLen) {
    return joinStrings(ss, maxLen);
  }

  const words = ss[0].split(/\s+/);

  if (words[0].length < maxLen) {
    return `${joinStrings(words, maxLen - 1)}\u2026`;
  }

  return `${words[0].substr(0, maxLen - 1)}\u2026`
}

function joinStrings(parts, maxLen) {
  return parts.slice(1).reduce((sum, p) => (sum.length + p.length - 1) >= maxLen ? sum : `${sum} ${p}`, parts[0]);
}

export function textToHTML(text) {
  const lines = text
    .trim()
    .split(/[\u0000-\u001f\u0085\u2028\u2029]/)
    .map((l) => l.trim())
    .map((l) => linkify(l));
  const paragraphs = [[]];
  lines.forEach((line, i) => {
    if (line !== '') {
      paragraphs[paragraphs.length - 1].push(line);
    } else if (lines[i - 1] !== '') {
      paragraphs.push([]);
    }
  });
  return paragraphs.map((ls) => `<p>${ls.join('<br />\n')}</p>`).join('\n');
}

const tokenize = withText(combine(hashTags, emails, mentions, links));

function linkify(text) {
  return tokenize(text).map((token) => {
    if (token instanceof HashTag) {
      return `<a href="${config.host}/search?qs=${urlEscape(token.text)}">${htmlEscape(token.text)}</a>`
    }

    if (token instanceof Email) {
      return `<a href="mailto:${urlEscape(token.text)}">${htmlEscape(token.pretty)}</a>`
    }

    if (token instanceof Mention) {
      return `<a href="${config.host}/${urlEscape(token.text.substr(1))}">${htmlEscape(token.text)}</a>`
    }

    if (token instanceof Link) {
      return `<a href="${htmlEscape(token.href)}">${htmlEscape(token.pretty)}</a>`
    }

    return token.text;
  }).join('');
}
