export function serializeAccessToken(token) {
  return {
    id:          token.uid,
    description: token.description,
    code:        token.code,
    createdAt:   new Date(token.created_at).getTime(),
    lastUsedAt:  (token.last_used_at === null ? null : new Date(token.last_used_at).getTime()),
    status:      token.status
  };
}
