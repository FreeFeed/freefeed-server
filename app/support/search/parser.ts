import XRegExp from 'xregexp';
import { flow } from 'lodash';
import config from 'config';

import { normalizeText } from './norm';
import {
  scopeStarts,
  listConditions,
  ScopeStart,
  Pipe,
  Condition,
  Text,
  InScope,
  trimText,
  Token,
  AnyText
} from './query-tokens';

// -?(scope:)?(double-quoted-string|string)
const tokenRe = XRegExp(
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

export type ParseQueryOptions = {
  minPrefixLength: number
}

export function parseQuery(query: string, { minPrefixLength }: ParseQueryOptions = config.search) {
  // 1-st run: Split the query string into tokens

  const tokens = [] as Token[];

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
          if (match.qstring) {
            // in-body:"cat mouse" => "cat mouse"
            tokens.push(new InScope(scope,
              new AnyText([
                new Text(
                  !!match.exclude,
                  true,
                  JSON.parse(match.qstring)
                )
              ]))
            );
          } else {
            const words = (match.word as string)
              .split(',')
              .map((w) => trimText(w, { minPrefixLength }))
              .filter(Boolean);

            if (!match.exclude) {
              // in-body:cat,mouse => cat || mouse
              const texts = words.map((word) => new Text(false, false, word));
              tokens.push(new InScope(scope, new AnyText(texts)));
            } else {
              // -in-body:cat,mouse => !cat && !mouse
              const texts = words.map((word) => new Text(true, false, word));
              tokens.push(...texts.map((t) => new InScope(scope, new AnyText([t]))));
            }
          }

          return;
        }
      }

      // Scope not found, treat as raw text
      tokens.push(
        new AnyText([new Text(!!match.exclude, false, trimText(raw, { minPrefixLength }))])
      );
      return;
    }

    // Just a text
    tokens.push(
      new AnyText([
        new Text(
          !!match.exclude,
          !!match.qstring,
          match.qstring ? JSON.parse(match.qstring) : trimText(match.word, { minPrefixLength })
        )
      ])
    );
  });

  // 2-nd run: Merge all "AnyText (Pipe AnyText)+" combinations into one AnyText.
  // Result should not contain any Pipe's.

  const result = [] as Token[];
  let prevToken = null;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] instanceof Pipe) {
      if (!prevToken || !(prevToken instanceof AnyText)) {
        // Last inserted token is not an AnyText
        continue;
      }

      if (i < tokens.length - 1 && tokens[i + 1] instanceof AnyText) {
        // Next token is AnyText, join it with the prevToken
        prevToken.children.push(...(tokens[i + 1] as AnyText).children);
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

export function queryComplexity(tokens: Token[]) {
  return tokens.reduce((acc, token) => acc + token.getComplexity(), 0);
}
