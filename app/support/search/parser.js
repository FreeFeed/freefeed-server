import XRegExp from 'xregexp';

import { normalizeText } from './norm';
import {
  scopeStarts,
  listConditions,
  ScopeStart,
  Pipe,
  Condition,
  Text,
  AnyText,
  InScope,
  trimText
} from './parser-tools';

// -?(scope:)?(double-quoted-string|string)
const tokenRe = new XRegExp(
  `
  (?:
    (?<pipe> \\|) |
    (?:
      (?<exclude> -)?
      (?:(?<cond> [\\w-]+):)?
      (?:
        (?<qstring> "(?:[^"\\\\]|\\\\.)*") |
        (?<word> \\S+)
      )
    )
  )
`,
  'gx'
);

export function parseQuery(query) {
  // 1-st run: Split the query string into tokens

  const tokens = [];

  XRegExp.forEach(normalizeText(query), tokenRe, (match) => {
    const [raw] = match;

    if (match.pipe) {
      tokens.push(new Pipe());
      return;
    }

    // in-body: (start of scope)
    if (/^[\w-]+:$/.test(raw)) {
      for (const [re, scope] of scopeStarts) {
        if (re.test(raw.substring(0, raw.length - 1))) {
          tokens.push(new ScopeStart(scope));
          return;
        }
      }
    }

    if (match.cond) {
      // (-)in:saves,friends
      for (const [re, condition] of listConditions) {
        if (re.test(match.cond)) {
          tokens.push(
            new Condition(
              !!match.exclude,
              condition,
              match.word
                .split(',')
                .map(trimText)
                .filter(Boolean)
            )
          );
          return;
        }
      }

      // (-)in-body:cat,mouse
      for (const [re, scope] of scopeStarts) {
        if (re.test(match.cond)) {
          const inner = [];

          if (match.qstring) {
            // in-body:"cat mouse" => "cat mouse"
            const phrase = new Text(
              !!match.exclude,
              true,
              JSON.parse(match.qstring)
            );
            inner.push(new AnyText([phrase]));
          } else {
            const words = match.word
              .split(',')
              .map(trimText)
              .filter(Boolean);

            if (!match.exclude) {
              // in-body:cat,mouse => cat || mouse
              const texts = words.map((word) => new Text(false, false, word));
              inner.push(new AnyText(texts));
            } else {
              // -in-body:cat,mouse => !cat && !mouse
              const parts = words.map(
                (word) => new AnyText([new Text(true, false, word)])
              );
              inner.push(...parts);
            }
          }

          tokens.push(new InScope(scope, inner));
          return;
        }
      }

      // Scope not found, treat as raw text
      tokens.push(
        new AnyText([new Text(!!match.exclude, false, trimText(raw))])
      );
      return;
    }

    // Just a text
    tokens.push(
      new AnyText([
        new Text(
          !!match.exclude,
          !!match.qstring,
          match.qstring ? JSON.parse(match.qstring) : trimText(match.word)
        )
      ])
    );
  });

  // 2-nd run: Merge all "AnyText (Pipe AnyText)+" combinations into one AnyText.
  // Result should not contain any Pipe's.

  const result = [];
  let prevToken = null;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] instanceof Pipe) {
      if (!prevToken || !(prevToken instanceof AnyText)) {
        // Last inserted token is not an AnyText
        continue;
      }

      if (i < tokens.length - 1 && tokens[i + 1] instanceof AnyText) {
        // Next token is AnyText, join it with the prevToken
        prevToken.texts.push(...tokens[i + 1].texts);
        // Jump over the joined token
        i++;
        continue;
      }
    } else {
      prevToken = tokens[i];
      result.push(prevToken);
    }
  }

  return result;
}
