import { ParsedUrlQuery } from 'querystring';

export function getQueryParams(query: ParsedUrlQuery) {
  let offset = parseInt(queryParam(query.offset, '0'), 10);
  let limit = parseInt(queryParam(query.limit, '30'), 10);

  if (!isFinite(limit)) {
    limit = 30;
  } else if (limit > 100) {
    limit = 100;
  }

  if (!isFinite(offset) || offset < 0) {
    offset = 0;
  }

  return {
    offset,
    limit,
  };
}

function queryParam(p: string | string[] | undefined, def: string) {
  if (Array.isArray(p) && p.length > 0) {
    return p[p.length - 1];
  } else if (typeof p === 'string') {
    return p;
  }

  return def;
}
