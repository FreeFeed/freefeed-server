/**
 * This middleware recursively applies unicode normalization (to NFC form)
 * of ctx.request.body and ctx.request.query string fields.
 *
 * @param {object} ctx
 * @param {Function} next
 */
export function normalizeInputStrings(ctx, next) {
  ctx.request.body = normalizeStrings(ctx.request.body, 'NFC');
  ctx.request.query = normalizeStrings(ctx.request.query, 'NFC');
  return next();
}

/**
 * Recursively normalize all strings in th val to the given form.
 * Val assumed to be a JSON value, i.e. primitive or plain object or
 * array of primitives.
 *
 * @param {any} val
 * @param {string} form
 */
export function normalizeStrings(val, form) {
  if (typeof val === 'string') {
    return val.normalize(form);
  }

  if (Array.isArray(val)) {
    return val.map((v) => normalizeStrings(v, form));
  } else if (typeof val === 'object' && val !== null) {
    const result = {};

    for (const k in val) {
      result[k.normalize(form)] = normalizeStrings(val[k], form);
    }

    return result;
  }

  return val;
}
