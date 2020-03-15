import { ScopeStart, InScope, AnyText, IN_ALL } from './query-tokens';


export function toTSQuery(tokens, targetScope) {
  let globalScope = IN_ALL;
  const result = [];

  for (const token of tokens) {
    if (token instanceof ScopeStart) {
      globalScope = token.scope;
      continue;
    }

    if (token instanceof AnyText && globalScope & targetScope) {
      result.push(token.toTSQuery());
    }

    if (token instanceof InScope && token.scope & targetScope) {
      result.push(...token.anyTexts.map((t) => t.toTSQuery()));
    }
  }

  return result.join(' && ');
}
